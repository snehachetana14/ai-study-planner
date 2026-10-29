// Unit tests for the scheduling engine (extends the Assessment 8 test suite).
process.env.NODE_ENV = 'test';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { score, rank, urgency, label } = require('../src/ai/PriorityScorer');
const { validate } = require('../src/ai/PlanValidator');
const { parseReply } = require('../src/ai/PromptBuilder');
const planner = require('../src/services/planner');
const { computePlan, diffPlans } = require('../src/services/ReplanningService');
const { lastStudyDay, localDate } = require('../src/utils/dates');
const { DEFAULT_SETTINGS } = require('../src/services/settingsService');

// 22 Oct 2026, 14:30 IST
const NOW = Date.parse('2026-10-22T09:00:00Z');
const tasks = () => [
  { id: 'A1', title: 'DBMS Assignment 3', deadline: '2026-10-24T00:00:00Z', weight: 10, difficulty: 3, estimatedHours: 4, status: 'pending' },
  { id: 'E1', title: 'SE CAT-2', deadline: '2026-10-30T00:00:00Z', weight: 30, difficulty: 4, estimatedHours: 8, status: 'pending' },
  { id: 'Q1', title: 'OS Quiz 2', deadline: '2026-11-10T00:00:00Z', weight: 5, difficulty: 2, estimatedHours: 2, status: 'pending' },
];
const settings = { ...DEFAULT_SETTINGS, weeklyHours: [4, 3, 3, 3, 3, 3, 4] };

describe('PriorityScorer', () => {
  test('DBMS assignment scores 57.2', () => assert.equal(score(tasks()[0], NOW), 57.2));
  test('overdue task has full urgency', () => assert.equal(urgency(Date.parse('2026-10-20T00:00:00Z'), NOW), 1));
  test('ranks A1 > E1 > Q1 with labels', () => {
    const r = rank(tasks(), NOW);
    assert.deepEqual(r.map((t) => t.id), ['A1', 'E1', 'Q1']);
    assert.deepEqual(r.map((t) => t.label), ['High', 'Med', 'Low']);
  });
  test('label thresholds', () => assert.deepEqual([label(50), label(25), label(24.9)], ['High', 'Med', 'Low']));
});

describe('Dates', () => {
  test('quiz at 09:00 IST on 23 Oct: last study day is 22 Oct', () => {
    assert.equal(lastStudyDay('2026-10-23T03:30:00Z', 330), '2026-10-22');
  });
  test('local date uses the time zone', () => {
    assert.equal(localDate(Date.parse('2026-10-22T20:00:00Z'), 330), '2026-10-23');
  });
});

describe('PlanValidator', () => {
  const ctx = {
    tasks: tasks().map((t) => ({ ...t, remaining: t.estimatedHours })),
    availability: [{ date: '2026-10-22', hours: 3 }, { date: '2026-10-23', hours: 3 }, { date: '2026-10-26', hours: 3 }],
    today: '2026-10-22',
    tzOffsetMin: 330,
  };
  test('valid plan passes', () => {
    assert.equal(validate([{ taskId: 'A1', date: '2026-10-22', hours: 2 }, { taskId: 'E1', date: '2026-10-22', hours: 1 }], ctx).valid, true);
  });
  test('overbooked day fails', () => assert.equal(validate([{ taskId: 'A1', date: '2026-10-22', hours: 2 }, { taskId: 'E1', date: '2026-10-22', hours: 2 }], ctx).valid, false));
  test('block over 2 h fails', () => assert.equal(validate([{ taskId: 'E1', date: '2026-10-22', hours: 2.5 }], ctx).valid, false));
  test('after deadline fails', () => assert.equal(validate([{ taskId: 'A1', date: '2026-10-26', hours: 1 }], ctx).valid, false));
  test('more hours than needed fails', () => {
    const plan = [{ taskId: 'Q1', date: '2026-10-22', hours: 2 }, { taskId: 'Q1', date: '2026-10-23', hours: 1 }];
    assert.equal(validate(plan, ctx).valid, false);
  });
  test('non-array fails', () => assert.equal(validate({}, ctx).valid, false));
});

describe('PromptBuilder.parseReply', () => {
  test('reads {sessions:[...]} and code fences', () => {
    const out = parseReply('```json\n{"sessions":[{"taskId":"A1","date":"2026-10-22","hours":"2"}]}\n```');
    assert.deepEqual(out, [{ taskId: 'A1', date: '2026-10-22', hours: 2 }]);
  });
  test('rejects replies without sessions', () => assert.throws(() => parseReply('{"plan":1}')));
});

