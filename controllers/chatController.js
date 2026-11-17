/**
 * Asistente virtual del portal (chatbot por reglas).
 *
 * Detecta la intención del mensaje por palabras clave y responde con datos
 * reales de la base: carreras (coordinadores, canales, cartillas), áreas,
 * preinscripción, calendario, tribunales de mesas, trámites, novedades,
 * institucional y contacto. No usa servicios externos: es gratuito.
 *
 * Respuesta: { reply: { text, list?, links?, suggestions? } }
 */
const Career = require('../models/Career');
const CalendarEvent = require('../models/CalendarEvent');
const ExamBoard = require('../models/ExamBoard');
const News = require('../models/News');
const Procedure = require('../models/Procedure');
const Setting = require('../models/Setting');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { startOfTodayUTC } = require('../utils/query');

const MAX_LENGTH = 300;

// Keep in sync with WELCOME.suggestions in public/js/chatbot.js
const DEFAULT_SUGGESTIONS = ['¿Qué carreras hay?', '¿Cómo me preinscribo?', 'Próximas mesas de examen', 'Permisos de examen', 'Retiro de títulos'];

// Pages of the site (client router paths)
const PAGE = {
  careers: '/ingresantes#careersList',
  calendar: '/estudiantes#calendario',
  boards: '/estudiantes#mesas',
  procedures: '/estudiantes#tramites',
  institutional: '/institucional',
  gallery: '/institucional#vida',
  news: '/novedades',
  contactForm: '/contacto#consultas',
};

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

const upcomingFilter = () => {
  const today = startOfTodayUTC();
  return { $or: [{ date: { $gte: today } }, { endDate: { $gte: today } }] };
};

// Palabras demasiado genéricas para identificar una carrera o materia puntual
const STOPWORDS = new Set([
  'profesorado', 'tecnicatura', 'tecnico', 'superior', 'educacion', 'en', 'de', 'la', 'el', 'y', 'del', 'para', 'nivel',
  'secundaria', 'las', 'los', 'con', 'mesa', 'mesas', 'examen', 'carrera', 'carreras',
]);
const keyWords = (text) => normalize(text).split(' ').filter((w) => w.length > 3 && !STOPWORDS.has(w));

// Trámites: palabras clave → patrón del TÍTULO del trámite (el ícono puede cambiar en el admin).
// El orden importa: gana la primera pista que coincide.
const PROCEDURE_HINTS = [
  { title: /permiso/i, words: ['permiso'] },
  {
    title: /t[ií]tulo|anal[ií]tico|certificad/i,
    words: ['titulo en tramite', 'titulos', 'retir', 'analitico', 'certificado', 'certificacion de servicio', 'ultima materia', 'egresad', 'legaliz', 'diploma'],
  },
  { title: /begu|boleto/i, words: ['begu', 'boleto', 'colectivo', 'pasaje', 'transporte'] },
  { title: /progresar|beca/i, words: ['progresar', 'beca'] },
  // Leading space = start of a word ("preinscribo" must not match "reinscri")
  { title: /matr[ií]cula/i, words: [' matricul', ' reinscri'] },
  { title: /alumno regular|constancia/i, words: ['constancia', 'alumno regular', 'regularidad'] },
  { title: /bono|cooperadora/i, words: ['bono', 'cooperadora', 'contribucion', 'cuota'] },
  { title: /ingresantes/i, words: ['ingresantes', 'lista de', 'si quede', 'quede en'] },
];

const YEAR_HINTS = [
  { words: ['1', 'primer', 'primero', 'ingres'], title: /1°|primer/i },
  { words: ['2', '3', 'segundo', 'tercer'], title: /2°|3°|segundo|tercer/i },
];

// ─── Respuestas ──────────────────────────────────────────────────────

