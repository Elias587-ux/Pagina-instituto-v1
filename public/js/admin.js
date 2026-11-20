/**
 * IES N° 11 — Panel de gestión (CMS).
 * Sesión JWT, navegación por secciones, CRUD genérico con formularios
 * generados desde configuración, alerta urgente y datos institucionales.
 */
import { api, auth } from './api.js';
import { icon, hydrateIcons } from './icons.js';
import { createLivePreview } from './livePreview.js';
import { $, $$, escapeHTML, safeUrl, formatDate, formatRange, toInputDate, normalize } from './utils.js';

// ─── Catálogos ───────────────────────────────────────────────────────
const VIDEO_MAX_MB = 60; // keep in sync with KINDS.video in controllers/uploadController.js
const CALENDAR_CATEGORIES = [
  { value: 'mesa-ordinaria', label: 'Mesas Ordinarias' },
  { value: 'mesa-extraordinaria', label: 'Mesas Extraordinarias' },
  { value: 'feriado', label: 'Feriados e Inasistencias' },
  { value: 'cursillo', label: 'Cursillos e Inscripción' },
  { value: 'inscripcion', label: 'Inscripciones' },
  { value: 'inicio-clases', label: 'Inicio de clases' },
  { value: 'evento', label: 'Eventos' },
  { value: 'capacitacion', label: 'Capacitaciones' },
  { value: 'fecha-importante', label: 'Fechas importantes' },
];
const EVENT_STATUSES = [
  { value: 'programado', label: 'Programado' },
  { value: 'abierto', label: 'Abierto' },
  { value: 'cerrado', label: 'Cerrado' },
  { value: 'finalizado', label: 'Finalizado' },
];
const PROCEDURE_ICONS = [
  { value: 'bus', label: 'Colectivo (BEGU)' },
  { value: 'scholarship', label: 'Beca' },
  { value: 'document', label: 'Documento' },
  { value: 'wallet', label: 'Pago / Bono' },
  { value: 'diploma', label: 'Título' },
  { value: 'info', label: 'Información' },
];

const labelOf = (list, value) => list.find((o) => o.value === value)?.label || value;

const STATUS_BADGES = {
  abierto: 'badge--open',
  cerrado: 'badge--closed',
  programado: 'badge--scheduled',
  finalizado: 'badge--done',
};
const newLabel = (cfg) => `${cfg.masculine ? 'Nuevo' : 'Nueva'} ${cfg.singular}`;
const badge = (cls, text) => `<span class="badge ${cls}">${escapeHTML(text)}</span>`;
const primary = (v) => `<span class="data-table__primary">${escapeHTML(v)}</span>`;

/**
 * Configuración de cada recurso administrable.
 * columns → tabla del listado · fields → formulario del modal.
 */
