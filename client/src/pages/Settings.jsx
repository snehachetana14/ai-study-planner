import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { WEEKDAY_NAMES, TIME_OPTIONS, to12, fmtDayMonth } from '../utils/format.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const START_TIMES = TIME_OPTIONS.filter((t) => t >= '05:00' && t <= '22:00');
const ZONES = [
  [330, 'India (UTC+5:30)'], [0, 'UTC'], [60, 'Central Europe (UTC+1)'], [180, 'Gulf / Moscow (UTC+3)'],
  [240, 'UAE (UTC+4)'], [345, 'Nepal (UTC+5:45)'], [360, 'Bangladesh (UTC+6)'], [480, 'Singapore / China (UTC+8)'],
  [540, 'Japan / Korea (UTC+9)'], [600, 'Sydney (UTC+10)'], [-300, 'US Eastern (UTC−5)'], [-480, 'US Pacific (UTC−8)'],
];

export default function Settings({ user, onUserChange }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [aiProvider, setAiProvider] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/settings').then((r) => {
      setForm({ name: r.name, ...r.settings });
      setAiProvider(r.aiProvider);
    }).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="card card-pad"><p className="err">⚠ {error}</p></div>;
  if (!form) return <div className="loading">Loading…</div>;

  const setDay = (key, i, value) => setForm((f) => {
    const list = [...f[key]];
    list[i] = value;
    return { ...f, [key]: list };
  });
  const hoursValid = form.weeklyHours.every((h) => h >= 0 && h <= 12 && Math.round(h * 2) === h * 2);
  const nameValid = form.name.trim().length >= 2;
  const total = form.weeklyHours.reduce((a, h) => a + (Number.isFinite(h) ? h : 0), 0);
  const overrides = Object.entries(form.overrides || {}).sort((a, b) => a[0].localeCompare(b[0]));

  async function save() {
    setSaving(true);
    try {
      const res = await api('/settings', {
        method: 'PUT',
        body: {
          name: form.name.trim(), weeklyHours: form.weeklyHours, startTimes: form.startTimes, tzOffsetMin: form.tzOffsetMin,
          useAI: form.useAI, reminderMinutes: form.reminderMinutes, overrides: form.overrides,
        },
      });
      setForm({ name: res.name, ...res.settings });
      onUserChange({ ...user, name: res.name });
      toast({ text: 'Settings saved · plan updated' });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Your free study time decides how the planner fills each day.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !hoursValid || !nameValid}>{saving ? 'Saving…' : 'Save & re-plan'}</button>
        </div>
      </div>

      <div className="stack">
        <section className="card" aria-labelledby="hours-title">
          <div className="card-head">
            <h2 id="hours-title">Weekly study hours</h2>
            <span className="small muted">{total} h per week</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Day</th><th>Free study hours</th><th>Start time</th></tr></thead>
              <tbody>
                {ORDER.map((i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{WEEKDAY_NAMES[i]}</td>
                    <td>
                      <input
                        type="number" className="input" style={{ width: 110 }} min="0" max="12" step="0.5"
                        aria-label={`${WEEKDAY_NAMES[i]} hours`}
                        value={Number.isFinite(form.weeklyHours[i]) ? form.weeklyHours[i] : ''}
                        onChange={(e) => setDay('weeklyHours', i, e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <select className="select" style={{ width: 130 }} aria-label={`${WEEKDAY_NAMES[i]} start time`} value={form.startTimes[i]} onChange={(e) => setDay('startTimes', i, e.target.value)}>
                        {START_TIMES.map((t) => <option key={t} value={t}>{to12(t)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hoursValid && <p className="err" style={{ padding: '0 18px 14px' }}>⚠ Each day needs 0–12 hours in steps of 0.5</p>}
        </section>

        {overrides.length > 0 && (
          <section className="card" aria-labelledby="extra-title">
            <div className="card-head"><h2 id="extra-title">Extra hours on specific days</h2></div>
            <ul className="list">
              {overrides.map(([date, hours]) => (
                <li key={date} className="spread">
                  <span>{fmtDayMonth(date)}: <strong>{hours} h</strong></span>
                  <button type="button" className="btn btn-sm" onClick={() => setForm((f) => { const o = { ...f.overrides }; delete o[date]; return { ...f, overrides: o }; })}>Remove</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid-2">
          <section className="card card-pad stack" style={{ gap: 14 }} aria-labelledby="ai-title">
            <h2 id="ai-title">AI planning</h2>
            <label className="check">
              <input type="checkbox" checked={form.useAI} onChange={(e) => setForm({ ...form, useAI: e.target.checked })} />
              <span>Use AI suggestions when available</span>
            </label>
            <p className="small muted">
              {aiProvider
                ? `Connected to ${aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI'}. Every AI plan is checked before it is saved; if it fails a check, the rule-based planner is used.`
                : 'No AI key is set on the server, so the rule-based planner is used. Add GEMINI_API_KEY or OPENAI_API_KEY to server/.env to enable AI.'}
            </p>
          </section>

          <section className="card card-pad stack" style={{ gap: 14 }} aria-labelledby="pref-title">
            <h2 id="pref-title">Profile and reminders</h2>
            <div className="field">
              <label htmlFor="s-name">Name</label>
              <input id="s-name" className={`input${nameValid ? '' : ' invalid'}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="s-tz">Time zone</label>
              <select id="s-tz" className="select" value={form.tzOffsetMin} onChange={(e) => setForm({ ...form, tzOffsetMin: Number(e.target.value) })}>
                {ZONES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-rem">Remind me before each session</label>
              <select id="s-rem" className="select" value={form.reminderMinutes} onChange={(e) => setForm({ ...form, reminderMinutes: Number(e.target.value) })}>
                {[[0, 'Off'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
