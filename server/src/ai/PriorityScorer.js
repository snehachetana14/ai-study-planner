// PriorityScorer: deterministic, explainable priority score for a study task.
// score = 100 * (0.5 * urgency + 0.3 * weight + 0.2 * difficulty), range 0..100
// urgency = 1 - daysLeft / 14 (0 when 14+ days away, 1 when due or overdue)

const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 14;
const WEIGHTS = { urgency: 0.5, weight: 0.3, difficulty: 0.2 };

function urgency(deadlineMs, nowMs) {
  const daysLeft = (deadlineMs - nowMs) / DAY_MS;
  if (daysLeft <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - daysLeft / HORIZON_DAYS));
}

function score(task, now = Date.now()) {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const u = urgency(Date.parse(task.deadline), nowMs);
  const w = Math.max(0, Math.min(100, task.weight)) / 100;
  const d = (Math.max(1, Math.min(5, task.difficulty)) - 1) / 4;
  const raw = 100 * (WEIGHTS.urgency * u + WEIGHTS.weight * w + WEIGHTS.difficulty * d);
  return Math.round(raw * 100) / 100;
}

function label(value) {
  if (value >= 50) return 'High';
  if (value >= 25) return 'Med';
  return 'Low';
}

function dueText(deadlineIso, now = Date.now()) {
  const hours = (Date.parse(deadlineIso) - now) / 3600000;
  if (hours <= 0) return 'overdue';
  if (hours < 48) return `due in ${Math.max(1, Math.round(hours))} hours`;
  return `due in ${(hours / 24).toFixed(1)} days`;
}

// Highest score first; ties broken by earlier deadline, then id for stable output.
function rank(tasks, now = Date.now()) {
  return tasks
    .map((t) => {
      const s = score(t, now);
      return {
        ...t,
        score: s,
        label: label(s),
        reasons: { due: dueText(t.deadline, now), weight: t.weight, difficulty: t.difficulty },
      };
    })
    .sort((a, b) => b.score - a.score
      || Date.parse(a.deadline) - Date.parse(b.deadline)
      || String(a.id).localeCompare(String(b.id)));
}

module.exports = { score, rank, urgency, label, dueText, WEIGHTS, HORIZON_DAYS };
