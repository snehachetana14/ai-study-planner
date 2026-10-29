// PlanValidator: checks a proposed plan (usually from the AI) before it is saved.
// Returns { valid, errors[] } and never throws on bad plan content.
const { lastStudyDay, DEFAULT_TZ } = require('../utils/dates');

const MAX_BLOCK_HOURS = 2;

function validate(sessions, { tasks, availability, today, tzOffsetMin = DEFAULT_TZ }) {
  const errors = [];
  if (!Array.isArray(sessions)) return { valid: false, errors: ['plan must be an array of sessions'] };

  const taskById = new Map(tasks.map((t) => [String(t.id), t]));
  const capacity = new Map(availability.map((a) => [a.date, a.hours]));
  const usedByDay = new Map();
  const usedByTask = new Map();

  sessions.forEach((s, i) => {
    const where = `session ${i + 1}`;
    if (!s || typeof s !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    const task = taskById.get(String(s.taskId));
    if (!task) errors.push(`${where}: unknown taskId ${s.taskId}`);
    const hoursOk = typeof s.hours === 'number' && s.hours > 0 && Math.round(s.hours * 2) === s.hours * 2;
    if (!hoursOk) errors.push(`${where}: hours must be a positive multiple of 0.5`);
    else if (s.hours > MAX_BLOCK_HOURS) errors.push(`${where}: blocks must be at most ${MAX_BLOCK_HOURS} h`);
    if (!capacity.has(s.date)) errors.push(`${where}: ${s.date} is not an available study day`);
    if (typeof s.date !== 'string' || s.date < today) errors.push(`${where}: ${s.date} is in the past`);
    if (task && s.date > lastStudyDay(task.deadline, tzOffsetMin)) {
      errors.push(`${where}: ${s.date} is after the deadline of ${task.title || task.id}`);
    }
    const h = hoursOk ? s.hours : 0;
    usedByDay.set(s.date, (usedByDay.get(s.date) || 0) + h);
    usedByTask.set(String(s.taskId), (usedByTask.get(String(s.taskId)) || 0) + h);
  });

  for (const [date, hrs] of usedByDay) {
    if (capacity.has(date) && hrs > capacity.get(date)) {
      errors.push(`${date}: ${hrs} h planned but only ${capacity.get(date)} h available`);
    }
  }
  for (const [taskId, hrs] of usedByTask) {
    const task = taskById.get(taskId);
    if (task && typeof task.remaining === 'number' && hrs > task.remaining) {
      errors.push(`${task.title || taskId}: ${hrs} h planned but only ${task.remaining} h needed`);
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validate, MAX_BLOCK_HOURS };
