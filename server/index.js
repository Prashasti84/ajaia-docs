import './check-node.js'; // must stay first: runs before the other imports load
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.js';
import { openDatabase, seed } from './db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';

const sessionSecret = process.env.SESSION_SECRET || (isProd ? null : 'dev-only-secret');
if (!sessionSecret) {
  console.error('SESSION_SECRET must be set in production.');
  process.exit(1);
}

const db = await openDatabase({
  databaseUrl: process.env.DATABASE_URL,
  sqliteFile: process.env.SQLITE_FILE || join(root, 'data', 'app.db'),
});
await seed(db);

const app = createApp({
  db,
  sessionSecret,
  secureCookies: isProd,
  staticDir: join(root, 'dist'),
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Ajaia Docs listening on http://localhost:${port} (storage: ${db.kind})`);
});
