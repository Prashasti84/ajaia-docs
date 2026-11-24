// Mocked authentication: users are seeded, and "signing in" sets a signed,
// httpOnly session cookie holding the user's id. There are no passwords on
// purpose (see ARCHITECTURE.md). Everything downstream relies on req.user,
// so swapping in real auth (OAuth, magic links) only touches this file.

import { Router } from 'express';
import { unauthorized, notFound } from './errors.js';
import { parseEmail } from './validate.js';

export const SESSION_COOKIE = 'ajaia_session';

export function sessionMiddleware(db) {
  return async (req, _res, next) => {
    try {
      const userId = req.signedCookies?.[SESSION_COOKIE];
      req.user = userId
        ? await db.get('SELECT id, email, name FROM users WHERE id = ?', [userId])
        : undefined;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function authRouter(db, { secureCookies }) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const email = parseEmail(req.body?.email);
    const user = await db.get('SELECT id, email, name FROM users WHERE email = ?', [email]);
    if (!user) throw notFound('No account with that email. Use one of the demo accounts.');
    res.cookie(SESSION_COOKIE, user.id, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  // 200 with user: null when signed out, so the app's first load isn't an error.
  router.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return router;
}