const RESOURCES = {
  news: {
    title: 'Noticias y Jornadas',
    subtitle: 'Novedades académicas, institucionales y eventos.',
    singular: 'noticia',
    icon: 'newspaper',
    searchKeys: ['title', 'category'],
    columns: [
      { key: 'title', label: 'Título', render: primary },
      { key: 'category', label: 'Categoría', render: (v) => `<span class="tag">${escapeHTML(v)}</span>` },
      { key: 'date', label: 'Fecha', render: (v) => escapeHTML(formatDate(v)) },
      {
        key: 'published',
        label: 'Estado',
        render: (v, row) =>
          (v ? badge('badge--open', 'Publicada') : badge('badge--draft', 'Borrador')) +
          (row.featured ? ` ${badge('badge--scheduled', 'Destacada')}` : ''),
      },
    ],
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true, maxlength: 160, full: true },
      { name: 'category', label: 'Categoría', type: 'select', required: true, options: ['Académico', 'Institucional', 'Eventos/Jornadas'] },
      { name: 'date', label: 'Fecha', type: 'date', required: true, default: () => toInputDate(new Date()) },
      { name: 'imageUrl', label: 'Imagen', type: 'upload', kind: 'image', full: true, hint: 'Opcional. Si se deja vacío se muestra una ilustración según la categoría.' },
      { name: 'videoUrl', label: 'Video', type: 'upload', kind: 'video', full: true, hint: `Opcional. MP4, MOV o WebM de hasta ${VIDEO_MAX_MB} MB (aprox. 1 minuto grabado con el celular). Se ve dentro de la noticia.` },
      { name: 'summary', label: 'Resumen', type: 'textarea', required: true, maxlength: 300, rows: 2, full: true },
      { name: 'content', label: 'Contenido completo', type: 'textarea', maxlength: 10000, rows: 6, full: true },
      { name: 'published', label: 'Publicada (visible en el sitio)', type: 'checkbox', default: true },
      { name: 'featured', label: 'Destacada (tarjeta grande)', type: 'checkbox' },
    ],
  },

  calendar: {
    title: 'Calendario y Mesas de Examen',
    subtitle: 'Mesas ordinarias y extraordinarias, feriados, cursillos e inscripciones.',
    singular: 'fecha',
    icon: 'calendar',
    searchKeys: ['title', 'career', 'category'],
    columns: [
      { key: 'title', label: 'Evento', render: primary },
      { key: 'category', label: 'Categoría', render: (v) => escapeHTML(labelOf(CALENDAR_CATEGORIES, v)) },
      { key: 'date', label: 'Fecha', render: (v, row) => escapeHTML(formatRange(v, row.endDate)) },
      { key: 'shift', label: 'Turno', render: (v) => escapeHTML(v) },
      { key: 'status', label: 'Estado', render: (v) => badge(STATUS_BADGES[v] || 'badge--closed', labelOf(EVENT_STATUSES, v)) },
    ],
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true, maxlength: 160, full: true },
      { name: 'category', label: 'Categoría', type: 'select', required: true, options: CALENDAR_CATEGORIES },
      { name: 'status', label: 'Estado', type: 'select', options: EVENT_STATUSES, default: 'programado' },
      { name: 'date', label: 'Fecha de inicio', type: 'date', required: true },
      { name: 'endDate', label: 'Fecha de fin', type: 'date', hint: 'Opcional, para rangos de varios días.' },
      { name: 'shift', label: 'Turno', type: 'select', options: ['Todo el día', 'Mañana', 'Tarde', 'Noche'], default: 'Todo el día' },
      { name: 'career', label: 'Carrera(s)', type: 'text', maxlength: 160, placeholder: 'Ej: Profesorados / Todas' },
      { name: 'location', label: 'Lugar', type: 'text', maxlength: 160, full: true },
      { name: 'description', label: 'Descripción', type: 'textarea', maxlength: 1000, rows: 3, full: true },
    ],
  },

  examBoards: {
    title: 'Mesas de examen',
    subtitle: 'Tribunales por materia: carrera, fecha, hora, titular, vocales y suplente.',
    singular: 'mesa',
    icon: 'users',
    searchKeys: ['session', 'career', 'subject', 'president', 'firstVocal', 'secondVocal', 'substitute'],
    columns: [
      { key: 'subject', label: 'Materia', render: (v, row) => `${primary(v)}<br><small>${escapeHTML(row.career)}</small>` },
      { key: 'session', label: 'Turno', render: (v) => escapeHTML(v) },
      { key: 'date', label: '1er llamado', render: (v, row) => escapeHTML(`${formatDate(v)}${row.time ? ` · ${row.time} hs` : ''}`) },
      { key: 'president', label: 'Titular', render: (v) => escapeHTML(v || '—') },
      { key: 'published', label: 'Estado', render: (v) => (v ? badge('badge--open', 'Publicada') : badge('badge--draft', 'Oculta')) },
    ],
    fields: [
      { name: 'session', label: 'Turno de mesas', type: 'text', required: true, maxlength: 120, full: true, placeholder: 'Ej: Mesas Extraordinarias Octubre 2026', hint: 'Usá el mismo texto en todas las mesas del turno: así se agrupan en una sola tabla.' },
      { name: 'type', label: 'Tipo', type: 'select', options: ['Extraordinaria', 'Ordinaria'], default: 'Extraordinaria' },
      { name: 'career', label: 'Carrera', type: 'text', required: true, maxlength: 160, placeholder: 'Ej: Enfermería' },
      { name: 'subject', label: 'Materia', type: 'text', required: true, maxlength: 200, full: true },
      { name: 'date', label: 'Fecha (1er llamado)', type: 'date', required: true },
      { name: 'secondCallDate', label: 'Fecha (2º llamado)', type: 'date', hint: 'Opcional.' },
      { name: 'time', label: 'Hora', type: 'text', maxlength: 5, placeholder: 'Ej: 15 o 20:30' },
      { name: 'president', label: 'Titular', type: 'text', maxlength: 80 },
      { name: 'firstVocal', label: '1º vocal', type: 'text', maxlength: 80 },
      { name: 'secondVocal', label: '2º vocal', type: 'text', maxlength: 80 },
      { name: 'substitute', label: 'Suplente', type: 'text', maxlength: 80 },
      { name: 'published', label: 'Publicada (visible en el sitio)', type: 'checkbox', default: true },
    ],
  },

  careers: {
    title: 'Carreras',
    subtitle: 'Oferta académica, titulaciones y planes de estudio.',
    singular: 'carrera',
    icon: 'graduation',
    searchKeys: ['name', 'degree', 'area'],
    columns: [
      {
        key: 'name',
        label: 'Carrera',
        render: (v, row) =>
          `<span class="data-table__with-logo">${row.logoUrl ? `<img class="data-table__logo" src="${escapeHTML(safeUrl(row.logoUrl, ''))}" alt="">` : ''}${primary(v)}</span>`,
      },
      { key: 'studyPlanUrl', label: 'Plan (PDF)', render: (v) => (v ? badge('badge--open', 'Cargado') : badge('badge--draft', 'Falta')) },
      { key: 'modality', label: 'Modalidad', render: (v) => escapeHTML(v) },
      { key: 'shifts', label: 'Turnos', render: (v) => escapeHTML((v || []).join(', ') || '—') },
      { key: 'durationYears', label: 'Duración', render: (v) => `${escapeHTML(v)} años` },
      { key: 'active', label: 'Estado', render: (v) => (v ? badge('badge--open', 'Activa') : badge('badge--closed', 'Oculta')) },
    ],
    fields: [
      { name: 'name', label: 'Nombre de la carrera', type: 'text', required: true, maxlength: 160, full: true },
      { name: 'degree', label: 'Titulación', type: 'text', required: true, maxlength: 200, full: true },
      { name: 'area', label: 'Área', type: 'text', maxlength: 60, placeholder: 'Ej: Salud y Atención a las Personas' },
      { name: 'durationYears', label: 'Duración (años)', type: 'number', required: true, min: 1, max: 6 },
      { name: 'modality', label: 'Modalidad', type: 'select', required: true, options: ['Presencial', 'Semipresencial', 'A distancia'] },
      { name: 'shifts', label: 'Turnos', type: 'checkboxes', options: ['Mañana', 'Tarde', 'Noche'] },
      { name: 'description', label: 'Descripción', type: 'textarea', maxlength: 3000, rows: 4, full: true },
      { name: 'logoUrl', label: 'Logo de la carrera', type: 'upload', kind: 'logo', full: true, hint: 'PNG, JPG o WebP de hasta 5 MB, cuadrado y con fondo transparente o blanco. Se muestra en la tarjeta y en el detalle.' },
      { name: 'studyPlanUrl', label: 'Plan de estudio (PDF)', type: 'upload', kind: 'pdf', full: true, hint: 'PDF de hasta 15 MB. También podés pegar un enlace externo (ej: Google Drive).' },
      { name: 'imageUrl', label: 'Imagen de portada', type: 'upload', kind: 'image', full: true, hint: 'Opcional, horizontal (ej: 1200×500 px). La primera carrera con imagen de cada área ilustra la tarjeta del área.' },
      { name: 'cursilloUrl', label: 'Cartilla de ingreso', type: 'upload', kind: 'pdf', full: true, hint: 'PDF de la cartilla de ingreso, o un enlace externo (ej: Google Drive o Classroom).' },
      { name: 'whatsappChannelUrl', label: 'Canal de WhatsApp de la carrera (URL)', type: 'url', full: true, placeholder: 'https://whatsapp.com/channel/…', hint: 'Opcional. Sólo si la carrera tiene canal propio.' },
      { name: 'coordinator', label: 'Coordinador/a', type: 'text', maxlength: 120, placeholder: 'Ej: Mendoza Martín' },
      { name: 'coordinatorSchedule', label: 'Horario de atención del coordinador/a', type: 'text', maxlength: 160, placeholder: 'Ej: Viernes 16 a 18 hs.' },
      { name: 'order', label: 'Orden', type: 'number', min: 0, default: 0 },
      { name: 'active', label: 'Visible en el sitio', type: 'checkbox', default: true },
    ],
  },

  procedures: {
    title: 'Trámites',
    subtitle: 'Hub estudiantil: estado, requisitos y descargas.',
    singular: 'trámite',
    masculine: true,
    icon: 'file-text',
    searchKeys: ['title'],
    columns: [
      { key: 'title', label: 'Trámite', render: primary },
      { key: 'status', label: 'Estado', render: (v) => badge(STATUS_BADGES[v], v === 'abierto' ? 'Abierto' : 'Cerrado') },
      { key: 'requirements', label: 'Requisitos', render: (v) => `${(v || []).length}` },
      { key: 'order', label: 'Orden', render: (v) => escapeHTML(v) },
    ],
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true, maxlength: 120, full: true },
      { name: 'status', label: 'Estado', type: 'select', options: [{ value: 'abierto', label: 'Abierto' }, { value: 'cerrado', label: 'Cerrado' }], default: 'abierto' },
      { name: 'icon', label: 'Ícono', type: 'select', options: PROCEDURE_ICONS, default: 'info' },
      { name: 'description', label: 'Descripción', type: 'textarea', required: true, maxlength: 600, rows: 3, full: true },
      { name: 'requirements', label: 'Requisitos', type: 'list', rows: 4, full: true, hint: 'Un requisito por línea.' },
      { name: 'downloadUrl', label: 'Archivo para descargar (PDF)', type: 'upload', kind: 'pdf', full: true },
      { name: 'downloadLabel', label: 'Texto del botón de descarga', type: 'text', maxlength: 60, placeholder: 'Descargar requisitos' },
      { name: 'linkUrl', label: 'Link para hacer el trámite online', type: 'url', full: true, placeholder: 'https://becasprogresar.educacion.gob.ar', hint: 'Opcional. Ej: inscripción a Becas Progresar o al Boleto BEGU. Se muestra como botón principal.' },
      { name: 'linkLabel', label: 'Texto del botón del link', type: 'text', maxlength: 60, placeholder: 'Inscribirme online' },
      { name: 'schedule', label: 'Horario / observación', type: 'text', maxlength: 160, full: true },
      { name: 'order', label: 'Orden', type: 'number', min: 0, default: 0 },
    ],
  },

  slides: {
    title: 'Carrusel principal',
    subtitle: 'Diapositivas destacadas de la portada (se muestran en orden).',
    singular: 'diapositiva',
    icon: 'dashboard',
    searchKeys: ['title', 'eyebrow'],
    columns: [
      { key: 'title', label: 'Título', render: (v, row) => primary(`${v}${row.highlight ? ` ${row.highlight}` : ''}`) },
      { key: 'eyebrow', label: 'Etiqueta', render: (v) => escapeHTML(v || '—') },
      { key: 'order', label: 'Orden', render: (v) => escapeHTML(v) },
      { key: 'active', label: 'Estado', render: (v) => (v ? badge('badge--open', 'Visible') : badge('badge--closed', 'Oculta')) },
    ],
    fields: [
      { name: 'eyebrow', label: 'Etiqueta superior', type: 'text', maxlength: 40, placeholder: 'Ej: INGRESO 2027' },
      { name: 'order', label: 'Orden', type: 'number', min: 0, default: 0 },
      { name: 'title', label: 'Título', type: 'text', required: true, maxlength: 120, placeholder: 'Ej: Empezá tu camino' },
      { name: 'highlight', label: 'Destacado (en negrita)', type: 'text', maxlength: 80, placeholder: 'Ej: en el IES N° 11' },
      { name: 'subtitle', label: 'Subtítulo', type: 'textarea', maxlength: 200, rows: 2, full: true },
      { name: 'ctaText', label: 'Texto del botón', type: 'text', maxlength: 40, placeholder: 'Ej: Conocé la propuesta' },
      { name: 'ctaUrl', label: 'Enlace del botón', type: 'url', placeholder: '#carreras o https://…' },
      { name: 'imageUrl', label: 'Imagen de fondo', type: 'upload', kind: 'image', full: true, hint: 'Horizontal, ideal 1600×700 px, con el sujeto a la derecha. Sin imagen se muestra el arte institucional.' },
      { name: 'active', label: 'Visible en la portada', type: 'checkbox', default: true },
    ],
  },

  testimonials: {
    title: 'Testimonios',
    subtitle: 'Experiencias de egresados/as y estudiantes que se muestran en la portada.',
    singular: 'testimonio',
    masculine: true,
    icon: 'message-circle',
    searchKeys: ['name', 'career', 'quote'],
    columns: [
      {
        key: 'name',
        label: 'Persona',
        render: (v, row) =>
          `<span class="data-table__with-logo">${row.photoUrl ? `<img class="data-table__logo" src="${escapeHTML(safeUrl(row.photoUrl, ''))}" alt="">` : ''}${primary(v)}</span>`,
      },
      { key: 'career', label: 'Carrera', render: (v) => escapeHTML(v || '—') },
      {
        key: 'source',
        label: 'Origen',
        render: (v, row) => escapeHTML(v === 'google' ? `Google ${'★'.repeat(row.rating || 0)}` : 'Cargado a mano'),
      },
      { key: 'order', label: 'Orden', render: (v) => escapeHTML(v) },
      { key: 'active', label: 'Estado', render: (v) => (v ? badge('badge--open', 'Visible') : badge('badge--draft', 'Pendiente de aprobar')) },
    ],
    fields: [
      { name: 'name', label: 'Nombre y apellido', type: 'text', required: true, maxlength: 80 },
      { name: 'order', label: 'Orden', type: 'number', min: 0, default: 0 },
      { name: 'career', label: 'Carrera', type: 'text', maxlength: 160, placeholder: 'Ej: Profesorado de Educación Primaria' },
      { name: 'role', label: 'Qué hace hoy', type: 'text', maxlength: 120, placeholder: 'Ej: Docente en Escuela N° 123 · Egresada 2021' },
      { name: 'quote', label: 'Testimonio', type: 'textarea', required: true, maxlength: 400, rows: 4, full: true, hint: 'Breve y en primera persona: 2 o 3 oraciones funcionan mejor.' },
      { name: 'photoUrl', label: 'Foto', type: 'upload', kind: 'logo', full: true, hint: 'Opcional. Foto cuadrada de la cara (se recorta en círculo). Con autorización de la persona.' },
      { name: 'rating', label: 'Estrellas (1 a 5)', type: 'number', min: 1, max: 5, hint: 'Opcional. Las opiniones importadas de Google traen su puntuación.' },
      { name: 'active', label: 'Visible en la portada (aprobado)', type: 'checkbox', default: true },
    ],
    headerActions: `<button class="btn btn--outline" type="button" data-google-import>${icon('star')}Importar opiniones de Google</button>`,
  },

  gallery: {
    title: 'Vida institucional',
    subtitle: 'Fotos y videos de jornadas, prácticas y comunidad. Pegá el link de un video ya publicado en YouTube, Instagram, TikTok o Facebook.',
    singular: 'publicación',
    icon: 'image',
    searchKeys: ['title', 'tag', 'description'],
    columns: [
      {
        key: 'title',
        label: 'Publicación',
        render: (v, row) =>
          `<span class="data-table__with-logo">${row.imageUrl ? `<img class="data-table__logo" src="${escapeHTML(safeUrl(row.imageUrl, ''))}" alt="">` : ''}${primary(v)}</span>`,
      },
      { key: 'tag', label: 'Categoría', render: (v) => `<span class="tag">${escapeHTML(v)}</span>` },
      { key: 'videoUrl', label: 'Tipo', render: (v) => escapeHTML(v ? 'Video' : 'Foto') },
      {
        key: 'active',
        label: 'Estado',
        render: (v, row) => (v ? badge('badge--open', 'Visible') : badge('badge--closed', 'Oculta')) + (row.featured ? ` ${badge('badge--scheduled', 'Destacada')}` : ''),
      },
    ],
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true, maxlength: 120, full: true },
      { name: 'tag', label: 'Categoría', type: 'select', options: ['Jornadas', 'Prácticas', 'Comunidad', 'Deportes y cultura', 'Egresos', 'Instalaciones'], default: 'Jornadas' },
      { name: 'date', label: 'Fecha', type: 'date', default: () => toInputDate(new Date()) },
      { name: 'imageUrl', label: 'Foto', type: 'upload', kind: 'image', full: true, hint: 'Obligatoria si no hay video. En los videos de YouTube se usa la miniatura automáticamente.' },
      { name: 'videoUrl', label: 'Link del video en redes', type: 'url', full: true, placeholder: 'https://www.instagram.com/reel/… o https://youtu.be/…', hint: 'Copiá el enlace de la publicación (Compartir → Copiar enlace). En Facebook el video tiene que ser público; los enlaces cortos (facebook.com/share/…) se convierten solos al guardar.' },
      { name: 'description', label: 'Descripción', type: 'textarea', maxlength: 600, rows: 3, full: true },
      { name: 'order', label: 'Orden', type: 'number', min: 0, default: 0 },
      { name: 'featured', label: 'Destacada (tarjeta grande)', type: 'checkbox' },
      { name: 'active', label: 'Visible en el sitio', type: 'checkbox', default: true },
    ],
  },

  inquiries: {
    title: 'Consultas',
    subtitle: 'Mensajes del formulario de contacto. Respondé desde acá y la respuesta le llega al correo de la persona.',
    singular: 'consulta',
    icon: 'inbox',
    noCreate: true,
    searchKeys: ['name', 'email', 'subject', 'message'],
    columns: [
      {
        key: 'name',
        label: 'Persona',
        render: (v, row) => `${primary(v)}<br><small class="muted">${escapeHTML(row.email)}</small>`,
      },
      {
        key: 'subject',
        label: 'Consulta',
        render: (v, row) => `<strong>${escapeHTML(v)}</strong><br><small class="muted">${escapeHTML(String(row.message || '').slice(0, 90))}${row.message?.length > 90 ? '…' : ''}</small>`,
      },
      { key: 'createdAt', label: 'Recibida', render: (v) => escapeHTML(formatDate(v, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Jujuy' })) },
      { key: 'status', label: 'Estado', render: (v) => badge(INQUIRY_BADGES[v]?.cls || 'badge--closed', INQUIRY_BADGES[v]?.label || v) },
    ],
    fields: [
      { name: 'status', label: 'Estado', type: 'select', options: [{ value: 'nueva', label: 'Nueva' }, { value: 'respondida', label: 'Respondida' }, { value: 'archivada', label: 'Archivada' }] },
      { name: 'notes', label: 'Notas internas', type: 'textarea', maxlength: 1000, rows: 3, full: true, hint: 'Sólo las ve el equipo del panel.' },
    ],
    rowActions: (row) =>
      `<button class="icon-btn" type="button" data-reply="${escapeHTML(row._id)}" aria-label="Responder a ${escapeHTML(row.name)}" title="Responder">${icon('reply')}</button>`,
  },
};

const INQUIRY_BADGES = {
  nueva: { cls: 'badge--scheduled', label: 'Nueva' },
  respondida: { cls: 'badge--open', label: 'Respondida' },
  archivada: { cls: 'badge--closed', label: 'Archivada' },
};

/** Qué puede mostrar la vista previa de cada recurso (sin entrada = sólo una vista). */
const CARD_AND_DETAIL = [
  { id: 'card', label: 'Tarjeta' },
  { id: 'detail', label: 'Ventana de detalle' },
];
const PREVIEW_VIEWS = { careers: CARD_AND_DETAIL, news: CARD_AND_DETAIL, procedures: CARD_AND_DETAIL };
const SITE_PREVIEW_VIEWS = [
  { id: 'stats', label: 'Números' },
  { id: 'institutional', label: 'Institucional' },
  { id: 'footer', label: 'Contacto' },
];
const PREVIEW_PREF_KEY = 'ies11_editor_preview';

const state = {
  previews: {},
  user: null,
  settings: null,
  data: {},
  editing: null, // { resource, id|null }
};

// ─── Utilidades de UI ────────────────────────────────────────────────
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert-triangle' : 'check')}<span>${escapeHTML(message)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}

function redirectToLogin() {
  auth.clear();
  window.location.replace('/login');
}

/** Manejo común de errores de la API: sesión vencida → login, resto → toast. */
function handleError(err, form) {
  if (err.status === 401) {
    toast('Tu sesión expiró. Volvé a iniciar sesión.', 'error');
    setTimeout(redirectToLogin, 1200);
    return;
  }
  if (form) showFormErrors(form, err);
  else toast(err.message, 'error');
}

function clearFormErrors(form) {
  const box = $('[data-form-error]', form);
  if (box) box.hidden = true;
  $$('[data-error-for]', form).forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
}

function showFormErrors(form, err) {
  const box = $('[data-form-error]', form);
  if (box) {
    box.textContent = err.message;
    box.hidden = false;
  }
  (err.details || []).forEach(({ field, message }) => {
    // "shifts.0" → "shifts", "institutional.authorities.0.name" → "institutional.authorities"
    const target = $$('[data-error-for]', form).find(
      (el) => field === el.dataset.errorFor || field.startsWith(`${el.dataset.errorFor}.`)
    );
    if (!target) return;
    target.textContent = message;
    target.hidden = false;
    form.querySelector(`[name="${CSS.escape(target.dataset.errorFor)}"]`)?.setAttribute('aria-invalid', 'true');
  });
  box?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function withBusy(button, task) {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

// ─── Navegación ──────────────────────────────────────────────────────
const SECTION_LOADERS = {
  overview: loadStats,
  alert: fillAlertForm,
  preinscription: () => fillSettingsWithPreview('preinscription', $('#preForm'), $('#prePreview'), []),
  site: fillSiteForm,
  home: fillHomeForm,
};

function showSection(name) {
  if (!$(`[data-panel="${name}"]`)) name = 'overview';
  $$('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  $$('.admin-nav__btn').forEach((btn) => {
    if (btn.dataset.section === name) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  if (window.location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);

  if (RESOURCES[name]) loadResource(name);
  else SECTION_LOADERS[name]?.();

  $('#adminMain').scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

function initNavigation() {
  $$('.admin-nav__btn').forEach((btn) => btn.addEventListener('click', () => showSection(btn.dataset.section)));
  $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => showSection(btn.dataset.goto)));
  $$('[data-shortcut]').forEach((btn) =>
    btn.addEventListener('click', () => {
      showSection(btn.dataset.shortcut);
      openEditor(btn.dataset.shortcut);
    })
  );
  window.addEventListener('hashchange', () => showSection(window.location.hash.slice(1)));
  $('#logoutBtn').addEventListener('click', () => {
    auth.clear();
    window.location.replace('/login');
  });
}

// ─── Resumen ─────────────────────────────────────────────────────────
/** Progress ring (SVG) for "part of total" stats. */
function statRing(part, total) {
  const pct = total ? Math.round((part / total) * 100) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return `
    <span class="stat-ring" aria-hidden="true">
      <svg viewBox="0 0 52 52"><circle class="stat-ring__track" cx="26" cy="26" r="${r}"/><circle class="stat-ring__fill" cx="26" cy="26" r="${r}" stroke-dasharray="${((pct / 100) * c).toFixed(1)} ${c.toFixed(1)}"/></svg>
      <span class="stat-ring__pct">${pct}%</span>
    </span>`;
}

// ─── Resumen: calendario del mes ─────────────────────────────────────
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const todayMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
};

/** Map "YYYY-MM-DD" → events that cover that day (ranges included). */
function eventsByDay(events) {
  const map = new Map();
  events.forEach((e) => {
    const start = new Date(dayKey(e.date));
    const end = e.endDate ? new Date(dayKey(e.endDate)) : start;
    for (let d = new Date(start), n = 0; d <= end && n < 62; d.setUTCDate(d.getUTCDate() + 1), n += 1) {
      const key = dayKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
  });
  return map;
}

function renderDashCalendar() {
  const month = state.dashMonth;
  const events = state.data.calendar || [];
  const byDay = eventsByDay(events);
  const year = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const offset = (month.getUTCDay() + 6) % 7; // weeks start on Monday
  const today = dayKey(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));

  $('#dashCalTitle').textContent = formatDate(month, { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());

  const cells = WEEKDAYS.map((w) => `<span class="dash-cal__wd" role="columnheader">${w}</span>`);
  for (let i = 0; i < offset; i += 1) cells.push('<span class="dash-cal__day dash-cal__day--empty"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dayKey(new Date(Date.UTC(year, m, day)));
    const list = byDay.get(key) || [];
    const cls = ['dash-cal__day', list.length && 'has-events', key === today && 'is-today'].filter(Boolean).join(' ');
    const title = list.map((e) => e.title).join(' · ');
    cells.push(
      list.length
        ? `<button type="button" class="${cls}" data-goto-calendar title="${escapeHTML(title)}" aria-label="${day}: ${escapeHTML(title)}">${day}<span class="dash-cal__dot"></span></button>`
        : `<span class="${cls}">${day}</span>`
    );
  }
  $('#dashCalGrid').innerHTML = cells.join('');

  const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
  const inMonth = events
    .filter((e) => {
      const start = dayKey(e.date).slice(0, 7);
      const end = dayKey(e.endDate || e.date).slice(0, 7);
      return start <= monthKey && end >= monthKey;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  $('#dashCalList').innerHTML = inMonth.length
    ? inMonth
        .map(
          (e) => `
        <li>
          <button type="button" class="dash-cal__item" data-edit-event="${escapeHTML(e._id)}">
            <span class="dash-cal__date">${escapeHTML(formatRange(e.date, e.endDate))}</span>
            <span class="dash-cal__name">${escapeHTML(e.title)}</span>
            <span class="dash-cal__cat">${escapeHTML(labelOf(CALENDAR_CATEGORIES, e.category))}</span>
          </button>
        </li>`
        )
        .join('')
    : '<li class="dash-cal__empty">No hay fechas cargadas este mes.</li>';
}

async function loadDashCalendar() {
  state.dashMonth ??= todayMonth();
  try {
    const { items } = await api.admin.list('calendar');
    state.data.calendar = items;
  } catch (err) {
    if (err.status === 401) return handleError(err);
  }
  renderDashCalendar();
}

function initDashCalendar() {
  const panel = $('.dash-cal');
  panel.addEventListener('click', (e) => {
    const step = e.target.closest('[data-cal-step]');
    if (step) {
      const d = state.dashMonth;
      state.dashMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(step.dataset.calStep), 1));
      return renderDashCalendar();
    }
    if (e.target.closest('[data-cal-today]')) {
      state.dashMonth = todayMonth();
      return renderDashCalendar();
    }
    if (e.target.closest('[data-goto-calendar]')) return showSection('calendar');
    const item = e.target.closest('[data-edit-event]');
    if (item) {
      showSection('calendar');
      openEditor('calendar', item.dataset.editEvent);
    }
  });
}

async function loadStats() {
  loadDashCalendar();
  const grid = $('#statsGrid');
  // DATE_TZ is UTC: use the local calendar day so late-evening loads don't show tomorrow
  const now = new Date();
  $('#dashToday').textContent = formatDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).replace(/^./, (c) => c.toUpperCase());
  grid.innerHTML = '<div class="state state--compact"><span class="spinner"></span></div>';
  try {
    const s = await api.admin.stats();
    // [icon, value, label, ring?: [part, total]]
    const cards = [
      ['newspaper', s.published, `Noticias publicadas de ${s.news}`, [s.published, s.news]],
      ['file-text', `${s.openProcedures}/${s.procedures}`, 'Trámites abiertos', [s.openProcedures, s.procedures]],
      ['graduation', s.careers, 'Carreras activas'],
      ['calendar', s.upcomingExams, 'Mesas de examen próximas'],
      ['clock', s.events, 'Fechas próximas en calendario'],
      ['inbox', s.newInquiries ?? 0, 'Consultas sin responder'],
    ];
    setInquiriesCount(s.newInquiries);
    grid.innerHTML = cards
      .map(
        ([ic, value, label, ring]) => `
        <div class="stat-card"${ring ? ` title="${escapeHTML(`${ring[0]} de ${ring[1]}`)}"` : ''}>
          ${ring ? statRing(...ring) : `<span class="stat-card__icon">${icon(ic)}</span>`}
          <span><span class="stat-card__value">${escapeHTML(value)}</span><span class="stat-card__label">${escapeHTML(label)}</span></span>
        </div>`
      )
      .join('');
  } catch (err) {
    grid.innerHTML = `<div class="state state--error state--compact">${icon('alert-triangle')}<p>${escapeHTML(err.message)}</p></div>`;
    if (err.status === 401) handleError(err);
  }
}

// ─── Secciones CRUD ──────────────────────────────────────────────────
function buildResourceSections() {
  $('#resourceSections').innerHTML = Object.entries(RESOURCES)
    .map(
      ([key, cfg]) => `
      <section class="admin-section" data-panel="${key}" aria-labelledby="title-${key}" hidden>
        <div class="admin-section__head">
          <div>
            <h1 class="admin-section__title" id="title-${key}">${escapeHTML(cfg.title)}</h1>
            <p class="admin-section__subtitle">${escapeHTML(cfg.subtitle)}</p>
          </div>
          <div class="admin-section__actions">
            ${cfg.headerActions || ''}
            ${cfg.noCreate ? '' : `<button class="btn btn--brand" type="button" data-create="${key}">${icon('plus')}${escapeHTML(newLabel(cfg))}</button>`}
          </div>
        </div>
        <div class="toolbar">
          <label class="sr-only" for="search-${key}">Buscar en ${escapeHTML(cfg.title)}</label>
          <input class="input" id="search-${key}" type="search" placeholder="Buscar…" data-search="${key}">
        </div>
        <div class="table-wrap" data-table="${key}"></div>
      </section>`
    )
    .join('');

  const container = $('#resourceSections');
  container.addEventListener('click', (e) => {
    const create = e.target.closest('[data-create]');
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    const reply = e.target.closest('[data-reply]');
    const googleImport = e.target.closest('[data-google-import]');
    if (reply) openReply(reply.dataset.reply);
    if (googleImport) importGoogleReviews(googleImport);
    if (create) openEditor(create.dataset.create);
    if (edit) openEditor(edit.dataset.resource, edit.dataset.edit);
    if (del) deleteItem(del.dataset.resource, del.dataset.delete);
  });
  container.addEventListener('input', (e) => {
    const input = e.target.closest('[data-search]');
    if (input) renderTable(input.dataset.search);
  });
}

async function loadResource(resource) {
  const wrap = $(`[data-table="${resource}"]`);
  wrap.innerHTML = '<div class="state"><span class="spinner"></span><p>Cargando…</p></div>';
  try {
    const { items } = await api.admin.list(resource);
    state.data[resource] = items;
    renderTable(resource);
  } catch (err) {
    wrap.innerHTML = `<div class="state state--error">${icon('alert-triangle')}<p>${escapeHTML(err.message)}</p></div>`;
    if (err.status === 401) handleError(err);
  }
}

function renderTable(resource) {
  const cfg = RESOURCES[resource];
  const wrap = $(`[data-table="${resource}"]`);
  const term = normalize($(`[data-search="${resource}"]`).value.trim());
  const all = state.data[resource] || [];
  const rows = term ? all.filter((row) => cfg.searchKeys.some((k) => normalize(row[k]).includes(term))) : all;

  if (!rows.length) {
    wrap.innerHTML = `<div class="state">${icon('info')}<p>${
      all.length ? 'No hay resultados para esa búsqueda.' : `Todavía no hay ${escapeHTML(cfg.title.toLowerCase())} cargadas.`
    }</p></div>`;
    return;
  }

  const nameKey = cfg.columns[0].key;
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>${cfg.columns.map((c) => `<th scope="col">${c.label}</th>`).join('')}<th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            ${cfg.columns.map((c) => `<td data-label="${c.label}">${c.render(row[c.key], row)}</td>`).join('')}
            <td class="data-table__actions">
              ${cfg.rowActions ? cfg.rowActions(row) : ''}
              <button class="icon-btn" type="button" data-resource="${resource}" data-edit="${escapeHTML(row._id)}" aria-label="Editar ${escapeHTML(row[nameKey])}">${icon('edit')}</button>
              <button class="icon-btn icon-btn--danger" type="button" data-resource="${resource}" data-delete="${escapeHTML(row._id)}" aria-label="Eliminar ${escapeHTML(row[nameKey])}">${icon('trash')}</button>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

async function deleteItem(resource, id) {
  const item = state.data[resource]?.find((r) => r._id === id);
  const name = item?.[RESOURCES[resource].columns[0].key] || 'este elemento';
  if (!window.confirm(`¿Eliminar “${name}”? Esta acción no se puede deshacer.`)) return;
  try {
    await api.admin.remove(resource, id);
    state.data[resource] = state.data[resource].filter((r) => r._id !== id);
    renderTable(resource);
    toast('Eliminado correctamente.');
  } catch (err) {
    handleError(err);
  }
}

// ─── Formularios generados ───────────────────────────────────────────
const optionsOf = (field) => field.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

const UPLOAD_ACCEPT = {
  logo: 'image/png,image/jpeg,image/webp',
  image: 'image/png,image/jpeg,image/webp',
  pdf: 'application/pdf',
  video: 'video/mp4,video/quicktime,video/webm',
};
const UPLOAD_LABELS = { pdf: 'PDF', logo: 'logo', image: 'imagen', video: 'video' };

/** Vista previa de un campo de archivo: miniatura para imágenes, ficha para PDFs. */
function uploadPreview(url, kind) {
  const href = safeUrl(url, '');
  if (!href) return `<span class="upload__empty">${icon(kind === 'pdf' ? 'file-text' : 'image')}</span>`;
  if (kind === 'pdf') {
    return `<a class="upload__file" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer" title="Abrir PDF">${icon('file-text')}<span>PDF</span></a>`;
  }
  if (kind === 'video') {
    return `<video class="upload__thumb" src="${escapeHTML(href)}" preload="metadata" muted playsinline></video>`;
  }
  return `<img class="upload__thumb${kind === 'logo' ? ' upload__thumb--logo' : ''}" src="${escapeHTML(href)}" alt="Vista previa">`;
}

function fieldHTML(field, value) {
  const id = `f-${field.name}`;
  const required = field.required ? ' required' : '';
  const maxlength = field.maxlength ? ` maxlength="${field.maxlength}"` : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHTML(field.placeholder)}"` : '';
  const hintId = field.hint ? `${id}-hint` : '';
  const describedBy = hintId ? ` aria-describedby="${hintId}"` : '';
  const label = `<label class="field__label" for="${id}">${escapeHTML(field.label)}${field.required ? ' <span class="req">*</span>' : ''}</label>`;
  const hint = field.hint ? `<small class="field__hint" id="${hintId}">${escapeHTML(field.hint)}</small>` : '';
  const error = `<p class="field__error" data-error-for="${field.name}" hidden></p>`;
  const wrap = (control, withLabel = true) =>
    `<div class="field${field.full ? ' field--full' : ''}">${withLabel ? label : ''}${control}${hint}${error}</div>`;

  switch (field.type) {
    case 'textarea':
    case 'list': {
      const text = field.type === 'list' ? (value || []).join('\n') : value ?? '';
      return wrap(`<textarea class="input" id="${id}" name="${field.name}" rows="${field.rows || 3}"${required}${maxlength}${placeholder}${describedBy}>${escapeHTML(text)}</textarea>`);
    }
    case 'select':
      return wrap(
        `<select class="input" id="${id}" name="${field.name}"${required}${describedBy}>
          ${field.required && !value ? '<option value="">Seleccionar…</option>' : ''}
          ${optionsOf(field)
            .map((o) => `<option value="${escapeHTML(o.value)}"${o.value === value ? ' selected' : ''}>${escapeHTML(o.label)}</option>`)
            .join('')}
        </select>`
      );
    case 'checkbox':
      return wrap(`<label class="check"><input type="checkbox" id="${id}" name="${field.name}"${value ? ' checked' : ''}> ${escapeHTML(field.label)}</label>`, false);
    case 'checkboxes':
      return wrap(
        `<fieldset class="check-group" id="${id}"><legend class="sr-only">${escapeHTML(field.label)}</legend>
          ${optionsOf(field)
            .map(
              (o) => `<label class="check"><input type="checkbox" name="${field.name}" value="${escapeHTML(o.value)}"${(value || []).includes(o.value) ? ' checked' : ''}> ${escapeHTML(o.label)}</label>`
            )
            .join('')}
        </fieldset>`
      ).replace(`for="${id}"`, '');
    case 'date':
      return wrap(`<input class="input" type="date" id="${id}" name="${field.name}" value="${escapeHTML(toInputDate(value))}"${required}${describedBy}>`);
    case 'number':
      return wrap(
        `<input class="input" type="number" id="${id}" name="${field.name}" value="${escapeHTML(value ?? '')}"${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}${required}${describedBy}>`
      );
    case 'url':
      return wrap(`<input class="input" type="text" inputmode="url" id="${id}" name="${field.name}" value="${escapeHTML(value ?? '')}"${maxlength || ' maxlength="500"'}${placeholder}${describedBy}>`);
    case 'upload':
      return wrap(`
        <div class="upload" data-upload="${field.name}" data-kind="${field.kind}">
          <div class="upload__preview" data-upload-preview>${uploadPreview(value, field.kind)}</div>
          <div class="upload__controls">
            <input class="input" type="text" inputmode="url" id="${id}" name="${field.name}" value="${escapeHTML(value ?? '')}" maxlength="500" placeholder="Subí un archivo o pegá un enlace https://…"${describedBy}>
            <div class="upload__buttons">
              <label class="btn btn--outline btn--sm upload__pick">${icon('upload')}<span data-upload-label>Subir ${UPLOAD_LABELS[field.kind]}</span><input class="sr-only" type="file" accept="${UPLOAD_ACCEPT[field.kind]}" data-upload-input></label>
              <button class="btn btn--ghost btn--sm" type="button" data-upload-clear${value ? '' : ' hidden'}>${icon('trash')}Quitar</button>
            </div>
          </div>
        </div>`);
    default:
      return wrap(`<input class="input" type="text" id="${id}" name="${field.name}" value="${escapeHTML(value ?? '')}"${required}${maxlength}${placeholder}${describedBy}>`);
  }
}

function readFields(form, fields) {
  const data = {};
  fields.forEach((field) => {
    if (field.type === 'checkbox') {
      data[field.name] = form.elements[field.name].checked;
    } else if (field.type === 'checkboxes') {
      data[field.name] = $$(`input[name="${field.name}"]:checked`, form).map((i) => i.value);
    } else {
      const raw = form.elements[field.name].value.trim();
      if (field.type === 'list') data[field.name] = raw.split('\n').map((s) => s.trim()).filter(Boolean);
      else if (field.type === 'number') data[field.name] = raw === '' ? null : Number(raw);
      else if (field.type === 'date') data[field.name] = raw || null;
      else data[field.name] = raw;
    }
  });
  return data;
}

/** Validación rápida en cliente (el servidor vuelve a validar todo). */
function validateRequired(form, fields) {
  const missing = fields.filter((f) => f.required && f.type !== 'checkbox' && f.type !== 'checkboxes' && !form.elements[f.name].value.trim());
  if (!missing.length) return true;
  showFormErrors(form, {
    message: 'Completá los campos obligatorios.',
    details: missing.map((f) => ({ field: f.name, message: `${f.label} es obligatorio` })),
  });
  form.elements[missing[0].name].focus();
  return false;
}

function openEditor(resource, id = null) {
  const cfg = RESOURCES[resource];
  const item = id ? state.data[resource]?.find((r) => r._id === id) : null;
  state.editing = { resource, id };

  $('#editorTitle').textContent = item ? `Editar ${cfg.singular}` : newLabel(cfg);
  $('#editorFields').innerHTML = cfg.fields
    .map((f) => {
      const fallback = typeof f.default === 'function' ? f.default() : f.default;
      return fieldHTML(f, item ? item[f.name] : fallback);
    })
    .join('');

  const form = $('#editorForm');
  clearFormErrors(form);
  $('#editorModal').showModal();
  state.editing.snapshot = editorSnapshot();
  setEditorPreview(localStorage.getItem(PREVIEW_PREF_KEY) !== 'off' && window.innerWidth >= 1000);
  form.querySelector('.input, input')?.focus();
}

/** Serialized form values, used to detect unsaved changes. */
function editorSnapshot() {
  const cfg = RESOURCES[state.editing?.resource];
  return cfg ? JSON.stringify(readFields($('#editorForm'), cfg.fields)) : '';
}

function editorIsDirty() {
  return Boolean($('#editorModal').open && state.editing?.snapshot !== undefined && editorSnapshot() !== state.editing.snapshot);
}

/** Closes the editor, asking for confirmation when there are unsaved changes. */
function requestCloseEditor() {
  if (editorIsDirty() && !window.confirm('Tenés cambios sin guardar. ¿Seguro que querés salir?')) return;
  $('#editorModal').close();
}

/** Borrador actual del editor, combinado con el ítem original para conservar campos no editables. */
function editorDraft() {
  const { resource, id } = state.editing || {};
  const cfg = RESOURCES[resource];
  if (!cfg) return null;
  const original = id ? state.data[resource]?.find((r) => r._id === id) : null;
  return { resource, item: { ...original, ...readFields($('#editorForm'), cfg.fields), _id: id || undefined } };
}

function setEditorPreview(on) {
  const modal = $('#editorModal');
  modal.classList.toggle('has-preview', on);
  $('#previewToggle').setAttribute('aria-pressed', String(on));
  if (!on) return;
  state.previews.editor ??= createLivePreview($('#editorPreview'), { getMessage: editorDraft });
  state.previews.editor.setViews(PREVIEW_VIEWS[state.editing?.resource] || []);
  state.previews.editor.refresh();
}

/**
 * Upload fields built by fieldHTML (type "upload") inside a form: upload a file, paste a link or clear it.
 * Used by the resource editor and by settings forms such as "Fotos de la portada".
 * @param {HTMLFormElement} form
 * @param {{ submit: HTMLButtonElement, suggestName: (box: HTMLElement) => string, onChange?: () => void }} options
 */
function bindUploads(form, { submit, suggestName, onChange = () => {} }) {
  const renderUpload = (box, url) => {
    $('[data-upload-preview]', box).innerHTML = uploadPreview(url, box.dataset.kind);
    $('[data-upload-clear]', box).hidden = !url;
  };
  const setUploadValue = (box, url) => {
    form.elements[box.dataset.upload].value = url;
    renderUpload(box, url);
    onChange();
  };

  form.addEventListener('change', async (e) => {
    const fileInput = e.target.closest('[data-upload-input]');
    if (!fileInput?.files.length) return;
    const box = fileInput.closest('[data-upload]');
    if (box.dataset.kind === 'video' && fileInput.files[0].size > VIDEO_MAX_MB * 1024 * 1024) {
      fileInput.value = '';
      toast(`El video supera los ${VIDEO_MAX_MB} MB. Recortalo o comprimilo y probá de nuevo.`, 'error');
      return;
    }
    const label = $('[data-upload-label]', box);
    const original = label.textContent;

    label.textContent = 'Subiendo…';
    box.classList.add('is-busy');
    submit.disabled = true;
    try {
      const { url } = await api.admin.upload(fileInput.files[0], box.dataset.kind, suggestName(box));
      setUploadValue(box, url);
      toast('Archivo subido. Guardá los cambios para publicarlo.');
    } catch (err) {
      handleError(err);
    } finally {
      fileInput.value = '';
      label.textContent = original;
      box.classList.remove('is-busy');
      submit.disabled = false;
    }
  });

  form.addEventListener('input', (e) => {
    const box = e.target.closest('[data-upload]');
    if (box && e.target.name === box.dataset.upload) renderUpload(box, e.target.value.trim());
  });

  form.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-upload-clear]');
    if (clear) setUploadValue(clear.closest('[data-upload]'), '');
  });

  return { renderUpload };
}

