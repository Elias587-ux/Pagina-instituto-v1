/**
 * Oferta académica (carreras) y calendario académico (lectura pública).
 */
const mongoose = require('mongoose');
const Career = require('../models/Career');
const CalendarEvent = require('../models/CalendarEvent');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { str, startOfTodayUTC } = require('../utils/query');

/** GET /api/careers?modality=&shift= */
exports.listCareers = asyncHandler(async (req, res) => {
  const modality = str(req.query.modality);
  const shift = str(req.query.shift);

  const filter = { active: true };
  if (Career.MODALITIES.includes(modality)) filter.modality = modality;
  if (Career.SHIFTS.includes(shift)) filter.shifts = shift;

  const items = await Career.find(filter).sort({ order: 1, name: 1 }).select('-__v').lean();
  res.json({ items, total: items.length });
});

/** GET /api/careers/:id */
exports.getCareer = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Carrera no encontrada', 404);
  const item = await Career.findOne({ _id: req.params.id, active: true }).select('-__v').lean();
  if (!item) throw new AppError('Carrera no encontrada', 404);
  res.json({ item });
});

/**
 * GET /api/calendar?category=&scope=upcoming|all
 * Por defecto devuelve sólo eventos vigentes o futuros, ordenados por fecha.
 */
exports.listCalendar = asyncHandler(async (req, res) => {
  const category = str(req.query.category);
  const scope = str(req.query.scope) === 'all' ? 'all' : 'upcoming';

  const filter = {};
  if (category && CalendarEvent.CATEGORIES[category]) filter.category = category;
  if (scope === 'upcoming') {
    const today = startOfTodayUTC();
    filter.$or = [{ date: { $gte: today } }, { endDate: { $gte: today } }];
  }

  const items = await CalendarEvent.find(filter).sort({ date: 1 }).limit(300).select('-__v').lean();
  res.json({ items, total: items.length, categories: CalendarEvent.CATEGORIES });
});
