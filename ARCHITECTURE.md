# Architecture note

## What I optimized for

The brief rewards a coherent product slice over feature count, so I picked the flows a reviewer will actually
exercise (write a formatted document, bring a file in, share it, come back later) and made those dependable:
nothing lost on refresh, no silent overwrites, clear permissions, clear errors. Everything else was cut or
deferred on purpose.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Editor | **TipTap v3** (ProseMirror) on React 19 + Vite | Mature rich-text model; the formatting the brief asks for comes built in, so time goes into product behavior instead of contentEditable edge cases. |
| API | **Node + Express 5** | Small surface, async errors handled natively, one process serves both the API and the built frontend. |
| Storage | **Postgres** in production, **SQLite** (built into Node) locally, behind one small adapter | Zero-setup local runs for reviewers, and real persistence on Render, whose free tier wipes the filesystem on restart. Both engines run the same test suite. |
| Hosting | **Render Blueprint** (free web service + free Postgres) | One click from a GitHub repo, nothing for reviewers to pay for. |

## Data model

```
users            (id, email unique, name)
documents        (id, owner_id → users, title, content HTML, version, source_filename,
                  created_at, updated_at, updated_by → users)
document_shares  (document_id → documents, user_id → users, role 'viewer'|'editor')  PK(document_id, user_id)
```

Ownership is a column, not a share row, so there is always exactly one owner and "owned vs shared" is a simple
query.

## Key decisions and tradeoffs

**Content stored as sanitized HTML.** The editor emits HTML; the server re-sanitizes every save and import
against an allowlist of exactly the tags the editor can produce. Formatting round-trips losslessly, and a shared
document can never carry a script to another user. Tradeoff: HTML is less structured than ProseMirror JSON, but
it is portable (export, import, debugging) and easy to read in the database.

**Optimistic concurrency instead of real-time sync.** Each content save sends the version it started from; the
update is `... WHERE id = ? AND version = ?`, so it is atomic. If someone saved in between, the API returns
409 with the latest copy and the UI offers "Load their version" or "Keep mine". Open documents poll every
8 seconds to pick up others' saves and permission changes. This gives correct, understandable shared editing
in a fraction of the time a CRDT/WebSocket setup (Yjs + Hocuspocus) would take, and it is the first thing I would
upgrade.

**Autosave pipeline.** Edits are debounced (800 ms) and merged into one in-flight request at a time, so saves
never race each other. Network and 5xx failures retry automatically; validation and permission errors don't.
The save state is always visible ("All changes saved", "Saving…", "Not saved: …"), and the browser warns before
closing a tab with unsaved work.

**Permissions enforced on the server, mirrored in the UI.** One helper (`loadWithRole`) resolves the caller's
role on every document request. Owners share, change roles, delete. Editors edit content and title. Viewers read.
Users without access get **404 rather than 403**, so document ids can't be probed. The UI hides controls the user
can't use, but the API is the source of truth (covered by tests).

**Mocked auth, isolated.** Sign-in sets a signed, httpOnly, SameSite cookie with the user id. All routes use
`req.user`, so real auth (OAuth or magic links) would replace only `auth.js`.

**File import as a product feature.** Uploads either become a new document or are inserted into the current
draft. Conversion runs server-side (mammoth for .docx, marked for Markdown, escaped paragraphs for .txt) and then
goes through the same sanitizer. Limits: 5 MB, allowlisted extensions, and friendly errors for empty, corrupt or
unsupported files.

## What I deliberately did not build

Real-time cursors and co-editing, comments and suggestions, version history, PDF export, folders and search,
public links, invite emails, and real authentication. Each is valuable, but each would have taken time away from
making the core flows solid.

## What I would build next (2-4 hours)

1. **Real-time collaboration:** Yjs + Hocuspocus over WebSockets with TipTap's collaboration and cursor
   extensions. The version column then becomes a snapshot checkpoint.
2. **Version history:** append a row to a `document_versions` table on each save (or every N minutes) with
   view and restore.
3. **Real auth:** email magic link or Google OAuth, plus share invites for people without an account.
4. **Client-side tests:** Playwright for the two-user sharing and conflict flows (verified manually and with a
   scripted browser run during development, but not committed as CI tests).
