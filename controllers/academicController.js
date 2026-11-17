/**
 * Oferta académica (carreras) y calendario académico (lectura pública).
 */
const mongoose = require('mongoose');
const Career = require('../models/Career');
const CalendarEvent = require('../models/CalendarEvent');
const ExamBoard = require('../models/ExamBoard');
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
  const scope = ['all', 'month'].includes(str(req.query.scope)) ? str(req.query.scope) : 'upcoming';

  const filter = {};
  if (category && CalendarEvent.CATEGORIES[category]) filter.category = category;
  if (scope !== 'all') {
    // "month" also keeps the past days of the current month, for the month grid
    const today = startOfTodayUTC();
    const from = scope === 'month' ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)) : today;
    filter.$or = [{ date: { $gte: from } }, { endDate: { $gte: from } }];
  }

  const items = await CalendarEvent.find(filter).sort({ date: 1 }).limit(300).select('-__v').lean();
  res.json({ items, total: items.length, categories: CalendarEvent.CATEGORIES });
});

/**
 * GET /api/exam-boards
 * Mesas publicadas. Bedelía decide qué turnos se ven con el campo "published".
 */
exports.listExamBoards = asyncHandler(async (_req, res) => {
  const items = await ExamBoard.find({ published: true })
    .sort({ date: 1, time: 1, career: 1 })
    .limit(500)
    .select('-__v -published -createdAt -updatedAt')
    .lean();
  res.json({ items, total: items.length });
});
