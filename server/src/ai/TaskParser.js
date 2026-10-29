// AI Quick Add: turns a sentence such as
//   "DBMS assignment 4 due Friday 5 pm, worth 10%, about 3 hours, medium"
// into task fields. The language model does the reading; this file builds its prompt,
// checks its answer, and provides a rule-based parser used when the AI is not available.
const { localDate, localMinutes, addDays, weekday } = require('../utils/dates');

const FIELDS = ['courseId', 'type', 'title', 'date', 'time', 'weight', 'difficulty', 'estimatedHours'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------- Prompt for the language model ----------

function buildTaskPrompt({ text, courses, today, nowTime }) {
  const list = courses.map((c) => ({ courseId: String(c.id), name: c.name, code: c.code || '' }));
  return [
    'You help a college student add a task to their study planner.',
    `Today is ${DAYS[weekday(today)]} ${today}; the time now is ${nowTime}.`,
    `The student's courses: ${JSON.stringify(list)}`,
    '',
    `Student's sentence: """${String(text).slice(0, 500)}"""`,
    '',
    'Extract the task. Rules:',
    '- courseId: the courseId from the list that the sentence refers to (by name, code or common short form such as DBMS, OS, CN, SE). null if unclear.',
    '- type: "assignment", "exam" or "quiz". Tests, CATs, mid-sems, finals and vivas are "exam"; labs, reports, records and projects are "assignment".',
    '- title: a short title (3–60 characters) without the date, time, weight or hours.',
    '- date: deadline date as YYYY-MM-DD. Resolve words like "tomorrow" or "next Friday" from today. null if not given.',
    '- time: deadline time as HH:MM in 24-hour format. null if not given.',
    '- weight: percent of the final grade (0–100). null if not given.',
    '- difficulty: 1–5 (1 very easy, 3 medium, 5 very hard). null if not given.',
    '- estimatedHours: study hours needed, 0.5–40 in steps of 0.5. null if not given.',
    'Never invent values that the sentence does not support; use null instead.',
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"courseId":null,"type":"assignment","title":"","date":null,"time":null,"weight":null,"difficulty":null,"estimatedHours":null}',
  ].join('\n');
}

function parseTaskReply(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty AI reply');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI reply is not an object');
  return parsed;
}

// ---------- Checking the AI's answer (never trust it blindly) ----------

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pad = (n) => String(n).padStart(2, '0');

// Keeps only values that are valid; anything else becomes null.
function sanitize(raw, { courses, today }) {
  const out = Object.fromEntries(FIELDS.map((f) => [f, null]));
  if (!raw || typeof raw !== 'object') return out;
  if (raw.courseId != null && courses.some((c) => String(c.id) === String(raw.courseId))) out.courseId = String(raw.courseId);
  if (['assignment', 'exam', 'quiz'].includes(raw.type)) out.type = raw.type;
  if (typeof raw.title === 'string') {
    const t = raw.title.trim().replace(/\s+/g, ' ');
    if (t.length >= 3 && t.length <= 80) out.title = t;
  }
  if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && !Number.isNaN(Date.parse(raw.date)) && raw.date >= today) {
    out.date = raw.date;
  }
  if (typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) out.time = raw.time;
  const w = Number(raw.weight);
  if (raw.weight !== null && raw.weight !== '' && isNum(w) && w >= 0 && w <= 100) out.weight = w;
  const d = Number(raw.difficulty);
  if (Number.isInteger(d) && d >= 1 && d <= 5) out.difficulty = d;
  const h = Number(raw.estimatedHours);
  if (raw.estimatedHours !== null && isNum(h) && h > 0) out.estimatedHours = Math.min(40, Math.max(0.5, Math.round(h * 2) / 2));
  return out;
}

// ---------- Rule-based parser (fallback when there is no AI) ----------

const acronym = (name) => name.split(/[\s&-]+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w))
  .filter((w) => !['and', 'of', 'the', 'for'].includes(w.toLowerCase())).map((w) => w[0]).join('').toLowerCase();
const has = (text, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text);

// Common short forms students use for course names.
const ALIASES = [
  [/database/, ['dbms', 'db']], [/operating system/, ['os']], [/computer network/, ['cn', 'networks']],
  [/software engineering/, ['se']], [/data structure/, ['ds', 'dsa']], [/algorithm/, ['daa', 'algo']],
  [/artificial intelligence/, ['ai']], [/machine learning/, ['ml']], [/compiler/, ['cd']],
  [/theory of computation/, ['toc']], [/computer organi[sz]ation/, ['coa']], [/cyber ?security/, ['cs', 'cyber']],
  [/web/, ['wt', 'web']], [/mathematics|maths|calculus|probability|statistics/, ['maths', 'math']],
];

