import { useEffect, useId, useRef } from 'react';

// Accessible dialog: Esc or the X closes it, focus moves into it when it opens.
export default function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  const titleId = useId();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current && ref.current.querySelector('input, select, button:not(.close-x)');
    if (first) first.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          <button type="button" className="close-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
