/**
 * IES N° 11 — Panel de gestión (CMS).
 * Sesión JWT, navegación por secciones, CRUD genérico con formularios
 * generados desde configuración, alerta urgente y datos institucionales.
 */
import { api, auth } from './api.js';
import { icon, hydrateIcons } from './icons.js';
import { $, $$, escapeHTML, formatDate, formatRange, toInputDate, normalize } from './utils.js';

// ─── Catálogos ───────────────────────────────────────────────────────
const CALENDAR_CATEGORIES = [
  { value: 'mesa-ordinaria', label: 'Mesas Ordinarias' },
  { value: 'mesa-extraordinaria', label: 'Mesas Extraordinarias' },
  { value: 'feriado', label: 'Feriados e Inasistencias' },
  { value: 'cursillo', label: 'Cursillos e Inscripción' },
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
      { name: 'imageUrl', label: 'Imagen (URL)', type: 'url', full: true, placeholder: 'https://… o /assets/…', hint: 'Opcional. Si se deja vacío se muestra una ilustración según la categoría.' },
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

  careers: {
    title: 'Carreras',
    subtitle: 'Oferta académica, titulaciones y planes de estudio.',
    singular: 'carrera',
    icon: 'graduation',
    searchKeys: ['name', 'degree', 'area'],
    columns: [
      { key: 'name', label: 'Carrera', render: primary },
      { key: 'modality', label: 'Modalidad', render: (v) => escapeHTML(v) },
      { key: 'shifts', label: 'Turnos', render: (v) => escapeHTML((v || []).join(', ') || '—') },
      { key: 'durationYears', label: 'Duración', render: (v) => `${escapeHTML(v)} años` },
      { key: 'active', label: 'Estado', render: (v) => (v ? badge('badge--open', 'Activa') : badge('badge--closed', 'Oculta')) },
    ],
    fields: [
      { name: 'name', label: 'Nombre de la carrera', type: 'text', required: true, maxlength: 160, full: true },
      { name: 'degree', label: 'Titulación', type: 'text', required: true, maxlength: 200, full: true },
      { name: 'area', label: 'Área', type: 'text', maxlength: 60, placeholder: 'Ej: Formación Docente' },
      { name: 'durationYears', label: 'Duración (años)', type: 'number', required: true, min: 1, max: 6 },
      { name: 'modality', label: 'Modalidad', type: 'select', required: true, options: ['Presencial', 'Semipresencial', 'A distancia'] },
      { name: 'shifts', label: 'Turnos', type: 'checkboxes', options: ['Mañana', 'Tarde', 'Noche'] },
      { name: 'description', label: 'Descripción', type: 'textarea', maxlength: 3000, rows: 4, full: true },
      { name: 'imageUrl', label: 'Imagen (URL)', type: 'url', full: true, placeholder: 'https://… o /assets/…', hint: 'Opcional. La primera carrera con imagen de cada área ilustra la tarjeta del área.' },
      { name: 'studyPlanUrl', label: 'Plan de estudio (URL del PDF)', type: 'url', full: true, placeholder: 'https://… o /assets/planes/…pdf' },
      { name: 'cursilloUrl', label: 'Cursillo de ingreso (URL)', type: 'url', full: true },
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
      { name: 'downloadUrl', label: 'Descarga (URL)', type: 'url', placeholder: 'https://… o /assets/…' },
      { name: 'downloadLabel', label: 'Texto del botón de descarga', type: 'text', maxlength: 60, placeholder: 'Descargar requisitos' },
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
      { name: 'imageUrl', label: 'Imagen de fondo (URL)', type: 'url', full: true, placeholder: 'https://… o /assets/…', hint: 'Horizontal, ideal 1600×700 px, con el sujeto a la derecha. Sin imagen se muestra el arte institucional.' },
      { name: 'active', label: 'Visible en la portada', type: 'checkbox', default: true },
    ],
  },
};

const state = {
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
  site: fillSiteForm,
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
async function loadStats() {
  const grid = $('#statsGrid');
  grid.innerHTML = '<div class="state state--compact"><span class="spinner"></span></div>';
  try {
    const s = await api.admin.stats();
    const cards = [
      ['newspaper', s.published, `Noticias publicadas (${s.news} en total)`],
      ['calendar', s.upcomingExams, 'Mesas de examen próximas'],
      ['clock', s.events, 'Fechas próximas en calendario'],
      ['graduation', s.careers, 'Carreras activas'],
      ['file-text', `${s.openProcedures}/${s.procedures}`, 'Trámites abiertos'],
    ];
    grid.innerHTML = cards
      .map(
        ([ic, value, label]) => `
        <div class="stat-card">
          <span class="stat-card__icon">${icon(ic)}</span>
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
          <button class="btn btn--brand" type="button" data-create="${key}">${icon('plus')}${escapeHTML(newLabel(cfg))}</button>
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
  form.querySelector('.input, input')?.focus();
}

function initEditor() {
  const modal = $('#editorModal');
  const form = $('#editorForm');

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-close-editor]')) modal.close();
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

async function fillSiteForm() {
  const form = $('#siteForm');
  try {
    const s = await getSettings();
    $$('input[name], textarea[name]', form).forEach((el) => {
      const [section, key] = el.name.split('.');
      const value = s[section]?.[key];
      el.value = key === 'authorities' ? (value || []).map((a) => `${a.role} | ${a.name}`).join('\n') : value ?? '';
    });
  } catch (err) {
    handleError(err, form);
  }
}

function parseAuthorities(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [role, ...rest] = line.split('|');
      return { role: role.trim(), name: rest.join('|').trim() };
    });
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

    const payload = { contact: {}, links: {}, institutional: {} };
    $$('input[name], textarea[name]', siteForm).forEach((el) => {
      const [section, key] = el.name.split('.');
      payload[section][key] = key === 'authorities' ? parseAuthorities(el.value) : el.value.trim();
    });

    const invalid = payload.institutional.authorities.find((a) => !a.role || !a.name);
    if (invalid) {
      showFormErrors(siteForm, {
        message: 'Revisá la lista de autoridades.',
        details: [{ field: 'institutional.authorities', message: 'Cada línea debe tener el formato “Cargo | Nombre”.' }],
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
  initSettingsForms();

  $('#pageLoader').hidden = true;
  $('#adminApp').hidden = false;
  showSection(window.location.hash.slice(1) || 'overview');
}

init();
