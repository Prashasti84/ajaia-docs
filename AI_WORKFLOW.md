<!-- Before submitting: read this through and edit it so it matches your own experience. -->
# AI-native workflow note

## Tools used

- **Claude (Anthropic)** as a pair programmer for planning, scaffolding, implementation, test writing and
  documentation drafts.
- Scripted headless browser runs (Playwright) and the project's own test suite to check the output.

## Where AI materially sped things up

- **Scaffolding and boilerplate:** Express routes, the React page structure, the TipTap toolbar wiring and the
  CSS came together in minutes instead of hours.
- **Library surface area:** TipTap v3, Express 5, multer 2 and mammoth all have version-specific APIs. AI got
  me to working code quickly, and I checked the details against library source where it mattered (below).
- **Test breadth:** drafting the permission matrix, conflict and file-import tests was fast, which let me cover
  more edge cases (empty file, corrupt .docx, XSS payloads, role escalation) than I would have by hand in the
  timebox.
- **Docs:** first drafts of the README and this note, which I then edited.

## What I changed or rejected

- **Rejected SQLite-only hosting.** The quickest suggestion was SQLite everywhere. Render's free tier has an
  ephemeral filesystem, so documents would disappear on every restart or spin-down. I kept SQLite for
  zero-setup local runs and added a small adapter so production uses Postgres, then ran the full test suite
  against both.
- **Fixed a phantom-save bug.** Generated code called `editor.setEditable(...)` on mount. In TipTap v3 that emits
  an update event by default, which queued a save on every open. For viewers that save would fail with a 403.
  I confirmed the default in the library source and passed `emitUpdate: false` there and on `setContent`.
- **Test config.** Vitest inherited Vite's `client/` root and silently found no tests. I added a dedicated
  `vitest.config.js` rather than reshaping the frontend build.
- **Signed-out state.** `/api/auth/me` originally returned 401 when signed out, which logged an error on every
  first visit. I changed it to `200 { user: null }`, since being signed out isn't an error.
- **UX from screenshot review.** The document header scrolled away while typing, hiding the save status. I made
  the header and toolbar sticky together.
- **Replaced a native dependency.** The first SQLite driver (`better-sqlite3`) compiles C++ on install. A clean
  install test showed it can fail without a compiler toolchain, which would break local setup for some reviewers
  (Windows especially). I switched to Node's built-in `node:sqlite`, so there is nothing to compile. I also made
  Postgres SSL depend on the host, because Render's internal database hostnames don't use SSL the way external
  ones do.
- **Kept scope tight.** I turned down suggestions to add WebSocket real-time editing and comments. Optimistic
  concurrency with a clear conflict UI was the better use of the timebox (see ARCHITECTURE.md).

## How I verified correctness, UX and reliability

- **Automated API tests (12),** run against in-memory SQLite and against a real Postgres instance:
  permissions for owner, editor, viewer and no access (including revoke and the 404 rule), formatting
  round-trip, sanitization, validation, 409 conflicts, and imports for .md, .docx and .txt plus failure cases.
- **Scripted two-user browser run** against the production build (SQLite and Postgres): Alice formats a document,
  reloads and checks that every mark and list survived; shares it as a viewer; Bob sees it under "Shared with me"
  with no toolbar and a read-only editor; Alice upgrades him to editor and his open page becomes editable;
  concurrent edits produce the conflict banner; Markdown import and a rejected PDF behave as expected. The only
  console errors were the intended 409 and 400 responses.
- **Manual review** of every screen via screenshots for layout, empty states, error messages and wording.
- **Code review** of anything security-relevant: the sanitizer allowlist, cookie flags, the access-control helper,
  and the upload size and type limits.
