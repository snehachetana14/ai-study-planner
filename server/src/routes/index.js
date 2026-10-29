// All REST routes under /api.
const express = require('express');
const authJwt = require('../middleware/authJwt');
const validateRequest = require('../middleware/validateRequest');
const { asyncHandler: h } = require('../middleware/errorHandler');
const v = require('../utils/validators');
const auth = require('../controllers/authController');
const schedule = require('../controllers/scheduleController');
const courses = require('../controllers/courseController');
const tasks = require('../controllers/assignmentController');
const tracker = require('../controllers/trackerController');
const analytics = require('../controllers/analyticsController');
const ai = require('../controllers/aiController');

const router = express.Router();

router.get('/health', (req, res) => res.json({
  ok: true,
  db: req.ctx.store.kind,
  ai: req.ctx.aiClient ? req.ctx.aiClient.provider : null,
}));

// Authentication
router.post('/auth/signup', validateRequest(v.validateSignup), h(auth.signup));
router.post('/auth/login', validateRequest(v.validateLogin), h(auth.login));
router.get('/auth/me', authJwt, h(auth.me));

// Everything below needs a logged-in user
router.use(authJwt);

// Courses
router.get('/courses', h(courses.list));
router.post('/courses', validateRequest(v.validateCourse), h(courses.create));
router.patch('/courses/:id', validateRequest(v.validateCourse, { partial: true }), h(courses.update));
router.delete('/courses/:id', h(courses.remove));

// Assignments / exams / quizzes
router.get('/assignments', h(tasks.list));
router.post('/assignments', validateRequest(v.validateTask), h(tasks.create));
router.patch('/assignments/:id', validateRequest(v.validateTask, { partial: true }), h(tasks.update));
router.delete('/assignments/:id', h(tasks.remove));

// Schedule and study sessions
router.get('/schedule', h(schedule.getSchedule));
router.post('/schedule/replan', h(schedule.replan));
router.post('/schedule/undo', h(schedule.undo));
router.post('/schedule/resolve', h(schedule.resolveConflict));
router.patch('/sessions/:id', h(schedule.setSessionStatus));

// AI Quick Add: sentence -> task fields (nothing is saved until the student confirms)
router.post('/ai/quick-add', h(ai.quickAddTask));

// Attendance
router.get('/attendance', h(tracker.getAttendance));
router.post('/attendance', validateRequest(v.validateAttendance), h(tracker.markAttendance));
router.delete('/attendance/:id', h(tracker.deleteAttendance));

// Insights, notifications, settings, sample data
router.get('/insights', h(analytics.insights));
router.get('/notifications', h(analytics.listNotifications));
router.post('/notifications/read', h(analytics.markRead));
router.get('/settings', h(analytics.getSettings));
router.put('/settings', validateRequest(v.validateSettings), h(analytics.updateSettings));
router.post('/demo/seed', h(analytics.seed));

module.exports = router;
