/**
 * Asistente virtual del portal (chatbot por reglas).
 *
 * Detecta la intención del mensaje por palabras clave y responde con datos
 * reales de la base (carreras, calendario, trámites, contacto). No usa
 * servicios externos: es gratuito y funciona sin conexión a internet.
 *
 * Respuesta: { reply: { text, list?, links?, suggestions? } }
 */
const Career = require('../models/Career');
const CalendarEvent = require('../models/CalendarEvent');
const Procedure = require('../models/Procedure');
const Setting = require('../models/Setting');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { startOfTodayUTC } = require('../utils/query');

const MAX_LENGTH = 300;

const DEFAULT_SUGGESTIONS = ['¿Qué carreras hay?', 'Próximas mesas de examen', '¿Cómo me preinscribo?', 'Requisitos del BEGU', 'Horarios de Bedelía'];

/** Minúsculas, sin tildes ni signos: "¿Cuándo son las MESAS?" → "cuando son las mesas" */
const normalize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const has = (msg, words) => words.some((w) => msg.includes(w));

const formatDate = (date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' }).format(date);

const formatEvent = (e) => {
  const range = e.endDate && e.endDate > e.date ? `del ${formatDate(e.date)} al ${formatDate(e.endDate)}` : formatDate(e.date);
  const shift = e.shift && e.shift !== 'Todo el día' ? ` · Turno ${e.shift}` : '';
  return `${e.title}: ${range}${shift}`;
};

// Palabras clave → ícono del trámite (los trámites se buscan por ícono y, si no, por título)
const PROCEDURE_KEYWORDS = [
  { icon: 'bus', words: ['begu', 'boleto', 'colectivo', 'pasaje', 'transporte'] },
  { icon: 'scholarship', words: ['progresar', 'beca'] },
  { icon: 'document', words: ['constancia', 'alumno regular', 'regularidad'] },
  { icon: 'wallet', words: ['bono', 'cooperadora', 'contribucion', 'cuota'] },
  // "titulo" solo no alcanza: puede ser una pregunta por la titulación de una carrera
  { icon: 'diploma', words: ['retir', 'analitico', 'certificado', 'egresad', 'legaliz'] },
];

// Palabras demasiado genéricas para identificar una carrera puntual
const CAREER_STOPWORDS = new Set([
  'profesorado', 'tecnicatura', 'superior', 'educacion', 'en', 'de', 'la', 'el', 'y', 'del', 'para', 'nivel', 'secundaria',
]);

// ─── Respuestas ──────────────────────────────────────────────────────

async function replyCareers() {
  const careers = await Career.find({ active: true }).sort({ order: 1, name: 1 }).lean();
  if (!careers.length) {
    return { text: 'Por el momento no hay carreras publicadas en el sitio. Consultá en Bedelía por la oferta vigente.' };
  }
  return {
    text: `Tenemos ${careers.length} ${careers.length === 1 ? 'carrera' : 'carreras'}. Preguntame por cualquiera para ver su detalle:`,
    list: careers.map((c) => `${c.name} — ${c.modality}, ${c.durationYears} años`),
    links: [{ label: 'Ver oferta académica', href: '#carreras' }],
    suggestions: ['¿Cómo me preinscribo?', 'Fechas de cursillo'],
  };
}

function replyCareerDetail(career, settings) {
  const shifts = career.shifts?.length ? career.shifts.join(', ') : 'a confirmar';
  const links = [];
  if (career.studyPlanUrl) links.push({ label: 'Plan de estudio', href: career.studyPlanUrl });
  links.push({ label: 'Preinscribirme', href: settings?.links?.preinscriptionUrl || '#carreras' });
  return {
    text: `${career.name}\nTítulo: ${career.degree}.\nDuración: ${career.durationYears} años · Modalidad ${career.modality.toLowerCase()} · Turno: ${shifts}.${
      career.description ? `\n${career.description}` : ''
    }`,
    links,
    suggestions: ['Fechas de cursillo', '¿Qué otras carreras hay?'],
  };
}

async function replyPreinscription(settings) {
  const events = await CalendarEvent.find({ category: 'cursillo', ...upcomingFilter() }).sort({ date: 1 }).limit(4).lean();
  return {
    text: 'La preinscripción es online y gratuita. Completá el formulario y después acercate a Bedelía con tu documentación.',
    list: events.length ? events.map(formatEvent) : undefined,
    links: [
      { label: 'Ir a la preinscripción', href: settings?.links?.preinscriptionUrl || '#carreras' },
      { label: 'Fechas de cursillos', href: '#calendario' },
    ],
    suggestions: ['¿Qué carreras hay?', 'Horarios de Bedelía'],
  };
}

const upcomingFilter = () => {
  const today = startOfTodayUTC();
  return { $or: [{ date: { $gte: today } }, { endDate: { $gte: today } }] };
};

async function replyCalendar(categories, intro, emptyText) {
  const events = await CalendarEvent.find({ category: { $in: categories }, ...upcomingFilter() }).sort({ date: 1 }).limit(5).lean();
  if (!events.length) return { text: emptyText, links: [{ label: 'Ver calendario', href: '#calendario' }] };
  return {
    text: intro,
    list: events.map(formatEvent),
    links: [{ label: 'Ver calendario completo', href: '#calendario' }],
    suggestions: ['Feriados próximos', 'Constancia de alumno regular'],
  };
}

function replyProcedure(p) {
  const open = p.status === 'abierto';
  const links = [];
  if (p.downloadUrl) links.push({ label: p.downloadLabel || 'Descargar requisitos', href: p.downloadUrl });
  links.push({ label: 'Ver trámites', href: '#tramites' });
  return {
    text: `${p.title} — ${open ? 'trámite ABIERTO ✅' : 'trámite CERRADO por el momento'}.\n${p.description}${p.schedule ? `\n🕒 ${p.schedule}` : ''}${
      p.requirements?.length ? '\nRequisitos:' : ''
    }`,
    list: p.requirements?.length ? p.requirements : undefined,
    links,
    suggestions: ['Horarios de Bedelía', 'Otros trámites'],
  };
}

async function replyProcedures() {
  const items = await Procedure.find().sort({ order: 1, title: 1 }).lean();
  if (!items.length) return { text: 'No hay trámites publicados por ahora. Consultá en Bedelía.' };
  return {
    text: 'Estos son los trámites frecuentes. Preguntame por uno para ver sus requisitos:',
    list: items.map((p) => `${p.title} — ${p.status === 'abierto' ? 'abierto' : 'cerrado'}`),
    links: [{ label: 'Ver trámites', href: '#tramites' }],
    suggestions: ['Requisitos del BEGU', 'Becas Progresar'],
  };
}

function replyContact(settings) {
  const c = settings?.contact || {};
  const list = [
    c.bedeliaHours && `Bedelía: ${c.bedeliaHours}`,
    c.address && `Dirección: ${c.address}`,
    c.phone && `Teléfono: ${c.phone}`,
    c.email && `Email: ${c.email}`,
  ].filter(Boolean);
  const links = [];
  const wa = String(c.whatsapp || '').replace(/\D/g, '');
  if (wa) links.push({ label: 'Escribir por WhatsApp', href: `https://wa.me/${wa}` });
  if (c.mapUrl) links.push({ label: 'Ver mapa', href: c.mapUrl });
  links.push({ label: 'Contacto', href: '#contacto' });
  return {
    text: list.length ? 'Estos son nuestros datos de contacto:' : 'Los datos de contacto se están actualizando. Podés acercarte a Bedelía del Instituto.',
    list: list.length ? list : undefined,
    links,
  };
}

function replyInstitutional(settings, msg) {
  const inst = settings?.institutional || {};
  if (has(msg, ['autoridad', 'rector', 'director', 'regent', 'jerarquia'])) {
    return inst.authorities?.length
      ? { text: 'Equipo directivo del IES N° 11:', list: inst.authorities.map((a) => `${a.role}: ${a.name}`), links: [{ label: 'Institucional', href: '#institucional' }] }
      : { text: 'La información de autoridades se está actualizando.', links: [{ label: 'Institucional', href: '#institucional' }] };
  }
  if (has(msg, ['vision'])) return { text: inst.vision || 'La visión institucional se está actualizando.', links: [{ label: 'Institucional', href: '#institucional' }] };
  return { text: inst.mission || 'La misión institucional se está actualizando.', links: [{ label: 'Institucional', href: '#institucional' }] };
}

// ─── Detección de intención ──────────────────────────────────────────

async function findCareerMentioned(msg) {
  const careers = await Career.find({ active: true }).lean();
  let best = null;
  let bestScore = 0;
  careers.forEach((c) => {
    const words = normalize(c.name).split(' ').filter((w) => w.length > 3 && !CAREER_STOPWORDS.has(w));
    const score = words.filter((w) => msg.includes(w)).length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  });
  return best;
}

async function findProcedureMentioned(msg) {
  const match = PROCEDURE_KEYWORDS.find((k) => has(msg, k.words));
  if (!match) return null;
  return (
    (await Procedure.findOne({ icon: match.icon }).lean()) ||
    (await Procedure.findOne({ title: new RegExp(match.words[0], 'i') }).lean())
  );
}

async function buildReply(rawMessage) {
  const msg = normalize(rawMessage);
  const settings = await Setting.getSingleton();

  if (!msg) return { text: '¿En qué te puedo ayudar?', suggestions: DEFAULT_SUGGESTIONS };

  if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(msg) && msg.split(' ').length <= 4) {
    return {
      text: '¡Hola! 👋 Soy el asistente virtual del IES N° 11. Puedo ayudarte con carreras, preinscripción, mesas de examen, trámites y horarios.',
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }
  if (has(msg, ['gracias', 'genial', 'perfecto', 'buenisimo'])) {
    return { text: '¡De nada! Si necesitás algo más, escribime. 😊', suggestions: DEFAULT_SUGGESTIONS.slice(0, 3) };
  }
  if (has(msg, ['chau', 'adios', 'hasta luego'])) return { text: '¡Hasta luego! Éxitos en tu cursada. 🎓' };

  // Trámites puntuales (antes que "mesas" para que "certificado de examen" no se confunda)
  const procedure = await findProcedureMentioned(msg);
  if (procedure) return replyProcedure(procedure);
  if (has(msg, ['tramite', 'gestion', 'papeles', 'documentacion'])) return replyProcedures();

  // Calendario
  if (has(msg, ['extraordinari'])) {
    return replyCalendar(['mesa-extraordinaria'], 'Próximas fechas de Mesas Extraordinarias:', 'No hay Mesas Extraordinarias cargadas próximamente.');
  }
  if (has(msg, ['ordinari'])) {
    return replyCalendar(['mesa-ordinaria'], 'Próximas fechas de Mesas Ordinarias:', 'No hay Mesas Ordinarias cargadas próximamente.');
  }
  if (has(msg, ['mesa', 'examen', 'final', 'rendir'])) {
    return replyCalendar(['mesa-ordinaria', 'mesa-extraordinaria'], 'Estas son las próximas mesas de examen:', 'No hay mesas de examen cargadas próximamente.');
  }
  if (has(msg, ['feriado', 'asueto', 'no hay clase', 'jornada', 'inasistencia', 'paro'])) {
    return replyCalendar(['feriado'], 'Próximos feriados y días sin actividad:', 'No hay feriados ni suspensiones cargados próximamente.');
  }
  if (has(msg, ['cursillo', 'curso de ingreso', 'ingreso'])) {
    return replyCalendar(['cursillo'], 'Fechas de cursillos e inscripción:', 'Todavía no se publicaron las fechas de cursillos.');
  }

  // Preinscripción
  if (has(msg, ['preinscri', 'inscrib', 'anotar', 'anoto', 'inscripcion'])) return replyPreinscription(settings);

  // Carrera puntual o listado
  const career = await findCareerMentioned(msg);
  if (career) return replyCareerDetail(career, settings);
  if (has(msg, ['carrera', 'profesorado', 'tecnicatura', 'estudiar', 'oferta', 'titulo'])) return replyCareers();

  if (has(msg, ['calendario', 'fecha', 'cuando'])) {
    return replyCalendar(Object.keys(CalendarEvent.CATEGORIES), 'Estas son las próximas fechas importantes:', 'No hay fechas próximas cargadas en el calendario.');
  }

  // Contacto e institucional
  if (has(msg, ['horario', 'bedelia', 'contacto', 'telefono', 'direccion', 'donde', 'ubicacion', 'whatsapp', 'mail', 'email', 'atencion'])) {
    return replyContact(settings);
  }
  if (has(msg, ['mision', 'vision', 'autoridad', 'rector', 'director', 'regent', 'institucion'])) return replyInstitutional(settings, msg);

  return {
    text: 'Perdón, no entendí tu consulta 🤔. Probá con alguna de estas opciones o escribí con otras palabras. Si preferís, podés comunicarte con Bedelía.',
    suggestions: DEFAULT_SUGGESTIONS,
    links: [{ label: 'Datos de contacto', href: '#contacto' }],
  };
}

/** POST /api/chat — { message } */
exports.chat = asyncHandler(async (req, res) => {
  const { message } = req.body || {};
  if (typeof message !== 'string') throw new AppError('El mensaje es obligatorio', 400);
  if (message.length > MAX_LENGTH) throw new AppError(`El mensaje admite hasta ${MAX_LENGTH} caracteres`, 400);

  const reply = await buildReply(message);
  res.json({ reply });
});

// Exportado para pruebas
exports.buildReply = buildReply;
