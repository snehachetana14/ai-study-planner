import { timeRange, hoursText } from '../utils/format.js';

// One study session (Assessment 9, Screen 1, marker 6): course stripe, task, time, priority, Done / Missed.
export default function SessionCard({ session, task, course, priority, isPast, onDone, onMissed, onUnmark, busy }) {
  const title = task ? task.title : 'Deleted task';
  const stripe = course ? course.color : '#9aa3b5';
  const status = session.status;

  return (
    <div className={`session ${status}`} style={{ '--stripe': stripe }} data-testid="session-card">
      <div className="top">
        <span className="course" title={course ? course.name : ''}>{course ? (course.code || course.name) : '—'}</span>
        {priority && status === 'planned' && <span className={`badge badge-${priority}`}>{priority}</span>}
      </div>
      <div className="title">{title}</div>
      <div className="time">{hoursText(session.hours)} · {timeRange(session.start, session.end)}</div>

      {status === 'planned' && (
        <>
          {isPast && <div className="ask">Did you study?</div>}
          <div className="acts">
            <button type="button" className="btn" disabled={busy} onClick={onDone} aria-label={`Mark ${title} done`}>✓ Done</button>
            <button type="button" className="btn" disabled={busy} onClick={onMissed} aria-label={`Mark ${title} missed`}>✕ Missed</button>
          </div>
        </>
      )}
      {status === 'done' && (
        <div className="state">
          <span>✓ Done</span>
          <button type="button" className="link-btn small" onClick={onUnmark} disabled={busy}>Undo</button>
        </div>
      )}
      {status === 'missed' && (
        <div className="state">
          <span>✕ Missed{session.reason && session.reason !== 'Not given' ? ` · ${session.reason}` : ''}</span>
        </div>
      )}
    </div>
  );
}
