import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(() => {});
let nextId = 1;

// Short messages at the bottom of the screen, optionally with an action such as Undo.
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);

  // Toasts with an action (Undo) stay 8 s, plain ones 4 s; at most two are shown at once.
  const show = useCallback(({ text, tone = 'success', action, duration }) => {
    const id = nextId++;
    setItems((list) => [...list.slice(-1), { id, text, tone, action }]);
    setTimeout(() => dismiss(id), duration || (action ? 8000 : 4000));
  }, [dismiss]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span>{t.tone === 'error' ? '⚠ ' : t.tone === 'success' ? '✓ ' : ''}{t.text}</span>
            {t.action && (
              <button type="button" className="link-btn" onClick={() => { dismiss(t.id); t.action.onClick(); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
