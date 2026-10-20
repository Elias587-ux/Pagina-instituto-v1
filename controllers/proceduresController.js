/**
 * Trámites frecuentes del Hub Estudiantil (lectura pública).
 */
const Procedure = require('../models/Procedure');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/procedures */
exports.listProcedures = asyncHandler(async (_req, res) => {
  const items = await Procedure.find().sort({ order: 1, title: 1 }).select('-__v').lean();
  res.json({ items, total: items.length });
});
