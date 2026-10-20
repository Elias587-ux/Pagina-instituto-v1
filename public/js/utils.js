/**
 * Utilidades compartidas del frontend.
 */

export const $ = (selector, ctx = document) => ctx.querySelector(selector);
export const $$ = (selector, ctx = document) => [...ctx.querySelectorAll(selector)];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para insertarlo de forma segura en plantillas HTML. */
export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * Devuelve la URL sólo si usa un esquema seguro (http/https/mailto/tel,
 * ruta interna o ancla). Evita enlaces javascript: cargados desde el CMS.
 */
export function safeUrl(url, fallback = '#') {
  if (typeof url !== 'string') return fallback;
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
  if ((u.startsWith('/') && !u.startsWith('//')) || u.startsWith('#')) return u;
  return fallback;
}

export const isExternalUrl = (url) => /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);

/** Atributos target/rel para enlaces externos. */
export const externalAttrs = (url) => (isExternalUrl(url) ? ' target="_blank" rel="noopener noreferrer"' : '');

// Las fechas del calendario se guardan como días UTC (medianoche): se formatean en UTC
// para que no "retrocedan" un día en la zona horaria de Argentina (UTC-3).
const DATE_TZ = 'UTC';

/** Ej: "3 de noviembre de 2026" */
export function formatDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', { timeZone: DATE_TZ, ...options }).format(date);
}

/** Partes de una fecha para tarjetas tipo agenda. */
export function dateParts(value) {
  const date = new Date(value);
  const fmt = (opts) => new Intl.DateTimeFormat('es-AR', { timeZone: DATE_TZ, ...opts }).format(date);
  return {
    day: fmt({ day: '2-digit' }),
    month: fmt({ month: 'short' }).replace('.', ''),
    weekday: fmt({ weekday: 'short' }).replace('.', ''),
  };
}

/** Rango legible: "3 al 7 de noviembre" o una sola fecha. */
export function formatRange(start, end) {
  if (!end || new Date(end).getTime() === new Date(start).getTime()) return formatDate(start);
  const s = new Date(start);
  const e = new Date(end);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  return sameMonth
    ? `${formatDate(s, { day: 'numeric' })} al ${formatDate(e)}`
    : `${formatDate(s, { day: 'numeric', month: 'long' })} al ${formatDate(e)}`;
}

/** Valor "YYYY-MM-DD" para <input type="date">. */
export const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Normaliza texto para búsquedas locales (sin tildes, minúsculas). */
export const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const whatsappUrl = (number) => {
  const digits = String(number || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
};

/** Acceso a storage tolerante a errores (modo privado, cookies bloqueadas). */
export const storage = {
  get(key, type = 'local') {
    try {
      return window[`${type}Storage`].getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value, type = 'local') {
    try {
      window[`${type}Storage`].setItem(key, value);
    } catch {
      /* sin persistencia disponible */
    }
  },
  remove(key, type = 'local') {
    try {
      window[`${type}Storage`].removeItem(key);
    } catch {
      /* sin persistencia disponible */
    }
  },
};
