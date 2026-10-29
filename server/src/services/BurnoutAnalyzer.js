// BurnoutAnalyzer: looks at the last 14 days of study behaviour and flags early burnout signs.
// Signals: missed sessions, late-night study, very long days, missed streaks, deadline pile-up.
const { localDate, localMinutes, addDays, toInstant } = require('../utils/dates');

const WINDOW_DAYS = 14;

function analyze({ sessions, tasks, tz, now = Date.now() }) {
  const today = localDate(now, tz);
  const start = addDays(today, -(WINDOW_DAYS - 1));
  const past = sessions.filter((s) => s.date >= start && s.date <= today
    && (s.status !== 'planned' || toInstant(s.date, s.start, tz) < now));

  const days = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const on = past.filter((s) => s.date === d);
    days.push({
      date: d,
      planned: on.reduce((a, s) => a + s.hours, 0),
      done: on.filter((s) => s.status === 'done').reduce((a, s) => a + s.hours, 0),
      missed: on.filter((s) => s.status === 'missed').length,
    });
  }

  const done = past.filter((s) => s.status === 'done');
  const missed = past.filter((s) => s.status === 'missed');
  const unmarked = past.filter((s) => s.status === 'planned');
  const plannedHours = past.reduce((a, s) => a + s.hours, 0);
  const doneHours = done.reduce((a, s) => a + s.hours, 0);
  const counted = done.length + missed.length;
  const missedRate = counted ? missed.length / counted : 0;

  const lateNight = done.filter((s) => {
    if (!s.completedAt) return false;
    const m = localMinutes(Date.parse(s.completedAt), tz);
    return m >= 23 * 60 || m < 5 * 60;
  }).length;
  const heavyDays = days.filter((d) => d.done > 6).length;

  let streak = 0;
  let longestStreak = 0;
  for (const s of [...done, ...missed].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))) {
    streak = s.status === 'missed' ? streak + 1 : 0;
    longestStreak = Math.max(longestStreak, streak);
  }

  const soon = tasks.filter((t) => t.status !== 'done'
    && Date.parse(t.deadline) > now && Date.parse(t.deadline) - now <= 3 * 24 * 3600 * 1000).length;

  const reasons = {};
  for (const s of missed) reasons[s.reason || 'Not given'] = (reasons[s.reason || 'Not given'] || 0) + 1;

  const signals = [
    {
      key: 'missed', label: 'Missed sessions', value: `${missed.length} of ${counted}`,
      points: missedRate > 0.4 ? 2 : missedRate > 0.25 ? 1 : 0,
      tip: 'Your plan may be too full. Lower your daily study hours in Settings.',
    },
    {
      key: 'late', label: 'Study finished after 11 PM', value: String(lateNight),
      points: lateNight >= 3 ? 1 : 0,
      tip: 'Late nights hurt memory. Move study earlier in the day.',
    },
    {
      key: 'heavy', label: 'Days with more than 6 h', value: String(heavyDays),
      points: heavyDays >= 2 ? 1 : 0,
      tip: 'Spread work out: long days are hard to repeat.',
    },
    {
      key: 'streak', label: 'Longest run of missed sessions', value: String(longestStreak),
      points: longestStreak >= 3 ? 1 : 0,
      tip: 'Several misses in a row: plan a lighter day and restart with one short session.',
    },
    {
      key: 'deadlines', label: 'Deadlines in the next 3 days', value: String(soon),
      points: soon >= 3 ? 1 : 0,
      tip: 'Several deadlines together: ask early about extensions and drop optional work.',
    },
  ].map((s) => ({ ...s, flagged: s.points > 0 }));

  const score = signals.reduce((a, s) => a + s.points, 0);
  const level = score >= 3 ? 'At risk' : score === 2 ? 'Watch' : 'On track';
  const suggestions = signals.filter((s) => s.flagged).map((s) => s.tip);
  if ((reasons.Unwell || 0) >= 2) suggestions.unshift('You missed sessions while unwell. Take a rest day before catching up.');
  if (!suggestions.length) suggestions.push('Good balance. Keep your current routine and rest days.');

  return {
    from: start,
    to: today,
    days,
    totals: {
      plannedHours,
      doneHours,
      sessionsDone: done.length,
      sessionsMissed: missed.length,
      sessionsUnmarked: unmarked.length,
      completionRate: counted ? Math.round((done.length / counted) * 100) : null,
    },
    reasons,
    signals,
    score,
    level,
    suggestions,
  };
}

module.exports = { analyze, WINDOW_DAYS };