function initEditor() {
  const modal = $('#editorModal');
  const form = $('#editorForm');

  // Close on backdrop only when the click both started and ended there:
  // selecting text inside the form and releasing outside must not close it.
  let pressedOnBackdrop = false;
  modal.addEventListener('mousedown', (e) => {
    pressedOnBackdrop = e.target === modal;
  });
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-editor]') || (e.target === modal && pressedOnBackdrop)) requestCloseEditor();
    pressedOnBackdrop = false;
  });
  // Escape key
  modal.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestCloseEditor();
  });
  // Reloading or leaving the page with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (!editorIsDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  $('#previewToggle').addEventListener('click', () => {
    const on = !modal.classList.contains('has-preview');
    localStorage.setItem(PREVIEW_PREF_KEY, on ? 'on' : 'off');
    setEditorPreview(on);
  });

  // Cualquier cambio del formulario se refleja en la vista previa
  ['input', 'change'].forEach((type) => form.addEventListener(type, () => state.previews.editor?.update()));

  bindUploads(form, {
    submit: $('#editorSubmit'),
    suggestName: () => form.elements.name?.value || form.elements.title?.value || '',
    onChange: () => state.previews.editor?.update(),
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { resource, id } = state.editing || {};
    const cfg = RESOURCES[resource];
    if (!cfg) return;

    clearFormErrors(form);
    if (!validateRequired(form, cfg.fields)) return;

    const data = readFields(form, cfg.fields);
    await withBusy($('#editorSubmit'), async () => {
      try {
        const { item } = id ? await api.admin.update(resource, id, data) : await api.admin.create(resource, data);
        const list = state.data[resource] || [];
        state.data[resource] = id ? list.map((r) => (r._id === id ? item : r)) : [item, ...list];
        renderTable(resource);
        modal.close();
        toast(id ? 'Cambios guardados.' : `${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} ${cfg.masculine ? 'creado' : 'creada'}.`);
      } catch (err) {
        handleError(err, form);
      }
    });
  });
}

