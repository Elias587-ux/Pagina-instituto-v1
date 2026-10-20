/**
 * Panel de gestión (CMS). CRUD genérico sobre los recursos de contenido,
 * estadísticas del tablero y actualización de la configuración del sitio.
 * Todas las rutas están protegidas por JWT (ver routes/apiRoutes.js).
 */
const mongoose = require('mongoose');
const News = require('../models/News');
const Career = require('../models/Career');
const CalendarEvent = require('../models/CalendarEvent');
const Procedure = require('../models/Procedure');
const Setting = require('../models/Setting');
const Slide = require('../models/Slide');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { startOfTodayUTC } = require('../utils/query');

/** Recursos administrables: modelo + orden por defecto del listado. */
const RESOURCES = {
  news: { Model: News, sort: { date: -1 }, label: 'Noticia' },
  careers: { Model: Career, sort: { order: 1, name: 1 }, label: 'Carrera' },
  calendar: { Model: CalendarEvent, sort: { date: -1 }, label: 'Evento' },
  procedures: { Model: Procedure, sort: { order: 1, title: 1 }, label: 'Trámite' },
  slides: { Model: Slide, sort: { order: 1, createdAt: 1 }, label: 'Diapositiva' },
};

const PROTECTED_FIELDS = new Set(['_id', '__v', 'createdAt', 'updatedAt']);
const SETTINGS_SECTIONS = ['alert', 'contact', 'links', 'institutional'];

const getResource = (name) => {
  const resource = RESOURCES[name];
  if (!resource) throw new AppError(`Recurso desconocido: ${name}`, 404);
  return resource;
};

/** Filtra el body dejando sólo campos definidos en el esquema (evita asignación masiva). */
const pickFields = (Model, body = {}) => {
  const allowed = new Set(
    Object.keys(Model.schema.paths)
      .map((p) => p.split('.')[0])
      .filter((p) => !PROTECTED_FIELDS.has(p))
  );
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)));
};

const findOr404 = async (Model, id, label) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`${label} no encontrado/a`, 404);
  const doc = await Model.findById(id);
  if (!doc) throw new AppError(`${label} no encontrado/a`, 404);
  return doc;
};

/** GET /api/admin/stats */
exports.stats = asyncHandler(async (_req, res) => {
  const today = startOfTodayUTC();
  const [news, published, careers, procedures, openProcedures, events, upcomingExams] = await Promise.all([
    News.countDocuments(),
    News.countDocuments({ published: true }),
    Career.countDocuments({ active: true }),
    Procedure.countDocuments(),
    Procedure.countDocuments({ status: 'abierto' }),
    CalendarEvent.countDocuments({ date: { $gte: today } }),
    CalendarEvent.countDocuments({
      date: { $gte: today },
      category: { $in: ['mesa-ordinaria', 'mesa-extraordinaria'] },
    }),
  ]);
  res.json({ news, published, careers, procedures, openProcedures, events, upcomingExams });
});

/** GET /api/admin/:resource — listado completo (incluye borradores e inactivos). */
exports.list = asyncHandler(async (req, res) => {
  const { Model, sort } = getResource(req.params.resource);
  const items = await Model.find().sort(sort).limit(500).select('-__v').lean();
  res.json({ items, total: items.length });
});

/** POST /api/admin/:resource */
exports.create = asyncHandler(async (req, res) => {
  const { Model } = getResource(req.params.resource);
  const item = await Model.create(pickFields(Model, req.body));
  res.status(201).json({ item });
});

/** PUT /api/admin/:resource/:id */
exports.update = asyncHandler(async (req, res) => {
  const { Model, label } = getResource(req.params.resource);
  const doc = await findOr404(Model, req.params.id, label);
  // set + save (en lugar de findByIdAndUpdate) para que los validadores
  // que dependen de otros campos (ej: endDate >= date) tengan el documento completo.
  doc.set(pickFields(Model, req.body));
  await doc.save();
  res.json({ item: doc });
});

/** DELETE /api/admin/:resource/:id */
exports.remove = asyncHandler(async (req, res) => {
  const { Model, label } = getResource(req.params.resource);
  const doc = await findOr404(Model, req.params.id, label);
  await doc.deleteOne();
  res.status(204).end();
});

/**
 * PUT /api/admin/settings
 * Body: { alert?, contact?, links?, institutional? } — cada sección se reemplaza completa.
 */
exports.updateSettings = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const sections = SETTINGS_SECTIONS.filter((s) => body[s] && typeof body[s] === 'object' && !Array.isArray(body[s]));
  if (!sections.length) throw new AppError('No se enviaron secciones para actualizar', 400);

  const settings = await Setting.getSingleton();
  sections.forEach((section) => settings.set(section, body[section]));
  await settings.save();

  res.json({ settings });
});
