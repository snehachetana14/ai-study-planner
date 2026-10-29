// API tests: runs the real Express app on a random port.
// Uses an in-memory store by default. To test against MongoDB instead:
//   TEST_MONGO_URI=mongodb://localhost:27017/studyplanner_test npm test
process.env.NODE_ENV = 'test';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/db/memoryStore');

const config = { jwtSecret: 'test-secret', jwtTtlSeconds: 3600, clientDist: null };
const RUN = Date.now().toString(36);
const EMAIL = `sneha.${RUN}@vit.ac.in`;
let server;
let base;
let token;
let store;

before(async () => {
  if (process.env.TEST_MONGO_URI) {
    const { createMongoStore } = require('../src/db/mongoStore');
    store = await createMongoStore(process.env.TEST_MONGO_URI);
  } else {
    store = createMemoryStore();
  }
  server = createApp({ store, config }).listen(0);
  await new Promise((ok) => server.once('listening', ok));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await store.close();
});

async function call(method, path, body, auth = true) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const inDays = (d, h = 12) => new Date(Date.now() + d * 86400000 + h * 3600000).toISOString();

describe('Auth', () => {
  test('signup validates input', async () => {
    const r = await call('POST', '/auth/signup', { name: 'S', email: 'bad', password: '1' }, false);
    assert.equal(r.status, 400);
    assert.ok(r.body.fields.email && r.body.fields.password && r.body.fields.name);
  });
  test('signup, duplicate email, login', async () => {
    const r = await call('POST', '/auth/signup', { name: 'Sneha', email: EMAIL.replace('sneha', 'Sneha'), password: 'secret123' }, false);
    assert.equal(r.status, 201);
    assert.equal(r.body.user.email, EMAIL);
    const dup = await call('POST', '/auth/signup', { name: 'Sneha', email: EMAIL, password: 'secret123' }, false);
    assert.equal(dup.status, 409);
    const bad = await call('POST', '/auth/login', { email: EMAIL, password: 'nope' }, false);
    assert.equal(bad.status, 401);
    const ok = await call('POST', '/auth/login', { email: EMAIL, password: 'secret123' }, false);
    assert.equal(ok.status, 200);
    token = ok.body.token;
  });
  test('protected route needs a token', async () => {
    const r = await call('GET', '/courses', undefined, false);
    assert.equal(r.status, 401);
  });
});

