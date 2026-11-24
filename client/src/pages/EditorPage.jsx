import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
import { api } from '../api.js';
import { ROLE_LABEL, timeAgo } from '../format.js';
import Toolbar from '../components/Toolbar.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import { Avatar } from '../components/TopBar.jsx';

const SAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 3000;
const POLL_MS = 8000;

export default function EditorPage({ id, user, navigate }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDocument(id).then((r) => setDoc(r.document)).catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <main className="center-screen">
        <div className="empty-state">
          <h2>Can’t open this document</h2>
          <p className="muted">{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Back to documents</button>
        </div>
      </main>
    );
  }
  if (!doc) return <main className="center-screen muted">Opening document…</main>;
  return <DocumentEditor initialDoc={doc} user={user} navigate={navigate} />;
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function SaveStatus({ status, message }) {
  const text = {
    saved: 'All changes saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: `Not saved: ${message}`,
    conflict: 'Not saved: newer version exists',
    readonly: 'View only',
  }[status];
  return <span className={`save-status save-${status}`} aria-live="polite">{text}</span>;
}

function DocumentEditor({ initialDoc, user, navigate }) {
  const id = initialDoc.id;
  const [meta, setMeta] = useState(initialDoc);
  const [title, setTitle] = useState(initialDoc.title);
  const [status, setStatus] = useState('saved');
  const [errorMsg, setErrorMsg] = useState('');
  const [conflict, setConflict] = useState(null);
  const [remoteUpdate, setRemoteUpdate] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [notice, setNotice] = useState('');

  const canEdit = meta.role !== 'viewer';

  // Save pipeline state lives in refs so editor callbacks always see the latest values.
  const editorRef = useRef(null);
  const versionRef = useRef(initialDoc.version);
  const pending = useRef({}); // { title?: string, content?: true }
  const inFlight = useRef(false);
  const conflictRef = useRef(null);
  const timer = useRef(null);
  const hasPending = () => Object.keys(pending.current).length > 0;

  // Sends at most one PATCH at a time, merging everything typed since the last save.
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || conflictRef.current || !hasPending()) return;

    const changes = pending.current;
    pending.current = {};
    const body = {};
    if (changes.title !== undefined) body.title = changes.title;
    if (changes.content) {
      body.content = editorRef.current.getHTML();
      body.baseVersion = versionRef.current;
    }

    inFlight.current = true;
    setStatus('saving');
    let nextDelay = null;
    try {
      const { document } = await api.updateDocument(id, body);
      versionRef.current = document.version;
      setMeta(document);
      setErrorMsg('');
      setStatus(hasPending() ? 'unsaved' : 'saved');
      if (hasPending()) nextDelay = SAVE_DELAY_MS;
    } catch (err) {
      pending.current = { ...changes, ...pending.current }; // keep unsaved work; newer title wins
      if (err.status === 409) {
        conflictRef.current = err.data.document;
        setConflict(err.data.document);
        setStatus('conflict');
      } else {
        setErrorMsg(err.message);
        setStatus('error');
        if (err.status === 0 || err.status >= 500) nextDelay = RETRY_DELAY_MS; // transient: retry
      }
    } finally {
      inFlight.current = false;
      if (nextDelay !== null) timer.current = setTimeout(flush, nextDelay);
    }
  }, [id]);

  const queue = useCallback(
    (changes) => {
      Object.assign(pending.current, changes);
      if (!conflictRef.current) setStatus((s) => (s === 'saving' ? s : 'unsaved'));
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initialDoc.content,
    editable: initialDoc.role !== 'viewer',
    onUpdate: () => queue({ content: true }),
  });
  editorRef.current = editor;

  // Role can change while the doc is open (owner upgrades or downgrades you).
  useEffect(() => {
    editor?.setEditable(canEdit, false); // false: don't emit an update (would queue a phantom save)
  }, [editor, canEdit]);

  const applyServerCopy = useCallback((latest) => {
    editorRef.current?.commands.setContent(latest.content, { emitUpdate: false });
    versionRef.current = latest.version;
    pending.current = {};
    conflictRef.current = null;
    setConflict(null);
    setRemoteUpdate(null);
    setTitle(latest.title);
    setMeta(latest);
    setStatus('saved');
  }, []);

  const keepMine = () => {
    versionRef.current = conflictRef.current.version;
    conflictRef.current = null;
    setConflict(null);
    pending.current.content = true;
    flush();
  };

  // Lightweight "collaboration": poll for newer versions saved by others.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden || inFlight.current || conflictRef.current) return;
      try {
        const { document: latest } = await api.getDocument(id);
        setMeta((m) => ({ ...m, role: latest.role, shares: latest.shares }));
        if (latest.version > versionRef.current && !hasPending()) {
          if (latest.role === 'viewer') applyServerCopy(latest);
          else setRemoteUpdate(latest);
        }
      } catch (err) {
        if (err.status === 404) {
          setErrorMsg('You no longer have access to this document.');
          setStatus('error');
          editorRef.current?.setEditable(false, false);
        }
      }
    };
    const handle = setInterval(tick, POLL_MS);
    return () => clearInterval(handle);
  }, [id, applyServerCopy]);

  // Warn before closing the tab with unsaved work; save on the way out.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (hasPending() || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (hasPending()) flush();
      clearTimeout(timer.current);
    };
  }, [flush]);

  const goBack = async () => {
    await flush();
    navigate('/');
  };

  const onTitleChange = (value) => {
    setTitle(value);
    if (value.trim()) queue({ title: value.trim() });
  };

  const insertFile = async (file) => {
    setInserting(true);
    setNotice('');
    try {
      const { html } = await api.convertFile(file);
      editor.chain().focus().insertContent(html).run();
      setNotice(`Inserted content from ${file.name}.`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setInserting(false);
    }
  };

  const exportMarkdown = () => {
    const md = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' }).turndown(editor.getHTML());
    download(`${title.trim() || 'document'}.md`, md, 'text/markdown');
  };

  if (!editor) return null;

  const collaborators = [meta.owner, ...meta.shares.map((s) => s.user)].filter((p) => p.id !== user.id);

  return (
    <div className="editor-page">
      <div className="doc-chrome">
      <div className="doc-header">
        <button className="icon-btn" onClick={goBack} aria-label="Back to documents" title="Back to documents">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <div className="doc-header-main">
          <input
            className="title-input"
            value={title}
            aria-label="Document title"
            maxLength={200}
            readOnly={!canEdit}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => !title.trim() && setTitle(meta.title)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                editor.commands.focus();
              }
            }}
          />
          <div className="doc-subline">
            {meta.role === 'owner' ? (
              <span className="badge badge-owner">Owner</span>
            ) : (
              <span className={`badge badge-${meta.role}`}>
                {ROLE_LABEL[meta.role]} · shared by {meta.owner.name}
              </span>
            )}
            <span className="muted">
              Edited {timeAgo(meta.updatedAt)}
              {meta.updatedBy ? ` by ${meta.updatedBy === user.name ? 'you' : meta.updatedBy}` : ''}
            </span>
            {meta.sourceFilename && <span className="muted">· Imported from {meta.sourceFilename}</span>}
            <SaveStatus status={canEdit ? status : status === 'error' ? 'error' : 'readonly'} message={errorMsg} />
          </div>
        </div>
        <div className="doc-header-actions">
          <div className="avatar-stack">
            {collaborators.slice(0, 4).map((p) => (
              <Avatar key={p.id} name={p.name} size={30} />
            ))}
          </div>
          <button className="btn" onClick={exportMarkdown} title="Download as Markdown">Export .md</button>
          {meta.role === 'owner' && (
            <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
              Share
            </button>
          )}
        </div>
      </div>

      {canEdit && <Toolbar editor={editor} onInsertFile={insertFile} inserting={inserting} />}
      </div>

      <div className="banners">
        {!canEdit && (
          <div className="alert">You have view-only access. Ask {meta.owner.name} for edit access.</div>
        )}
        {conflict && (
          <div className="alert alert-warn" role="alert">
            <span>
              <strong>{conflict.updatedBy || 'Someone'}</strong> saved a newer version while you were editing.
              Your latest changes are not saved yet.
            </span>
            <span className="alert-actions">
              <button className="btn" onClick={() => applyServerCopy(conflict)}>Load their version</button>
              <button className="btn btn-primary" onClick={keepMine}>Keep mine</button>
            </span>
          </div>
        )}
        {remoteUpdate && !conflict && (
          <div className="alert alert-info">
            <span>
              <strong>{remoteUpdate.updatedBy || 'Someone'}</strong> updated this document.
            </span>
            <span className="alert-actions">
              <button className="btn btn-primary" onClick={() => applyServerCopy(remoteUpdate)}>Load latest</button>
            </span>
          </div>
        )}
        {notice && (
          <div className="alert alert-info">
            <span>{notice}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setNotice('')}>✕</button>
          </div>
        )}
      </div>

      <div className="page-wrap" onMouseDown={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <article className="page">
          <EditorContent editor={editor} />
        </article>
      </div>

      {shareOpen && (
        <ShareDialog
          doc={meta}
          onClose={() => setShareOpen(false)}
          onSharesChange={(shares) => setMeta((m) => ({ ...m, shares }))}
        />
      )}
    </div>
  );
}
