// NotificationService: creates reminders that escalate as deadlines get closer.
// A background check runs every minute (the "reminder worker" from the deployment diagram).
const { withDefaults } = require('./settingsService');
const { summary } = require('./AttendanceService');
const { toInstant } = require('../utils/dates');
const logger = require('../utils/logger');

const HOUR = 3600 * 1000;

// Creates a notification unless one with the same key already exists.
async function notify(store, userId, { key, kind, level = 'info', title, body }) {
  if (key && await store.notifications.findOne({ userId, key })) return null;
  return store.notifications.insert({ userId, key, kind, level, title, body, read: false });
}

function to12h(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

async function checkUser(store, user, now) {
  const settings = withDefaults(user.settings);
  const tz = settings.tzOffsetMin;
  const userId = user.id;
  const [schedule, tasks, courses, logs] = await Promise.all([
    store.schedules.findOne({ userId }),
    store.assignments.find({ userId }),
    store.courses.find({ userId }),
    store.attendance.find({ userId }),
  ]);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const created = [];
  const push = async (n) => { const r = await notify(store, userId, n); if (r) created.push(r); };

  // 1. Session about to start
  const lead = settings.reminderMinutes * 60 * 1000;
  for (const s of (schedule && schedule.sessions) || []) {
    if (s.status !== 'planned' || !lead) continue;
    const startMs = toInstant(s.date, s.start, tz);
    if (startMs > now && startMs - now <= lead) {
      const task = taskById.get(s.taskId);
      if (!task) continue;
      const course = courseById.get(task.courseId);
      await push({
        key: `session:${s.id}`, kind: 'session', level: 'info',
        title: `Study ${task.title} at ${to12h(s.start)}`,
        body: `${s.hours} h${course ? ` · ${course.name}` : ''}`,
      });
    }
  }

  // 2. Deadlines: 24 h warning, then 3 h urgent, then overdue
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const left = Date.parse(t.deadline) - now;
    if (left <= 0) {
      await push({ key: `overdue:${t.id}`, kind: 'deadline', level: 'critical', title: `${t.title} is overdue`, body: 'Mark it done or update the deadline.' });
    } else if (left <= 3 * HOUR) {
      await push({ key: `deadline3:${t.id}`, kind: 'deadline', level: 'critical', title: `${t.title} is due in under 3 hours`, body: 'Final check and submit.' });
    } else if (left <= 24 * HOUR) {
      await push({ key: `deadline24:${t.id}`, kind: 'deadline', level: 'warning', title: `${t.title} is due within 24 hours`, body: `Due ${new Date(t.deadline).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` });
    }
  }

  // 3. Attendance below the minimum (at most one reminder per course per week)
  const week = Math.floor(now / (7 * 24 * HOUR));
  for (const c of summary(courses, logs)) {
    if (c.status === 'low') {
      await push({ key: `attendance:${c.id}:w${week}`, kind: 'attendance', level: 'warning', title: `${c.name} attendance is ${c.pct}%`, body: c.message });
    }
  }
  return created;
}

async function runChecks(store, now = Date.now()) {
  const users = await store.users.find({});
  let count = 0;
  for (const user of users) count += (await checkUser(store, user, now)).length;
  return count;
}

function startWorker(store, { intervalMs = 60 * 1000 } = {}) {
  const run = () => runChecks(store).catch((err) => logger.error('[notifications]', err));
  const timer = setInterval(run, intervalMs);
  const first = setTimeout(run, 3000);
  if (timer.unref) timer.unref();
  if (first.unref) first.unref();
  return () => { clearInterval(timer); clearTimeout(first); };
}

module.exports = { notify, runChecks, checkUser, startWorker };