describe('Courses, tasks and schedule', () => {
  let courseId;
  let taskId;

  test('create course', async () => {
    const r = await call('POST', '/courses', { name: 'Software Engineering', code: 'BCSE301L', color: '#4f7cff' });
    assert.equal(r.status, 201);
    courseId = r.body.course.id;
  });

  test('add task rejects weight 130 (Assessment 9, Screen 2)', async () => {
    const r = await call('POST', '/assignments', {
      courseId, title: 'CAT-2 preparation', type: 'exam', deadline: inDays(8), weight: 130, difficulty: 4, estimatedHours: 8,
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.fields.weight, 'Enter a value from 0 to 100');
  });

  test('add task re-plans and reports added sessions', async () => {
    const r = await call('POST', '/assignments', {
      courseId, title: 'CAT-2 preparation', type: 'exam', deadline: inDays(8), weight: 30, difficulty: 4, estimatedHours: 8,
    });
    assert.equal(r.status, 201);
    taskId = r.body.task.id;
    assert.ok(r.body.changes.added.length > 0);
    assert.equal(r.body.schedule.source, 'rules');
    const planned = r.body.schedule.sessions.filter((s) => s.taskId === taskId).reduce((a, s) => a + s.hours, 0);
    assert.equal(planned, 8);
    assert.equal(r.body.schedule.canUndo, true);
  });

  test('undo right after adding a task removes it again', async () => {
    const r = await call('POST', '/assignments', {
      courseId, title: 'Temporary task', type: 'quiz', deadline: inDays(4), weight: 5, difficulty: 2, estimatedHours: 2,
    });
    assert.equal(r.status, 201);
    const u = await call('POST', '/schedule/undo');
    assert.equal(u.status, 200);
    assert.ok(!u.body.schedule.tasks.some((t) => t.id === r.body.task.id));
    assert.ok(!u.body.schedule.sessions.some((s) => s.taskId === r.body.task.id));
  });

  test('schedule view has ranked tasks and day capacities', async () => {
    const r = await call('GET', '/schedule');
    assert.equal(r.status, 200);
    assert.equal(r.body.ranked[0].id, taskId);
    assert.ok(r.body.days.length === 56);
    assert.ok(r.body.sessions.every((s) => s.end));
  });

  test('mark a session missed: re-plans, keeps hours, can undo', async () => {
    const before = (await call('GET', '/schedule')).body;
    const first = before.sessions.find((s) => s.status === 'planned');
    const r = await call('PATCH', `/sessions/${first.id}`, { status: 'missed', reason: 'Busy' });
    assert.equal(r.status, 200);
    assert.equal(r.body.changes.missed.id, first.id);
    const s = r.body.schedule.sessions.find((x) => x.id === first.id);
    assert.equal(s.status, 'missed');
    assert.equal(s.reason, 'Busy');
    const planned = r.body.schedule.sessions.filter((x) => x.status === 'planned').reduce((a, x) => a + x.hours, 0);
    assert.equal(planned, 8);

    const u = await call('POST', '/schedule/undo');
    assert.equal(u.status, 200);
    assert.equal(u.body.schedule.sessions.find((x) => x.id === first.id).status, 'planned');
    assert.equal(u.body.schedule.canUndo, false);
  });

  test('mark session done counts towards the task', async () => {
    const sch = (await call('GET', '/schedule')).body;
    const first = sch.sessions.find((s) => s.status === 'planned');
    const r = await call('PATCH', `/sessions/${first.id}`, { status: 'done' });
    assert.equal(r.status, 200);
    const t = r.body.schedule.tasks.find((x) => x.id === taskId);
    assert.equal(t.hoursDone, first.hours);
  });

  test('a task that cannot fit creates a conflict that can be resolved', async () => {
    const r = await call('POST', '/assignments', {
      courseId, title: 'Huge report', type: 'assignment', deadline: inDays(2), weight: 20, difficulty: 3, estimatedHours: 40,
    });
    assert.equal(r.status, 201);
    const conflict = r.body.schedule.unscheduled.find((u) => u.taskId === r.body.task.id);
    assert.ok(conflict, 'expected a conflict');
    const remind = await call('POST', '/schedule/resolve', { taskId: r.body.task.id, action: 'remind' });
    assert.equal(remind.status, 200);
    assert.ok(remind.body.notification.title.includes('Huge report'));
    const add = await call('POST', '/schedule/resolve', { taskId: r.body.task.id, action: 'addHours' });
    assert.equal(add.status, 200);
    const left = add.body.schedule.unscheduled.find((u) => u.taskId === r.body.task.id);
    assert.ok(!left || left.hoursLeft < conflict.hoursLeft);
    await call('DELETE', `/assignments/${r.body.task.id}`);
  });

  test('AI Quick Add returns a filled draft and saves nothing', async () => {
    const before = (await call('GET', '/assignments')).body.tasks.length;
    const bad = await call('POST', '/ai/quick-add', { text: 'x' });
    assert.equal(bad.status, 400);
    const r = await call('POST', '/ai/quick-add', { text: 'SE viva next week worth 12%, hard, 4 hours' });
    assert.equal(r.status, 200);
    assert.equal(r.body.draft.courseId, courseId);
    assert.equal(r.body.draft.type, 'exam');
    assert.equal(r.body.draft.weight, 12);
    assert.equal(r.body.source, 'rules');
    assert.equal((await call('GET', '/assignments')).body.tasks.length, before);
  });

  test('settings validation and save re-plans', async () => {
    const bad = await call('PUT', '/settings', { weeklyHours: [1, 2, 3] });
    assert.equal(bad.status, 400);
    const r = await call('PUT', '/settings', { weeklyHours: [2, 2, 2, 2, 2, 2, 2], useAI: false });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.settings.weeklyHours, [2, 2, 2, 2, 2, 2, 2]);
    assert.equal(r.body.schedule.sourceNote, 'No AI key set');
  });
});

describe('Attendance, insights, notifications, sample data', () => {
  test('attendance summary and below-minimum message', async () => {
    const { body } = await call('GET', '/courses');
    const courseId = body.courses[0].id;
    for (const [date, present] of [['2026-10-01', true], ['2026-10-03', false], ['2026-10-05', false], ['2026-10-07', true]]) {
      await call('POST', '/attendance', { courseId, date, present });
    }
    const again = await call('POST', '/attendance', { courseId, date: '2026-10-07', present: true });
    const c = again.body.courses[0];
    assert.equal(c.total, 4);
    assert.equal(c.pct, 50);
    assert.equal(c.status, 'low');
    assert.equal(c.needToAttend, 4);
  });

  test('sample data loads courses, tasks, history and a plan', async () => {
    const r = await call('POST', '/demo/seed');
    assert.equal(r.status, 200);
    assert.equal(r.body.schedule.courses.length, 4);
    assert.ok(r.body.schedule.sessions.some((s) => s.status === 'done'));
    assert.ok(r.body.schedule.sessions.some((s) => s.status === 'planned'));
  });

  test('insights report signals and a level', async () => {
    const r = await call('GET', '/insights');
    assert.equal(r.status, 200);
    assert.equal(r.body.days.length, 14);
    assert.ok(['On track', 'Watch', 'At risk'].includes(r.body.level));
    assert.ok(r.body.totals.sessionsMissed >= 3);
  });

  test('notifications list and mark all read', async () => {
    const r = await call('GET', '/notifications');
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length > 0);
    await call('POST', '/notifications/read', {});
    const after2 = await call('GET', '/notifications');
    assert.equal(after2.body.unread, 0);
  });
});
