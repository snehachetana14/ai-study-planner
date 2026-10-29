// AttendanceService: attendance % per course and how many classes can be skipped or must be attended.

function courseSummary(course, logs) {
  const mine = logs.filter((l) => l.courseId === course.id).sort((a, b) => b.date.localeCompare(a.date));
  const attended = mine.filter((l) => l.present).length;
  const total = mine.length;
  const min = typeof course.minAttendance === 'number' ? course.minAttendance : 75;
  const pct = total ? Math.round((attended / total) * 1000) / 10 : null;

  let status = 'none';
  let canSkip = 0;
  let needToAttend = 0;
  let message = 'No classes recorded yet';
  if (total) {
    if (pct >= min) {
      canSkip = min > 0 ? Math.max(0, Math.floor((attended * 100) / min - total)) : total;
      status = pct >= min + 5 ? 'ok' : 'warn';
      message = canSkip > 0
        ? `You can miss ${canSkip} more class${canSkip === 1 ? '' : 'es'} and stay above ${min}%`
        : `At the limit: missing the next class drops you below ${min}%`;
    } else {
      needToAttend = min >= 100 ? Infinity : Math.ceil((min * total - 100 * attended) / (100 - min));
      status = 'low';
      message = `Attend the next ${needToAttend} class${needToAttend === 1 ? '' : 'es'} in a row to reach ${min}%`;
    }
  }
  return { ...course, attended, total, pct, min, status, canSkip, needToAttend, message, recent: mine.slice(0, 10) };
}

function summary(courses, logs) {
  return courses.map((c) => courseSummary(c, logs)).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { summary, courseSummary };