function findCourse(t, courses) {
  let best = null;
  let bestScore = 0;
  for (const c of courses) {
    const name = c.name.toLowerCase();
    const aliases = ALIASES.filter(([re]) => re.test(name)).flatMap(([, list]) => list);
    let score = 0;
    if (c.code && (has(t, c.code.toLowerCase()) || has(t, c.code.toLowerCase().replace(/^[a-z]+/, '')))) score = 4;
    else if (has(t, name)) score = 4;
    else if (aliases.some((a) => has(t, a))) score = 3;
    else if (acronym(c.name).length >= 2 && has(t, acronym(c.name))) score = 3;
    else {
      const words = c.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 5);
      if (words.some((w) => has(t, w) || has(t, w.replace(/s$/, '')))) score = 1;
    }
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function findType(t) {
  if (/\b(exam|cat|cat-?\d|mid-?sem|midterm|end-?sem|final|test|viva|fat)\b/.test(t)) return 'exam';
  if (/\bquiz(zes)?\b/.test(t)) return 'quiz';
  if (/\b(assignment|homework|lab|report|project|record|essay|da\d?|submission)\b/.test(t)) return 'assignment';
  return null;
}

function findDate(text, today) {
  const t = text.replace(/\b[1-5]\s*\/\s*5\b/g, ' '); // "3/5" is a difficulty, not 3 May
  if (/\bday after tomorrow\b/.test(t)) return addDays(today, 2);
  if (/\btomorrow\b|\btmrw\b/.test(t)) return addDays(today, 1);
  if (/\btoday\b|\btonight\b/.test(t)) return today;
  const inDays = /\bin (\d{1,2}) days?\b/.exec(t);
  if (inDays) return addDays(today, Number(inDays[1]));
  if (/\bnext week\b/.test(t)) return addDays(today, 7);
  // A weekday name means its next occurrence (1–7 days ahead).
  const dayIdx = DAYS.findIndex((d) => has(t, d) || has(t, d.slice(0, 3)));
  if (dayIdx >= 0) {
    const diff = (dayIdx - weekday(today) + 7) % 7 || 7;
    return addDays(today, diff);
  }
  const year = Number(today.slice(0, 4));
  const build = (d, m) => {
    let date = `${year}-${pad(m)}-${pad(d)}`;
    if (date < today) date = `${year + 1}-${pad(m)}-${pad(d)}`;
    return Number.isNaN(Date.parse(date)) ? null : date;
  };
  const dm = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\b/.exec(t);
  if (dm && MONTHS.includes(dm[2])) return build(Number(dm[1]), MONTHS.indexOf(dm[2]) + 1);
  const md = /\b([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t);
  if (md && MONTHS.includes(md[1])) return build(Number(md[2]), MONTHS.indexOf(md[1]) + 1);
  const slash = /\b(\d{1,2})[/-](\d{1,2})\b/.exec(t);
  if (slash && Number(slash[2]) <= 12) return build(Number(slash[1]), Number(slash[2]));
  return null;
}

function findTime(t) {
  const ampm = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/.exec(t);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3] === 'pm') h += 12;
    return h < 24 ? `${pad(h)}:${ampm[2] || '00'}` : null;
  }
  const hm = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(t);
  if (hm) return `${pad(Number(hm[1]))}:${hm[2]}`;
  if (/\bnoon\b/.test(t)) return '12:00';
  if (/\bmidnight\b/.test(t)) return '23:59';
  if (/\bmorning\b/.test(t)) return '09:00';
  if (/\bevening\b/.test(t)) return '18:00';
  return null;
}

function findWeight(t) {
  const m = /(\d{1,3}(?:\.\d+)?)\s*(%|percent\b|marks?\b)/.exec(t);
  if (!m) return null;
  const w = Number(m[1]);
  return w <= 100 ? w : null;
}

function findHours(t) {
  const m = /(\d{1,2}(?:\.\d+)?)\s*(?:-\s*\d+\s*)?(h|hr|hrs|hour|hours)\b/.exec(t);
  return m ? Number(m[1]) : null;
}