// ─── Configuración del sitio ─────────────────────────────────────────
async function getSettings(force = false) {
  if (!state.settings || force) state.settings = await api.settings();
  return state.settings;
}

function updateAlertPreview() {
  const form = $('#alertForm');
  const preview = $('#alertPreview');
  preview.className = `alert-bar alert-bar--${form.level.value}`;
  $('.alert-bar__text', preview).textContent = form.message.value || 'Escribí el mensaje de la alerta…';
  $('.alert-bar__link', preview).textContent = form.linkText.value ? `${form.linkText.value} →` : '';
  preview.parentElement.classList.toggle('muted', !form.enabled.checked);
}

async function fillAlertForm() {
  const form = $('#alertForm');
  try {
    const { alert = {} } = await getSettings();
    form.enabled.checked = !!alert.enabled;
    form.message.value = alert.message || '';
    form.linkText.value = alert.linkText || '';
    form.linkUrl.value = alert.linkUrl || '';
    form.level.value = alert.level || 'urgent';
    updateAlertPreview();
  } catch (err) {
    handleError(err, form);
  }
}

// Campos de texto que se editan como "un ítem por línea"
const LINE_LIST_FIELDS = ['steps', 'requirements'];

// Campos que se editan como "A | B" por línea: [clave A, clave B] de cada objeto
const PAIR_LIST_FIELDS = { authorities: ['role', 'name'], stats: ['value', 'label'] };

