/**
 * Noticias y jornadas (lectura pública). La escritura vive en adminController.
 */
const mongoose = require('mongoose');
const News = require('../models/News');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { clampInt, str } = require('../utils/query');

/** GET /api/news?category=&limit=&page= */
exports.listNews = asyncHandler(async (req, res) => {
  const category = str(req.query.category);
  const limit = clampInt(req.query.limit, 1, 50, 12);
  const page = clampInt(req.query.page, 1, 1000, 1);

  const filter = { published: true };
  if (category && News.CATEGORIES.includes(category)) filter.category = category;

  const [items, total] = await Promise.all([
    News.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v')
      .lean(),
    News.countDocuments(filter),
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

/** GET /api/news/:id */
exports.getNews = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Noticia no encontrada', 404);
  const item = await News.findOne({ _id: req.params.id, published: true }).select('-__v').lean();
  if (!item) throw new AppError('Noticia no encontrada', 404);
  res.json({ item });
});
