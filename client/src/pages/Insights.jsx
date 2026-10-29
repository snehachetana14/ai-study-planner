import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDay, hoursText, fmtDayMonth } from '../utils/format.js';

const LEVEL = {
  'On track': { pill: 'pill-good', text: 'No sign of burnout. Your study pattern looks sustainable.' },
  Watch: { pill: 'pill-warn', text: 'Two warning signs. Ease off a little before it builds up.' },
  'At risk': { pill: 'pill-bad', text: 'Several warning signs. Plan a lighter few days and rest.' },
};

// 14-day chart: planned hours (light) vs studied hours (solid), missed sessions as red marks.
function DaysChart({ days }) {
  const W = 680;
  const H = 220;
  const left = 34;
  const bottom = 30;
  const top = 14;
  const max = Math.max(4, ...days.map((d) => d.planned));
  const step = (W - left - 8) / days.length;
  const bw = Math.min(14, step / 2.6);
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), Math.round(max)];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Planned and studied hours for each of the last 14 days">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e3e6ee" />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64708a">{t}h</text>
        </g>
      ))}
      {days.map((d, i) => {
        const cx = left + step * i + step / 2;
        return (
          <g key={d.date}>
            <title>{`${fmtDayMonth(d.date)}: ${hoursText(d.done)} studied of ${hoursText(d.planned)} planned${d.missed ? `, ${d.missed} missed` : ''}`}</title>
            <rect x={cx - bw - 1} y={y(d.planned)} width={bw} height={y(0) - y(d.planned)} rx="3" fill="#c9d6fd" />
            <rect x={cx + 1} y={y(d.done)} width={bw} height={y(0) - y(d.done)} rx="3" fill="#3b6cf6" />
            {Array.from({ length: d.missed }).map((_, k) => (
              <circle key={k} cx={cx} cy={y(d.planned) - 7 - k * 9} r="3.5" fill="#d14343" />
            ))}
            {(i % 2 === 0 || days.length <= 7) && (
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="10.5" fill="#64708a">{fmtDay(d.date)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Analytics & Burnout dashboard.
export default function Insights() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/insights').then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="card card-pad"><p className="err">⚠ {error}</p></div>;
  if (!data) return <div className="loading">Loading…</div>;

  const level = LEVEL[data.level];
  const reasons = Object.entries(data.reasons).sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(1, ...reasons.map((r) => r[1]));
  const late = data.signals.find((s) => s.key === 'late');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p className="muted">Last 14 days · {fmtDayMonth(data.from)} – {fmtDayMonth(data.to)}</p>
        </div>
      </div>

      <div className="stack">
        <section className="card card-pad" aria-labelledby="level-title">
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <h2 id="level-title">Burnout risk</h2>
            <span className={`pill ${level.pill}`} style={{ fontSize: 13, height: 28 }}>{data.level}</span>
            <span className="small muted">{data.score} warning point{data.score === 1 ? '' : 's'}</span>
          </div>
          <p style={{ marginTop: 8 }}>{level.text}</p>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {data.suggestions.map((s) => <li key={s} style={{ marginBottom: 4 }}>{s}</li>)}
          </ul>
        </section>

        <div className="grid-4">
          <div className="card card-pad stat"><div className="label">Hours studied</div><div className="value">{hoursText(data.totals.doneHours)}</div><div className="sub">of {hoursText(data.totals.plannedHours)} planned</div></div>
          <div className="card card-pad stat"><div className="label">Sessions completed</div><div className="value">{data.totals.completionRate === null ? '–' : `${data.totals.completionRate}%`}</div><div className="sub">{data.totals.sessionsDone} done · {data.totals.sessionsMissed} missed</div></div>
          <div className="card card-pad stat"><div className="label">Late-night sessions</div><div className="value">{late ? late.value : 0}</div><div className="sub">finished after 11 PM</div></div>
          <div className="card card-pad stat"><div className="label">Not marked yet</div><div className="value">{data.totals.sessionsUnmarked}</div><div className="sub">past sessions without Done/Missed</div></div>
        </div>

        <section className="card" aria-labelledby="chart-title">
          <div className="card-head">
            <h2 id="chart-title">Planned vs studied</h2>
            <div className="row small muted" style={{ gap: 14 }}>
              <span className="row"><span className="color-dot" style={{ background: '#c9d6fd', borderRadius: 3 }} />Planned</span>
              <span className="row"><span className="color-dot" style={{ background: '#3b6cf6', borderRadius: 3 }} />Studied</span>
              <span className="row"><span className="color-dot" style={{ background: '#d14343' }} />Missed session</span>
            </div>
          </div>
          <div className="card-pad"><DaysChart days={data.days} /></div>
        </section>

        <div className="grid-2">
          <section className="card" aria-labelledby="signals-title">
            <div className="card-head"><h2 id="signals-title">Warning signs checked</h2></div>
            <table className="table">
              <tbody>
                {data.signals.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td style={{ fontWeight: 650 }}>{s.value}</td>
                    <td className="nowrap">{s.flagged ? <span className="pill pill-warn">⚠ Flagged</span> : <span className="pill pill-good">✓ OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card" aria-labelledby="reasons-title">
            <div className="card-head"><h2 id="reasons-title">Why sessions were missed</h2></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              {reasons.length === 0 && <p className="muted">No missed sessions in the last 14 days.</p>}
              {reasons.map(([reason, count]) => (
                <div key={reason}>
                  <div className="spread small"><span>{reason}</span><span style={{ fontWeight: 650 }}>{count}</span></div>
                  <div className="bar" style={{ height: 8, marginTop: 4 }}><div style={{ width: `${(count / maxReason) * 100}%`, background: '#d14343' }} /></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
