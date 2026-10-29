import { useState } from 'react';
import Modal from './Modal.jsx';
import ReplanResult from './ReplanResult.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDay, hoursText, timeRange } from '../utils/format.js';

const REASONS = ['Unwell', 'Busy', 'Forgot', 'Other'];
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Missed-session flow (Assessment 9, Screen 3): confirm -> working -> result.
export default function MissedFlow({ session, schedule, onClose, onUpdated, onUndo, onResolve }) {
  const toast = useToast();
  const [step, setStep] = useState('confirm');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(schedule);

  const task = schedule.tasks.find((t) => t.id === session.taskId);
  const course = task && schedule.courses.find((c) => c.id === task.courseId);
  const freeHours = schedule.days.filter((d) => d.date >= schedule.today).slice(0, 14).reduce((a, d) => a + d.capacity, 0);

  async function confirm() {
    setStep('working');
    setError('');
    const started = Date.now();
    try {
      const res = await api(`/sessions/${session.id}`, { method: 'PATCH', body: { status: 'missed', reason: reason || 'Not given' } });
      const wait = 700 - (Date.now() - started);
      if (wait > 0) await sleep(wait);
      onUpdated(res.schedule);
      setCurrent(res.schedule);
      setResult(res);
      setStep('result');
      const needs = res.schedule.unscheduled.length;
      const moved = (res.changes.added || []).length + (res.changes.changed || []).length;
      toast({
        text: `Plan updated · 1 removed${moved ? ` · ${moved} moved` : ''}${needs ? ` · ${needs} need${needs === 1 ? 's' : ''} your choice` : ''}`,
        action: { label: 'Undo', onClick: onUndo },
      });
    } catch (err) {
      setError(err.message);
      setStep('confirm');
    }
  }

  async function resolve(taskId, action) {
    const res = await onResolve(taskId, action);
    setCurrent(res.schedule);
    if (action === 'addHours') setResult(res);
  }

  if (step === 'result') {
    return (
      <Modal title="Plan updated" onClose={onClose} wide>
        <ReplanResult result={result} schedule={current} onResolve={resolve} onClose={onClose} />
      </Modal>
    );
  }

  if (step === 'working') {
    return (
      <Modal title="Re-planning…" onClose={() => {}}>
        <p style={{ marginBottom: 12 }}>Re-planning {schedule.ranked.length} task{schedule.ranked.length === 1 ? '' : 's'} around {hoursText(freeHours)} of free time…</p>
        <div className="progress indeterminate" role="progressbar" aria-label="Re-planning"><div /></div>
        <p className="small muted" style={{ marginTop: 10 }}>Usually 1–3 s; switches to the rule-based planner if the AI is slow.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Mark as missed?"
      subtitle={`${fmtDay(session.date)} · ${task ? task.title : ''} · ${hoursText(session.hours)}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirm}>Mark missed</button>
        </>
      )}
    >
      <div className="session" style={{ '--stripe': course ? course.color : '#999', marginBottom: 16 }}>
        <div className="course">{course ? course.name : ''}</div>
        <div className="title">{task ? task.title : ''}</div>
        <div className="time">{hoursText(session.hours)} · {timeRange(session.start, session.end)}</div>
      </div>
      <p style={{ fontWeight: 600, marginBottom: 8 }} id="reason-label">Why? <span className="muted" style={{ fontWeight: 400 }}>(optional, used for burnout insights)</span></p>
      <div className="chips" role="group" aria-labelledby="reason-label">
        {REASONS.map((r) => (
          <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>The planner will move this work into your next free hours.</p>
      {error && <p className="err" role="alert" style={{ marginTop: 8 }}>⚠ {error}</p>}
    </Modal>
  );
}
