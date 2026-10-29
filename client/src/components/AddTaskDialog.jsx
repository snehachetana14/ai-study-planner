import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import {
  addDays, fmtDate, toIso, localParts, lastStudyDay, TIME_OPTIONS, DIFFICULTY_LABELS, to12, hoursText,
} from '../utils/format.js';

const TYPES = [['assignment', 'Assignment'], ['exam', 'Exam'], ['quiz', 'Quiz']];
const TIMES = [...TIME_OPTIONS, '23:59'];

// Same rules as the server (Assessment 9, Screen 2 validation table).
function validate(f, tz, editing) {
  const e = {};
  if (!f.courseId) e.courseId = 'Choose a course';
  const title = f.title.trim();
  if (title.length < 3 || title.length > 80) e.title = 'Title must be 3–80 characters';
  if (!f.date) e.date = 'Choose a deadline date';
  else if (!editing && Date.parse(toIso(f.date, f.time, tz)) <= Date.now()) e.date = 'Deadline must be in the future';
  const w = f.weight === '' ? NaN : Number(f.weight);
  if (!(Number.isFinite(w) && w >= 0 && w <= 100)) e.weight = 'Enter a value from 0 to 100';
  if (!(Number.isInteger(f.difficulty) && f.difficulty >= 1 && f.difficulty <= 5)) e.difficulty = 'Choose a difficulty from 1 to 5';
  if (!(f.hours >= 0.5 && f.hours <= 40)) e.hours = 'Hours must be 0.5–40';
  return e;
}

const FIELD_LABELS = { courseId: 'course', title: 'title', date: 'deadline date', weight: 'weight' };
const FORM_KEY = { estimatedHours: 'hours' };

