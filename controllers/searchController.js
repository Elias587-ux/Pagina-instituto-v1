/**
 * Buscador rápido del header: busca en carreras, trámites, noticias y calendario.
 */
const Career = require('../models/Career');
const Procedure = require('../models/Procedure');
const News = require('../models/News');
const CalendarEvent = require('../models/CalendarEvent');
const asyncHandler = require('../utils/asyncHandler');
const { str, accentInsensitiveRegex } = require('../utils/query');

const MAX_PER_TYPE = 5;

/** GET /api/search?q= */
exports.search = asyncHandler(async (req, res) => {
  const q = str(req.query.q).slice(0, 60);
  if (q.length < 2) return res.json({ query: q, results: [] });

  const rx = accentInsensitiveRegex(q);

  const [careers, procedures, news, events] = await Promise.all([
    Career.find({ active: true, $or: [{ name: rx }, { degree: rx }, { area: rx }] })
      .limit(MAX_PER_TYPE)
      .select('name degree modality')
      .lean(),
    Procedure.find({ $or: [{ title: rx }, { description: rx }] })
      .limit(MAX_PER_TYPE)
      .select('title status')
      .lean(),
    News.find({ published: true, $or: [{ title: rx }, { summary: rx }] })
      .sort({ date: -1 })
      .limit(MAX_PER_TYPE)
      .select('title category date')
      .lean(),
    CalendarEvent.find({ $or: [{ title: rx }, { career: rx }] })
      .sort({ date: -1 })
      .limit(MAX_PER_TYPE)
      .select('title category date')
      .lean(),
  ]);

  const results = [
    ...careers.map((c) => ({ type: 'career', id: c._id, title: c.name, subtitle: `${c.degree} · ${c.modality}` })),
    ...procedures.map((p) => ({ type: 'procedure', id: p._id, title: p.title, subtitle: p.status === 'abierto' ? 'Trámite abierto' : 'Trámite cerrado' })),
    ...news.map((n) => ({ type: 'news', id: n._id, title: n.title, subtitle: n.category, date: n.date })),
    ...events.map((e) => ({ type: 'event', id: e._id, title: e.title, subtitle: CalendarEvent.CATEGORIES[e.category], category: e.category, date: e.date })),
  ];

  res.json({ query: q, results });
});
