// Date helpers. A "study day" is a calendar date (YYYY-MM-DD) in the student's time zone.
// The time zone is stored as an offset in minutes from UTC (India = +330).

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const DEFAULT_TZ = 330;

const pad = (n) => String(n).padStart(2, '0');

// Local calendar date for an instant.
function localDate(ms, tz = DEFAULT_TZ) {
  return new Date(ms + tz * MIN_MS).toISOString().slice(0, 10);
}

// Minutes since local midnight for an instant.
function localMinutes(ms, tz = DEFAULT_TZ) {
  const d = new Date(ms + tz * MIN_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function addDays(dateStr, n) {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

// 0 = Sunday ... 6 = Saturday
function weekday(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS);
}

function parseHM(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatHM(minutes) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

// UTC instant (ms) of a local date + time.
function toInstant(dateStr, hm, tz = DEFAULT_TZ) {
  const minutes = typeof hm === 'number' ? hm : parseHM(hm) || 0;
  return Date.parse(`${dateStr}T00:00:00Z`) + minutes * MIN_MS - tz * MIN_MS;
}

// Latest study day whose study time (which ends by 11 PM) is over before the deadline (local time).
// A quiz at 09:00 on the 23rd can be studied for until the 22nd; a deadline at 23:59 allows that same day.
const STUDY_DAY_END_MS = 23 * 60 * MIN_MS;
function lastStudyDay(deadlineIso, tz = DEFAULT_TZ) {
  const ms = Date.parse(deadlineIso) + tz * MIN_MS - STUDY_DAY_END_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

module.exports = {
  DAY_MS,
  MIN_MS,
  DEFAULT_TZ,
  localDate,
  localMinutes,
  addDays,
  weekday,
  daysBetween,
  parseHM,
  formatHM,
  toInstant,
  lastStudyDay,
};
