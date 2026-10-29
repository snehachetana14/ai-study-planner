import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useSchedule, useScheduleActions } from '../hooks/useSchedule.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import AddTaskDialog from '../components/AddTaskDialog.jsx';
import { COURSE_COLORS, TYPE_LABELS, deadlineText, dueIn, hoursText } from '../utils/format.js';

function CourseDialog({ course, onClose, onSaved }) {
  const [f, setF] = useState({
    name: course ? course.name : '',
    code: course ? course.code : '',
    color: course ? course.color : COURSE_COLORS[0],
    minAttendance: course ? String(course.minAttendance) : '75',
  });
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const errors = {};
  if (f.name.trim().length < 2 || f.name.trim().length > 60) errors.name = 'Course name must be 2–60 characters';
  if (f.code.length > 20) errors.code = 'Course code must be at most 20 characters';
  const min = Number(f.minAttendance);
  if (f.minAttendance === '' || !(min >= 0 && min <= 100)) errors.minAttendance = 'Enter 0–100';
  const invalid = Object.keys(errors).length > 0;

  async function submit(e) {
    e.preventDefault();
    setTouched({ name: true, code: true, minAttendance: true });
    if (invalid) return;
    setSaving(true);
    try {
      const body = { name: f.name.trim(), code: f.code.trim(), color: f.color, minAttendance: min };
      const res = await api(course ? `/courses/${course.id}` : '/courses', { method: course ? 'PATCH' : 'POST', body });
      onSaved(res.course, !course);
    } catch (err) {
      setFormError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={course ? 'Edit course' : 'Add a course'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor="c-name">Course name</label>
            <input id="c-name" className={`input${touched.name && errors.name ? ' invalid' : ''}`} value={f.name} placeholder="e.g. Software Engineering" onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => setTouched({ ...touched, name: true })} />
            {touched.name && errors.name && <span className="err">⚠ {errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="c-code">Course code</label>
            <input id="c-code" className={`input${touched.code && errors.code ? ' invalid' : ''}`} value={f.code} placeholder="e.g. BCSE301L" onChange={(e) => setF({ ...f, code: e.target.value })} />
            {touched.code && errors.code && <span className="err">⚠ {errors.code}</span>}
          </div>
          <div className="field">
            <label htmlFor="c-min">Minimum attendance</label>
            <div className="suffix-wrap">
              <input id="c-min" type="number" min="0" max="100" className={`input${touched.minAttendance && errors.minAttendance ? ' invalid' : ''}`} value={f.minAttendance} onChange={(e) => setF({ ...f, minAttendance: e.target.value })} onBlur={() => setTouched({ ...touched, minAttendance: true })} />
              <span className="suffix">%</span>
            </div>
            {touched.minAttendance && errors.minAttendance && <span className="err">⚠ {errors.minAttendance}</span>}
          </div>
          <div className="field full">
            <span className="label" id="c-color-label">Colour</span>
            <div className="swatches" role="group" aria-labelledby="c-color-label">
              {COURSE_COLORS.map((c) => (
                <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={f.color === c} aria-label={`Colour ${c}`} onClick={() => setF({ ...f, color: c })} />
              ))}
            </div>
          </div>
        </div>
        {formError && <p className="err" style={{ marginTop: 12 }}>⚠ {formError}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={invalid || saving}>{course ? 'Save' : 'Add course'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Courses and their assignments, exams and quizzes (Course & Assignment Manager module).
export default function Courses() {
  const toast = useToast();
  const { data, setData, error, load } = useSchedule();
  const actions = useScheduleActions(data, setData);
  const [courseDialog, setCourseDialog] = useState(null);
  const [taskDialog, setTaskDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState(false);

  if (error) return <div className="card card-pad"><p className="err">⚠ {error}</p></div>;
  if (!data) return <div className="loading">Loading…</div>;

  const tz = data.tzOffsetMin;
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const tasks = data.tasks
    .filter((t) => (filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  async function patchTask(task, body, message) {
    try {
      const res = await api(`/assignments/${task.id}`, { method: 'PATCH', body });
      if (res.schedule) setData(res.schedule);
      toast({ text: message, action: res.schedule ? { label: 'Undo', onClick: actions.undo } : undefined });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    }
  }

  async function runConfirm() {
    setBusy(true);
    try {
      if (confirm.kind === 'course') {
        await api(`/courses/${confirm.item.id}`, { method: 'DELETE' });
        await load();
        toast({ text: `${confirm.item.name} deleted` });
      } else {
        const res = await api(`/assignments/${confirm.item.id}`, { method: 'DELETE' });
        setData(res.schedule);
        toast({ text: `${confirm.item.title} deleted` });
      }
      setConfirm(null);
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Courses</h1>
          <p className="muted">{data.courses.length} course{data.courses.length === 1 ? '' : 's'} · {data.tasks.filter((t) => t.status !== 'done').length} pending tasks</p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setCourseDialog({})}>+ Add course</button>
          <button type="button" className="btn btn-primary" onClick={() => setTaskDialog({})} disabled={!data.courses.length}>+ Add task</button>
        </div>
      </div>

      <div className="stack">
        {data.courses.length === 0 ? (
          <div className="card empty">
            <h2>No courses yet</h2>
            <p className="muted">Add the courses you are taking this semester.</p>
            <div className="actions"><button type="button" className="btn btn-primary" onClick={() => setCourseDialog({})}>Add a course</button></div>
          </div>
        ) : (
          <div className="course-grid">
            {data.courses.map((c) => {
              const mine = data.tasks.filter((t) => t.courseId === c.id);
              const open = mine.filter((t) => t.status !== 'done').length;
              return (
                <div key={c.id} className="card course-card" style={{ '--stripe': c.color }}>
                  <div style={{ fontWeight: 650 }}>{c.name}</div>
                  <div className="small muted">{c.code || 'No code'} · min attendance {c.minAttendance}%</div>
                  <div className="small" style={{ marginTop: 8 }}>{open} pending · {mine.length - open} done</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-sm" onClick={() => setCourseDialog({ course: c })}>Edit</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirm({ kind: 'course', item: c, count: mine.length })}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data.courses.length > 0 && (
          <section className="card" aria-labelledby="tasks-title">
            <div className="card-head">
              <h2 id="tasks-title">Tasks</h2>
              <div className="tabs" role="group" aria-label="Filter tasks">
                {[['pending', 'Pending'], ['done', 'Completed'], ['all', 'All']].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Deadline</th>
                    <th>Weight</th>
                    <th>Difficulty</th>
                    <th style={{ minWidth: 130 }}>Progress</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 && <tr><td colSpan={6} className="muted">No tasks here.</td></tr>}
                  {tasks.map((t) => {
                    const course = courseById.get(t.courseId);
                    const pct = Math.min(100, Math.round((t.hoursDone / t.estimatedHours) * 100));
                    const overdue = t.status !== 'done' && Date.parse(t.deadline) < Date.now();
                    return (
                      <tr key={t.id}>
                        <td>
                          <div className="row">
                            <span className="color-dot" style={{ background: course ? course.color : '#999' }} />
                            <span style={{ fontWeight: 600, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                          </div>
                          <div className="small muted">{TYPE_LABELS[t.type]} · {course ? course.name : ''}</div>
                        </td>
                        <td className="nowrap">
                          <div>{deadlineText(t.deadline, tz)}</div>
                          <div className={`small ${overdue ? 'err' : 'muted'}`}>{t.status === 'done' ? 'completed' : dueIn(t.deadline)}</div>
                        </td>
                        <td>{t.weight}%</td>
                        <td>{t.difficulty}/5</td>
                        <td>
                          <div className="small muted">{hoursText(t.hoursDone)} of {hoursText(t.estimatedHours)}</div>
                          <div className="bar"><div style={{ width: `${pct}%`, background: course ? course.color : undefined }} /></div>
                        </td>
                        <td className="nowrap">
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            {t.status === 'done'
                              ? <button type="button" className="btn btn-sm" onClick={() => patchTask(t, { status: 'pending' }, `${t.title} reopened · plan updated`)}>Reopen</button>
                              : <button type="button" className="btn btn-sm" onClick={() => patchTask(t, { status: 'done' }, `${t.title} completed · plan updated`)}>✓ Complete</button>}
                            <button type="button" className="btn btn-sm" onClick={() => setTaskDialog({ task: t })}>Edit</button>
                            <button type="button" className="btn btn-sm btn-danger" aria-label={`Delete ${t.title}`} onClick={() => setConfirm({ kind: 'task', item: t })}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {courseDialog && (
        <CourseDialog
          course={courseDialog.course}
          onClose={() => setCourseDialog(null)}
          onSaved={(c, created) => { setCourseDialog(null); load(); toast({ text: created ? `${c.name} added` : `${c.name} saved` }); }}
        />
      )}
      {taskDialog && (
        <AddTaskDialog
          schedule={data}
          task={taskDialog.task}
          onClose={() => setTaskDialog(null)}
          onNeedCourse={() => { setTaskDialog(null); setCourseDialog({}); }}
          onSaved={(res, { created }) => {
            setTaskDialog(null);
            if (res.schedule) setData(res.schedule); else load();
            toast({ text: created ? 'Task added · plan updated' : 'Task saved', action: res.schedule ? { label: 'Undo', onClick: actions.undo } : undefined });
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'course' ? `Delete ${confirm.item.name}?` : `Delete ${confirm.item.title}?`}
          message={confirm.kind === 'course'
            ? `Its ${confirm.count} task${confirm.count === 1 ? '' : 's'}, their study sessions and its attendance records will be deleted too. This cannot be undone.`
            : 'Its study sessions will be removed and your plan updated.'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}
    </>
  );
}
