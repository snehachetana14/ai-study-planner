// Default study settings and helpers to read free hours for a date.
const { weekday, parseHM } = require('../utils/dates');

// Index 0 = Sunday ... 6 = Saturday
const DEFAULT_SETTINGS = {
  weeklyHours: [4, 3, 3, 3, 3, 3, 4],
  startTimes: ['10:00', '16:00', '16:00', '16:00', '16:00', '16:00', '10:00'],
  overrides: {}, // { 'YYYY-MM-DD': hours } extra/changed hours for a specific date
  tzOffsetMin: 330,
  useAI: true,
  reminderMinutes: 15,
};

function withDefaults(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    overrides: { ...(settings.overrides || {}) },
  };
}

function hoursFor(settings, date) {
  const s = withDefaults(settings);
  if (Object.prototype.hasOwnProperty.call(s.overrides, date)) return s.overrides[date];
  return s.weeklyHours[weekday(date)];
}

function startMinutesFor(settings, date) {
  const s = withDefaults(settings);
  return parseHM(s.startTimes[weekday(date)]) ?? 16 * 60;
}

module.exports = { DEFAULT_SETTINGS, withDefaults, hoursFor, startMinutesFor };
