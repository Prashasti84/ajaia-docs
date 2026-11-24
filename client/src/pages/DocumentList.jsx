import { useEffect, useRef, useState } from 'react';
import { api, UPLOAD_ACCEPT, UPLOAD_HINT } from '../api.js';
import { ROLE_LABEL, timeAgo } from '../format.js';

function DocIcon() {
  return (
    <svg className="doc-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="var(--accent-soft)" />
      <path d="M14 2v5h5" fill="none" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M8 12h8M8 15h8M8 18h5" stroke="var(--accent)" strokeWidth="1.4" />
    </svg>
  );
}

function DocRow({ doc, onOpen, onDelete }) {
  return (
    <li className="doc-row">
      <button className="doc-row-main" onClick={onOpen}>
        <DocIcon />
        <span className="doc-row-title">{doc.title}</span>
        <span className="doc-row-meta">
          {doc.role === 'owner'
            ? doc.shareCount > 0
              ? `Shared with ${doc.shareCount} ${doc.shareCount === 1 ? 'person' : 'people'}`
              : 'Only you'
            : `Owner: ${doc.owner.name}`}
        </span>
        <span className="doc-row-meta">{timeAgo(doc.updatedAt)}</span>
        {doc.role !== 'owner' && <span className={`badge badge-${doc.role}`}>{ROLE_LABEL[doc.role]}</span>}
      </button>
      {onDelete && (
        <button className="icon-btn danger" title="Delete document" aria-label={`Delete ${doc.title}`} onClick={onDelete}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      )}
    </li>
  );
}

export default function DocumentList({ navigate }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const fileInput = useRef(null);

  const load = () =>
    api.listDocuments().then(setDocs).catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const createBlank = async () => {
    setBusy(true);
    setError('');
    try {
      const { document } = await api.createDocument();
      navigate(`/d/${document.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const importFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { document } = await api.importDocument(file);
      navigate(`/d/${document.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete “${doc.title}”? People it is shared with will lose access too.`)) return;
    try {
      await api.deleteDocument(doc.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const showOwned = filter !== 'shared';
  const showShared = filter !== 'owned';

  return (
    <main className="dashboard">
      <section className="start-row">
        <button className="start-card" onClick={createBlank} disabled={busy}>
          <span className="start-card-art plus" aria-hidden>+</span>
          <span>
            <strong>Blank document</strong>
            <span className="muted">Start writing from scratch</span>
          </span>
        </button>
        <button className="start-card" onClick={() => fileInput.current?.click()} disabled={busy}>
          <span className="start-card-art" aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
            </svg>
          </span>
          <span>
            <strong>Import a file</strong>
            <span className="muted">{UPLOAD_HINT}, becomes an editable doc</span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={UPLOAD_ACCEPT}
          hidden
          onChange={(e) => importFile(e.target.files?.[0])}
        />
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {busy && <div className="alert">Working…</div>}

      <div className="list-header">
        <h2>Documents</h2>
        <div className="segmented" role="tablist">
          {[
            ['all', 'All'],
            ['owned', 'Owned by me'],
            ['shared', 'Shared with me'],
          ].map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
              {docs && value !== 'all' && (
                <span className="count">{value === 'owned' ? docs.owned.length : docs.shared.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {!docs && !error && <p className="muted">Loading documents…</p>}

      {docs && showOwned && (
        <section className="doc-section">
          <h3>Owned by me</h3>
          {docs.owned.length === 0 ? (
            <p className="empty">You don’t own any documents yet. Create one or import a file above.</p>
          ) : (
            <ul className="doc-list">
              {docs.owned.map((d) => (
                <DocRow key={d.id} doc={d} onOpen={() => navigate(`/d/${d.id}`)} onDelete={() => remove(d)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {docs && showShared && (
        <section className="doc-section">
          <h3>Shared with me</h3>
          {docs.shared.length === 0 ? (
            <p className="empty">Nothing has been shared with you yet.</p>
          ) : (
            <ul className="doc-list">
              {docs.shared.map((d) => (
                <DocRow key={d.id} doc={d} onOpen={() => navigate(`/d/${d.id}`)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
