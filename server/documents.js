import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { badRequest, conflict, forbidden, notFound, HttpError } from './errors.js';
import { parseContent, parseEmail, parseRole, parseTitle, parseVersion } from './validate.js';
import {
  fileToHtml, sanitizeDocumentHtml, titleFromFilename, MAX_UPLOAD_BYTES,
} from './content.js';

const now = () => new Date().toISOString();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// Wrap multer so its errors become friendly HTTP errors.
function singleFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      if (!req.file) return next(badRequest('Choose a file to upload.'));
      return next();
    }
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'File is too large (limit is 5 MB).'));
    next(badRequest(err.message));
  });
}

// Returns the document plus the caller's role on it. A user with no access gets
// a 404 rather than a 403 so document ids can't be probed for existence.
async function loadWithRole(db, documentId, userId) {
  const doc = await db.get(
    `SELECT d.*, o.name AS owner_name, o.email AS owner_email, e.name AS editor_name
       FROM documents d
       JOIN users o ON o.id = d.owner_id
       LEFT JOIN users e ON e.id = d.updated_by
      WHERE d.id = ?`,
    [documentId],
  );
  if (!doc) throw notFound('Document not found.');
  if (doc.owner_id === userId) return { doc, role: 'owner' };
  const share = await db.get(
    'SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?',
    [documentId, userId],
  );
  if (!share) throw notFound('Document not found.');
  return { doc, role: share.role };
}

async function listShares(db, documentId) {
  const rows = await db.all(
    `SELECT u.id, u.name, u.email, s.role
       FROM document_shares s JOIN users u ON u.id = s.user_id
      WHERE s.document_id = ?
      ORDER BY u.name`,
    [documentId],
  );
  return rows.map((r) => ({ user: { id: r.id, name: r.name, email: r.email }, role: r.role }));
}

async function serialize(db, doc, role) {
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    version: Number(doc.version),
    role,
    owner: { id: doc.owner_id, name: doc.owner_name, email: doc.owner_email },
    sourceFilename: doc.source_filename || null,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    updatedBy: doc.editor_name || null,
    shares: await listShares(db, doc.id),
  };
}

async function fetchDocument(db, id, userId) {
  const { doc, role } = await loadWithRole(db, id, userId);
  return serialize(db, doc, role);
}

