// Tests for the AI Quick Add feature (Assessment 10).
process.env.NODE_ENV = 'test';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { quickAdd, sanitize, buildTaskPrompt, parseTaskReply } = require('../src/ai/TaskParser');
const { makeClient } = require('../src/ai/AIClient');

const courses = [
  { id: 'c1', name: 'Database Management Systems', code: 'BCSE302L' },
  { id: 'c2', name: 'Operating Systems', code: 'BCSE303L' },
  { id: 'c3', name: 'Software Engineering', code: 'BCSE301L' },
];
const NOW = Date.parse('2026-10-29T16:30:00Z'); // Thu 29 Oct, 22:00 IST
const SENTENCE = 'DBMS assignment 4 on transactions due Friday 5 pm, worth 10%, about 3 hours, medium';

// A fake language model: returns whatever reply text the test gives it.
const fakeAI = (reply) => makeClient('gemini', 'test-model', async () => (reply instanceof Error ? Promise.reject(reply) : reply));

describe('AI Quick Add', () => {
  test('uses the AI answer when it is valid', async () => {
    const ai = fakeAI(JSON.stringify({
      courseId: 'c1', type: 'assignment', title: 'Assignment 4 – Transactions', date: '2026-10-30', time: '17:00',
      weight: 10, difficulty: 3, estimatedHours: 3,
    }));
    const r = await quickAdd({ text: SENTENCE, courses, aiClient: ai, now: NOW });
    assert.equal(r.source, 'ai');
    assert.equal(r.provider, 'gemini');
    assert.equal(r.draft.title, 'Assignment 4 – Transactions');
    assert.deepEqual(r.missing, []);
    assert.ok(Object.values(r.filledBy).every((v) => v === 'ai'));
  });

  test('rejects invalid AI values and fills them from the built-in parser', async () => {
    const ai = fakeAI('```json\n{"courseId":"c99","type":"lecture","title":"Assignment 4","date":"2020-01-01","time":"25:00","weight":150,"difficulty":9,"estimatedHours":3}\n```');
    const r = await quickAdd({ text: SENTENCE, courses, aiClient: ai, now: NOW });
    assert.equal(r.draft.courseId, 'c1');
    assert.equal(r.filledBy.courseId, 'rules');
    assert.equal(r.draft.type, 'assignment');
    assert.equal(r.draft.date, '2026-10-30');
    assert.equal(r.draft.time, '17:00');
    assert.equal(r.draft.weight, 10);
    assert.equal(r.filledBy.weight, 'rules');
    assert.equal(r.draft.difficulty, 3);
    assert.equal(r.filledBy.title, 'ai');
  });

  test('AI never invents: null fields stay empty and are listed as missing', async () => {
    const ai = fakeAI('{"courseId":null,"type":"assignment","title":"Read chapter 5","date":null,"time":null,"weight":null,"difficulty":null,"estimatedHours":null}');
    const r = await quickAdd({ text: 'read chapter 5', courses, aiClient: ai, now: NOW });
    assert.deepEqual(r.missing, ['courseId', 'date', 'weight']);
  });

  test('falls back to the built-in parser when the AI fails', async () => {
    const r = await quickAdd({ text: SENTENCE, courses, aiClient: fakeAI(new Error('AI timeout')), now: NOW });
    assert.equal(r.source, 'rules');
    assert.match(r.note, /AI unavailable \(AI timeout\)/);
    assert.equal(r.draft.courseId, 'c1');
    assert.equal(r.draft.estimatedHours, 3);
  });

  test('works with no AI key at all', async () => {
    const r = await quickAdd({ text: 'OS quiz tomorrow 9am 5% easy 2 hours', courses, aiClient: null, now: NOW });
    assert.equal(r.source, 'rules');
    assert.deepEqual(
      [r.draft.courseId, r.draft.type, r.draft.title, r.draft.date, r.draft.time, r.draft.weight, r.draft.difficulty, r.draft.estimatedHours],
      ['c2', 'quiz', 'OS quiz', '2026-10-30', '09:00', 5, 2, 2],
    );
  });

  test('built-in parser: dates, course codes, difficulty fractions', async () => {
    const r = await quickAdd({ text: '303L lab record due 5/11 at 17:00 worth 8 marks difficulty 2/5', courses, now: NOW });
    assert.equal(r.draft.courseId, 'c2');
    assert.equal(r.draft.date, '2026-11-05');
    assert.equal(r.draft.difficulty, 2);
    const r2 = await quickAdd({ text: 'Software engineering CAT-2 on 12 Nov, 30 percent, very hard, needs 8 hrs', courses, now: NOW });
    assert.deepEqual([r2.draft.type, r2.draft.date, r2.draft.weight, r2.draft.difficulty, r2.draft.estimatedHours], ['exam', '2026-11-12', 30, 5, 8]);
  });

  test('prompt lists the courses and today, and asks for JSON only', () => {
    const p = buildTaskPrompt({ text: SENTENCE, courses, today: '2026-10-29', nowTime: '22:00' });
    assert.match(p, /thursday 2026-10-29/);
    assert.match(p, /"courseId":"c1"/);
    assert.match(p, /Reply with JSON only/);
    assert.throws(() => parseTaskReply('not json'));
  });

  test('sanitize rounds hours to 0.5 and drops past dates', () => {
    const s = sanitize({ estimatedHours: 2.3, date: '2026-10-01' }, { courses, today: '2026-10-29' });
    assert.equal(s.estimatedHours, 2.5);
    assert.equal(s.date, null);
  });
});
