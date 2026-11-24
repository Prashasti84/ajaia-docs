// API tests: run the real Express app against a fresh in-memory SQLite DB
// (or Postgres, if TEST_DATABASE_URL is set) and exercise the flows that matter
// most: access control, persistence of formatting, conflicts and file import.

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { createApp } from '../server/app.js';
import { openDatabase, seed } from '../server/db.js';

let db;
let app;

beforeEach(async () => {
  if (db) await db.close();
  db = await openDatabase({ databaseUrl: process.env.TEST_DATABASE_URL, sqliteFile: ':memory:' });
  if (db.kind === 'postgres') {
    await db.run('DELETE FROM document_shares');
    await db.run('DELETE FROM documents');
  }
  await seed(db, { withSampleDocs: false });
  app = createApp({ db, sessionSecret: 'test-secret' });
});

afterAll(async () => db && db.close());

async function login(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email }).expect(200);
  return agent;
}

async function createDoc(agent, body = {}) {
  const res = await agent.post('/api/documents').send(body).expect(201);
  return res.body.document;
}

describe('auth', () => {
  it('rejects document access without a session', async () => {
    await request(app).get('/api/documents').expect(401);
  });

  it('rejects unknown accounts', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@ajaia.test' });
    expect(res.status).toBe(404);
  });
});

describe('documents', () => {
  it('creates, renames, saves and reopens a document with formatting intact', async () => {
    const alice = await login('alice@ajaia.test');
    const doc = await createDoc(alice);
    expect(doc.title).toBe('Untitled document');
    expect(doc.role).toBe('owner');

    const html = '<h2>Plan</h2><p><strong>Bold</strong> <em>italic</em> <u>under</u></p><ol><li><p>One</p></li></ol>';
    const saved = await alice
      .patch(`/api/documents/${doc.id}`)
      .send({ title: 'Launch plan', content: html, baseVersion: doc.version })
      .expect(200);
    expect(saved.body.document.version).toBe(doc.version + 1);

    const reopened = await alice.get(`/api/documents/${doc.id}`).expect(200);
    expect(reopened.body.document.title).toBe('Launch plan');
    expect(reopened.body.document.content).toBe(html);
  });

  it('strips scripts and event handlers from saved HTML', async () => {
    const alice = await login('alice@ajaia.test');
    const doc = await createDoc(alice);
    const res = await alice
      .patch(`/api/documents/${doc.id}`)
      .send({ content: '<p onclick="steal()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>', baseVersion: 1 })
      .expect(200);
    expect(res.body.document.content).toBe('<p>Hi</p>');
  });

  it('validates input', async () => {
    const alice = await login('alice@ajaia.test');
    const doc = await createDoc(alice);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: '   ' }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: 'x'.repeat(201) }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>no version</p>' }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({}).expect(400);
  });

  it('returns 409 instead of overwriting when someone else saved first', async () => {
    const alice = await login('alice@ajaia.test');
    const bob = await login('bob@ajaia.test');
    const doc = await createDoc(alice);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' }).expect(201);

    await bob.patch(`/api/documents/${doc.id}`).send({ content: '<p>Bob was here</p>', baseVersion: 1 }).expect(200);
    const stale = await alice
      .patch(`/api/documents/${doc.id}`)
      .send({ content: '<p>Alice overwrites</p>', baseVersion: 1 })
      .expect(409);
    expect(stale.body.document.content).toBe('<p>Bob was here</p>');
    expect(stale.body.document.version).toBe(2);
  });
});

