// Assignments, exams and quizzes ("tasks").
const { HttpError } = require('../middleware/errorHandler');
const svc = require('../services/ReplanningService');
const { withDefaults } = require('../services/settingsService');
const { view } = require('./scheduleController');

const FIELDS = ['courseId', 'title', 'type', 'deadline', 'weight', 'difficulty', 'estimatedHours', 'status'];

function pick(body) {
  const out = {};
  for (const f of FIELDS) if (f in body) out[f] = body[f];
  if ('title' in out) out.title = String(out.title).trim();
  if ('deadline' in out) out.deadline = new Date(out.deadline).toISOString();
  return out;
}

async function ensureCourse(store, userId, courseId) {
  if (!courseId) return;
  const course = await store.courses.findOne({ id: courseId, userId });
  if (!course) throw new HttpError(400, 'Choose one of your courses', { courseId: 'Choose one of your courses' });
}

// Re-plans with an Undo snapshot and returns the new schedule + what changed.
async function replanAfter(req, extra = {}) {
  const { store } = req.ctx;
  const existing = await store.schedules.findOne({ userId: req.userId });
  const previous = { ...svc.snapshotOf(existing, withDefaults(req.user.settings)), ...extra };
  const { changes } = await svc.replanForUser(store, req.userId, { aiClient: req.ctx.aiClient, previous });
  return { schedule: await view(req, req.userId), changes };
}

async function list(req, res) {
  const tasks = await req.ctx.store.assignments.find({ userId: req.userId });
  res.json({ tasks: tasks.sort((a, b) => a.deadline.localeCompare(b.deadline)) });
}

async function create(req, res) {
  const { store } = req.ctx;
  await ensureCourse(store, req.userId, req.body.courseId);
  const task = await store.assignments.insert({ ...pick(req.body), status: 'pending', userId: req.userId });
  const result = req.body.replan === false ? {} : await replanAfter(req, { undoDeleteTaskId: task.id });
  res.status(201).json({ task, ...result });
}

async function update(req, res) {
  const { store } = req.ctx;
  await ensureCourse(store, req.userId, req.body.courseId);
  const patch = pick(req.body);
  if (patch.status === 'done') patch.completedAt = new Date().toISOString();
  if (patch.status === 'pending') patch.completedAt = null;
  const task = await store.assignments.update({ id: req.params.id, userId: req.userId }, patch);
  if (!task) throw new HttpError(404, 'Task not found');
  const result = req.body.replan === false ? {} : await replanAfter(req);
  res.json({ task, ...result });
}

async function remove(req, res) {
  const { store } = req.ctx;
  const task = await store.assignments.findOne({ id: req.params.id, userId: req.userId });
  if (!task) throw new HttpError(404, 'Task not found');
  await store.assignments.remove({ id: task.id });
  const schedule = await store.schedules.findOne({ userId: req.userId });
  if (schedule) {
    await store.schedules.update({ userId: req.userId }, { sessions: schedule.sessions.filter((s) => s.taskId !== task.id) });
  }
  const result = await replanAfter(req);
  res.json({ ok: true, ...result });
}

module.exports = { list, create, update, remove };
