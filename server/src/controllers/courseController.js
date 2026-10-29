const { HttpError } = require('../middleware/errorHandler');
const svc = require('../services/ReplanningService');

const pick = (b) => {
  const out = {};
  if ('name' in b) out.name = String(b.name).trim();
  if ('code' in b) out.code = String(b.code || '').trim();
  if ('color' in b) out.color = b.color;
  if ('minAttendance' in b) out.minAttendance = b.minAttendance;
  return out;
};

async function list(req, res) {
  const courses = await req.ctx.store.courses.find({ userId: req.userId });
  res.json({ courses: courses.sort((a, b) => a.name.localeCompare(b.name)) });
}

async function create(req, res) {
  const course = await req.ctx.store.courses.insert({ color: '#4f7cff', minAttendance: 75, code: '', ...pick(req.body), userId: req.userId });
  res.status(201).json({ course });
}

async function update(req, res) {
  const course = await req.ctx.store.courses.update({ id: req.params.id, userId: req.userId }, pick(req.body));
  if (!course) throw new HttpError(404, 'Course not found');
  res.json({ course });
}

// Deleting a course also deletes its tasks, their study sessions and its attendance records.
async function remove(req, res) {
  const { store } = req.ctx;
  const course = await store.courses.findOne({ id: req.params.id, userId: req.userId });
  if (!course) throw new HttpError(404, 'Course not found');
  const tasks = await store.assignments.find({ userId: req.userId, courseId: course.id });
  const taskIds = new Set(tasks.map((t) => t.id));
  await store.assignments.remove({ userId: req.userId, courseId: course.id });
  await store.attendance.remove({ userId: req.userId, courseId: course.id });
  await store.courses.remove({ id: course.id });
  const schedule = await store.schedules.findOne({ userId: req.userId });
  if (schedule) {
    await store.schedules.update({ userId: req.userId }, { sessions: schedule.sessions.filter((s) => !taskIds.has(s.taskId)) });
    await svc.replanForUser(store, req.userId, { aiClient: req.ctx.aiClient, previous: null });
  }
  res.json({ ok: true });
}

module.exports = { list, create, update, remove };
