// Storage adapter. One small interface, two engines:
//   - SQLite (built into Node) for zero-config local development and tests
//   - Postgres (pg) when DATABASE_URL is set, e.g. on Render
// Queries are written in a portable SQL subset with `?` placeholders.

import { randomUUID } from 'node:crypto';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users(id),
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     source_filename TEXT,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     updated_by TEXT REFERENCES users(id)
   )`,
  `CREATE TABLE IF NOT EXISTS document_shares (
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id),
     role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
     created_at TEXT NOT NULL,
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id)`,
];

// Node's built-in SQLite (node:sqlite, Node 22.13+): no native module to compile.
async function createSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    kind: 'sqlite',
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params);
    },
    async run(sql, params = []) {
      return { changes: Number(db.prepare(sql).run(...params).changes) };
    },
    async close() {
      db.close();
    },
  };
}

async function createPostgres(url) {
  const { default: pg } = await import('pg');
  // SSL for external hosts (Neon, Render external URLs); plain TCP for localhost
  // and Render's internal hostnames (e.g. "dpg-abc123-a", which have no dots).
  // DATABASE_SSL=true|false overrides the guess.
  const host = new URL(url).hostname;
  const needsSsl = process.env.DATABASE_SSL
    ? process.env.DATABASE_SSL === 'true'
    : host.includes('.') && !['127.0.0.1'].includes(host) && !/sslmode=disable/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 5,
  });
  // Convert portable `?` placeholders to Postgres `$1, $2, ...`
  const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  return {
    kind: 'postgres',
    async all(sql, params = []) {
      return (await pool.query(toPg(sql), params)).rows;
    },
    async get(sql, params = []) {
      return (await pool.query(toPg(sql), params)).rows[0];
    },
    async run(sql, params = []) {
      return { changes: (await pool.query(toPg(sql), params)).rowCount };
    },
    async close() {
      await pool.end();
    },
  };
}

export async function openDatabase({ databaseUrl, sqliteFile = 'data/app.db' } = {}) {
  let db;
  if (databaseUrl) {
    db = await createPostgres(databaseUrl);
  } else {
    if (sqliteFile !== ':memory:') {
      const { mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      mkdirSync(dirname(sqliteFile), { recursive: true });
    }
    db = await createSqlite(sqliteFile);
  }
  for (const statement of SCHEMA) await db.run(statement);
  return db;
}

export const SEED_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Chen' },
  { email: 'bob@ajaia.test', name: 'Bob Martinez' },
  { email: 'carol@ajaia.test', name: 'Carol Singh' },
];

const now = () => new Date().toISOString();

// Idempotent: safe to run on every boot.
export async function seed(db, { withSampleDocs = true } = {}) {
  for (const u of SEED_USERS) {
    await db.run(
      `INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING`,
      [randomUUID(), u.email, u.name, now()],
    );
  }
  if (!withSampleDocs) return;
  const { count } = await db.get('SELECT COUNT(*) AS count FROM documents');
  if (Number(count) > 0) return;

  const users = await db.all('SELECT id, email FROM users');
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u.id]));
  const alice = byEmail['alice@ajaia.test'];
  const bob = byEmail['bob@ajaia.test'];

  const welcomeId = randomUUID();
  await db.run(
    `INSERT INTO documents (id, owner_id, title, content, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      welcomeId,
      alice,
      'Q1 Planning Notes',
      '<h1>Q1 Planning Notes</h1><p>This document is owned by <strong>Alice</strong> and shared with <em>Bob</em> as an <u>editor</u>.</p><h2>Goals</h2><ul><li><p>Ship the internal docs MVP</p></li><li><p>Collect feedback from two teams</p></li></ul><h2>Next steps</h2><ol><li><p>Review the draft</p></li><li><p>Agree on owners</p></li></ol>',
      now(),
      now(),
      alice,
    ],
  );
  await db.run(
    `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)`,
    [welcomeId, bob, now()],
  );

  const bobDocId = randomUUID();
  await db.run(
    `INSERT INTO documents (id, owner_id, title, content, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      bobDocId,
      bob,
      'Team Onboarding Checklist',
      '<h1>Team Onboarding Checklist</h1><p>Owned by Bob, shared with Alice as a <strong>viewer</strong> (read-only).</p><ul><li><p>Laptop and accounts</p></li><li><p>Meet your buddy</p></li><li><p>First small task</p></li></ul>',
      now(),
      now(),
      bob,
    ],
  );
  await db.run(
    `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, 'viewer', ?)`,
    [bobDocId, alice, now()],
  );
}
