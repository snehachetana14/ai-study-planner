import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useSchedule, useScheduleActions, sessionEndMs } from '../hooks/useSchedule.jsx';
import SessionCard from '../components/SessionCard.jsx';
import { EmptyStart } from './Schedule.jsx';
import { addDays, fmtLong, dueIn, deadlineText, hoursText, greeting, TYPE_LABELS } from '../utils/format.js';

const LEVEL_PILL = { 'On track': 'pill-good', Watch: 'pill-warn', 'At risk': 'pill-bad' };
const ATT_PILL = { ok: 'pill-good', warn: 'pill-warn', low: 'pill-bad', none: '' };

export default function Dashboard({ user, navigate }) {
  const toast = useToast();
  const { data, setData, error } = useSchedule();
  const actions = useScheduleActions(data, setData);
  const [attendance, setAttendance] = useState(null);
  const [insights, setInsights] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const loadSide = () => {
    api('/attendance').then(setAttendance).catch(() => {});
    api('/insights').then(setInsights).catch(() => {});
  };
  useEffect(loadSide, [data && data.generatedAt]);

  if (error) return <div className="card card-pad"><p className="err">⚠ {error}</p></div>;
  if (!data) return <div className="loading">Loading…</div>;

  async function seed() {
    setSeeding(true);
    try {
      const res = await api('/demo/seed', { method: 'POST' });
      setData(res.schedule);
      loadSide();
      toast({ text: 'Sample courses, tasks and history loaded' });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setSeeding(false);
    }
  }

  const tz = data.tzOffsetMin;
  const now = Date.now();
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const priorityOf = new Map(data.ranked.map((r) => [r.id, r.label]));
  const todays = data.sessions.filter((s) => s.date === data.today);
  const todayHours = todays.filter((s) => s.status !== 'missed').reduce((a, s) => a + s.hours, 0);
  const weekStart = addDays(data.today, -6);
  const lastWeek = data.sessions.filter((s) => s.date >= weekStart && s.date <= data.today);
  const weekDone = lastWeek.filter((s) => s.status === 'done').reduce((a, s) => a + s.hours, 0);
  const weekPlanned = lastWeek.reduce((a, s) => a + s.hours, 0);
  const pending = data.tasks.filter((t) => t.status !== 'done').sort((a, b) => a.deadline.localeCompare(b.deadline));
  const dueSoon = pending.filter((t) => Date.parse(t.deadline) - now < 3 * 86400000).length;
  const alerts = attendance ? attendance.courses.filter((c) => c.status === 'low' || c.status === 'warn') : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}, {user.name.split(' ')[0]}</h1>
          <p className="muted">{fmtLong(data.today)}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate('schedule')}>Open schedule</button>
        </div>
      </div>

      {data.courses.length === 0 ? (
        <EmptyStart onAddCourse={() => navigate('courses')} onSeed={seed} seeding={seeding} />
      ) : (
        <div className="stack">
          {data.unscheduled.length > 0 && (
            <div className="banner" role="alert">
              <span>⚠ {data.unscheduled.length} task{data.unscheduled.length === 1 ? '' : 's'} no longer fit{data.unscheduled.length === 1 ? 's' : ''} before {data.unscheduled.length === 1 ? 'its' : 'their'} deadline.</span>
              <button type="button" className="link-btn" onClick={() => navigate('schedule')}>Review ›</button>
            </div>
          )}

          <div className="grid-4">
            <div className="card card-pad stat">
              <div className="label">Today</div>
              <div className="value">{hoursText(todayHours)}</div>
              <div className="sub">{todays.length} session{todays.length === 1 ? '' : 's'} planned</div>
            </div>
            <div className="card card-pad stat">
              <div className="label">Last 7 days</div>
              <div className="value">{hoursText(weekDone)} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>of {hoursText(weekPlanned)}</span></div>
              <div className="sub">studied of planned</div>
            </div>
            <div className="card card-pad stat">
              <div className="label">Pending tasks</div>
              <div className="value">{pending.length}</div>
              <div className="sub">{dueSoon} due in the next 3 days</div>
            </div>
            <div className="card card-pad stat">
              <div className="label">Wellbeing</div>
              <div className="value" style={{ fontSize: 16, marginTop: 8 }}>
                {insights ? <span className={`pill ${LEVEL_PILL[insights.level]}`}>{insights.level}</span> : '…'}
              </div>
              <div className="sub">{insights ? (insights.signals.find((s) => s.flagged) || {}).label || 'No warning signs' : ''}</div>
            </div>
          </div>

          <div className="grid-2">
            <section className="card" aria-labelledby="today-title">
              <div className="card-head">
                <h2 id="today-title">Today's plan</h2>
                <button type="button" className="link-btn small" onClick={() => navigate('schedule')}>Full week ›</button>
              </div>
              <div className="card-pad stack" style={{ gap: 8 }}>
                {todays.length === 0 && <p className="muted">Nothing planned for today. Enjoy the break or add a task.</p>}
                {todays.map((s) => {
                  const task = taskById.get(s.taskId);
                  return (
                    <SessionCard
                      key={s.id}
                      session={s}
                      task={task}
                      course={task && courseById.get(task.courseId)}
                      priority={priorityOf.get(s.taskId)}
                      isPast={sessionEndMs(s, tz) < now}
                      busy={actions.busyId === s.id}
                      onDone={() => actions.markDone(s)}
                      onMissed={() => actions.startMissed(s)}
                      onUnmark={() => actions.unmark(s)}
                    />
                  );
                })}
              </div>
            </section>

            <section className="card" aria-labelledby="deadlines-title">
              <div className="card-head">
                <h2 id="deadlines-title">Upcoming deadlines</h2>
                <button type="button" className="link-btn small" onClick={() => navigate('courses')}>All tasks ›</button>
              </div>
              <ul className="list">
                {pending.length === 0 && <li className="muted">No pending tasks.</li>}
                {pending.slice(0, 6).map((t) => {
                  const course = courseById.get(t.courseId);
                  const pct = Math.min(100, Math.round((t.hoursDone / t.estimatedHours) * 100));
                  const overdue = Date.parse(t.deadline) < now;
                  return (
                    <li key={t.id}>
                      <div className="spread">
                        <div className="row" style={{ minWidth: 0 }}>
                          <span className="color-dot" style={{ background: course ? course.color : '#999' }} />
                          <span style={{ fontWeight: 600 }}>{t.title}</span>
                          <span className="type-tag">{TYPE_LABELS[t.type]}</span>
                        </div>
                        <span className={`small nowrap ${overdue ? 'err' : 'muted'}`}>{dueIn(t.deadline)}</span>
                      </div>
                      <div className="spread small muted" style={{ marginTop: 4 }}>
                        <span>{deadlineText(t.deadline, tz)}</span>
                        <span>{hoursText(t.hoursDone)} of {hoursText(t.estimatedHours)}</span>
                      </div>
                      <div className="bar" style={{ marginTop: 6 }}><div style={{ width: `${pct}%`, background: course ? course.color : undefined }} /></div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="grid-2">
            <section className="card" aria-labelledby="att-title">
              <div className="card-head">
                <h2 id="att-title">Attendance</h2>
                <button type="button" className="link-btn small" onClick={() => navigate('attendance')}>Record ›</button>
              </div>
              <ul className="list">
                {!attendance && <li className="muted">Loading…</li>}
                {attendance && attendance.courses.map((c) => (
                  <li key={c.id} className="spread">
                    <div className="row"><span className="color-dot" style={{ background: c.color }} />{c.name}</div>
                    <span className={`pill ${ATT_PILL[c.status]}`}>{c.pct === null ? 'No classes yet' : `${c.pct}%`}</span>
                  </li>
                ))}
              </ul>
              {alerts.length > 0 && <p className="small" style={{ padding: '0 18px 14px', color: 'var(--warn)', fontWeight: 600 }}>{alerts[0].name}: {alerts[0].message}.</p>}
            </section>

            <section className="card" aria-labelledby="well-title">
              <div className="card-head">
                <h2 id="well-title">Study wellbeing</h2>
                <button type="button" className="link-btn small" onClick={() => navigate('insights')}>Insights ›</button>
              </div>
              <div className="card-pad stack" style={{ gap: 10 }}>
                {insights ? (
                  <>
                    <div className="row"><span className={`pill ${LEVEL_PILL[insights.level]}`}>{insights.level}</span><span className="small muted">last 14 days</span></div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {insights.suggestions.slice(0, 2).map((s) => <li key={s} style={{ marginBottom: 4 }}>{s}</li>)}
                    </ul>
                  </>
                ) : <p className="muted">Loading…</p>}
              </div>
            </section>
          </div>
        </div>
      )}
      {actions.missedFlow}
    </>
  );
}
