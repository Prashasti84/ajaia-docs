# Submission: Ajaia Docs

**Candidate:** Prashasti Vikas Randive (randiveprashasti@gmail.com)
**Role:** AI-Native Full Stack Product Engineer

## Links

- **Live app:** `<PASTE YOUR RENDER URL HERE>`
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Source:** this folder

## Test accounts

No passwords (mocked auth). Pick an account on the sign-in screen.

- `alice@ajaia.test`: owns "Q1 Planning Notes" (shared with Bob as editor)
- `bob@ajaia.test`: owns "Team Onboarding Checklist" (shared with Alice as viewer)
- `carol@ajaia.test`: no documents; use her to test a fresh share

Tip: use a normal window for one user and a private window for another.

## What's included

| Item | Location |
| --- | --- |
| Source code | `server/`, `client/`, `test/`, `package.json`, config files |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| This manifest | `SUBMISSION.md` |
| Walkthrough video link | `VIDEO_URL.txt` |
| Screenshots | `docs/screenshots/` |
| Deployment config | `render.yaml` (Render Blueprint: web service + Postgres) |
| Automated tests | `test/api.test.js` (12 tests, run with `npm test`) |

## Status

**Working end to end:** create, rename, edit, autosave and reopen documents; bold, italic, underline,
strikethrough, headings, bulleted and numbered lists; import .txt, .md or .docx as a new document or insert into an
existing one; owner-based sharing with editor and viewer roles; owned vs shared views; persistence in Postgres;
version-conflict detection with resolution UI; Markdown export.

**Stretch work included:** role-based sharing permissions (editor vs viewer), Markdown export, and lightweight
update detection (polling picks up others' saves and permission changes).

**Intentionally not built:** real-time co-editing, comments, version history, real authentication, invite emails.

**Next 2-4 hours:** real-time collaboration with Yjs + Hocuspocus, version history with restore, real auth with
share invites, and committed Playwright end-to-end tests. Details in `ARCHITECTURE.md`.
