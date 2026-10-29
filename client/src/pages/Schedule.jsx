import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useSchedule, useScheduleActions, sessionEndMs } from '../hooks/useSchedule.jsx';
import SessionCard from '../components/SessionCard.jsx';
import SourcePill from '../components/SourcePill.jsx';
import WhyOrder from '../components/WhyOrder.jsx';
import AddTaskDialog from '../components/AddTaskDialog.jsx';
import QuickAdd from '../components/QuickAdd.jsx';
import ReplanResult, { ConflictBox } from '../components/ReplanResult.jsx';
import Modal from '../components/Modal.jsx';
import { addDays, fmtDay, fmtDayMonth, fmtDate, hoursText, deadlineText } from '../utils/format.js';

function weekLabel(offset, start) {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  return `Week of ${fmtDate(start)}`;
}

export function EmptyStart({ onAddCourse, onSeed, seeding }) {
  return (
    <div className="card empty">
      <h2>Start by adding your courses</h2>
      <p className="muted">Add a course, then its assignments, exams and quizzes. The planner builds your week from them.</p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onAddCourse}>Add a course</button>
        <button type="button" className="btn" onClick={onSeed} disabled={seeding}>{seeding ? 'Loading…' : 'Load sample data'}</button>
      </div>
    </div>
  );
}

