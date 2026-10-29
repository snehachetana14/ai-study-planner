import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { fmtDate, fmtDayMonth } from '../utils/format.js';

const STATUS_COLOR = { ok: 'var(--good)', warn: 'var(--warn)', low: 'var(--bad)', none: 'var(--border-strong)' };
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Attendance / progress tracker: % per course and how many classes can be missed.
export default function Attendance({ navigate }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [date, setDate] = useState(localToday());
  const [busy, setBusy] = useState(null);

  useEffect(() => { api('/attendance').then(setData).catch((e) => setError(e.message)); }, []);

  async function mark(course, present) {
    setBusy(course.id);
    try {
      const res = await api('/attendance', { method: 'POST', body: { courseId: course.id, date, present } });
      setData(res);
      toast({ text: `${course.code || course.name}: ${present ? 'present' : 'absent'} on ${fmtDate(date)}` });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function remove(record) {
    try {
      setData(await api(`/attendance/${record.id}`, { method: 'DELETE' }));
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    }
  }

  if (error) return <div className="card card-pad"><p className="err">⚠ {error}</p></div>;
  if (!data) return <div className="loading">Loading…</div>;

  const below = data.courses.filter((c) => c.status === 'low').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Attendance</h1>
          <p className="muted">{below ? `${below} course${below === 1 ? ' is' : 's are'} below the minimum` : 'All courses at or above the minimum'}</p>
        </div>
        <div className="actions">
          <label htmlFor="att-date" className="small" style={{ fontWeight: 600 }}>Recording for</label>
          <input id="att-date" type="date" className="input" style={{ width: 170 }} value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {data.courses.length === 0 ? (
        <div className="card empty">
          <h2>No courses yet</h2>
          <p className="muted">Add your courses first, then record each class here.</p>
          <div className="actions"><button type="button" className="btn btn-primary" onClick={() => navigate('courses')}>Go to Courses</button></div>
        </div>
      ) : (
        <section className="card" aria-label="Attendance by course">
          {data.courses.map((c) => (
            <div key={c.id} className="att-row" data-testid="att-row">
              <div style={{ minWidth: 0 }}>
                <div className="row"><span className="color-dot" style={{ background: c.color }} /><span style={{ fontWeight: 650 }}>{c.name}</span></div>
                <div className="small muted">{c.code || ''}{c.code ? ' · ' : ''}{c.attended} of {c.total} classes</div>
              </div>
              <div className="att-pct" style={{ color: STATUS_COLOR[c.status] }}>{c.pct === null ? '–' : `${Math.round(c.pct)}%`}</div>
              <div className="att-bar-cell">
                <div className="att-bar" role="img" aria-label={`${c.pct ?? 0}% attended, minimum ${c.min}%`}>
                  <div style={{ width: `${c.pct ?? 0}%`, background: STATUS_COLOR[c.status] }} />
                  <span className="min" style={{ left: `${c.min}%` }} />
                </div>
                <div className="small" style={{ marginTop: 6, color: c.status === 'low' ? 'var(--bad)' : c.status === 'warn' ? 'var(--warn)' : 'var(--muted)', fontWeight: c.status === 'ok' || c.status === 'none' ? 400 : 600 }}>{c.message}</div>
                {c.recent.length > 0 && (
                  <div className="marks" aria-label="Recent classes">
                    {c.recent.map((r) => (
                      <span key={r.id} className={`mark ${r.present ? 'p' : 'a'}`} title={`${fmtDayMonth(r.date)}: ${r.present ? 'present' : 'absent'}`}>
                        {r.present ? 'P' : 'A'} {fmtDate(r.date)}
                        <button type="button" aria-label={`Remove record for ${fmtDate(r.date)}`} onClick={() => remove(r)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="row">
                <button type="button" className="btn btn-sm" disabled={busy === c.id} onClick={() => mark(c, true)}>✓ Present</button>
                <button type="button" className="btn btn-sm" disabled={busy === c.id} onClick={() => mark(c, false)}>✕ Absent</button>
              </div>
            </div>
          ))}
        </section>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>The dark line on each bar marks the course's minimum attendance. Marking the same date again replaces the earlier record.</p>
    </>
  );
}