function parsePairs(text, [a, b]) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, ...rest] = line.split('|');
      return { [a]: first.trim(), [b]: rest.join('|').trim() };
    });
}

function fieldToText(key, value) {
  const pair = PAIR_LIST_FIELDS[key];
  if (pair) return (value || []).map((item) => `${item[pair[0]]} | ${item[pair[1]]}`).join('\n');
  if (LINE_LIST_FIELDS.includes(key)) return (value || []).join('\n');
  return value ?? '';
}

function textToField(key, text) {
  if (PAIR_LIST_FIELDS[key]) return parsePairs(text, PAIR_LIST_FIELDS[key]);
  if (LINE_LIST_FIELDS.includes(key)) return text.split('\n').map((line) => line.trim()).filter(Boolean);
  return text.trim();
}

// Settings inputs are named by path: "section.key" or deeper ("home.pathImages.tecnicatura")
async function fillSettingsForm(form) {
  try {
    const s = await getSettings();
    $$('input[name], textarea[name]', form).forEach((el) => {
      const path = el.name.split('.');
      el.value = fieldToText(path.at(-1), path.reduce((obj, key) => obj?.[key], s));
    });
  } catch (err) {
    handleError(err, form);
  }
}

/** Rellena un formulario de configuración y, ya con los datos cargados, conecta su vista previa. */
async function fillSettingsWithPreview(name, form, host, views) {
  await fillSettingsForm(form);
  if (!state.previews[name]) {
    const view = views[0]?.id || name;
    state.previews[name] = createLivePreview(host, {
      views,
      getMessage: (current) => ({ resource: 'settings', item: settingsPayload(form), view: current || view }),
    });
    form.addEventListener('input', () => state.previews[name].update());
  }
  state.previews[name].refresh();
}