async function replyCareers() {
  const careers = await Career.find({ active: true }).sort({ order: 1, name: 1 }).lean();
  if (!careers.length) {
    return { text: 'Por el momento no hay carreras publicadas en el sitio. Consultá en Bedelía por la oferta vigente.' };
  }
  return {
    text: `Tenemos ${careers.length} ${careers.length === 1 ? 'carrera' : 'carreras'} con título oficial. Preguntame por cualquiera para ver su detalle:`,
    list: careers.map((c) => `${c.name} — ${c.modality}, ${c.durationYears} años`),
    links: [{ label: 'Ver todas las carreras', href: PAGE.careers }],
    suggestions: ['¿Cómo me preinscribo?', 'Carreras de salud', 'Coordinadores'],
  };
}

function replyCareersByArea(area, careers) {
  return {
    text: `Carreras del área ${area}:`,
    list: careers.map((c) => `${c.name} — ${c.durationYears} años · ${c.modality}`),
    links: [{ label: 'Ver carreras', href: PAGE.careers }],
    suggestions: ['¿Cómo me preinscribo?', '¿Qué carreras hay?'],
  };
}

function replyCareerDetail(career, settings, msg) {
  const shifts = career.shifts?.length ? career.shifts.join(', ') : 'a confirmar';
  const links = [];
  if (career.studyPlanUrl) links.push({ label: 'Plan de estudio', href: career.studyPlanUrl });
  if (career.cursilloUrl) links.push({ label: 'Cartilla del cursillo de ingreso', href: career.cursilloUrl });
  if (career.whatsappChannelUrl) links.push({ label: 'Canal de WhatsApp de la carrera', href: career.whatsappChannelUrl });
  links.push({ label: 'Preinscribirme', href: settings?.links?.preinscriptionUrl || PAGE.careers });

  const coordinator = career.coordinator
    ? `Coordinación: ${career.coordinator}${career.coordinatorSchedule ? ` (${career.coordinatorSchedule})` : ''}.`
    : '';
  // Pregunta puntual por el coordinador: respuesta corta
  if (has(msg, ['coordinad', 'coordinacion'])) {
    return {
      text: coordinator ? `${career.name}\n${coordinator}` : `Todavía no está cargado el coordinador de ${career.name}. Consultá en Bedelía.`,
      links,
      suggestions: ['Coordinadores', '¿Qué carreras hay?'],
    };
  }
  return {
    text: [
      career.name,
      `Título: ${career.degree}.`,
      `Duración: ${career.durationYears} años · Modalidad ${String(career.modality).toLowerCase()} · Turno: ${shifts}.`,
      career.area ? `Área: ${career.area}.` : '',
      coordinator,
      career.description || '',
    ]
      .filter(Boolean)
      .join('\n'),
    links,
    suggestions: ['¿Cómo me preinscribo?', 'Fechas de cursillo', '¿Qué otras carreras hay?'],
  };
}

async function replyCoordinators() {
  const careers = await Career.find({ active: true, coordinator: { $ne: '' } }).sort({ order: 1, name: 1 }).lean();
  if (!careers.length) return { text: 'Los coordinadores de cada carrera se están actualizando. Consultá en Bedelía.' };
  return {
    text: 'Coordinadores de carrera y sus horarios:',
    list: careers.map((c) => `${c.name}: ${c.coordinator}${c.coordinatorSchedule ? ` — ${c.coordinatorSchedule}` : ''}`),
    links: [{ label: 'Ver carreras', href: PAGE.careers }],
  };
}

