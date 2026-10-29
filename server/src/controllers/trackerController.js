// Attendance tracker.
const { HttpError } = require('../middleware/errorHandler');
const { summary } = require('../services/AttendanceService');

async function attendanceView(store, userId) {
  const [courses, logs] = await Promise.all([store.courses.find({ userId }), store.attendance.find({ userId })]);
  return { courses: summary(courses, logs) };
}

async function getAttendance(req, res) {
  res.json(await attendanceView(req.ctx.store, req.userId));
}

// One record per course per date: marking the same day again changes it.
async function markAttendance(req, res) {
  const { store } = req.ctx;
  const { courseId, date, present } = req.body;
  const course = await store.courses.findOne({ id: courseId, userId: req.userId });
  if (!course) throw new HttpError(400, 'Choose one of your courses', { courseId: 'Choose one of your courses' });
  const existing = await store.attendance.findOne({ userId: req.userId, courseId, date });
  if (existing) await store.attendance.update({ id: existing.id }, { present });
  else await store.attendance.insert({ userId: req.userId, courseId, date, present });
  res.json(await attendanceView(store, req.userId));
}

async function deleteAttendance(req, res) {
  const removed = await req.ctx.store.attendance.remove({ id: req.params.id, userId: req.userId });
  if (!removed) throw new HttpError(404, 'Record not found');
  res.json(await attendanceView(req.ctx.store, req.userId));
}

module.exports = { getAttendance, markAttendance, deleteAttendance };