// Weekly schedule (Assessment 9, Screen 1) with Add task (Screen 2) and the missed-session flow (Screen 3).
export default function Schedule({ navigate }) {
  const toast = useToast();
  const { data, setData, error, load } = useSchedule();
  const actions = useScheduleActions(data, setData);
  const [weekOffset, setWeekOffset] = useState(0);
  const [adding, setAdding] = useState(null); // null, {} for a blank form, or { ai } from Quick Add
  const [result, setResult] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [seeding, setSeeding] = useState(false);

  if (error) return <div className="card card-pad"><p className="err">⚠ {error}</p><button type="button" className="btn" onClick={load} style={{ marginTop: 10 }}>Try again</button></div>;
  if (!data) return <div className="loading">Loading your plan…</div>;

  const tz = data.tzOffsetMin;
  const start = addDays(data.today, weekOffset * 7);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const dayInfo = new Map(data.days.map((d) => [d.date, d]));
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const priorityOf = new Map(data.ranked.map((r) => [r.id, r.label]));
  const now = Date.now();

  async function replan() {
    setReplanning(true);
    try {
      const res = await api('/schedule/replan', { method: 'POST' });
      setData(res.schedule);
      setResult({ title: 'Plan updated', res });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setReplanning(false);
    }
  }

  async function seed() {
    setSeeding(true);
    try {
      const res = await api('/demo/seed', { method: 'POST' });
      setData(res.schedule);
      toast({ text: 'Sample courses, tasks and history loaded' });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setSeeding(false);
    }
  }

  function onSaved(res, { created, replanned }) {
    setAdding(null);
    if (res.schedule) setData(res.schedule);
    else load();
    if (replanned && res.schedule) {
      setResult({ title: created ? 'Task added · plan updated' : 'Task saved · plan updated', res });
      toast({ text: `${created ? 'Task added' : 'Task saved'} · plan updated`, action: { label: 'Undo', onClick: actions.undo } });
    } else {
      toast({ text: created ? 'Task added' : 'Task saved' });
    }
  }

  async function resolveInResult(taskId, action) {
    const res = await actions.resolve(taskId, action);
    if (action === 'addHours') setResult({ title: 'Plan updated', res });
    return res;
  }

  const noCourses = data.courses.length === 0;
  const noTasks = !noCourses && data.tasks.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{weekLabel(weekOffset, start)}</h1>
          <p className="muted">{fmtDayMonth(start)} – {fmtDayMonth(dates[6])} {dates[6].slice(0, 4)}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-icon" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)} disabled={weekOffset <= -4}>‹</button>
          <button type="button" className="btn btn-icon" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)} disabled={weekOffset >= 3}>›</button>
          {weekOffset !== 0 && <button type="button" className="btn" onClick={() => setWeekOffset(0)}>Today</button>}
          <button type="button" className="btn btn-outline-primary" onClick={replan} disabled={replanning || noCourses}>↻ {replanning ? 'Re-planning…' : 'Re-plan'}</button>
          <button type="button" className="btn btn-primary" onClick={() => setAdding({})}>+ Add task</button>
        </div>
      </div>

      {noCourses ? (
        <EmptyStart onAddCourse={() => navigate('courses')} onSeed={seed} seeding={seeding} />
      ) : (
        <div className="stack">
          <QuickAdd onDraft={(res, text) => setAdding({ ai: { ...res, text } })} />

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <SourcePill schedule={data} />
            {data.canUndo && <button type="button" className="link-btn small" onClick={actions.undo}>Undo last change</button>}
          </div>

          {data.unscheduled.length > 0 && (
            <div>
              {data.unscheduled.map((c) => {
                const task = taskById.get(c.taskId);
                const course = task && courseById.get(task.courseId);
                if (!task) return null;
                return (
                  <div className="banner" key={c.taskId} role="alert">
                    <span>⚠ {course ? `${course.code || course.name} ` : ''}<strong>{task.title}</strong>: only {hoursText(c.totalHours - c.hoursLeft)} of {hoursText(c.totalHours)} fits before {deadlineText(c.deadline, tz)}.</span>
                    <button type="button" className="link-btn nowrap" onClick={() => setReviewing(true)}>Review ›</button>
                  </div>
                );
              })}
            </div>
          )}

          {noTasks ? (
            <div className="card empty">
              <h2>No tasks yet</h2>
              <p className="muted">Add an assignment, exam or quiz and the planner will schedule study sessions for it.</p>
              <div className="actions"><button type="button" className="btn btn-primary" onClick={() => setAdding({})}>+ Add task</button></div>
            </div>
          ) : (
            <div className="week" aria-label="Study sessions this week">
              {dates.map((date) => {
                const info = dayInfo.get(date);
                const sessions = data.sessions.filter((s) => s.date === date);
                const isToday = date === data.today;
                return (
                  <section key={date} className={`day${isToday ? ' today' : ''}`} aria-label={`${fmtDayMonth(date)}${isToday ? ', today' : ''}`}>
                    {isToday && <div className="today-tag">Today</div>}
                    <div className="day-head">
                      <span className="d">{fmtDay(date)}</span>
                      {info && <span className="free">{hoursText(info.capacity)} free</span>}
                    </div>
                    <div className="day-col">
                      {sessions.length === 0 && <div className="day-empty">{info && info.capacity === 0 ? 'Rest day' : 'Nothing planned'}</div>}
                      {sessions.map((s) => {
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
                );
              })}
            </div>
          )}

          <WhyOrder schedule={data} />
        </div>
      )}

      {adding && (
        <AddTaskDialog
          schedule={data}
          ai={adding.ai}
          onClose={() => setAdding(null)}
          onSaved={onSaved}
          onNeedCourse={() => { setAdding(null); navigate('courses'); }}
        />
      )}

      {result && (
        <Modal title={result.title} onClose={() => setResult(null)} wide>
          <ReplanResult result={result.res} schedule={data} onResolve={resolveInResult} onClose={() => setResult(null)} />
        </Modal>
      )}

      {reviewing && (
        <Modal title="Work that does not fit" subtitle="Choose how to handle each one." onClose={() => setReviewing(false)} wide>
          {data.unscheduled.length === 0
            ? <p>All resolved. Everything now fits before its deadline.</p>
            : data.unscheduled.map((c) => <ConflictBox key={c.taskId} conflict={c} schedule={data} onResolve={actions.resolve} />)}
        </Modal>
      )}

      {actions.missedFlow}
    </>
  );
}