describe('sharing and access control', () => {
  it('enforces owner / editor / viewer permissions end to end', async () => {
    const alice = await login('alice@ajaia.test');
    const bob = await login('bob@ajaia.test');
    const doc = await createDoc(alice, { title: 'Private notes' });

    // Not shared yet: Bob cannot see it at all (404, not 403, to avoid leaking ids).
    await bob.get(`/api/documents/${doc.id}`).expect(404);
    expect((await bob.get('/api/documents')).body.shared).toHaveLength(0);

    // Share as viewer: visible under "shared", readable, not writable.
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'viewer' }).expect(201);
    const list = (await bob.get('/api/documents')).body;
    expect(list.owned).toHaveLength(0);
    expect(list.shared).toMatchObject([{ id: doc.id, role: 'viewer', owner: { name: 'Alice Chen' } }]);
    expect((await bob.get(`/api/documents/${doc.id}`)).body.document.role).toBe('viewer');
    await bob.patch(`/api/documents/${doc.id}`).send({ content: '<p>x</p>', baseVersion: 1 }).expect(403);

    // Non-owners can't reshare or delete.
    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'viewer' }).expect(403);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);

    // Upgrade to editor: now Bob can write.
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' }).expect(201);
    await bob.patch(`/api/documents/${doc.id}`).send({ content: '<p>edited by Bob</p>', baseVersion: 1 }).expect(200);
    expect((await alice.get(`/api/documents/${doc.id}`)).body.document.updatedBy).toBe('Bob Martinez');

    // Revoke: access is gone again.
    const bobId = (await bob.get('/api/auth/me')).body.user.id;
    await alice.delete(`/api/documents/${doc.id}/shares/${bobId}`).expect(200);
    await bob.get(`/api/documents/${doc.id}`).expect(404);
  });

  it('rejects bad share requests', async () => {
    const alice = await login('alice@ajaia.test');
    const doc = await createDoc(alice);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'alice@ajaia.test' }).expect(400);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'ghost@ajaia.test' }).expect(404);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'admin' }).expect(400);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'not-an-email' }).expect(400);
  });
});

describe('file import', () => {
  it('turns a Markdown file into a formatted document', async () => {
    const alice = await login('alice@ajaia.test');
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from('# Meeting notes\n\nWe agreed on **two** things:\n\n- ship\n- learn\n'), 'meeting_notes.md')
      .expect(201);
    const doc = res.body.document;
    expect(doc.title).toBe('meeting notes');
    expect(doc.sourceFilename).toBe('meeting_notes.md');
    expect(doc.content).toContain('<h1>Meeting notes</h1>');
    expect(doc.content).toContain('<strong>two</strong>');
    expect(doc.content).toContain('<li>ship</li>');
  });

  it('turns a .docx file into a document, keeping headings, bold, underline and lists', async () => {
    const alice = await login('alice@ajaia.test');
    const res = await alice
      .post('/api/documents/import')
      .attach('file', readFileSync(new URL('./fixtures/sample.docx', import.meta.url)), 'Roadmap.docx')
      .expect(201);
    const { content } = res.body.document;
    expect(content).toContain('<h1>Imported Roadmap</h1>');
    expect(content).toContain('<strong>Word</strong>');
    expect(content).toContain('<u>underline</u>');
    expect(content).toContain('<li>First bullet</li>');
  });

  it('escapes HTML in plain-text uploads and keeps paragraphs', async () => {
    const alice = await login('alice@ajaia.test');
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from('Line <b>one</b>\n\nSecond para'), 'note.txt')
      .expect(201);
    expect(res.body.document.content).toBe('<p>Line &lt;b&gt;one&lt;/b&gt;</p><p>Second para</p>');
  });

  it('rejects unsupported, empty and corrupt files with clear errors', async () => {
    const alice = await login('alice@ajaia.test');
    const pdf = await alice.post('/api/documents/import').attach('file', Buffer.from('%PDF'), 'file.pdf');
    expect(pdf.status).toBe(400);
    expect(pdf.body.error).toMatch(/Unsupported file type/);
    await alice.post('/api/documents/import').attach('file', Buffer.from(''), 'empty.txt').expect(400);
    await alice.post('/api/documents/import').attach('file', Buffer.from('not a zip'), 'broken.docx').expect(422);
    await alice.post('/api/documents/import').expect(400);
  });
});
