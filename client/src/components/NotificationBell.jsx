import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { icons } from './icons.jsx';
import { timeAgo } from '../utils/format.js';

// Bell with unread count. Checks for new reminders every minute.
export default function NotificationBell({ refreshKey }) {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  const load = useCallback(() => {
    api('/notifications').then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markAll = async () => {
    await api('/notifications/read', { method: 'POST', body: {} });
    load();
  };

  return (
    <div className="bell" ref={wrap}>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
      >
        {icons.bell}
      </button>
      {data.unread > 0 && <span className="count" aria-hidden="true">{data.unread > 9 ? '9+' : data.unread}</span>}
      {open && (
        <div className="menu" role="region" aria-label="Notifications">
          <div className="spread" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <h3>Notifications</h3>
            {data.unread > 0 && <button type="button" className="link-btn small" onClick={markAll}>Mark all read</button>}
          </div>
          {data.items.length === 0 && <p className="muted" style={{ padding: 16 }}>No reminders yet.</p>}
          {data.items.map((n) => (
            <div key={n.id} className={`menu-item${n.read ? '' : ' unread'}`}>
              <span className={`dot ${n.level}`} aria-hidden="true" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{n.title}</div>
                {n.body && <div className="small muted">{n.body}</div>}
                <div className="small muted">{timeAgo(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
