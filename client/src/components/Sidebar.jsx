import { icons } from './icons.jsx';

export const NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'courses', label: 'Courses' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'insights', label: 'Insights' },
  { key: 'settings', label: 'Settings' },
];

export default function Sidebar({ page, onNavigate, user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">{icons.logo}</div>
        <span>StudyPlanner AI</span>
      </div>
      <nav className="nav" aria-label="Main menu">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={page === item.key ? 'page' : undefined}
            onClick={() => onNavigate(item.key)}
            title={item.label}
          >
            {icons[item.key]}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="name">{user.name}</div>
        <button type="button" className="link-btn" onClick={onLogout}>Log out</button>
      </div>
    </aside>
  );
}
