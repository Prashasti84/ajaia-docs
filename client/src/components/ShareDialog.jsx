import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Avatar } from './TopBar.jsx';

export default function ShareDialog({ doc, onClose, onSharesChange }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.users().then((r) => setUsers(r.users)).catch(() => {});
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sharedIds = new Set(doc.shares.map((s) => s.user.id));
  const suggestions = users.filter((u) => u.id !== doc.owner.id && !sharedIds.has(u.id));

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const { shares } = await fn();
      onSharesChange(shares);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => api.share(doc.id, email, role))) setEmail('');
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <h2 id="share-title">Share “{doc.title}”</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <form className="share-form" onSubmit={submit}>
          <input
            ref={inputRef}
            type="email"
            list="share-users"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <datalist id="share-users">
            {suggestions.map((u) => (
              <option key={u.id} value={u.email}>{u.name}</option>
            ))}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Permission">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy}>Share</button>
        </form>
        {suggestions.length > 0 && (
          <p className="hint">
            Demo accounts:{' '}
            {suggestions.map((u, i) => (
              <span key={u.id}>
                <button type="button" className="link" onClick={() => setEmail(u.email)}>{u.email}</button>
                {i < suggestions.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}

        <h3 className="modal-sub">People with access</h3>
        <ul className="access-list">
          <li>
            <Avatar name={doc.owner.name} />
            <span className="access-person">
              <strong>{doc.owner.name}</strong>
              <span>{doc.owner.email}</span>
            </span>
            <span className="muted">Owner</span>
          </li>
          {doc.shares.map((s) => (
            <li key={s.user.id}>
              <Avatar name={s.user.name} />
              <span className="access-person">
                <strong>{s.user.name}</strong>
                <span>{s.user.email}</span>
              </span>
              <select
                value={s.role}
                disabled={busy}
                aria-label={`Permission for ${s.user.name}`}
                onChange={(e) => run(() => api.share(doc.id, s.user.email, e.target.value))}
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button
                className="icon-btn danger"
                disabled={busy}
                aria-label={`Remove ${s.user.name}`}
                title="Remove access"
                onClick={() => run(() => api.unshare(doc.id, s.user.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-foot">
          <span className="muted">Editors can change content and the title. Only you can share or delete.</span>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
