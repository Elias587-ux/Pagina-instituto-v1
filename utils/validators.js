/**
 * Validadores y helpers compartidos por los esquemas Mongoose.
 */

// Acepta URLs absolutas http(s), mailto:, tel:, rutas internas (/...) y anclas (#...).
// Rechaza esquemas peligrosos como javascript: o data:.
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

const isSafeUrl = (value) => !value || SAFE_URL.test(String(value).trim());

/**
 * Definición reutilizable para campos de URL.
 * @param {string} label Nombre del campo para el mensaje de error.
 */
const urlField = (label) => ({
  type: String,
  trim: true,
  default: '',
  maxlength: [500, `${label}: máximo 500 caracteres`],
  validate: {
    validator: isSafeUrl,
    message: `${label}: URL no válida (use https://…, una ruta /… o un ancla #…)`,
  },
});

/** Opciones comunes de serialización: oculta __v. */
const toJSONOptions = { versionKey: false };

module.exports = { isSafeUrl, urlField, toJSONOptions };