/** Arma el payload { seccion: { campo: valor } } a partir de los name="seccion.campo" (o más niveles) del form. */
function settingsPayload(form) {
  const payload = {};
  $$('input[name], textarea[name]', form).forEach((el) => {
    const path = el.name.split('.');
    const key = path.pop();
    const parent = path.reduce((obj, part) => (obj[part] ||= {}), payload);
    parent[key] = textToField(key, el.value);
  });
  return payload;
}

// ─── Fotos de la portada (settings.home) ─────────────────────────────
const HOME_PATH_PHOTOS = [
  ['pathImages.tecnicatura', 'Busco una tecnicatura'],
  ['pathImages.ingresante', 'Quiero estudiar'],
  ['pathImages.estudiante', 'Ya soy estudiante'],
  ['pathImages.egresado', 'Egresados'],
  ['pathImages.institucional', 'Conocé el IES'],
];
const HOME_NEXT_STEP_PHOTOS = [
  ['nextStepImages.tecnicaturas', 'Tecnicaturas superiores'],
  ['nextStepImages.cursillo', 'Cursillo de ingreso'],
  ['nextStepImages.preinscripcion', 'Preinscripción online'],
];
const HOME_PREVIEW_VIEWS = [
  { id: 'homePaths', label: 'Elegí tu camino' },
  { id: 'homeNextStep', label: 'Próximo paso' },
];

