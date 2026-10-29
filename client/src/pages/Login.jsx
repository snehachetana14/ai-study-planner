import { useState } from 'react';
import { api, setToken } from '../api.js';
import { icons } from '../components/icons.jsx';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      const body = mode === 'signup' ? f : { email: f.email, password: f.password };
      const res = await api(`/auth/${mode}`, { method: 'POST', body });
      setToken(res.token);
      onLogin(res.user, mode === 'signup');
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
      setBusy(false);
    }
  }

  const field = (key, label, type = 'text', autoComplete = undefined) => (
    <div className="field">
      <label htmlFor={`a-${key}`}>{label}</label>
      <input id={`a-${key}`} type={type} autoComplete={autoComplete} className={`input${errors[key] ? ' invalid' : ''}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      {errors[key] && <span className="err">⚠ {errors[key]}</span>}
    </div>
  );

  return (
    <div className="auth">
      <div className="card">
        <div className="brand"><div className="brand-mark">{icons.logo}</div><span>StudyPlanner AI</span></div>
        <h1 style={{ marginBottom: 4 }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted" style={{ marginBottom: 18 }}>Your AI study planner and productivity coach.</p>
        <form onSubmit={submit} className="stack" style={{ gap: 14 }} noValidate>
          {mode === 'signup' && field('name', 'Name', 'text', 'name')}
          {field('email', 'Email', 'email', 'email')}
          {field('password', 'Password', 'password', mode === 'login' ? 'current-password' : 'new-password')}
          {message && !Object.keys(errors).length && <p className="err" role="alert">⚠ {message}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ height: 40 }}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p className="small" style={{ marginTop: 16, textAlign: 'center' }}>
          {mode === 'login' ? 'New here? ' : 'Already have an account? '}
          <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErrors({}); setMessage(''); }}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  );
}
