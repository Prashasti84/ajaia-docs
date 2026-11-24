# Ajaia Docs

A lightweight collaborative document editor, inspired by Google Docs, built for the Ajaia
Full Stack Product Engineer assignment.

**Live app:** `<https://ajaia-docs-09h5.onrender.com>`
(Free Render instance: the first request after 15 idle minutes takes about a minute to wake up.)

## Demo accounts

Authentication is mocked: pick an account on the sign-in screen, no password needed.

| Account | Email | Seeded state |
| --- | --- | --- |
| Alice Chen | `alice@ajaia.test` | Owns "Q1 Planning Notes" (shared with Bob as **editor**); can **view** Bob's checklist |
| Bob Martinez | `bob@ajaia.test` | Owns "Team Onboarding Checklist" (shared with Alice as **viewer**) |
| Carol Singh | `carol@ajaia.test` | Nothing shared yet; good for testing a fresh share |

**Fastest way to review sharing:** open the app in a normal window as Alice and in a
private/incognito window as Bob. Share a document from Alice and it shows up under
"Shared with me" for Bob. Change Bob's permission and his open editor switches between
read-only and editable within about 8 seconds.

## What works end to end

- **Documents:** create, rename (inline title), edit in the browser, autosave, reopen, delete (owner only).
- **Rich text:** bold, italic, underline, strikethrough, Heading 1/2/3, bulleted and numbered lists,
  quotes, undo/redo, standard keyboard shortcuts.
- **File upload:**
  - *Import a file* on the dashboard turns a **.txt, .md or .docx** file (up to 5 MB) into a new editable document.
  - *Insert file* in the editor toolbar inserts a file's content at the cursor in an existing draft.
  - Formatting is kept: Markdown and Word headings, bold, italic, underline and lists come through.
  - Other types (PDF, images and so on) are rejected with a clear message. Supported types are stated in the UI.
- **Sharing:** every document has an owner. The owner shares by email with **Can edit** or **Can view**,
  changes roles, or removes access. The dashboard separates **Owned by me** and **Shared with me**,
  with role badges.
- **Persistence:** documents (stored as sanitized HTML, so formatting is preserved), titles, versions and shares
  live in Postgres in production and SQLite locally.
- **Safe concurrent editing:** saves are versioned. If someone else saved first, you get a clear choice
  ("Load their version" / "Keep mine") instead of silently losing work. Other people's saves are picked up by
  polling.
- **Export:** download any document as Markdown.

## Run locally

Requirements: **Node.js 22.13 or newer** (uses the built-in `node:sqlite`). No database setup and no native modules to compile.
Check with `node -v`; older versions fail during `npm install` or on start with confusing errors.

```bash
npm install
npm run dev        # API on :3001 and the Vite dev server on http://localhost:5173
```

Open http://localhost:5173. Data is stored in `./data/app.db` (SQLite) and the demo users and documents are
seeded on first start. Delete the `data/` folder to reset.

Production-style run (one process serving API and built frontend on http://localhost:3001):

```bash
npm run build
npm start
```

To use Postgres locally instead of SQLite, set `DATABASE_URL=postgres://...` (see `.env.example`).

## Tests

```bash
npm test
```

12 API tests (Vitest + Supertest) run the real Express app against an in-memory SQLite database and cover:
owner/editor/viewer permissions end to end (including revoke and the 404-not-403 rule), formatting surviving a
save and reopen, HTML sanitization, input validation, version conflicts (409), and file import for Markdown,
.docx and .txt plus rejected, empty and corrupt files.

The same suite runs against Postgres: `TEST_DATABASE_URL=postgres://... npm test`.

## Deploy (Render, free)

The repo includes a `render.yaml` Blueprint that creates a free web service and a free Postgres database and
connects them.

1. Push this folder to a GitHub repository.
2. In Render: **New → Blueprint**, select the repository, click **Apply**.
3. Wait for the build (about 2-3 minutes), then open the `onrender.com` URL.

`SESSION_SECRET` is generated automatically and `DATABASE_URL` is wired from the database.
Note: Render's free Postgres expires after 30 days, which is enough for review.

## Project structure

```
server/
  index.js        boot: env, database, seed, listen
  app.js          Express app: middleware, routes, static hosting, error handler
  auth.js         mocked sign-in with a signed httpOnly session cookie
  documents.js    documents, import, sharing routes and the access-control helper
  content.js      HTML sanitization and file → HTML conversion (.txt/.md/.docx)
  validate.js     request validation
  db.js           storage adapter (SQLite or Postgres), schema, seed data
client/src/
  pages/          Login, DocumentList (dashboard), EditorPage (editor, autosave, conflicts)
  components/     Toolbar, ShareDialog, TopBar
  api.js          fetch wrapper
test/             API tests and a .docx fixture
```

## Known limitations

- No real-time co-editing: two editors don't see each other's keystrokes live. Conflicts are detected and
  resolved per save instead (see ARCHITECTURE.md).
- Auth is mocked by design; there are no passwords or sign-up.
- Sharing is only with existing (seeded) accounts; there are no invite emails or public links.
- No version history, comments or PDF export.

## Other documents

- [ARCHITECTURE.md](ARCHITECTURE.md): what I prioritized and why
- [AI_WORKFLOW.md](AI_WORKFLOW.md): how AI tools were used and verified
- [SUBMISSION.md](SUBMISSION.md): exactly what is included
