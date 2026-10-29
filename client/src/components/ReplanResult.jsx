import { useState } from 'react';
import SourcePill from './SourcePill.jsx';
import { fmtDay, hoursText, deadlineText, to12 } from '../utils/format.js';

const MAX_LINES = 6;

// A conflict: work that no longer fits before its deadline, with two choices (Screen 3, marker 6).
export function ConflictBox({ conflict, schedule, onResolve }) {
  const [busy, setBusy] = useState(false);
  const [reminded, setReminded] = useState(false);
  const task = schedule.tasks.find((t) => t.id === conflict.taskId);
  if (!task) return null;
  const addOption = conflict.options.find((o) => o.action === 'addHours');

  const choose = async (action) => {
    setBusy(true);
    try {
      await onResolve(conflict.taskId, action);
      if (action === 'remind') setReminded(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="conflict" data-testid="conflict">
      <div style={{ fontWeight: 650 }}>⚠ {hoursText(conflict.hoursLeft)} of {task.title} {conflict.hoursLeft === 1 ? 'does' : 'do'} not fit</div>
      <div className="small">before its deadline, {deadlineText(conflict.deadline, schedule.tzOffsetMin)}.</div>
      {conflict.tooSoon && <div className="small" style={{ marginTop: 4 }}>There is no full study day left before the deadline.</div>}
      <div className="small muted" style={{ marginTop: 8 }}>Choose how to handle it:</div>
      <div className="acts">
        {addOption && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => choose('addHours')}>
            Add {hoursText(addOption.hours)} on {fmtDay(addOption.date)}
          </button>
        )}
        <button type="button" className="btn btn-sm" disabled={busy || reminded} onClick={() => choose('remind')}>
          {reminded ? '✓ Reminder set' : 'Keep plan, remind me'}
        </button>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>Nothing else changes until you choose.</div>
    </div>
  );
}

// "Plan updated" panel: source, what changed, conflicts and the next session (Screen 3, step 3).
export default function ReplanResult({ result, schedule, onResolve, onClose }) {
  const changes = result.changes || {};
  const taskById = new Map(schedule.tasks.map((t) => [t.id, t]));
  const name = (id) => (taskById.get(id) ? taskById.get(id).title : 'Deleted task');

  const lines = [];
  if (changes.missed) {
    lines.push({ k: '✕ Removed', cls: 'k-removed', text: `${fmtDay(changes.missed.date)} · ${name(changes.missed.taskId)} · ${hoursText(changes.missed.hours)} (missed)` });
  }
  // A session removed from one day and added on another for the same task is shown as one "Moved" line.
  const added = [...(changes.added || [])];
  for (const r of changes.removed || []) {
    const i = added.findIndex((a) => a.taskId === r.taskId && a.hours === r.hours);
    if (i >= 0) {
      const a = added.splice(i, 1)[0];
      lines.push({ k: '↻ Moved', cls: '', text: `${name(r.taskId)} · ${hoursText(r.hours)} · ${fmtDay(r.date)} → ${fmtDay(a.date)}` });
    } else {
      lines.push({ k: '✕ Removed', cls: 'k-removed', text: `${fmtDay(r.date)} · ${name(r.taskId)} · ${hoursText(r.hours)}` });
    }
  }
  for (const a of added) lines.push({ k: '+ Added', cls: 'k-added', text: `${fmtDay(a.date)} · ${name(a.taskId)} · ${hoursText(a.hours)}` });
  for (const c of changes.changed || []) lines.push({ k: '↻ Changed', cls: '', text: `${fmtDay(c.date)} · ${name(c.taskId)} · ${hoursText(c.from)} → ${hoursText(c.to)}` });
  const shown = lines.slice(0, MAX_LINES);
  const hidden = lines.length - shown.length;
  const full = (changes.fullDays || []).filter((d) => d >= schedule.today).slice(0, 3);

  const now = Date.parse(schedule.now);
  const next = schedule.sessions.find((s) => s.status === 'planned'
    && Date.parse(`${s.date}T${s.start}:00Z`) - schedule.tzOffsetMin * 60000 > now);
  const reminderMin = schedule.settings ? schedule.settings.reminderMinutes : 15;
  const remindAt = next && reminderMin
    ? (() => { const [h, m] = next.start.split(':').map(Number); const t = h * 60 + m - reminderMin; return to12(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`); })()
    : null;

  return (
    <div className="stack" style={{ gap: 14 }} data-testid="replan-result">
      <div><SourcePill schedule={schedule} /></div>
      <div>
        <h3 style={{ marginBottom: 4 }}>What changed</h3>
        <ul className="changes">
          {shown.map((l, i) => (
            <li key={i}><span className={`k ${l.cls}`}>{l.k}</span><span>{l.text}</span></li>
          ))}
          {hidden > 0 && <li><span className="k" /><span className="muted">and {hidden} more</span></li>}
          {changes.keptCount > 0 && (
            <li><span className="k">= Kept</span><span>{changes.keptCount} session{changes.keptCount === 1 ? '' : 's'} unchanged</span></li>
          )}
          {full.length > 0 && (
            <li><span className="k">■ Full</span><span>{full.map(fmtDay).join(', ')}: all free hours used</span></li>
          )}
          {!lines.length && !changes.keptCount && <li><span className="k">= Same</span><span>No sessions needed to move</span></li>}
        </ul>
      </div>

      {schedule.unscheduled.map((c) => (
        <ConflictBox key={c.taskId} conflict={c} schedule={schedule} onResolve={onResolve} />
      ))}

      {next && (
        <div>
          <h3 style={{ marginBottom: 4 }}>Next up</h3>
          <div>{fmtDay(next.date)}, {to12(next.start)} · {name(next.taskId)} · {hoursText(next.hours)}</div>
          {remindAt && <div className="small muted">Reminder at {remindAt}</div>}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>Back to week ›</button>
      </div>
    </div>
  );
}
