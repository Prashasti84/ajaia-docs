// Thin fetch wrapper: JSON in/out, consistent error objects with status + body.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = 'GET', body, form } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data);
  return data;
}

const fileForm = (file) => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export const api = {
  me: () => request('/auth/me'),
  login: (email) => request('/auth/login', { method: 'POST', body: { email } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  config: () => request('/config'),
  users: () => request('/users'),

  listDocuments: () => request('/documents'),
  createDocument: (data = {}) => request('/documents', { method: 'POST', body: data }),
  importDocument: (file) => request('/documents/import', { method: 'POST', form: fileForm(file) }),
  getDocument: (id) => request(`/documents/${id}`),
  updateDocument: (id, data) => request(`/documents/${id}`, { method: 'PATCH', body: data }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  convertFile: (file) => request('/files/convert', { method: 'POST', form: fileForm(file) }),

  share: (id, email, role) => request(`/documents/${id}/shares`, { method: 'POST', body: { email, role } }),
  unshare: (id, userId) => request(`/documents/${id}/shares/${userId}`, { method: 'DELETE' }),
};

export const UPLOAD_ACCEPT = '.txt,.md,.markdown,.docx';
export const UPLOAD_HINT = '.txt, .md or .docx, up to 5 MB';
