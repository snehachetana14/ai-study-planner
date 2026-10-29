// ReplanningService: builds and rebuilds a student's schedule.
// Flow (Assessment 7, Q1): load pending tasks -> score -> ask AI -> validate -> fall back if needed
// -> save -> report what changed. Every change keeps a snapshot so the student can Undo it.
const crypto = require('node:crypto');
const { rank } = require('../ai/PriorityScorer');
const { validate } = require('../ai/PlanValidator');
const planner = require('./planner');
const { withDefaults, hoursFor } = require('./settingsService');
const { localDate, toInstant, lastStudyDay, addDays, formatHM, parseHM } = require('../utils/dates');
const { HttpError } = require('../middleware/errorHandler');

const bySessionTime = (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start);

function doneHours(taskId, sessions) {
  return sessions
    .filter((s) => s.taskId === String(taskId) && s.status === 'done')
    .reduce((sum, s) => sum + s.hours, 0);
}

function remainingFor(task, sessions) {
  return Math.max(0, task.estimatedHours - doneHours(task.id, sessions));
}

// History = anything already done/missed or already started. Future = planned and not yet started.
function splitSessions(sessions, now, tz) {
  const history = [];
  const future = [];
  for (const s of sessions) {
    if (s.status === 'planned' && toInstant(s.date, s.start, tz) > now) future.push(s);
    else history.push(s);
  }
  return { history, future };
}

// Snapshot used by Undo. With no plan yet, the snapshot is an empty plan.
function snapshotOf(schedule, settings) {
  if (!schedule || !schedule.sessions) {
    return { sessions: [], source: 'none', sourceNote: '', warnings: [], unscheduled: [], overrides: { ...(withDefaults(settings).overrides) } };
  }
  return {
    sessions: schedule.sessions,
    source: schedule.source,
    sourceNote: schedule.sourceNote,
    warnings: schedule.warnings || [],
    unscheduled: schedule.unscheduled || [],
    generatedAt: schedule.generatedAt,
    generatedFor: schedule.generatedFor,
    overrides: { ...(withDefaults(settings).overrides) },
  };
}

function conflictFor(u, ranked, today, tz) {
  const task = ranked.find((t) => String(t.id) === String(u.taskId));
  const lastDay = lastStudyDay(task.deadline, tz);
  const options = [];
  if (lastDay >= today) options.push({ action: 'addHours', date: lastDay, hours: u.hoursLeft });
  options.push({ action: 'remind' });
  return {
    taskId: String(u.taskId),
    hoursLeft: u.hoursLeft,
    totalHours: task.remaining,
    deadline: task.deadline,
    lastDay,
    tooSoon: lastDay < today,
    options,
  };
}

// Works out the new future sessions. Does not save anything.
async function computePlan({ tasks, courses, settings, history, now, aiClient }) {
  const s = withDefaults(settings);
  const tz = s.tzOffsetMin;
  const today = localDate(now, tz);
  const pending = tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({ ...t, remaining: remainingFor(t, history) }))
    .filter((t) => t.remaining > 0);
  const ranked = rank(pending, now);
  const warnings = [];

  if (!ranked.length) {
    return { today, ranked, future: [], unscheduled: [], warnings, source: 'none', sourceNote: 'Nothing to plan', availability: [] };
  }

  const until = ranked.reduce((m, t) => {
    const d = lastStudyDay(t.deadline, tz);
    return d > m ? d : m;
  }, today);
  const availability = planner.buildAvailability({ settings: s, history, now, tz, until });
  const usable = availability.filter((a) => a.hours > 0);

  let sessions = null;
  let source = 'rules';
  let sourceNote;

  if (aiClient && s.useAI) {
    try {
      const proposal = await aiClient.suggestSlots({ ranked, availability: usable, today, tzOffsetMin: tz, courses });
      const check = validate(proposal, { tasks: ranked, availability: usable, today, tzOffsetMin: tz });
      if (check.valid) {
        const aiSessions = proposal.filter((p) => p.hours > 0);
        const gaps = planner.greedyPlan(ranked, usable, tz, aiSessions);
        sessions = [...aiSessions, ...gaps];
        source = 'ai';
        sourceNote = gaps.length ? `${aiClient.provider} + rules filled gaps` : aiClient.provider;
      } else {
        warnings.push(`AI plan rejected: ${check.errors.slice(0, 3).join('; ')}`);
        sourceNote = 'AI plan failed checks';
      }
    } catch (err) {
      warnings.push(`AI unavailable: ${err.message}`);
      sourceNote = 'AI was busy';
    }
  } else {
    sourceNote = aiClient ? 'AI turned off in Settings' : 'No AI key set';
  }

  if (!sessions) sessions = planner.bestGreedyPlan(ranked, usable, tz).sessions;

  const future = planner
    .assignTimes(sessions, availability, ranked.map((t) => t.id))
    .map((x) => ({ id: crypto.randomUUID(), status: 'planned', ...x }));
  const unscheduled = planner.uncovered(ranked, sessions).map((u) => conflictFor(u, ranked, today, tz));

  return { today, ranked, future, unscheduled, warnings, source, sourceNote, availability };
}

