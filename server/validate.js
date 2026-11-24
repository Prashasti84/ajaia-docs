import { badRequest } from './errors.js';

export const MAX_TITLE = 200;
export const MAX_CONTENT_BYTES = 1_000_000;
export const ROLES = ['viewer', 'editor'];

export function parseTitle(value, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') throw badRequest('Title must be text.');
  const title = value.trim();
  if (!title) throw badRequest('Title cannot be empty.');
  if (title.length > MAX_TITLE) throw badRequest(`Title must be ${MAX_TITLE} characters or fewer.`);
  return title;
}

export function parseContent(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('Content must be an HTML string.');
  if (Buffer.byteLength(value, 'utf8') > MAX_CONTENT_BYTES) {
    throw badRequest('Document is too large to save (limit is 1 MB).');
  }
  return value;
}

export function parseVersion(value) {
  if (!Number.isInteger(value) || value < 1) throw badRequest('baseVersion must be a positive integer.');
  return value;
}

export function parseEmail(value) {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw badRequest('Enter a valid email address.');
  }
  return value.trim().toLowerCase();
}

export function parseRole(value) {
  if (!ROLES.includes(value)) throw badRequest(`Role must be one of: ${ROLES.join(', ')}.`);
  return value;
}