async function insertDocument(db, { ownerId, title, content, sourceFilename = null }) {
  const id = randomUUID();
  const ts = now();
  await db.run(
    `INSERT INTO documents (id, owner_id, title, content, source_filename, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ownerId, title, content, sourceFilename, ts, ts, ownerId],
  );
  return id;
}

export function documentsRouter(db) {
  const router = Router();

  // Dashboard: what I own vs. what others shared with me.
  router.get('/', async (req, res) => {
    const owned = await db.all(
      `SELECT d.id, d.title, d.updated_at,
              (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS share_count
         FROM documents d
        WHERE d.owner_id = ?
        ORDER BY d.updated_at DESC`,
      [req.user.id],
    );
    const shared = await db.all(
      `SELECT d.id, d.title, d.updated_at, s.role, o.name AS owner_name, o.email AS owner_email
         FROM document_shares s
         JOIN documents d ON d.id = s.document_id
         JOIN users o ON o.id = d.owner_id
        WHERE s.user_id = ?
        ORDER BY d.updated_at DESC`,
      [req.user.id],
    );
    res.json({
      owned: owned.map((d) => ({
        id: d.id, title: d.title, updatedAt: d.updated_at, role: 'owner', shareCount: Number(d.share_count),
      })),
      shared: shared.map((d) => ({
        id: d.id, title: d.title, updatedAt: d.updated_at, role: d.role,
        owner: { name: d.owner_name, email: d.owner_email },
      })),
    });
  });

  router.post('/', async (req, res) => {
    const title = parseTitle(req.body?.title) ?? 'Untitled document';
    const content = sanitizeDocumentHtml(parseContent(req.body?.content) ?? '');
    const id = await insertDocument(db, { ownerId: req.user.id, title, content });
    res.status(201).json({ document: await fetchDocument(db, id, req.user.id) });
  });

  // Upload a .txt / .md / .docx file and turn it into a new editable document.
  router.post('/import', singleFile, async (req, res) => {
    const content = await fileToHtml(req.file);
    const title = parseTitle(req.body?.title) ?? titleFromFilename(req.file.originalname);
    const id = await insertDocument(db, {
      ownerId: req.user.id, title, content, sourceFilename: req.file.originalname,
    });
    res.status(201).json({ document: await fetchDocument(db, id, req.user.id) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ document: await fetchDocument(db, req.params.id, req.user.id) });
  });

  // Rename and/or save content. Content saves use optimistic concurrency:
  // the client sends the version it started from, and if someone else saved in
  // the meantime we return 409 with the latest copy instead of overwriting it.
  router.patch('/:id', async (req, res) => {
    const title = parseTitle(req.body?.title);
    const content = parseContent(req.body?.content);
    if (title === undefined && content === undefined) throw badRequest('Nothing to update.');

    const { role } = await loadWithRole(db, req.params.id, req.user.id);
    if (role === 'viewer') throw forbidden('You have view-only access to this document.');

    const ts = now();
    if (content !== undefined) {
      const baseVersion = parseVersion(req.body?.baseVersion);
      const sets = ['content = ?', 'version = version + 1', 'updated_at = ?', 'updated_by = ?'];
      const params = [sanitizeDocumentHtml(content), ts, req.user.id];
      if (title !== undefined) {
        sets.push('title = ?');
        params.push(title);
      }
      const { changes } = await db.run(
        `UPDATE documents SET ${sets.join(', ')} WHERE id = ? AND version = ?`,
        [...params, req.params.id, baseVersion],
      );
      if (changes === 0) {
        throw conflict('Someone else saved changes to this document after you opened it.', {
          document: await fetchDocument(db, req.params.id, req.user.id),
        });
      }
    } else {
      await db.run(
        'UPDATE documents SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        [title, ts, req.user.id, req.params.id],
      );
    }
    res.json({ document: await fetchDocument(db, req.params.id, req.user.id) });
  });

  router.delete('/:id', async (req, res) => {
    const { role } = await loadWithRole(db, req.params.id, req.user.id);
    if (role !== 'owner') throw forbidden('Only the owner can delete this document.');
    await db.run('DELETE FROM document_shares WHERE document_id = ?', [req.params.id]);
    await db.run('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.status(204).end();
  });

  // ---- Sharing (owner only) ----

  router.post('/:id/shares', async (req, res) => {
    const email = parseEmail(req.body?.email);
    const role = parseRole(req.body?.role ?? 'viewer');
    const { doc, role: myRole } = await loadWithRole(db, req.params.id, req.user.id);
    if (myRole !== 'owner') throw forbidden('Only the owner can share this document.');

    const target = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (!target) throw notFound(`No user with email ${email}. Try one of the demo accounts.`);
    if (target.id === doc.owner_id) throw badRequest('You already own this document.');

    await db.run(
      `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
      [doc.id, target.id, role, now()],
    );
    res.status(201).json({ shares: await listShares(db, doc.id) });
  });

  router.delete('/:id/shares/:userId', async (req, res) => {
    const { doc, role } = await loadWithRole(db, req.params.id, req.user.id);
    if (role !== 'owner') throw forbidden('Only the owner can change sharing.');
    await db.run('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?', [
      doc.id, req.params.userId,
    ]);
    res.json({ shares: await listShares(db, doc.id) });
  });

  return router;
}

// Convert a file to HTML without creating a document ("Insert from file").
export function filesRouter() {
  const router = Router();
  router.post('/convert', singleFile, async (req, res) => {
    res.json({ html: await fileToHtml(req.file), title: titleFromFilename(req.file.originalname) });
  });
  return router;
}

export function usersRouter(db) {
  const router = Router();
  router.get('/', async (req, res) => {
    const users = await db.all('SELECT id, name, email FROM users ORDER BY name');
    res.json({ users });
  });
  return router;
}