// What changed between the old and new future plan, per task per day.
function diffPlans(oldFuture, newFuture) {
  const sum = (list) => {
    const m = new Map();
    for (const s of list) {
      const k = `${s.taskId}|${s.date}`;
      m.set(k, (m.get(k) || 0) + s.hours);
    }
    return m;
  };
  const a = sum(oldFuture);
  const b = sum(newFuture);
  const split = (k) => {
    const [taskId, date] = k.split('|');
    return { taskId, date };
  };
  const removed = [];
  const added = [];
  const changed = [];
  let keptCount = 0;
  for (const [k, h] of a) {
    if (!b.has(k)) removed.push({ ...split(k), hours: h });
    else if (b.get(k) !== h) changed.push({ ...split(k), from: h, to: b.get(k) });
    else keptCount += 1;
  }
  for (const [k, h] of b) if (!a.has(k)) added.push({ ...split(k), hours: h });
  const order = (x, y) => x.date.localeCompare(y.date);
  return { removed: removed.sort(order), added: added.sort(order), changed: changed.sort(order), keptCount };
}

// Rebuilds the future part of the plan and saves it.
// `previous`: snapshot for Undo (undefined = snapshot of the current plan, null = no Undo).
async function replanForUser(store, userId, { now = Date.now(), aiClient = null, previous, missed = null } = {}) {
  const user = await store.users.findOne({ id: userId });
  if (!user) throw new HttpError(404, 'User not found');
  const settings = withDefaults(user.settings);
  const [tasks, courses, existing] = await Promise.all([
    store.assignments.find({ userId }),
    store.courses.find({ userId }),
    store.schedules.findOne({ userId }),
  ]);
  const { history, future: oldFuture } = splitSessions((existing && existing.sessions) || [], now, settings.tzOffsetMin);
  const plan = await computePlan({ tasks, courses, settings, history, now, aiClient });

  const doc = {
    sessions: [...history, ...plan.future].sort(bySessionTime),
    source: plan.source,
    sourceNote: plan.sourceNote,
    warnings: plan.warnings,
    unscheduled: plan.unscheduled,
    generatedAt: new Date(now).toISOString(),
    generatedFor: plan.today,
    previous: previous !== undefined ? previous : snapshotOf(existing, settings),
  };
  const saved = await store.schedules.upsert({ userId }, doc);

  const plannedOn = new Map();
  for (const s of plan.future) plannedOn.set(s.date, (plannedOn.get(s.date) || 0) + s.hours);
  const fullDays = plan.availability
    .filter((a) => a.hours > 0 && (plannedOn.get(a.date) || 0) >= a.hours)
    .map((a) => a.date);

  const changes = { ...diffPlans(oldFuture, plan.future), fullDays, missed, unscheduled: plan.unscheduled };
  return { schedule: saved, changes };
}

