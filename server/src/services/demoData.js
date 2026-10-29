// Loads realistic sample data for a user so the app can be demonstrated immediately.
// Replaces that user's existing courses, tasks, schedule, attendance and notifications.
const crypto = require('node:crypto');
const { withDefaults } = require('./settingsService');
const { localDate, addDays, toInstant, weekday } = require('../utils/dates');

const iso = (date, hm, tz) => new Date(toInstant(date, hm, tz)).toISOString();

async function seedDemo(store, userId, { now = Date.now() } = {}) {
  const user = await store.users.findOne({ id: userId });
  const tz = withDefaults(user.settings).tzOffsetMin;
  const today = localDate(now, tz);

  for (const col of ['courses', 'assignments', 'attendance', 'notifications', 'schedules']) {
    await store[col].remove({ userId });
  }

  const course = async (name, code, color, minAttendance = 75) => store.courses.insert({ userId, name, code, color, minAttendance });
  const dbms = await course('Database Management Systems', 'BCSE302L', '#e8743b');
  const os = await course('Operating Systems', 'BCSE303L', '#2fb380');
  const se = await course('Software Engineering', 'BCSE301L', '#4f7cff');
  const cn = await course('Computer Networks', 'BCSE308L', '#a05be0');

  const task = async (c, title, type, dayOffset, hm, weight, difficulty, estimatedHours, status = 'pending') => store.assignments.insert({
    userId, courseId: c.id, title, type, deadline: iso(addDays(today, dayOffset), hm, tz),
    weight, difficulty, estimatedHours, status,
    ...(status === 'done' ? { completedAt: iso(addDays(today, dayOffset - 1), '20:00', tz) } : {}),
  });

  // Finished work (gives the Insights page some history)
  const er = await task(dbms, 'Assignment 2 – ER diagrams', 'assignment', -4, '23:59', 10, 3, 4, 'done');
  const lab3 = await task(cn, 'Lab 3 – Subnetting', 'assignment', -2, '17:00', 5, 2, 2, 'done');
  const cat1 = await task(os, 'CAT-1 revision', 'exam', -6, '09:00', 15, 4, 6, 'done');

  // Upcoming work
  await task(dbms, 'Assignment 3 – Normalisation', 'assignment', 2, '23:59', 10, 3, 4);
  await task(os, 'Surprise quiz prep', 'quiz', 1, '09:00', 5, 2, 2);
  await task(se, 'CAT-2 preparation', 'exam', 7, '09:00', 30, 4, 8);
  await task(cn, 'Lab record – Socket programming', 'assignment', 5, '17:00', 8, 2, 3);
  await task(se, 'Mini-project report', 'assignment', 10, '23:59', 15, 3, 6);
  await task(os, 'Quiz 2 revision', 'quiz', 14, '09:00', 5, 2, 2);

  // Past study sessions: mostly done, a few missed, two late nights
  const past = [
    [-9, '10:00', cat1, 2, 'done', '12:05'], [-8, '16:00', cat1, 2, 'done', '18:10'],
    [-7, '16:00', cat1, 2, 'done', '23:40'], [-7, '18:30', er, 1, 'missed', null, 'Busy'],
    [-6, '16:00', er, 2, 'done', '18:00'], [-5, '16:00', er, 2, 'done', '23:20'],
    [-4, '16:00', lab3, 1, 'missed', null, 'Unwell'], [-3, '16:00', lab3, 2, 'done', '18:05'],
    [-2, '10:00', lab3, 1, 'missed', null, 'Forgot'],
  ];
  const sessions = past.map(([d, start, t, hours, status, doneAt, reason]) => ({
    id: crypto.randomUUID(), taskId: t.id, date: addDays(today, d), start, hours, status,
    ...(status === 'done' ? { completedAt: iso(addDays(today, d), doneAt, tz) } : { reason }),
  }));
  await store.schedules.upsert({ userId }, { sessions, source: 'none', unscheduled: [], warnings: [], previous: null });

  // Attendance for the last 4 weeks: 3 classes a week per course
  const pattern = {
    [dbms.id]: [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
    [os.id]: [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    [se.id]: [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1],
    [cn.id]: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1],
  };
  const classDays = [];
  for (let d = -28; d < 0 && classDays.length < 12; d += 1) {
    const date = addDays(today, d);
    if ([1, 3, 5].includes(weekday(date))) classDays.push(date);
  }
  for (const [courseId, marks] of Object.entries(pattern)) {
    for (let i = 0; i < classDays.length; i += 1) {
      await store.attendance.insert({ userId, courseId, date: classDays[i], present: Boolean(marks[i]) });
    }
  }
}

module.exports = { seedDemo };
