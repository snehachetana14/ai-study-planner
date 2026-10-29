import { useEffect, useState } from 'react';
import { api, hasToken, setToken, setUnauthorizedHandler } from './api.js';
import { ToastProvider } from './components/Toast.jsx';
import Sidebar, { NAV } from './components/Sidebar.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Schedule from './pages/Schedule.jsx';
import Courses from './pages/Courses.jsx';
import Attendance from './pages/Attendance.jsx';
import Insights from './pages/Insights.jsx';
import Settings from './pages/Settings.jsx';

const PAGES = { dashboard: Dashboard, schedule: Schedule, courses: Courses, attendance: Attendance, insights: Insights, settings: Settings };

// Simple hash routing: #/schedule, #/courses, ...
function readPage() {
  const key = window.location.hash.replace(/^#\/?/, '');
  return PAGES[key] ? key : 'dashboard';
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(hasToken());
  const [page, setPage] = useState(readPage);

  useEffect(() => {
    setUnauthorizedHandler(() => { setToken(null); setUser(null); });
    if (hasToken()) {
      api('/auth/me')
        .then((r) => setUser(r.user))
        .catch(() => setToken(null))
        .finally(() => setChecking(false));
    }
    const onHash = () => setPage(readPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (key) => {
    window.location.hash = `/${key}`;
    setPage(key);
    window.scrollTo(0, 0);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  if (checking) return <div className="loading">Loading…</div>;

  if (!user) {
    return (
      <ToastProvider>
        <Login onLogin={(u, isNew) => { setUser(u); navigate(isNew ? 'dashboard' : readPage()); }} />
      </ToastProvider>
    );
  }

  const Page = PAGES[page];
  const title = NAV.find((n) => n.key === page).label;

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar page={page} onNavigate={navigate} user={user} onLogout={logout} />
        <main className="main">
          <div className="topbar">
            <span className="small muted" aria-hidden="true">{title}</span>
            <NotificationBell refreshKey={page} />
          </div>
          <div className="content">
            <Page key={page} user={user} navigate={navigate} onUserChange={setUser} />
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