// Add task / edit task dialog (Assessment 9, Screen 2).
// With `ai` (from AI Quick Add) the form starts filled in and marks which fields the AI filled.
export default function AddTaskDialog({ schedule, task, ai, onClose, onSaved, onNeedCourse }) {
  const tz = schedule.tzOffsetMin;
  const courses = schedule.courses;
  const editing = Boolean(task);
  const [f, setF] = useState(() => {
    if (task) {
      const p = localParts(task.deadline, tz);
      return {
        courseId: task.courseId, type: task.type, title: task.title, date: p.date,
        time: p.hm, weight: String(task.weight),
        difficulty: task.difficulty, hours: task.estimatedHours, replan: true,
      };
    }
    if (ai) {
      const d = ai.draft;
      return {
        courseId: d.courseId || '', type: d.type || 'assignment', title: d.title || '', date: d.date || '',
        time: d.time || '23:59', weight: d.weight === null ? '' : String(d.weight),
        difficulty: d.difficulty || 3, hours: d.estimatedHours || 2, replan: true,
      };
    }
    return {
      courseId: courses[0] ? courses[0].id : '', type: 'assignment', title: '', date: addDays(schedule.today, 7),
      time: '23:59', weight: '', difficulty: 3, hours: 2, replan: true,
    };
  });
  // Fields the AI could not fill are shown as errors straight away so the student fills them in.
  const [touched, setTouched] = useState(() => (ai ? Object.fromEntries(ai.missing.map((k) => [k, true])) : {}));
  const timeOptions = TIMES.includes(f.time) ? TIMES : [...TIMES, f.time].sort();
  const filled = (key) => {
    if (!ai) return null;
    const by = ai.filledBy[Object.keys(FORM_KEY).find((k) => FORM_KEY[k] === key) || key];
    if (by === 'ai') return <span className="ai-tag" title="Filled by AI">✨ AI</span>;
    if (by === 'rules') return <span className="ai-tag rules" title="Filled by the built-in parser">auto</span>;
    return null;
  };
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const errors = validate(f, tz, editing);
  const invalid = Object.keys(errors).length > 0;
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setServerErrors((s) => ({ ...s, [k]: undefined })); };
  const touch = (k) => setTouched((t) => ({ ...t, [k]: true }));
  const errorFor = (k) => (touched[k] && errors[k]) || serverErrors[k];

  // Free hours before the deadline, shown beside the hours field (Screen 2, marker 6).
  const free = useMemo(() => {
    if (!f.date) return null;
    const last = lastStudyDay(toIso(f.date, f.time, tz), tz);
    const hours = schedule.days
      .filter((d) => d.date >= schedule.today && d.date <= last)
      .reduce((sum, d) => sum + Math.max(0, d.capacity - d.planned), 0);
    return { hours, last };
  }, [f.date, f.time, tz, schedule]);

  async function submit(e) {
    e.preventDefault();
    setTouched({ courseId: true, title: true, date: true, weight: true, difficulty: true, hours: true });
    if (invalid || saving) return;
    setSaving(true);
    setFormError('');
    const body = {
      courseId: f.courseId, title: f.title.trim(), type: f.type, deadline: toIso(f.date, f.time, tz),
      weight: Number(f.weight), difficulty: f.difficulty, estimatedHours: f.hours, replan: f.replan,
    };
    try {
      const res = await api(editing ? `/assignments/${task.id}` : '/assignments', { method: editing ? 'PATCH' : 'POST', body });
      onSaved(res, { created: !editing, replanned: f.replan });
    } catch (err) {
      setServerErrors(err.fields || {});
      setFormError(err.message);
      setSaving(false);
    }
  }

  if (!courses.length) {
    return (
      <Modal title="Add a task" onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={onNeedCourse}>Add a course</button>}>
        <p>Tasks belong to a course. Add your first course, then come back to add tasks.</p>
      </Modal>
    );
  }

  const primary = f.replan ? (editing ? 'Save & re-plan' : 'Add & re-plan') : (editing ? 'Save' : 'Add task');

  return (
    <Modal title={editing ? 'Edit task' : 'Add a task'} subtitle="The planner will fit it into your free study hours." onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {ai && (
          <div className={`ai-banner${ai.source === 'ai' ? '' : ' rules'}`} role="status" data-testid="ai-banner">
            <div style={{ fontWeight: 650 }}>
              {ai.source === 'ai'
                ? `✨ Filled by AI (${ai.provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}) from your sentence`
                : 'Filled by the built-in parser from your sentence'}
            </div>
            <div className="small">“{ai.text}”</div>
            {ai.note && <div className="small muted" style={{ marginTop: 4 }}>{ai.note}</div>}
            <div className="small" style={{ marginTop: 6, fontWeight: 600 }}>
              {ai.missing.length
                ? `Please add: ${ai.missing.map((m) => FIELD_LABELS[m]).join(', ')}. Check the rest before adding.`
                : 'Check the details, then add it.'}
            </div>
          </div>
        )}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="t-course">Course {filled('courseId')}</label>
            <select id="t-course" className={`select${errorFor('courseId') ? ' invalid' : ''}`} value={f.courseId} onChange={(e) => set('courseId', e.target.value)} onBlur={() => touch('courseId')}>
              {!f.courseId && <option value="">Choose a course</option>}
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {errorFor('courseId') && <span className="err">⚠ {errorFor('courseId')}</span>}
          </div>

          <div className="field">
            <span className="label" id="t-type-label">Type {filled('type')}</span>
            <div className="seg" role="group" aria-labelledby="t-type-label">
              {TYPES.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={f.type === value} onClick={() => set('type', value)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="field full">
            <label htmlFor="t-title">Title {filled('title')}</label>
            <input id="t-title" className={`input${errorFor('title') ? ' invalid' : ''}`} value={f.title} maxLength={80} placeholder="e.g. CAT-2 preparation" onChange={(e) => set('title', e.target.value)} onBlur={() => touch('title')} aria-invalid={Boolean(errorFor('title'))} />
            {errorFor('title') && <span className="err">⚠ {errorFor('title')}</span>}
          </div>

          <div className="field">
            <label htmlFor="t-date">Deadline date {filled('date')}</label>
            <input id="t-date" type="date" className={`input${errorFor('date') || errorFor('deadline') ? ' invalid' : ''}`} value={f.date} min={editing ? undefined : schedule.today} onChange={(e) => set('date', e.target.value)} onBlur={() => touch('date')} />
            {(errorFor('date') || errorFor('deadline')) && <span className="err">⚠ {errorFor('date') || errorFor('deadline')}</span>}
          </div>

          <div className="field">
            <label htmlFor="t-time">Time {filled('time')}</label>
            <select id="t-time" className="select" value={f.time} onChange={(e) => set('time', e.target.value)}>
              {timeOptions.map((t) => <option key={t} value={t}>{to12(t)}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="t-weight">Weight (% of final grade) {filled('weight')}</label>
            <div className="suffix-wrap">
              <input id="t-weight" type="number" inputMode="decimal" min="0" max="100" step="1" className={`input${errorFor('weight') ? ' invalid' : ''}`} value={f.weight} placeholder="e.g. 10" onChange={(e) => set('weight', e.target.value)} onBlur={() => touch('weight')} aria-invalid={Boolean(errorFor('weight'))} aria-describedby="t-weight-err" />
              <span className="suffix">%</span>
            </div>
            {errorFor('weight') && <span className="err" id="t-weight-err">⚠ {errorFor('weight')}</span>}
          </div>

          <div className="field">
            <span className="label" id="t-diff-label">Difficulty {filled('difficulty')}</span>
            <div className="diff-row" role="group" aria-labelledby="t-diff-label">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`diff-dot${n <= f.difficulty ? ' on' : ''}${n === f.difficulty ? ' sel' : ''}`}
                  aria-pressed={n === f.difficulty}
                  aria-label={`${n} – ${DIFFICULTY_LABELS[n]}`}
                  onClick={() => set('difficulty', n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="help">{f.difficulty} of 5 · {DIFFICULTY_LABELS[f.difficulty]}</span>
          </div>

          <div className="field">
            <span className="label" id="t-hours-label">Estimated study hours {filled('hours')}</span>
            <div className="stepper" role="group" aria-labelledby="t-hours-label">
              <button type="button" aria-label="Fewer hours" disabled={f.hours <= 0.5} onClick={() => set('hours', Math.max(0.5, f.hours - 0.5))}>−</button>
              <span className="val" aria-live="polite">{hoursText(f.hours)}</span>
              <button type="button" aria-label="More hours" disabled={f.hours >= 40} onClick={() => set('hours', Math.min(40, f.hours + 0.5))}>+</button>
            </div>
          </div>

          <div className="field" style={{ justifyContent: 'center' }}>
            {free && (
              <span className="help" style={free.hours < f.hours ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
                {free.hours < f.hours
                  ? `Only ${hoursText(free.hours)} free before ${fmtDate(f.date)}. The planner will show what does not fit.`
                  : `You have ${hoursText(free.hours)} free before ${fmtDate(f.date)}.`}
              </span>
            )}
          </div>

          <label className="check full field" style={{ flexDirection: 'row' }}>
            <input type="checkbox" checked={f.replan} onChange={(e) => set('replan', e.target.checked)} />
            <span>Re-plan my week after {editing ? 'saving' : 'adding'}</span>
          </label>
        </div>

        {formError && <p className="err" style={{ marginTop: 12 }} role="alert">⚠ {formError}</p>}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={invalid || saving}>{saving ? 'Saving…' : primary}</button>
        </div>
      </form>
    </Modal>
  );
}
