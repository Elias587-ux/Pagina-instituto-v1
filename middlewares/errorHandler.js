/**
 * Manejo centralizado de errores y rutas inexistentes de la API.
 * Todas las respuestas de error tienen la forma:
 *   { error: { message: string, details?: [{ field, message }] } }
 */
const AppError = require('../utils/AppError');
const { isDBConnected } = require('../config/db');

/** 404 para endpoints de la API que no existen. */
const notFound = (req, _res, next) => next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404));

/** Devuelve 503 si MongoDB todavía no está conectado. */
const requireDB = (_req, _res, next) =>
  isDBConnected()
    ? next()
    : next(new AppError('La base de datos no está disponible en este momento. Intentá nuevamente en unos instantes.', 503));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Error interno del servidor';
  let details = err.details;

  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Hay datos inválidos en el formulario';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Valor inválido para "${err.path}"`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'Ya existe un registro con esos datos';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'El cuerpo de la petición no es un JSON válido';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'El contenido enviado es demasiado grande';
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
    if (process.env.NODE_ENV === 'production') message = 'Error interno del servidor';
  }

  res.status(status).json({ error: { message, ...(details && { details }) } });
};

module.exports = { notFound, requireDB, errorHandler };
