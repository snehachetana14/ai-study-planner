import Modal from './Modal.jsx';

export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', danger = true, busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'btn-primary' : 'btn-primary'}`} style={danger ? { background: 'var(--bad)', borderColor: 'var(--bad)' } : undefined} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p>{message}</p>
    </Modal>
  );
}
