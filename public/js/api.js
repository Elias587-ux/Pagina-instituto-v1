/**
 * Cliente Fetch centralizado para la API del portal.
 * Normaliza errores en ApiError y gestiona el token JWT del panel.
 */
import { storage } from './utils.js';

const BASE = '/api';
const TOKEN_KEY = 'ies11_token';

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status Código HTTP (0 si no hubo respuesta).
   * @param {Array<{field: string, message: string}>} [details]
   */
  constructor(message, status, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const auth = {
  getToken: () => storage.get(TOKEN_KEY),
  setToken: (token) => storage.set(TOKEN_KEY, token),
  clear: () => storage.remove(TOKEN_KEY),
};

const toQuery = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

/**
 * Realiza una petición a la API.
 * @param {string} path Ruta relativa a /api.
 * @param {{ method?: string, body?: any, withAuth?: boolean, signal?: AbortSignal }} [options]
 */
async function request(path, { method = 'GET', body, withAuth = false, signal } = {}) {
  const headers = { Accept: 'application/json' };
  // Los archivos (Blob/File) viajan como binario con su propio tipo; el resto, como JSON.
  const isFile = body instanceof Blob;
  if (body !== undefined) headers['Content-Type'] = isFile ? body.type || 'application/octet-stream' : 'application/json';
  if (withAuth) {
    const token = auth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined || isFile ? body : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('No se pudo conectar con el servidor. Revisá tu conexión.', 0);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && withAuth) auth.clear();
    throw new ApiError(data?.error?.message || `Error ${response.status}`, response.status, data?.error?.details);
  }
  return data;
}

export const api = {
  // ─── Público ───
  health: () => request('/health'),
  settings: () => request('/settings'),
  news: (params) => request(`/news${toQuery(params)}`),
  newsItem: (id) => request(`/news/${encodeURIComponent(id)}`),
  careers: (params) => request(`/careers${toQuery(params)}`),
  career: (id) => request(`/careers/${encodeURIComponent(id)}`),
  calendar: (params) => request(`/calendar${toQuery(params)}`),
  procedures: () => request('/procedures'),
  examBoards: () => request('/exam-boards'),
  search: (q, signal) => request(`/search${toQuery({ q })}`, { signal }),
  slides: () => request('/slides'),
  testimonials: () => request('/testimonials'),
  gallery: () => request('/gallery'),
  contact: (data) => request('/contact', { method: 'POST', body: data }),
  chat: (message) => request('/chat', { method: 'POST', body: { message } }),

  // ─── Autenticación ───
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me', { withAuth: true }),

  // ─── Panel de administración ───
  admin: {
    stats: () => request('/admin/stats', { withAuth: true }),
    list: (resource) => request(`/admin/${resource}`, { withAuth: true }),
    create: (resource, data) => request(`/admin/${resource}`, { method: 'POST', body: data, withAuth: true }),
    update: (resource, id, data) =>
      request(`/admin/${resource}/${encodeURIComponent(id)}`, { method: 'PUT', body: data, withAuth: true }),
    remove: (resource, id) =>
      request(`/admin/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE', withAuth: true }),
    replyInquiry: (id, message) =>
      request(`/admin/inquiries/${encodeURIComponent(id)}/reply`, { method: 'POST', body: { message }, withAuth: true }),
    importGoogleReviews: () => request('/admin/testimonials/import-google', { method: 'POST', withAuth: true }),
    saveSettings: (data) => request('/admin/settings', { method: 'PUT', body: data, withAuth: true }),
    /** @param {File} file @param {'logo'|'image'|'pdf'} kind @param {string} [name] nombre sugerido para el archivo */
    upload: (file, kind, name) => request(`/admin/uploads${toQuery({ kind, name })}`, { method: 'POST', body: file, withAuth: true }),
  },
};
