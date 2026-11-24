// Everything that turns untrusted input (editor HTML, uploaded files) into
// safe, storable document HTML lives here.

import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';
import mammoth from 'mammoth';
import { badRequest, HttpError } from './errors.js';

// Only the markup the editor itself can produce. Anything else is dropped, so a
// shared document can never carry scripts or event handlers to another user.
const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Normalise headings beyond h3 so they still render as headings in the editor.
    h4: 'h3', h5: 'h3', h6: 'h3',
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

export function sanitizeDocumentHtml(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

export const SUPPORTED_UPLOADS = {
  '.txt': 'Plain text',
  '.md': 'Markdown',
  '.markdown': 'Markdown',
  '.docx': 'Word document',
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function extensionOf(filename = '') {
  const match = /\.[^.]+$/.exec(filename.toLowerCase());
  return match ? match[0] : '';
}

export function titleFromFilename(filename = '') {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return (base || 'Imported document').slice(0, 200);
}

// Convert an uploaded file buffer into sanitized HTML.
export async function fileToHtml({ originalname, buffer }) {
  const ext = extensionOf(originalname);
  if (!SUPPORTED_UPLOADS[ext]) {
    throw badRequest(
      `Unsupported file type "${ext || 'unknown'}". Supported: ${Object.keys(SUPPORTED_UPLOADS).join(', ')}.`,
    );
  }
  if (!buffer || buffer.length === 0) throw badRequest('The uploaded file is empty.');

  let html;
  if (ext === '.docx') {
    try {
      const result = await mammoth.convertToHtml({ buffer }, { styleMap: ['u => u'] });
      html = result.value;
    } catch {
      throw new HttpError(422, 'Could not read this .docx file. Is it a valid Word document?');
    }
  } else {
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) throw new HttpError(422, 'This file does not look like text.');
    html = ext === '.txt' ? textToHtml(text) : await marked.parse(text, { gfm: true });
  }

  const clean = sanitizeDocumentHtml(html).trim();
  if (!clean) throw new HttpError(422, 'No readable content was found in this file.');
  return clean;
}