async function replyPreinscription(settings) {
  const p = settings?.preinscription || {};
  const events = await CalendarEvent.find({ category: { $in: ['cursillo', 'inscripcion'] }, ...upcomingFilter() })
    .sort({ date: 1 })
    .limit(4)
    .lean();
  const list = [
    ...(p.steps || []).map((s, i) => `${i + 1}. ${s}`),
    ...(p.requirements?.length ? [`Documentación: ${p.requirements.join(' · ')}`] : []),
    ...events.map(formatEvent),
  ];
  const url = settings?.links?.preinscriptionUrl;
  return {
    text: [`${p.title || 'Preinscripción online'}${p.period ? ` — ${p.period}` : ''}.`, p.intro, p.note].filter(Boolean).join('\n'),
    list: list.length ? list : undefined,
    links: [
      ...(url && !url.startsWith('#') ? [{ label: p.buttonText || 'Ir a la preinscripción', href: url }] : []),
      { label: 'Ver carreras', href: PAGE.careers },
      { label: 'Fechas de cursillo', href: PAGE.calendar },
    ],
    suggestions: ['¿Qué carreras hay?', 'Horarios de Bedelía', 'Lista de ingresantes'],
  };
}

async function replyCalendar(categories, intro, emptyText) {
  const events = await CalendarEvent.find({ category: { $in: categories }, ...upcomingFilter() }).sort({ date: 1 }).limit(6).lean();
  if (!events.length) return { text: emptyText, links: [{ label: 'Ver calendario', href: PAGE.calendar }] };
  return {
    text: intro,
    list: events.map(formatEvent),
    links: [{ label: 'Ver calendario completo', href: PAGE.calendar }],
    suggestions: ['Permisos de examen', 'Tribunales de mesas', 'Feriados próximos'],
  };
}

/** Tribunales de mesas: filtra por carrera o materia mencionada. */
async function replyExamBoards(msg, career) {
  const today = startOfTodayUTC();
  const boards = await ExamBoard.find({ published: true, $or: [{ date: { $gte: today } }, { secondCallDate: { $gte: today } }] })
    .sort({ date: 1, time: 1 })
    .limit(300)
    .lean();
  if (!boards.length) {
    return {
      text: 'No hay tribunales de mesas publicados para las próximas fechas.',
      links: [{ label: 'Ver mesas de examen', href: PAGE.boards }],
    };
  }
  const careerWords = career ? keyWords(career.name) : [];
  const bySubject = boards.filter((b) => keyWords(b.subject).some((w) => msg.includes(w)));
  const byCareer = careerWords.length ? boards.filter((b) => careerWords.some((w) => normalize(b.career).includes(w))) : [];
  const items = bySubject.length ? bySubject : byCareer.length ? byCareer : boards;
  const day = (d) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'numeric' }).format(d);
  const tribunal = (b) => [b.president, b.firstVocal, b.secondVocal].filter(Boolean).join(', ');
  return {
    text:
      items === boards
        ? `Hay ${boards.length} mesas publicadas. Decime la carrera o la materia para filtrar. Las primeras:`
        : 'Estas son las mesas que encontré:',
    list: items.slice(0, 6).map(
      (b) =>
        `${b.subject} (${b.career}) — ${day(b.date)}${b.secondCallDate ? ` y 2º llamado ${day(b.secondCallDate)}` : ''}${b.time ? ` · ${b.time} hs` : ''}${
          tribunal(b) ? ` · Tribunal: ${tribunal(b)}` : ''
        }`
    ),
    links: [{ label: 'Ver todas las mesas', href: PAGE.boards }],
    suggestions: ['Permisos de examen', 'Próximas mesas de examen'],
  };
}

function replyProcedure(p) {
  const open = p.status === 'abierto';
  const links = [];
  if (p.linkUrl && open) links.push({ label: p.linkLabel || 'Inscribirme online', href: p.linkUrl });
  if (p.downloadUrl) links.push({ label: p.downloadLabel || 'Descargar requisitos', href: p.downloadUrl });
  links.push({ label: 'Ver trámites', href: PAGE.procedures });
  return {
    text: `${p.title} — ${open ? 'trámite ABIERTO ✅' : 'trámite CERRADO por el momento'}.\n${p.description}${p.schedule ? `\n🕒 ${p.schedule}` : ''}${
      p.requirements?.length ? '\nRequisitos:' : ''
    }`,
    list: p.requirements?.length ? p.requirements : undefined,
    links,
    suggestions: ['Horarios de Bedelía', 'Otros trámites'],
  };
}

