/**
 * Helpers para parsear parámetros de query de forma segura.
 */

/** Convierte a entero acotado entre min y max; si no es válido devuelve fallback. */
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

/** Devuelve el string sólo si es un string (evita inyección de objetos tipo {$gt: ''}). */
const str = (value) => (typeof value === 'string' ? value.trim() : '');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ACCENT_CLASSES = { a: '[aáàäâ]', e: '[eéèëê]', i: '[iíìïî]', o: '[oóòöô]', u: '[uúùüû]', n: '[nñ]' };

/** Crea una RegExp insensible a mayúsculas y tildes ("matematica" encuentra "Matemática"). */
const accentInsensitiveRegex = (text) => {
  const base = escapeRegex(text.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  return new RegExp(base.replace(/[aeioun]/gi, (ch) => ACCENT_CLASSES[ch.toLowerCase()]), 'i');
};

/** Medianoche UTC del día actual (las fechas de calendario se guardan como días UTC). */
const startOfTodayUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

module.exports = { clampInt, str, escapeRegex, accentInsensitiveRegex, startOfTodayUTC };
