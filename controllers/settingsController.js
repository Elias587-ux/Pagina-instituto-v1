/**
 * Configuración pública del sitio: banner de alerta, contacto, enlaces e
 * información institucional. La edición está en adminController.updateSettings.
 */
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/settings */
exports.getSettings = asyncHandler(async (_req, res) => {
  const settings = await Setting.getSingleton();
  res.json(settings);
});
