/**
 * Conexión a MongoDB vía Mongoose con reintentos automáticos.
 */
const mongoose = require('mongoose');

const RETRY_MS = 10_000;
const DEFAULT_URI = 'mongodb://127.0.0.1:27017/ies11';

mongoose.set('strictQuery', true);

const isDBConnected = () => mongoose.connection.readyState === 1;

/**
 * Conecta a MongoDB. Si falla, reintenta cada RETRY_MS sin tumbar el servidor.
 * @param {string} uri
 * @param {{ onConnected?: () => Promise<void> }} [options]
 */
async function connectDB(uri, { onConnected } = {}) {
  if (!uri) {
    console.warn(`[db] MONGODB_URI no definida. Usando ${DEFAULT_URI}`);
    uri = DEFAULT_URI;
  }

  mongoose.connection.on('disconnected', () => console.warn('[db] Conexión con MongoDB perdida.'));
  mongoose.connection.on('reconnected', () => console.info('[db] Reconectado a MongoDB.'));
  mongoose.connection.on('error', (err) => console.error('[db] Error de MongoDB:', err.message));

  const attempt = async () => {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.info(`[db] Conectado a MongoDB (base: ${mongoose.connection.name})`);
    } catch (err) {
      console.error(`[db] No se pudo conectar (${err.message}). Reintentando en ${RETRY_MS / 1000}s…`);
      setTimeout(attempt, RETRY_MS);
      return;
    }

    if (onConnected) {
      try {
        await onConnected();
      } catch (err) {
        console.error('[db] Error en la inicialización posterior a la conexión:', err);
      }
    }
  };

  await attempt();
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB, isDBConnected };
