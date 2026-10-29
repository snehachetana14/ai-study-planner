// PromptBuilder: turns ranked tasks and free hours into a prompt for the language model.
const { lastStudyDay } = require('../utils/dates');

function buildPrompt({ ranked, availability, today, tzOffsetMin, courses = [] }) {
  const courseName = new Map(courses.map((c) => [String(c.id), c.name]));
  const tasks = ranked.map((t) => ({
    taskId: String(t.id),
    title: t.title,
    course: courseName.get(String(t.courseId)) || '',
    type: t.type,
    priorityScore: t.score,
    hoursNeeded: t.remaining,
    lastStudyDay: lastStudyDay(t.deadline, tzOffsetMin),
    weightPercent: t.weight,
    difficulty: t.difficulty,
  }));
  const days = availability.map((a) => ({ date: a.date, freeHours: a.hours }));

  return [
    'You are a study-planning assistant for a college student.',
    `Today is ${today}. Build a study plan that splits each task into study sessions on the free days below.`,
    '',
    'Rules (all must hold):',
    '1. Only use dates listed in FREE_DAYS. Never plan more hours on a date than its freeHours.',
    '2. Never plan a task on a date later than its lastStudyDay.',
    '3. Each session is 0.5 to 2 hours, in steps of 0.5.',
    '4. Never plan more total hours for a task than its hoursNeeded.',
    '5. Give earlier dates to higher priorityScore tasks, but spread big tasks over several days instead of cramming.',
    '6. Prefer putting hard tasks (difficulty 4-5) earlier in the plan.',
    '',
    `TASKS = ${JSON.stringify(tasks)}`,
    `FREE_DAYS = ${JSON.stringify(days)}`,
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"sessions":[{"taskId":"<taskId>","date":"YYYY-MM-DD","hours":1.5}]}',
  ].join('\n');
}

// Pulls the sessions array out of a model reply (tolerates code fences or a bare array).
function parseReply(text) {
  if (typeof text !== 'string') throw new Error('empty AI reply');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  const sessions = Array.isArray(parsed) ? parsed : parsed.sessions;
  if (!Array.isArray(sessions)) throw new Error('AI reply has no sessions array');
  return sessions.map((s) => ({ taskId: String(s.taskId), date: String(s.date), hours: Number(s.hours) }));
}

module.exports = { buildPrompt, parseReply };
