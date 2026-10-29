// Rule-based planning helpers: free hours per day, greedy fallback plan, time slots.
const { localDate, localMinutes, addDays, parseHM, formatHM, lastStudyDay } = require('../utils/dates');
const { hoursFor, startMinutesFor } = require('./settingsService');

const BREAK_MIN = 30; // break between two study blocks
const DAY_END_MIN = 23 * 60; // nothing is planned after 11 PM (late-night study feeds burnout)
const MAX_BLOCK_HOURS = 2;
const HORIZON_DAYS = 28; // plan at most 4 weeks ahead

const floorHalf = (h) => Math.max(0, Math.floor(h * 2 + 1e-9) / 2);
const minDate = (a, b) => (a < b ? a : b);
const endMin = (s) => (parseHM(s.start) || 0) + s.hours * 60;

// Free study hours and the first free start time for each day from today to `until`.
// Sessions already done/missed (history) on a day use up that day's hours.
function buildAvailability({ settings, history, now, tz, until }) {
  const today = localDate(now, tz);
  const last = minDate(until && until > today ? until : today, addDays(today, HORIZON_DAYS - 1));
  const nowMin = Math.ceil(localMinutes(now, tz) / 30) * 30;
  const out = [];
  for (let date = today; date <= last; date = addDays(date, 1)) {
    const onDay = history.filter((s) => s.date === date);
    const used = onDay.reduce((sum, s) => sum + s.hours, 0);
    const lastEnd = onDay.reduce((m, s) => Math.max(m, endMin(s) + BREAK_MIN), 0);
    let startMin = Math.max(startMinutesFor(settings, date), lastEnd);
    if (date === today) startMin = Math.max(startMin, nowMin);
    const hours = Math.min(hoursFor(settings, date) - used, (DAY_END_MIN - startMin) / 60);
    out.push({ date, hours: floorHalf(hours), startMin });
  }
  return out;
}

// Hours each task still needs after the given sessions.
function uncovered(ranked, sessions) {
  const planned = new Map();
  for (const s of sessions) planned.set(String(s.taskId), (planned.get(String(s.taskId)) || 0) + s.hours);
  return ranked
    .map((t) => ({ taskId: String(t.id), hoursLeft: Math.round((t.remaining - (planned.get(String(t.id)) || 0)) * 2) / 2 }))
    .filter((u) => u.hoursLeft > 0);
}

// Fill each day in date order; within a day, tasks in the given order get one block (<= 2 h) each.
// `existing` sessions (e.g. from the AI) are respected and only the gaps are filled.
function greedyPlan(order, availability, tz, existing = []) {
  const left = new Map(order.map((t) => [String(t.id), t.remaining]));
  const lastDay = new Map(order.map((t) => [String(t.id), lastStudyDay(t.deadline, tz)]));
  const usedOn = new Map();
  for (const s of existing) {
    left.set(String(s.taskId), (left.get(String(s.taskId)) || 0) - s.hours);
    usedOn.set(s.date, (usedOn.get(s.date) || 0) + s.hours);
  }
  const sessions = [];
  const place = (t, date, free) => {
    const id = String(t.id);
    const block = floorHalf(Math.min(left.get(id), free, MAX_BLOCK_HOURS));
    if (block <= 0) return 0;
    sessions.push({ taskId: id, date, hours: block });
    left.set(id, left.get(id) - block);
    return block;
  };
  for (const day of availability) {
    let free = day.hours - (usedOn.get(day.date) || 0);
    // 1. Tasks whose last study day is today get all the blocks they still need first.
    for (const t of order) {
      if (lastDay.get(String(t.id)) !== day.date) continue;
      while (free >= 0.5 && left.get(String(t.id)) > 0) {
        const got = place(t, day.date, free);
        if (!got) break;
        free -= got;
      }
    }
    // 2. Then each task gets one block in priority order; later passes use any spare time.
    let placed = true;
    while (free >= 0.5 && placed) {
      placed = false;
      for (const t of order) {
        if (free < 0.5) break;
        const id = String(t.id);
        if (left.get(id) <= 0 || day.date > lastDay.get(id)) continue;
        const got = place(t, day.date, free);
        if (got) { free -= got; placed = true; }
      }
    }
  }
  return sessions;
}

const unscheduledHours = (list) => list.reduce((sum, u) => sum + u.hoursLeft, 0);

// Tries priority order first, then earliest-deadline-first, and keeps whichever leaves less work
// unscheduled. This fixes OBS-01 from Assessment 8 (an urgent low-weight task losing its hours).
function bestGreedyPlan(ranked, availability, tz) {
  const byPriority = greedyPlan(ranked, availability, tz);
  const a = { sessions: byPriority, unscheduled: uncovered(ranked, byPriority), order: 'priority' };
  if (!a.unscheduled.length) return a;

  const edf = [...ranked].sort((x, y) => lastStudyDay(x.deadline, tz).localeCompare(lastStudyDay(y.deadline, tz))
    || y.score - x.score);
  const byDeadline = greedyPlan(edf, availability, tz);
  const b = { sessions: byDeadline, unscheduled: uncovered(ranked, byDeadline), order: 'deadline' };
  return unscheduledHours(b.unscheduled) < unscheduledHours(a.unscheduled) ? b : a;
}

// Gives each session a start time: blocks follow each other with a 30-minute break,
// highest-priority task first within a day.
function assignTimes(sessions, availability, rankedIds) {
  const startOf = new Map(availability.map((a) => [a.date, a.startMin]));
  const rankOf = new Map(rankedIds.map((id, i) => [String(id), i]));
  const byDate = new Map();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const out = [];
  for (const [date, list] of [...byDate].sort((x, y) => x[0].localeCompare(y[0]))) {
    list.sort((x, y) => (rankOf.get(String(x.taskId)) ?? 99) - (rankOf.get(String(y.taskId)) ?? 99));
    let cursor = startOf.get(date) ?? 16 * 60;
    for (const s of list) {
      out.push({ taskId: String(s.taskId), date, hours: s.hours, start: formatHM(cursor) });
      cursor += s.hours * 60 + BREAK_MIN;
    }
  }
  return out;
}

module.exports = {
  BREAK_MIN,
  DAY_END_MIN,
  MAX_BLOCK_HOURS,
  HORIZON_DAYS,
  floorHalf,
  endMin,
  buildAvailability,
  uncovered,
  greedyPlan,
  bestGreedyPlan,
  assignTimes,
};