async function replyProcedures(items) {
  items ||= await Procedure.find().sort({ order: 1, title: 1 }).lean();
  if (!items.length) return { text: 'No hay trámites publicados por ahora. Consultá en Bedelía.' };
  return {
    text: 'Estos son los trámites. Preguntame por uno para ver horarios y requisitos:',
    list: items.map((p) => `${p.title} — ${p.status === 'abierto' ? 'abierto' : 'cerrado'}`),
    links: [{ label: 'Ver trámites', href: PAGE.procedures }],
    suggestions: items.slice(0, 3).map((p) => p.title),
  };
}

async function replyNews() {
  const items = await News.find({ published: true }).sort({ date: -1 }).limit(4).lean();
  if (!items.length) return { text: 'Todavía no hay novedades publicadas.', links: [{ label: 'Novedades', href: PAGE.news }] };
  const day = (d) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(d);
  return {
    text: 'Las últimas novedades del IES N° 11:',
    list: items.map((n) => `${n.title} (${day(n.date)})`),
    links: [{ label: 'Ver todas las novedades', href: PAGE.news }],
  };
}

function replyContact(settings, { directions = false } = {}) {
  const c = settings?.contact || {};
  const list = [
    c.bedeliaHours && `Bedelía: ${c.bedeliaHours}`,
    c.address && `Dirección: ${c.address}`,
    c.phone && `Teléfono: ${c.phone}`,
    c.email && `Email: ${c.email}`,
  ].filter(Boolean);
  const links = [];
  if (directions || c.address) {
    links.push({
      label: 'Cómo llegar (Google Maps)',
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address || 'IES N° 11, San Salvador de Jujuy')}`,
    });
  }
  const wa = String(c.whatsapp || '').replace(/\D/g, '');
  if (wa) links.push({ label: 'Escribir por WhatsApp', href: `https://wa.me/${wa}` });
  if (c.whatsappChannelUrl) links.push({ label: 'Canal de WhatsApp', href: c.whatsappChannelUrl });
  links.push({ label: 'Dejar una consulta', href: PAGE.contactForm });
  return {
    text: list.length ? 'Estos son nuestros datos de contacto:' : 'Los datos de contacto se están actualizando. Podés acercarte a Bedelía del Instituto.',
    list: list.length ? list : undefined,
    links,
  };
}

function replyContactForm(settings) {
  const reply = replyContact(settings);
  return {
    ...reply,
    text: 'Si tu consulta es particular, escribinos desde el formulario de consultas y te respondemos por correo. También podés usar estos datos:',
  };
}

function replyInstitutional(settings, msg) {
  const inst = settings?.institutional || {};
  const link = [{ label: 'Conocé el IES', href: PAGE.institutional }];
  if (has(msg, ['autoridad', 'rector', 'director', 'regent', 'jerarquia', 'equipo de gestion', 'secretari'])) {
    return inst.authorities?.length
      ? { text: 'Equipo de gestión del IES N° 11:', list: inst.authorities.map((a) => `${a.role}: ${a.name}`), links: link }
      : { text: 'La información de autoridades se está actualizando.', links: link };
  }
  if (has(msg, ['vision'])) return { text: inst.vision || 'La visión institucional se está actualizando.', links: link };
  return { text: inst.mission || 'La misión institucional se está actualizando.', links: link };
}

// ─── Detección de intención ──────────────────────────────────────────

async function findCareerMentioned(msg, careers) {
  let best = null;
  let bestScore = 0;
  careers.forEach((c) => {
    const score = keyWords(c.name).filter((w) => msg.includes(w)).length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  });
  return best;
}

/** Área mencionada ("carreras de salud") → { area, careers } */
function findAreaMentioned(msg, careers) {
  const areas = [...new Set(careers.map((c) => c.area).filter(Boolean))];
  for (const area of areas) {
    if (keyWords(area).some((w) => msg.includes(w.slice(0, 6)))) {
      return { area, careers: careers.filter((c) => c.area === area) };
    }
  }
  return null;
}

async function findProcedureReply(msg) {
  const padded = ` ${msg}`;
  const hint = PROCEDURE_HINTS.find((h) => has(padded, h.words));
  if (!hint) return null;
  const candidates = (await Procedure.find().sort({ order: 1, title: 1 }).lean()).filter((p) => hint.title.test(p.title));
  if (!candidates.length) return null;
  if (candidates.length === 1) return replyProcedure(candidates[0]);
  // Varios (ej: matriculación 1° año y 2°/3° año): desambiguar por año mencionado
  const year = YEAR_HINTS.find((y) => y.words.some((w) => new RegExp(`\\b${w}`).test(msg)));
  const chosen = year && candidates.find((p) => year.title.test(p.title));
  return chosen ? replyProcedure(chosen) : replyProcedures(candidates);
}

async function buildReply(rawMessage) {
  const msg = normalize(rawMessage);
  const settings = await Setting.getSingleton();

  if (!msg) return { text: '¿En qué te puedo ayudar?', suggestions: DEFAULT_SUGGESTIONS };

  if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(msg) && msg.split(' ').length <= 4) {
    return {
      text: '¡Hola! 👋 Soy el asistente virtual del IES N° 11. Puedo ayudarte con carreras, preinscripción, mesas de examen y tribunales, trámites (títulos, permisos, BEGU, Progresar), fechas, novedades y horarios.',
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }
  if (has(msg, ['gracias', 'genial', 'perfecto', 'buenisimo'])) {
    return { text: '¡De nada! Si necesitás algo más, escribime. 😊', suggestions: DEFAULT_SUGGESTIONS.slice(0, 3) };
  }
  if (has(msg, ['chau', 'adios', 'hasta luego'])) return { text: '¡Hasta luego! Éxitos en tu cursada. 🎓' };

  const careers = await Career.find({ active: true }).sort({ order: 1, name: 1 }).lean();
  const career = await findCareerMentioned(msg, careers);

  // Tribunales (antes que trámites y calendario: "quién toma la mesa de X")
  if (has(msg, ['tribunal', 'quien toma', 'quienes toman', 'vocal', 'quien me toma'])) return replyExamBoards(msg, career);

  // Trámites puntuales (antes que "mesas" para que "permiso de examen" no se confunda)
  const procedureReply = await findProcedureReply(msg);
  if (procedureReply) return procedureReply;
  if (has(msg, ['tramite', 'gestion', 'papeles', 'documentacion'])) return replyProcedures();

  // Calendario
  if (has(msg, ['inicio de clases', 'empiezan las clases', 'arrancan las clases', 'comienzo de clases', 'empieza el cursado', 'inicio del cursado'])) {
    return replyCalendar(['inicio-clases'], 'Inicio de clases:', 'Todavía no se publicó la fecha de inicio de clases.');
  }
  if (has(msg, ['vencimiento', 'plazo', 'ultimo dia', 'hasta cuando', 'fecha limite'])) {
    return replyCalendar(['fecha-importante', 'inscripcion'], 'Plazos y fechas importantes:', 'No hay plazos próximos cargados.');
  }
  if (has(msg, ['capacitacion', 'taller', 'charla', 'curso '])) {
    return replyCalendar(['capacitacion'], 'Próximas capacitaciones:', 'No hay capacitaciones cargadas próximamente.');
  }
  if (has(msg, ['evento', 'acto', 'colacion'])) {
    return replyCalendar(['evento'], 'Próximos eventos:', 'No hay eventos cargados próximamente.');
  }
  if (has(msg, ['extraordinari'])) {
    return replyCalendar(['mesa-extraordinaria'], 'Próximas fechas de Mesas Extraordinarias:', 'No hay Mesas Extraordinarias cargadas próximamente.');
  }
  if (has(msg, ['ordinari'])) {
    return replyCalendar(['mesa-ordinaria'], 'Próximas fechas de Mesas Ordinarias:', 'No hay Mesas Ordinarias cargadas próximamente.');
  }
  if (has(msg, ['mesa', 'examen', 'final', 'rendir'])) {
    // Con carrera o materia mencionada, los tribunales son más útiles que las fechas generales
    const subjectAsked = career || has(msg, ['materia']);
    if (subjectAsked) return replyExamBoards(msg, career);
    return replyCalendar(['mesa-ordinaria', 'mesa-extraordinaria'], 'Estas son las próximas mesas de examen:', 'No hay mesas de examen cargadas próximamente.');
  }
  if (has(msg, ['feriado', 'asueto', 'no hay clase', 'jornada', 'inasistencia', 'paro'])) {
    return replyCalendar(['feriado'], 'Próximos feriados y días sin actividad:', 'No hay feriados ni suspensiones cargados próximamente.');
  }
  if (has(msg, ['cursillo', 'curso de ingreso', 'ingreso'])) {
    return replyCalendar(['cursillo'], 'Fechas de cursillos e inscripción:', 'Todavía no se publicaron las fechas de cursillos.');
  }

  // Preinscripción
  if (has(msg, ['preinscri', 'inscrib', 'anotar', 'anoto', 'inscripcion', 'nexo'])) return replyPreinscription(settings);

  // Coordinadores
  if (has(msg, ['coordinad', 'coordinacion'])) return career ? replyCareerDetail(career, settings, msg) : replyCoordinators();

  // Carreras: por área, puntual o listado
  const area = findAreaMentioned(msg, careers);
  if (area && (!career || has(msg, ['carreras', 'area', 'que hay', 'tienen', 'opciones']))) return replyCareersByArea(area.area, area.careers);
  if (career) return replyCareerDetail(career, settings, msg);
  if (has(msg, ['carrera', 'tecnicatura', 'estudiar', 'oferta', 'titulo'])) return replyCareers();

  if (has(msg, ['calendario', 'fecha', 'cuando'])) {
    return replyCalendar(Object.keys(CalendarEvent.CATEGORIES), 'Estas son las próximas fechas:', 'No hay fechas próximas cargadas en el calendario.');
  }

  // Novedades, galería, institucional, contacto
  if (has(msg, ['novedad', 'noticia', 'ultimas', 'que paso'])) return replyNews();
  if (has(msg, ['vida institucional', 'foto', 'galeria', 'video'])) {
    return { text: 'En Vida institucional vas a encontrar fotos y videos de jornadas, prácticas y actividades del IES N° 11.', links: [{ label: 'Ver Vida institucional', href: PAGE.gallery }] };
  }
  if (has(msg, ['mision', 'vision', 'autoridad', 'rector', 'director', 'regent', 'institucion', 'equipo de gestion', 'secretari'])) {
    return replyInstitutional(settings, msg);
  }
  if (has(msg, ['como llego', 'mapa', 'donde queda', 'donde esta', 'ubicacion', 'direccion'])) return replyContact(settings, { directions: true });
  if (has(msg, ['horario', 'bedelia', 'contacto', 'telefono', 'donde', 'whatsapp', 'mail', 'email', 'atencion'])) return replyContact(settings);
  if (has(msg, ['consulta', 'duda', 'hablar con', 'una persona', 'escribirles'])) return replyContactForm(settings);

  return {
    text: 'Perdón, no entendí tu consulta 🤔. Probá con alguna de estas opciones o escribila con otras palabras. Si es un caso particular, dejanos tu consulta y te respondemos por correo.',
    suggestions: DEFAULT_SUGGESTIONS,
    links: [{ label: 'Dejar una consulta', href: PAGE.contactForm }],
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
