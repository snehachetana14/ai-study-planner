// Date and text helpers. Dates are 'YYYY-MM-DD' strings in the student's time zone.

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DIFFICULTY_LABELS = ['', 'Very easy', 'Easy', 'Medium', 'Hard', 'Very hard'];
export const TYPE_LABELS = { assignment: 'Assignment', exam: 'Exam', quiz: 'Quiz' };

const parse = (date) => new Date(`${date}T00:00:00Z`);

export function addDays(date, n) {
  return new Date(parse(date).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export const weekdayOf = (date) => parse(date).getUTCDay();
export const fmtDay = (date) => `${WEEKDAYS[weekdayOf(date)]} ${parse(date).getUTCDate()}`;
export const fmtDate = (date) => `${parse(date).getUTCDate()} ${MONTHS[parse(date).getUTCMonth()]}`;
export const fmtDayMonth = (date) => `${WEEKDAYS[weekdayOf(date)]} ${fmtDate(date)}`;
export const fmtLong = (date) => `${fmtDayMonth(date)} ${parse(date).getUTCFullYear()}`;

export function to12(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function timeRange(start, end) {
  const a = to12(start);
  const b = to12(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

export const hoursText = (h) => `${Number(h.toFixed(1)).toString()} h`;

// Local date and time of an ISO instant in the student's time zone.
export function localParts(iso, tz) {
  const d = new Date(Date.parse(iso) + tz * 60000);
  const date = d.toISOString().slice(0, 10);
  const hm = d.toISOString().slice(11, 16);
  return { date, hm };
}

export function deadlineText(iso, tz) {
  const { date, hm } = localParts(iso, tz);
  return `${fmtDayMonth(date)}, ${to12(hm)}`;
}

// ISO instant for a local date + time in the student's time zone.
export function toIso(date, hm, tz) {
  const [h, m] = hm.split(':').map(Number);
  return new Date(parse(date).getTime() + (h * 60 + m - tz) * 60000).toISOString();
}

// Last day whose study time (ending by 11 PM) is over before the deadline (same rule as the server).
export function lastStudyDay(iso, tz) {
  return new Date(Date.parse(iso) + tz * 60000 - 23 * 3600000).toISOString().slice(0, 10);
}

export function dueIn(iso, now = Date.now()) {
  const hours = (Date.parse(iso) - now) / 3600000;
  if (hours <= 0) return 'overdue';
  if (hours < 1) return 'in under an hour';
  if (hours < 48) return `in ${Math.round(hours)} hours`;
  return `in ${Math.round(hours / 24)} days`;
}

export function timeAgo(iso, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export const COURSE_COLORS = ['#4f7cff', '#e8743b', '#2fb380', '#a05be0', '#e04f7a', '#14a3b8', '#c9a227', '#6b7a90'];

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
