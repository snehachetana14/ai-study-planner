import { useState } from 'react';
import { api } from '../api.js';

const EXAMPLES = [
  'DBMS assignment 4 due Monday 5 pm, worth 10%, about 3 hours, medium',
  'OS quiz tomorrow 9 am, 5%, easy, 2 hours',
];

// AI Quick Add (Assessment 10): type a sentence, the AI fills the Add Task form.
export default function QuickAdd({ onDraft, disabled }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api('/ai/quick-add', { method: 'POST', body: { text: text.trim() } });
      onDraft(res, text.trim());
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card quick-add" onSubmit={submit} aria-labelledby="qa-title">
      <div className="spread" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 id="qa-title"><span aria-hidden="true">✨ </span>Quick add with AI</h2>
        <span className="small muted">Describe a task in your own words; you check the form before it is added.</span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label htmlFor="qa-text" className="sr-only">Describe your task</label>
        <input
          id="qa-text"
          className="input"
          value={text}
          maxLength={500}
          disabled={disabled || busy}
          placeholder={`e.g. ${EXAMPLES[0]}`}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-ai" disabled={disabled || busy || text.trim().length < 3}>
          {busy ? 'Reading…' : '✨ Fill with AI'}
        </button>
      </div>
      {busy && <div className="progress indeterminate" style={{ marginTop: 10 }} role="progressbar" aria-label="AI is reading your sentence"><div /></div>}
      {error && <p className="err" style={{ marginTop: 8 }} role="alert">⚠ {error}</p>}
      {!busy && !error && (
        <div className="row small muted" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <span>Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="link-btn small" style={{ fontWeight: 500 }} onClick={() => setText(ex)} disabled={disabled}>“{ex}”</button>
          ))}
        </div>
      )}
    </form>
  );
}