// Everything the Schedule screen needs in one response.
async function getScheduleView(store, userId, { now = Date.now(), aiClient = null, refresh = true } = {}) {
  const user = await store.users.findOne({ id: userId });
  const settings = withDefaults(user.settings);
  const tz = settings.tzOffsetMin;
  const today = localDate(now, tz);
  let [tasks, courses, schedule] = await Promise.all([
    store.assignments.find({ userId }),
    store.courses.find({ userId }),
    store.schedules.findOne({ userId }),
  ]);

  // First visit of the day, or tasks exist but no plan yet: refresh the plan automatically.
  const hasPending = tasks.some((t) => t.status !== 'done');
  if (refresh && hasPending && (!schedule || schedule.generatedFor !== today)) {
    ({ schedule } = await replanForUser(store, userId, { now, aiClient, previous: null }));
  }
  schedule = schedule || { sessions: [], source: 'none', unscheduled: [], warnings: [] };

  const sessions = (schedule.sessions || []).map((s) => ({
    ...s,
    end: formatHM((parseHM(s.start) || 0) + s.hours * 60),
  }));
  const pending = tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({ ...t, remaining: remainingFor(t, sessions) }));
  const ranked = rank(pending.filter((t) => t.remaining > 0), now).map((t) => ({
    id: t.id, title: t.title, courseId: t.courseId, type: t.type, score: t.score, label: t.label,
    reasons: t.reasons, remaining: t.remaining, deadline: t.deadline,
  }));

  const days = [];
  for (let i = -28; i < 28; i += 1) {
    const date = addDays(today, i);
    const planned = sessions.filter((s) => s.date === date && s.status !== 'missed').reduce((a, s) => a + s.hours, 0);
    days.push({ date, capacity: hoursFor(settings, date), planned });
  }

  return {
    today,
    now: new Date(now).toISOString(),
    tzOffsetMin: tz,
    source: schedule.source,
    sourceNote: schedule.sourceNote,
    generatedAt: schedule.generatedAt,
    canUndo: Boolean(schedule.previous),
    warnings: schedule.warnings || [],
    unscheduled: schedule.unscheduled || [],
    sessions,
    days,
    ranked,
    tasks: tasks.map((t) => ({ ...t, hoursDone: doneHours(t.id, sessions) })),
    courses,
    settings,
    aiProvider: aiClient ? aiClient.provider : null,
  };
}

// Done / Missed / back to planned for one session.
async function setSessionStatus(store, userId, sessionId, { status, reason }, { now = Date.now(), aiClient = null } = {}) {
  const user = await store.users.findOne({ id: userId });
  const settings = withDefaults(user.settings);
  const schedule = await store.schedules.findOne({ userId });
  const session = schedule && schedule.sessions.find((s) => s.id === sessionId);
  if (!session) throw new HttpError(404, 'Session not found');
  if (!['done', 'missed', 'planned'].includes(status)) throw new HttpError(400, 'Status must be done, missed or planned');

  const snapshot = snapshotOf(schedule, settings);
  const sessions = schedule.sessions.map((s) => {
    if (s.id !== sessionId) return s;
    const next = { ...s, status };
    delete next.reason;
    delete next.completedAt;
    if (status === 'done') next.completedAt = new Date(now).toISOString();
    if (status === 'missed') next.reason = reason || 'Not given';
    return next;
  });
  await store.schedules.update({ userId }, { sessions });

  // Keep the task's status in step with the hours studied.
  const task = await store.assignments.findOne({ id: session.taskId, userId });
  if (task) {
    const left = remainingFor(task, sessions);
    if (left <= 0 && task.status !== 'done') {
      await store.assignments.update({ id: task.id }, { status: 'done', completedAt: new Date(now).toISOString() });
    } else if (left > 0 && task.status === 'done' && status === 'planned') {
      await store.assignments.update({ id: task.id }, { status: 'pending', completedAt: null });
    }
  }

  if (status !== 'missed') return { changes: null };
  const missed = sessions.find((s) => s.id === sessionId);
  const { changes } = await replanForUser(store, userId, { now, aiClient, previous: snapshot, missed });
  return { changes };
}

async function undo(store, userId) {
  const schedule = await store.schedules.findOne({ userId });
  if (!schedule || !schedule.previous) throw new HttpError(400, 'Nothing to undo');
  const { overrides, undoDeleteTaskId, ...prev } = schedule.previous;
  await store.schedules.update({ userId }, { ...prev, previous: null });

  // Undo right after adding a task removes that task again.
  if (undoDeleteTaskId) await store.assignments.remove({ id: undoDeleteTaskId, userId });

  // Restore any session statuses (e.g. a session marked missed goes back to planned).
  const user = await store.users.findOne({ id: userId });
  if (overrides) {
    await store.users.update({ id: userId }, { settings: { ...withDefaults(user.settings), overrides } });
  }
  const tasks = await store.assignments.find({ userId });
  for (const t of tasks) {
    if (t.status === 'done' && remainingFor(t, prev.sessions) > 0 && doneHours(t.id, prev.sessions) > 0) {
      await store.assignments.update({ id: t.id }, { status: 'pending', completedAt: null });
    }
  }
}

module.exports = {
  remainingFor,
  doneHours,
  splitSessions,
  snapshotOf,
  computePlan,
  diffPlans,
  replanForUser,
  getScheduleView,
  setSessionStatus,
  undo,
};
