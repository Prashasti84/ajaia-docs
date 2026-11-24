import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { authRouter, requireUser, sessionMiddleware } from './auth.js';
import { documentsRouter, filesRouter, usersRouter } from './documents.js';
import { SUPPORTED_UPLOADS, MAX_UPLOAD_BYTES } from './content.js';

export function createApp({ db, sessionSecret, secureCookies = false, staticDir } = {}) {
  if (!sessionSecret) throw new Error('sessionSecret is required');
  const app = express();
  app.set('trust proxy', 1); // behind Render's proxy, needed for secure cookies
  app.disable('x-powered-by');

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser(sessionSecret));
  app.use(sessionMiddleware(db));

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: db.kind }));
  app.get('/api/config', (_req, res) =>
    res.json({ supportedUploads: SUPPORTED_UPLOADS, maxUploadBytes: MAX_UPLOAD_BYTES }),
  );
  app.use('/api/auth', authRouter(db, { secureCookies }));
  app.use('/api/users', requireUser, usersRouter(db));
  app.use('/api/documents', requireUser, documentsRouter(db));
  app.use('/api/files', requireUser, filesRouter());
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));

  // Serve the built React app, with client-side routing fallback.
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false }));
    app.get('/{*splat}', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  // Central error handler: known errors keep their status, everything else is a 500.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request is too large.' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({
      error: status === 500 ? 'Something went wrong on our side. Please try again.' : err.message,
      ...(err.details || {}),
    });
  });

  return app;
}
