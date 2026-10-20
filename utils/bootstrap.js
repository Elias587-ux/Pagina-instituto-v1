/**
 * Inicialización que corre cada vez que se establece la conexión a MongoDB:
 *  - Crea el documento único de configuración del sitio si no existe.
 *  - Crea el administrador inicial (desde .env) si no hay usuarios.
 */
const User = require('../models/User');
const Setting = require('../models/Setting');

async function ensureAdmin() {
  const count = await User.estimatedDocumentCount();
  if (count > 0) return;

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('[bootstrap] No hay usuarios y faltan ADMIN_EMAIL / ADMIN_PASSWORD en .env: no se creó un administrador.');
    return;
  }

  await User.create({
    name: ADMIN_NAME || 'Administrador',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'admin',
  });
  console.info(`[bootstrap] Administrador inicial creado: ${ADMIN_EMAIL}`);
}

async function bootstrap() {
  await Setting.getSingleton();
  await ensureAdmin();
}

module.exports = { bootstrap, ensureAdmin };