function findDifficulty(t) {
  const n = /difficulty\s*(?:is\s*|of\s*|:)?\s*([1-5])\b/.exec(t) || /\b([1-5])\s*\/\s*5\b/.exec(t);
  if (n) return Number(n[1]);
  if (/\bvery (hard|difficult|tough)\b/.test(t)) return 5;
  if (/\bvery easy\b/.test(t)) return 1;
  if (/\b(hard|difficult|tough|challenging)\b/.test(t)) return 4;
  if (/\b(medium|moderate|average|okay)\b/.test(t)) return 3;
  if (/\b(easy|simple)\b/.test(t)) return 2;
  return null;
}

// Words that describe the deadline, weight, effort or difficulty are not part of the title.
const NOT_TITLE = [
  /\b(on|at|by|for)?\s*(today|tonight|tomorrow|tmrw|day after tomorrow|next week|this week)\b/gi,
  /\b(on|at|by|for|this|next)?\s*(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b/gi,
  /\bin \d{1,2} days?\b/gi,
  /\b(on|by)?\s*\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi,
  /\b(on|by)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(st|nd|rd|th)?\b/gi,
  /\b(at)?\s*\d{1,2}([:.]\d{2})?\s*(am|pm)\b/gi, /\b(at)?\s*([01]?\d|2[0-3]):[0-5]\d\b/gi,
  /\b\d{1,3}(\.\d+)?\s*(%|percent|marks?)/gi, /\b\d{1,2}(\.\d+)?\s*(h|hr|hrs|hours?)\b/gi,
  /\bdifficulty\s*[:=]?\s*[1-5]\b/gi, /\b[1-5]\s*\/\s*5\b/gi,
  /\b(very\s+)?(easy|simple|medium|moderate|hard|difficult|tough|challenging)\b/gi,
];

function findTitle(text) {
  let first = String(text).split(/,|\b(?:due|before|deadline|worth|weight|takes|needs|about|around)\b/i)[0];
  for (const re of NOT_TITLE) first = first.replace(re, ' ');
  first = first.replace(/^\s*(add|create|new|i have|i've got|there is|there's|my|a|an)\s+/i, '').replace(/^\s*(a|an)\s+/i, '').trim();
  first = first.replace(/\s+(on|at|by|for|in)\s*$/i, '');
  first = first.replace(/\s+/g, ' ').replace(/[\s.:;-]+$/, '');
  if (first.length < 3) return null;
  return first.charAt(0).toUpperCase() + first.slice(1, 80);
}

function parseTaskRules(text, { courses }) {
  const t = String(text).toLowerCase();
  return {
    courseId: (findCourse(t, courses) || {}).id || null,
    type: findType(t),
    title: findTitle(text),
    dateText: t,
    weight: findWeight(t),
    difficulty: findDifficulty(t),
    estimatedHours: findHours(t),
    time: findTime(t),
  };
}

// ---------- The feature: AI first, rules for anything the AI could not give ----------

async function quickAdd({ text, courses, aiClient, now = Date.now(), tz = 330 }) {
  const today = localDate(now, tz);
  const m = localMinutes(now, tz);
  const nowTime = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  const rulesRaw = parseTaskRules(text, { courses });
  const rules = sanitize({ ...rulesRaw, date: findDate(rulesRaw.dateText, today) }, { courses, today });

  let ai = null;
  let note = null;
  if (aiClient) {
    try {
      ai = sanitize(await aiClient.parseTask({ text, courses, today, nowTime }), { courses, today });
    } catch (err) {
      note = `AI unavailable (${err.message}); used the built-in parser.`;
    }
  } else {
    note = 'No AI key set; used the built-in parser.';
  }

  const draft = {};
  const filledBy = {};
  for (const f of FIELDS) {
    if (ai && ai[f] !== null) { draft[f] = ai[f]; filledBy[f] = 'ai'; }
    else if (rules[f] !== null) { draft[f] = rules[f]; filledBy[f] = 'rules'; }
    else { draft[f] = null; filledBy[f] = null; }
  }
  if (draft.date && !draft.time) { draft.time = '23:59'; filledBy.time = 'default'; }
  const missing = ['courseId', 'title', 'date', 'weight'].filter((f) => draft[f] === null);
  const usedAI = Object.values(filledBy).includes('ai');

  return {
    draft,
    filledBy,
    missing,
    source: usedAI ? 'ai' : 'rules',
    provider: usedAI ? aiClient.provider : null,
    note,
  };
}

module.exports = { buildTaskPrompt, parseTaskReply, sanitize, parseTaskRules, findDate, quickAdd, FIELDS };