const homePhotoFields = (list) =>
  list.map(([name, label]) => fieldHTML({ name: `home.${name}`, label, type: 'upload', kind: 'image' }, '')).join('');

async function fillHomeForm() {
  const form = $('#homeForm');
  await fillSettingsWithPreview('home', form, $('#homePreview'), HOME_PREVIEW_VIEWS);
  // Values were set after the fields were built: refresh each thumbnail
  $$('[data-upload]', form).forEach((box) => state.homeUploads.renderUpload(box, form.elements[box.dataset.upload].value.trim()));
}

function initHomeForm() {
  const form = $('#homeForm');
  const submit = $('button[type="submit"]', form);
  $('#homePathFields').innerHTML = homePhotoFields(HOME_PATH_PHOTOS);
  $('#homeNextStepFields').innerHTML = homePhotoFields(HOME_NEXT_STEP_PHOTOS);
  state.homeUploads = bindUploads(form, {
    submit,
    suggestName: (box) => `Portada - ${$('.field__label', box.closest('.field'))?.textContent.trim() || 'foto'}`,
    onChange: () => state.previews.home?.update(),
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    await withBusy(submit, async () => {
      try {
        ({ settings: state.settings } = await api.admin.saveSettings(settingsPayload(form)));
        toast('Fotos de la portada guardadas.');
      } catch (err) {
        handleError(err, form);
      }
    });
  });
}

