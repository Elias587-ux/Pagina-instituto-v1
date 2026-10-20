/**
 * IES N° 11 — Portal institucional
 * Punto de entrada del servidor Express.
 *
 * - Sirve el frontend estático (public/) y las vistas HTML (views/).
 * - Expone la API REST bajo /api.
 * - Se conecta a MongoDB con reintentos: el sitio arranca aunque la base
 *   todavía no esté disponible (la API responde 503 hasta que conecte).
 */
require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const { connectDB, disconnectDB } = require('./config/db');
const { bootstrap } = require('./utils/bootstrap');
const apiRoutes = require('./routes/apiRoutes');
const viewRoutes = require('./routes/viewRoutes');
const { errorHandler } = require('./middlewares/errorHandler');

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ─── Validación de configuración crítica ─────────────────────────────
if (!process.env.JWT_SECRET) {
  if (isProd) {
    console.error('[config] JWT_SECRET es obligatorio en producción. Abortando.');
    process.exit(1);
  }
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET no definido: se generó uno temporal (las sesiones se pierden al reiniciar).');
}

const app = express();

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// ─── Seguridad y middlewares globales ────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'upgrade-insecure-requests': isProd ? [] : null,
      },
    },
  })
);
app.use(express.json({ limit: '200kb' }));
app.use(morgan(isProd ? 'combined' : 'dev'));

// ─── Estáticos, API y vistas ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: isProd ? '7d' : 0 }));
app.use('/api', apiRoutes);
app.use('/', viewRoutes);

// 404 para rutas de vistas inexistentes
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'views', '404.html')));

// Manejo centralizado de errores
app.use(errorHandler);

// ─── Arranque ────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.info(`[server] Portal IES N° 11 disponible en http://localhost:${PORT}`);
});

connectDB(process.env.MONGODB_URI, { onConnected: bootstrap });

// ─── Apagado ordenado ────────────────────────────────────────────────
const shutdown = (signal) => {
  console.info(`[server] ${signal} recibido. Cerrando…`);
  server.close(async () => {
    await disconnectDB().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => console.error('[server] Promesa rechazada sin manejar:', reason));
