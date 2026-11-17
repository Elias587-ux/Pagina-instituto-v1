/**
 * "Vida institucional" gallery (public read).
 */
const GalleryItem = require('../models/GalleryItem');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/gallery */
exports.listGallery = asyncHandler(async (_req, res) => {
  const items = await GalleryItem.find({ active: true })
    .sort({ featured: -1, order: 1, date: -1 })
    .limit(24)
    .select('-__v -active -createdAt -updatedAt')
    .lean();
  res.json({ items, total: items.length, tags: GalleryItem.TAGS });
});