describe('Planner', () => {
  test('availability: today starts after now, history uses up hours', () => {
    const history = [{ taskId: 'A1', date: '2026-10-22', start: '16:00', hours: 2, status: 'missed' }];
    // now = 18:10 IST
    const av = planner.buildAvailability({ settings, history, now: Date.parse('2026-10-22T12:40:00Z'), tz: 330, until: '2026-10-24' });
    assert.deepEqual(av[0], { date: '2026-10-22', hours: 1, startMin: 18 * 60 + 30 });
    assert.equal(av.length, 3);
  });
  test('assignTimes: 30-minute break between blocks', () => {
    const out = planner.assignTimes(
      [{ taskId: 'E1', date: '2026-10-23', hours: 1 }, { taskId: 'A1', date: '2026-10-23', hours: 2 }],
      [{ date: '2026-10-23', hours: 3, startMin: 16 * 60 }],
      ['A1', 'E1'],
    );
    assert.deepEqual(out.map((s) => `${s.taskId} ${s.start}`), ['A1 16:00', 'E1 18:30']);
  });
  test('deadline-first fallback rescues an urgent low-weight task (OBS-01)', () => {
    const ranked = rank([
      { id: 'A1', deadline: '2026-10-24T00:00:00Z', weight: 10, difficulty: 3, remaining: 2 },
      { id: 'N1', deadline: '2026-10-23T03:30:00Z', weight: 5, difficulty: 2, remaining: 2 },
    ], NOW);
    const availability = [{ date: '2026-10-22', hours: 2 }, { date: '2026-10-23', hours: 2 }];
    const plan = planner.bestGreedyPlan(ranked, availability, 330);
    assert.deepEqual(plan.unscheduled, []);
  });
  test('a task on its last study day gets all the hours it needs that day', () => {
    // A3 must finish by Fri (needs 3 h); CAT-2 ranks lower but competes for Friday's 3 h.
    const ranked = rank([
      { id: 'A3', deadline: '2026-10-24T00:00:00Z', weight: 10, difficulty: 3, remaining: 3 },
      { id: 'CAT', deadline: '2026-10-30T00:00:00Z', weight: 30, difficulty: 4, remaining: 4 },
    ], NOW);
    const sessions = planner.greedyPlan(ranked, [{ date: '2026-10-23', hours: 3 }], 330);
    assert.equal(sessions.filter((s) => s.taskId === 'A3').reduce((a, s) => a + s.hours, 0), 3);
  });
  test('a deadline at 23:59 still allows study that day', () => {
    assert.equal(lastStudyDay('2026-10-31T18:29:00Z', 330), '2026-10-31');
  });
});

describe('computePlan', () => {
  const base = () => ({ tasks: tasks(), courses: [], settings, history: [], now: NOW });

  test('rule plan has no overbooked day and blocks <= 2 h', async () => {
    const r = await computePlan(base());
    assert.equal(r.source, 'rules');
    assert.equal(r.sourceNote, 'No AI key set');
    assert.ok(r.future.every((s) => s.hours <= 2 && /^\d\d:\d\d$/.test(s.start)));
    const check = validate(r.future, { tasks: r.ranked, availability: r.availability, today: r.today, tzOffsetMin: 330 });
    assert.equal(check.valid, true, check.errors.join('; '));
  });

  test('valid AI plan is used and gaps are filled by rules', async () => {
    const ai = { provider: 'gemini', suggestSlots: async () => [{ taskId: 'A1', date: '2026-10-22', hours: 2 }] };
    const r = await computePlan({ ...base(), aiClient: ai });
    assert.equal(r.source, 'ai');
    assert.equal(r.sourceNote, 'gemini + rules filled gaps');
    assert.ok(r.future.length > 1);
  });

  test('AI error falls back to rules with a note', async () => {
    const ai = { provider: 'gemini', suggestSlots: async () => { throw new Error('429 rate limit'); } };
    const r = await computePlan({ ...base(), aiClient: ai });
    assert.equal(r.source, 'rules');
    assert.equal(r.sourceNote, 'AI was busy');
    assert.match(r.warnings[0], /429/);
  });

  test('invalid AI plan is rejected', async () => {
    const ai = { provider: 'openai', suggestSlots: async () => [{ taskId: 'A1', date: '2026-10-22', hours: 9 }] };
    const r = await computePlan({ ...base(), aiClient: ai });
    assert.equal(r.source, 'rules');
    assert.equal(r.sourceNote, 'AI plan failed checks');
  });

  test('AI turned off in settings is respected', async () => {
    const ai = { provider: 'gemini', suggestSlots: async () => { throw new Error('should not be called'); } };
    const r = await computePlan({ ...base(), settings: { ...settings, useAI: false }, aiClient: ai });
    assert.equal(r.sourceNote, 'AI turned off in Settings');
  });

  test('done hours reduce what is planned', async () => {
    const history = [{ id: 'h1', taskId: 'A1', date: '2026-10-21', start: '16:00', hours: 2, status: 'done' }];
    const r = await computePlan({ ...base(), history });
    const a1 = r.future.filter((s) => s.taskId === 'A1').reduce((a, s) => a + s.hours, 0);
    assert.equal(a1, 2);
  });

  test('work that cannot fit is reported with options', async () => {
    const t = tasks();
    t[0].estimatedHours = 12;
    const r = await computePlan({ ...base(), tasks: t });
    const c = r.unscheduled.find((u) => u.taskId === 'A1');
    assert.ok(c && c.hoursLeft > 0);
    assert.deepEqual(c.options.map((o) => o.action), ['addHours', 'remind']);
    assert.equal(c.options[0].date, '2026-10-23');
  });
});

describe('diffPlans', () => {
  test('reports removed, added, changed and kept', () => {
    const oldP = [{ taskId: 'A', date: 'd1', hours: 2 }, { taskId: 'B', date: 'd1', hours: 1 }, { taskId: 'C', date: 'd2', hours: 1 }];
    const newP = [{ taskId: 'A', date: 'd1', hours: 2 }, { taskId: 'B', date: 'd1', hours: 2 }, { taskId: 'C', date: 'd3', hours: 1 }];
    const d = diffPlans(oldP, newP);
    assert.equal(d.keptCount, 1);
    assert.deepEqual(d.changed, [{ taskId: 'B', date: 'd1', from: 1, to: 2 }]);
    assert.deepEqual(d.removed, [{ taskId: 'C', date: 'd2', hours: 1 }]);
    assert.deepEqual(d.added, [{ taskId: 'C', date: 'd3', hours: 1 }]);
  });
});