/** "Institucional y contacto": building photo as an upload widget (same as the editor's). */
function initSiteUploads() {
  const form = $('#siteForm');
  $('#iImageField').outerHTML = fieldHTML(
    {
      name: 'institutional.imageUrl',
      label: 'Foto del edificio',
      type: 'upload',
      kind: 'image',
      full: true,
      hint: 'Se muestra en el panel "Conocé el IES N° 11". Horizontal, ideal 1600×1000 px.',
    },
    ''
  );
  state.siteUploads = bindUploads(form, {
    submit: $('button[type="submit"]', form),
    suggestName: () => 'Edificio IES 11',
    onChange: () => state.previews.site?.update(),
  });
}

async function fillSiteForm() {
  const form = $('#siteForm');
  await fillSettingsWithPreview('site', form, $('#sitePreview'), SITE_PREVIEW_VIEWS);
  // Values were set after the widget was built: refresh its thumbnail
  $$('[data-upload]', form).forEach((box) => state.siteUploads.renderUpload(box, form.elements[box.dataset.upload].value.trim()));
}

function initSettingsForms() {
  const alertForm = $('#alertForm');
  alertForm.addEventListener('input', updateAlertPreview);
  alertForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(alertForm);
    const alert = {
      enabled: alertForm.enabled.checked,
      message: alertForm.message.value.trim(),
      linkText: alertForm.linkText.value.trim(),
      linkUrl: alertForm.linkUrl.value.trim(),
      level: alertForm.level.value,
    };
    if (alert.enabled && !alert.message) {
      showFormErrors(alertForm, { message: 'Escribí el mensaje para poder mostrar la alerta.', details: [{ field: 'alert.message', message: 'El mensaje es obligatorio' }] });
      return;
    }
    await withBusy($('button[type="submit"]', alertForm), async () => {
      try {
        ({ settings: state.settings } = await api.admin.saveSettings({ alert }));
        toast(alert.enabled ? 'Alerta publicada en el sitio.' : 'Alerta guardada (oculta).');
      } catch (err) {
        handleError(err, alertForm);
      }
    });
  });

  const siteForm = $('#siteForm');
  siteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(siteForm);

    const payload = settingsPayload(siteForm);

    if (payload.institutional.authorities.some((a) => !a.role || !a.name)) {
      showFormErrors(siteForm, {
        message: 'Revisá la lista de autoridades.',
        details: [{ field: 'institutional.authorities', message: 'Cada línea debe tener el formato “Cargo | Nombre”.' }],
      });
      return;
    }
    if (payload.highlights.stats.some((s) => !s.value || !s.label)) {
      showFormErrors(siteForm, {
        message: 'Revisá los números destacados.',
        details: [{ field: 'highlights.stats', message: 'Cada línea debe tener el formato “Número | Descripción”.' }],
      });
      return;
    }

    await withBusy($('button[type="submit"]', siteForm), async () => {
      try {
        ({ settings: state.settings } = await api.admin.saveSettings(payload));
        toast('Datos institucionales guardados.');
      } catch (err) {
        handleError(err, siteForm);
      }
    });
  });

  const preForm = $('#preForm');
  preForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(preForm);
    await withBusy($('button[type="submit"]', preForm), async () => {
      try {
        ({ settings: state.settings } = await api.admin.saveSettings(settingsPayload(preForm)));
        toast('Información de preinscripción guardada.');
      } catch (err) {
        handleError(err, preForm);
      }
    });
  });
}

// ─── Consultas del formulario de contacto ────────────────────────────
function setInquiriesCount(count) {
  const el = $('#inquiriesCount');
  if (!el) return;
  el.hidden = !count;
  el.textContent = count > 99 ? '99+' : String(count || '');
  el.setAttribute('aria-label', `${count} sin responder`);
}

function openReply(id) {
  const item = state.data.inquiries?.find((r) => r._id === id);
  if (!item) return;
  state.replying = id;
  const replies = (item.replies || [])
    .map(
      (r) => `
      <div class="reply-thread__msg reply-thread__msg--out">
        <span class="reply-thread__meta">${escapeHTML(r.sentBy || 'Equipo')} · ${escapeHTML(formatDate(r.sentAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Jujuy' }))}${r.delivered ? '' : ' · enviada desde tu correo'}</span>
        <p>${escapeHTML(r.message)}</p>
      </div>`
    )
    .join('');
  $('#replyThread').innerHTML = `
    <div class="reply-thread__msg">
      <span class="reply-thread__meta"><strong>${escapeHTML(item.name)}</strong> · <a href="mailto:${escapeHTML(item.email)}">${escapeHTML(item.email)}</a>${item.phone ? ` · ${escapeHTML(item.phone)}` : ''}</span>
      <span class="reply-thread__meta">${escapeHTML(item.subject)}${item.career ? ` · ${escapeHTML(item.career)}` : ''}</span>
      <p>${escapeHTML(item.message)}</p>
    </div>
    ${replies}`;
  const form = $('#replyForm');
  clearFormErrors(form);
  form.reset();
  $('#replyModal').showModal();
  $('#replyMessage').focus();
}

function initReply() {
  const modal = $('#replyModal');
  const form = $('#replyForm');
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-reply]') || e.target === modal) modal.close();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const message = $('#replyMessage').value.trim();
    if (!message) return showFormErrors(form, { message: 'Escribí la respuesta.', details: [{ field: 'message', message: 'Escribí la respuesta' }] });
    try {
      const { item, delivered, mailto } = await withBusy($('#replySubmit'), () => api.admin.replyInquiry(state.replying, message));
      state.data.inquiries = state.data.inquiries.map((r) => (r._id === item._id ? item : r));
      renderTable('inquiries');
      modal.close();
      if (delivered) {
        toast(`Respuesta enviada a ${item.email}.`);
      } else {
        // No SMTP configured on the server: open the admin's mail app with the draft
        toast('El servidor no tiene correo configurado: se abrió tu app de correo con la respuesta lista para enviar.', 'warning');
        if (mailto) window.location.href = mailto;
      }
      api.admin.stats().then((s) => setInquiriesCount(s.newInquiries), () => {});
    } catch (err) {
      handleError(err, form);
    }
  });
}

async function importGoogleReviews(button) {
  try {
    const { imported, received, minRating } = await withBusy(button, () => api.admin.importGoogleReviews());
    toast(
      imported
        ? `Se importaron ${imported} opiniones de ${minRating}★ o más. Quedan pendientes: revisalas y marcá "Visible" en las que quieras publicar.`
        : `Google devolvió ${received} opiniones, pero ninguna nueva pasó el filtro (${minRating}★ o más, con texto).`
    );
    loadResource('testimonials');
  } catch (err) {
    handleError(err);
  }
}

// ─── Inicio ──────────────────────────────────────────────────────────
async function init() {
  if (!auth.getToken()) return redirectToLogin();

  try {
    ({ user: state.user } = await api.me());
  } catch (err) {
    if (err.status === 401) return redirectToLogin();
    $('#pageLoader').innerHTML = `<div class="state state--error">${icon('alert-triangle')}<p>${escapeHTML(err.message)}</p><a class="btn btn--outline btn--sm" href="/admin">Reintentar</a></div>`;
    return;
  }

  $('#userName').textContent = state.user.name;
  $('#userRole').textContent = state.user.role;
  $('#userAvatar').textContent = state.user.name.trim().charAt(0).toUpperCase();
  $('#greetName').textContent = state.user.name.split(' ')[0];

  buildResourceSections();
  hydrateIcons();
  initNavigation();
  initEditor();
  initDashCalendar();
  initSettingsForms();
  initHomeForm();
  initSiteUploads();
  initReply();
  api.admin.stats().then((s) => setInquiriesCount(s.newInquiries), () => {});

  $('#pageLoader').hidden = true;
  $('#adminApp').hidden = false;
  showSection(window.location.hash.slice(1) || 'overview');
}

init();
