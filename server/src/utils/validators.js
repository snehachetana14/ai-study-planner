// Input validation rules (same rules the React form enforces, see Assessment 9 Screen 2).
const { parseHM } = require('./dates');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const TASK_TYPES = ['assignment', 'exam', 'quiz'];

function validateSignup(b) {
  const e = {};
  if (!b.name || String(b.name).trim().length < 2) e.name = 'Enter your name (at least 2 characters)';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email || ''))) e.email = 'Enter a valid email address';
  if (String(b.password || '').length < 6) e.password = 'Password must be at least 6 characters';
  return e;
}

function validateLogin(b) {
  const e = {};
  if (!b.email) e.email = 'Enter your email';
  if (!b.password) e.password = 'Enter your password';
  return e;
}

function validateCourse(b, { partial = false } = {}) {
  const e = {};
  if (!partial || 'name' in b) {
    if (!b.name || String(b.name).trim().length < 2 || String(b.name).length > 60) e.name = 'Course name must be 2–60 characters';
  }
  if ('code' in b && String(b.code || '').length > 20) e.code = 'Course code must be at most 20 characters';
  if ('color' in b && !/^#[0-9a-fA-F]{6}$/.test(String(b.color))) e.color = 'Pick a colour';
  if ('minAttendance' in b && !(isNum(b.minAttendance) && b.minAttendance >= 0 && b.minAttendance <= 100)) {
    e.minAttendance = 'Minimum attendance must be 0–100%';
  }
  return e;
}

function validateTask(b, { partial = false, now = Date.now() } = {}) {
  const e = {};
  const need = (k) => !partial || k in b;
  if (need('courseId') && !b.courseId) e.courseId = 'Choose a course';
  if (need('type') && !TASK_TYPES.includes(b.type)) e.type = 'Choose Assignment, Exam or Quiz';
  if (need('title')) {
    const t = String(b.title || '').trim();
    if (t.length < 3 || t.length > 80) e.title = 'Title must be 3–80 characters';
  }
  if (need('deadline')) {
    const ms = Date.parse(b.deadline);
    if (!b.deadline || Number.isNaN(ms)) e.deadline = 'Choose a deadline date and time';
    else if (!partial && ms <= now) e.deadline = 'Deadline must be in the future';
  }
  if (need('weight') && !(isNum(b.weight) && b.weight >= 0 && b.weight <= 100)) e.weight = 'Enter a value from 0 to 100';
  if (need('difficulty') && !(Number.isInteger(b.difficulty) && b.difficulty >= 1 && b.difficulty <= 5)) {
    e.difficulty = 'Choose a difficulty from 1 to 5';
  }
  if (need('estimatedHours')) {
    const h = b.estimatedHours;
    if (!(isNum(h) && h >= 0.5 && h <= 40 && Math.round(h * 2) === h * 2)) {
      e.estimatedHours = 'Hours must be 0.5–40 in steps of 0.5';
    }
  }
  if ('status' in b && !['pending', 'done'].includes(b.status)) e.status = 'Status must be pending or done';
  return e;
}

function validateSettings(b) {
  const e = {};
  if ('weeklyHours' in b) {
    const ok = Array.isArray(b.weeklyHours) && b.weeklyHours.length === 7
      && b.weeklyHours.every((h) => isNum(h) && h >= 0 && h <= 12 && Math.round(h * 2) === h * 2);
    if (!ok) e.weeklyHours = 'Each day needs 0–12 hours in steps of 0.5';
  }
  if ('startTimes' in b) {
    const ok = Array.isArray(b.startTimes) && b.startTimes.length === 7
      && b.startTimes.every((t) => { const m = parseHM(t); return m !== null && m >= 5 * 60 && m <= 22 * 60; });
    if (!ok) e.startTimes = 'Start times must be between 05:00 and 22:00';
  }
  if ('tzOffsetMin' in b && !(Number.isInteger(b.tzOffsetMin) && b.tzOffsetMin >= -720 && b.tzOffsetMin <= 840)) {
    e.tzOffsetMin = 'Choose a valid time zone';
  }
  if ('reminderMinutes' in b && !(Number.isInteger(b.reminderMinutes) && b.reminderMinutes >= 0 && b.reminderMinutes <= 120)) {
    e.reminderMinutes = 'Reminder must be 0–120 minutes before';
  }
  if ('useAI' in b && typeof b.useAI !== 'boolean') e.useAI = 'useAI must be true or false';
  if ('overrides' in b) {
    const o = b.overrides;
    const ok = o && typeof o === 'object' && !Array.isArray(o)
      && Object.entries(o).every(([d, h]) => isDate(d) && isNum(h) && h >= 0 && h <= 16);
    if (!ok) e.overrides = 'Extra hours must be 0–16 per date';
  }
  if ('name' in b && String(b.name || '').trim().length < 2) e.name = 'Enter your name (at least 2 characters)';
  return e;
}

function validateAttendance(b) {
  const e = {};
  if (!b.courseId) e.courseId = 'Choose a course';
  if (!isDate(b.date)) e.date = 'Choose a date';
  if (typeof b.present !== 'boolean') e.present = 'Mark present or absent';
  return e;
}

module.exports = {
  TASK_TYPES,
  validateSignup,
  validateLogin,
  validateCourse,
  validateTask,
  validateSettings,
  validateAttendance,
};
