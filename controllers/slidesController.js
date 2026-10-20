/**
 * Carrusel principal de la portada (lectura pública).
 */
const Slide = require('../models/Slide');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/slides */
exports.listSlides = asyncHandler(async (_req, res) => {
  const items = await Slide.find({ active: true }).sort({ order: 1, createdAt: 1 }).limit(8).select('-__v').lean();
  res.json({ items, total: items.length });
});
