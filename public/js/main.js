/**
 * IES N° 11 — Sitio público.
 * Navegación (barra de perfiles, menú lateral, buscador en vivo) y
 * renderizado de los módulos dinámicos: carrusel principal, áreas y
 * carreras, trámites, calendario, panel institucional, novedades y footer.
 */
import { api } from './api.js';
import { icon, hydrateIcons } from './icons.js';
import { createCarousel } from './carousel.js';
import { initChatbot } from './chatbot.js';
import {
  $,
  $$,
  escapeHTML,
  safeUrl,
  externalAttrs,
  formatDate,
  formatRange,
  dateParts,
  debounce,
  normalize,
  whatsappUrl,
  storage,
} from './utils.js';

// ─── Catálogos de presentación ───────────────────────────────────────
const CALENDAR_CATEGORIES = {
  'mesa-ordinaria': 'Mesas Ordinarias',
  'mesa-extraordinaria': 'Mesas Extraordinarias',
  feriado: 'Feriados e Inasistencias',
  cursillo: 'Cursillos e Inscripción',
};

const EVENT_STATUS = {
  programado: { label: 'Programado', badge: 'badge--scheduled' },
  abierto: { label: 'Abierto', badge: 'badge--open' },
  cerrado: { label: 'Cerrado', badge: 'badge--closed' },
  finalizado: { label: 'Finalizado', badge: 'badge--done' },
};

const PROCEDURE_ICONS = { bus: 'bus', scholarship: 'award', document: 'file-text', wallet: 'wallet', diploma: 'graduation', info: 'info' };

const NEWS_ICONS = { Académico: 'book-open', Institucional: 'building', 'Eventos/Jornadas': 'megaphone' };

const SEARCH_TYPES = {
  career: { label: 'Carrera', icon: 'graduation' },
  procedure: { label: 'Trámite', icon: 'file-text' },
  news: { label: 'Novedad', icon: 'newspaper' },
  event: { label: 'Calendario', icon: 'calendar' },
};

// Diapositivas por defecto si todavía no se cargaron desde el panel
const DEFAULT_SLIDES = [
  {
    eyebrow: 'Instituto de Educación Superior N° 11',
    title: 'Formando profesionales',
    highlight: 'con compromiso social',
    subtitle: 'Profesorados y tecnicaturas de nivel superior en Jujuy.',
    ctaText: 'Conocé la propuesta',
    ctaUrl: '#carreras',
  },
];

const state = {
  settings: null,
  careers: [],
  procedures: [],
  events: [],
  news: [],
  filters: { area: 'all', modality: 'all', shift: 'all' },
  calendarTab: 'mesa-ordinaria',
  showcaseTab: 'mision',
  newsTag: 'all',
  carousels: {},
};

/** Variante de arte de reemplazo según un índice (para dar variedad). */
const artClass = (i) => ['art', 'art art--2', 'art art--3'][Math.abs(i) % 3];

// ─── Estados de carga / vacío / error ────────────────────────────────
function renderStatus(container, { type, message, onRetry, compact = false }) {
  const cls = `state state--${type}${compact ? ' state--compact' : ''}`;
  if (type === 'loading') {
    container.innerHTML = `<div class="${cls}" role="status"><span class="spinner" aria-hidden="true"></span><p>${escapeHTML(message || 'Cargando…')}</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="${cls}" role="${type === 'error' ? 'alert' : 'status'}">
      ${icon(type === 'error' ? 'alert-triangle' : 'info')}
      <p>${escapeHTML(message)}</p>
      ${onRetry ? '<button type="button" class="btn btn--outline btn--sm" data-retry>Reintentar</button>' : ''}
    </div>`;
  if (onRetry) $('[data-retry]', container).addEventListener('click', onRetry, { once: true });
}

/** Ejecuta un loader mostrando spinner y, si falla, un estado de error con reintento. */
async function loadInto(container, label, loader) {
  renderStatus(container, { type: 'loading', message: `Cargando ${label}…` });
  try {
    await loader();
  } catch (err) {
    console.error(`[ies11] Error al cargar ${label}:`, err);
    renderStatus(container, {
      type: 'error',
      message: `No pudimos cargar ${label}. ${err.message || ''}`.trim(),
      onRetry: () => loadInto(container, label, loader),
    });
  }
}

const highlight = (el) => {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('is-highlighted');
  void el.offsetWidth; // reinicia la animación
  el.classList.add('is-highlighted');
  setTimeout(() => el.classList.remove('is-highlighted'), 2500);
};

// ─── Header, barra de perfiles y menú lateral ────────────────────────
function initNavigation() {
  const header = $('#siteHeader');
  const bar = $('#profileBar');

  // La barra de perfiles muestra logo + CTA cuando el header sale de pantalla
  new IntersectionObserver(([entry]) => bar.classList.toggle('is-stuck', !entry.isIntersecting)).observe(header);

  // Resalta el perfil/sección visible
  const links = $$('.profile-bar__link');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}` && !a.dataset.procedureIcon));
      });
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  ['carreras', 'tramites', 'calendario', 'institucional', 'novedades'].forEach((id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });

  // Menú lateral
  const drawer = $('#menuDrawer');
  $('#menuOpen').addEventListener('click', () => drawer.showModal());
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer || e.target.closest('[data-close-drawer]') || e.target.closest('a[href^="#"]')) drawer.close();
  });
}

// ─── Buscador rápido en vivo ─────────────────────────────────────────
function initSearch() {
  const form = $('#searchForm');
  const input = $('#searchInput');
  const box = $('#searchResults');
  let controller;
  let results = [];
  let activeIndex = -1;

  const open = () => {
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    box.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };

  const setActive = (index) => {
    const items = $$('.search__item', box);
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((el, i) => {
      el.classList.toggle('is-active', i === activeIndex);
      el.setAttribute('aria-selected', String(i === activeIndex));
    });
    input.setAttribute('aria-activedescendant', items[activeIndex].id);
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  };

  const render = (query) => {
    if (!results.length) {
      box.innerHTML = `<p class="search__empty">Sin resultados para “${escapeHTML(query)}”. Probá con otra palabra o consultá al asistente.</p>`;
      return;
    }
    box.innerHTML = results
      .map((r, i) => {
        const type = SEARCH_TYPES[r.type] || SEARCH_TYPES.news;
        const sub = [r.subtitle, r.date ? formatDate(r.date) : ''].filter(Boolean).join(' · ');
        return `
          <button type="button" class="search__item" id="search-opt-${i}" role="option" aria-selected="false" data-index="${i}">
            <span class="search__item-icon">${icon(type.icon)}</span>
            <span>
              <span class="search__type">${type.label}</span>
              <span class="search__title">${escapeHTML(r.title)}</span>
              ${sub ? `<span class="search__sub">${escapeHTML(sub)}</span>` : ''}
            </span>
          </button>`;
      })
      .join('');
  };

  const run = debounce(async (query) => {
    controller?.abort();
    if (query.length < 2) return close();

    controller = new AbortController();
    box.innerHTML = '<p class="search__empty">Buscando…</p>';
    open();
    try {
      ({ results } = await api.search(query, controller.signal));
      render(query);
    } catch (err) {
      if (err.name === 'AbortError') return;
      results = [];
      box.innerHTML = `<p class="search__empty">${escapeHTML(err.message)}</p>`;
    }
  }, 250);

  const choose = (index) => {
    const result = results[index];
    if (!result) return;
    close();
    input.blur();
    goToResult(result);
  };

  input.addEventListener('input', () => run(input.value.trim()));
  input.addEventListener('focus', () => results.length && input.value.trim().length >= 2 && open());
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    choose(activeIndex >= 0 ? activeIndex : 0);
  });
  box.addEventListener('click', (e) => {
    const item = e.target.closest('.search__item');
    if (item) choose(Number(item.dataset.index));
  });
  document.addEventListener('click', (e) => !form.contains(e.target) && close());
}

function goToResult({ type, id, category }) {
  switch (type) {
    case 'career':
      openCareerModal(id);
      break;
    case 'news':
      openNewsModal(id);
      break;
    case 'procedure':
      openProcedureModal(id);
      break;
    case 'event':
      if (category) setCalendarTab(category);
      requestAnimationFrame(() => highlight(document.getElementById(`evt-${id}`) || $('#calendario')));
      break;
    default:
      break;
  }
}

// ─── Carrusel principal (hero) ───────────────────────────────────────
const WAVES_SVG = (() => {
  const paths = Array.from({ length: 11 }, (_, i) => {
    const y = 250 + i * 12;
    return `<path d="M-120 ${y} C 220 ${110 + i * 24}, 640 ${560 - i * 20}, 1320 ${170 + i * 18}"/>`;
  }).join('');
  return `<svg class="hero-waves" viewBox="0 0 1200 560" preserveAspectRatio="none" aria-hidden="true" focusable="false">${paths}</svg>`;
})();

function slideHTML(s, i, total) {
  const href = safeUrl(s.ctaUrl, '#carreras');
  const media = s.imageUrl
    ? `<img src="${escapeHTML(safeUrl(s.imageUrl, ''))}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>`
    : `<div class="${artClass(i)}"></div>`;
  const emblem = s.imageUrl
    ? ''
    : `<div class="hero-emblem" aria-hidden="true">
         <span class="hero-emblem__ring"></span><span class="hero-emblem__ring"></span><span class="hero-emblem__ring"></span>
         <img src="/assets/logo-ies11.svg" alt="">
         <span class="hero-emblem__chip hero-emblem__chip--a">🎓 Profesorados</span>
         <span class="hero-emblem__chip hero-emblem__chip--b">💻 Tecnicaturas</span>
       </div>`;

  return `
    <article class="hero-slide${s.imageUrl ? '' : ' hero-slide--art'}" role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${total}">
      <div class="hero-slide__media">${media}</div>
      ${WAVES_SVG}
      ${emblem}
      <div class="hero-slide__content">
        ${s.eyebrow ? `<span class="hero-slide__eyebrow">${escapeHTML(s.eyebrow)}</span>` : ''}
        <h2 class="hero-slide__title">${escapeHTML(s.title)}${s.highlight ? ` <strong>${escapeHTML(s.highlight)}</strong>` : ''}</h2>
        ${s.subtitle ? `<p class="hero-slide__text">${escapeHTML(s.subtitle)}</p>` : ''}
        ${s.ctaText ? `<a class="btn btn--cta" href="${escapeHTML(href)}"${externalAttrs(href)}>${escapeHTML(s.ctaText)}</a>` : ''}
      </div>
    </article>`;
}

async function loadSlides() {
  let slides = [];
  try {
    ({ items: slides } = await api.slides());
  } catch (err) {
    console.error('[ies11] Error al cargar el carrusel:', err);
  }
  if (!slides.length) slides = DEFAULT_SLIDES;

  $('#heroTrack').innerHTML = slides.map((s, i) => slideHTML(s, i, slides.length)).join('');
  state.carousels.hero = createCarousel($('#heroCarousel'), { loop: true, autoplay: 7000, label: 'Diapositiva' });
}

// ─── Configuración: alerta, enlaces, institucional y footer ──────────
async function loadSettings() {
  try {
    state.settings = await api.settings();
  } catch (err) {
    console.error('[ies11] Error al cargar la configuración:', err);
    state.settings = null;
  }
  renderAlert(state.settings?.alert);
  applyPreinscriptionLinks(state.settings?.links?.preinscriptionUrl);
  renderShowcaseMedia();
  renderShowcase();
  renderContact(state.settings?.contact);
}

function renderAlert(alert) {
  const bar = $('#alertBar');
  if (!alert?.enabled || !alert.message) {
    bar.hidden = true;
    return;
  }
  const dismissKey = `ies11_alert_dismissed:${alert.message}`;
  if (storage.get(dismissKey, 'session')) return;

  bar.className = `alert-bar alert-bar--${alert.level || 'info'}`;
  $('.alert-bar__text', bar).textContent = alert.message;

  const link = $('.alert-bar__link', bar);
  const href = safeUrl(alert.linkUrl, '');
  link.hidden = !(alert.linkText && href);
  if (!link.hidden) {
    link.textContent = `${alert.linkText} →`;
    link.href = href;
  }

  bar.hidden = false;
  $('.alert-bar__close', bar).addEventListener(
    'click',
    () => {
      bar.hidden = true;
      storage.set(dismissKey, '1', 'session');
    },
    { once: true }
  );
}

function applyPreinscriptionLinks(url) {
  const href = safeUrl(url, '#carreras');
  $$('[data-preinscription]').forEach((a) => {
    a.href = href;
    if (/^https?:/i.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });
}

function renderContact(contact) {
  contact = contact || {};
  const items = [];
  if (contact.address) items.push(`<li>${icon('map-pin')}<span>${escapeHTML(contact.address)}${contact.mapUrl ? ` · <a href="${escapeHTML(safeUrl(contact.mapUrl))}"${externalAttrs(contact.mapUrl)}>Ver mapa</a>` : ''}</span></li>`);
  if (contact.phone) items.push(`<li>${icon('phone')}<a href="tel:${escapeHTML(contact.phone.replace(/[^\d+]/g, ''))}">${escapeHTML(contact.phone)}</a></li>`);
  if (contact.email) items.push(`<li>${icon('mail')}<a href="mailto:${escapeHTML(contact.email)}">${escapeHTML(contact.email)}</a></li>`);
  items.push(`<li>${icon('clock')}<span>${escapeHTML(contact.bedeliaHours || 'Consultá los horarios en Bedelía.')}</span></li>`);
  $('#footerContact').innerHTML = items.join('');

  const wa = whatsappUrl(contact.whatsapp);
  const fab = $('#fabWhatsapp');
  fab.hidden = !wa;
  if (wa) fab.href = wa;

  const social = [
    ['facebookUrl', 'facebook', 'Facebook'],
    ['instagramUrl', 'instagram', 'Instagram'],
  ]
    .filter(([key]) => contact[key])
    .map(([key, name, label]) => `<a href="${escapeHTML(safeUrl(contact[key]))}" target="_blank" rel="noopener noreferrer" aria-label="${label} del IES N° 11">${icon(name)}</a>`);
  if (wa) social.push(`<a href="${wa}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp del IES N° 11">${icon('whatsapp')}</a>`);
  $('#footerSocial').innerHTML = social.join('');
}

// ─── Panel institucional (estilo "Sedes y centros") ──────────────────
function renderShowcaseMedia() {
  const img = state.settings?.institutional?.imageUrl;
  $('#showcaseMedia').innerHTML = img
    ? `<img src="${escapeHTML(safeUrl(img, ''))}" alt="Edificio del IES N° 11" loading="lazy">`
    : `<div class="art art--3"><div class="art__stack"><img class="art__logo" src="/assets/logo-ies11.svg" alt=""><p class="art__caption">Formando profesionales<br>con compromiso social</p></div></div>`;
}

function renderShowcase() {
  const panel = $('#showcasePanel');
  const inst = state.settings?.institutional || {};
  const contact = state.settings?.contact || {};
  const fallback = 'Información en actualización.';

  const views = {
    mision: () => `<h3 class="showcase__title">Misión</h3><p class="showcase__text">${escapeHTML(inst.mission || fallback)}</p>`,
    vision: () => `<h3 class="showcase__title">Visión</h3><p class="showcase__text">${escapeHTML(inst.vision || fallback)}</p>`,
    autoridades: () =>
      `<h3 class="showcase__title">Autoridades</h3>${
        inst.authorities?.length
          ? `<ul class="showcase__list">${inst.authorities.map((a) => `<li><small>${escapeHTML(a.role)}</small><strong>${escapeHTML(a.name)}</strong></li>`).join('')}</ul>`
          : `<p class="showcase__text">${fallback}</p>`
      }`,
    bedelia: () => {
      const rows = [
        ['Horarios', contact.bedeliaHours],
        ['Dirección', contact.address],
        ['Teléfono', contact.phone],
        ['Email', contact.email],
      ].filter(([, v]) => v);
      return `<h3 class="showcase__title">Bedelía</h3>${
        rows.length
          ? `<ul class="showcase__list">${rows.map(([k, v]) => `<li><small>${k}</small><strong>${escapeHTML(v)}</strong></li>`).join('')}</ul>`
          : `<p class="showcase__text">${fallback}</p>`
      }`;
    },
  };

  panel.innerHTML = (views[state.showcaseTab] || views.mision)();
}

function setShowcaseTab(tab, { focus = false } = {}) {
  state.showcaseTab = tab;
  $$('.showcase__tab').forEach((btn) => {
    const selected = btn.dataset.showcase === tab;
    btn.setAttribute('aria-selected', String(selected));
    btn.tabIndex = selected ? 0 : -1;
    if (selected) {
      $('#showcasePanel').setAttribute('aria-labelledby', btn.id);
      if (focus) btn.focus();
    }
  });
  renderShowcase();
}

function initShowcase() {
  initTablist($$('.showcase__tab'), (btn, opts) => setShowcaseTab(btn.dataset.showcase, opts));
  $$('[data-showcase-open]').forEach((a) => a.addEventListener('click', () => setShowcaseTab(a.dataset.showcaseOpen)));
}

/** Navegación por teclado estándar para role="tablist" (flechas, Inicio, Fin). */
function initTablist(tabs, select) {
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const moves = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      select(tabs[(moves[e.key] + tabs.length) % tabs.length], { focus: true });
    });
  });
}

// ─── Trámites ────────────────────────────────────────────────────────
function procedureCard(p) {
  const open = p.status === 'abierto';
  return `
    <article class="proc-card" id="proc-${escapeHTML(p._id)}">
      <div class="proc-card__head">
        <span class="proc-card__icon">${icon(PROCEDURE_ICONS[p.icon] || 'info')}</span>
        <span class="badge ${open ? 'badge--open' : 'badge--closed'}">${open ? 'Abierto' : 'Cerrado'}</span>
      </div>
      <h3 class="proc-card__title">${escapeHTML(p.title)}</h3>
      <p class="proc-card__text">${escapeHTML(p.description)}</p>
      ${p.schedule ? `<p class="proc-card__meta">${icon('clock')}${escapeHTML(p.schedule)}</p>` : ''}
      <div class="proc-card__actions">
        <button type="button" class="link-chevron" data-procedure-id="${escapeHTML(p._id)}">Ver requisitos ${icon('chevron-right')}</button>
        ${p.downloadUrl ? `<a class="link-chevron" href="${escapeHTML(safeUrl(p.downloadUrl))}"${externalAttrs(p.downloadUrl)}>${icon('download')} Descargar</a>` : ''}
      </div>
    </article>`;
}

function loadProcedures() {
  const grid = $('#proceduresGrid');
  return loadInto(grid, 'los trámites', async () => {
    const { items } = await api.procedures();
    state.procedures = items;
    if (!items.length) return renderStatus(grid, { type: 'empty', message: 'No hay trámites publicados por el momento.' });
    grid.innerHTML = items.map(procedureCard).join('');
  });
}

function openProcedureModal(id) {
  const p = state.procedures.find((x) => x._id === id);
  if (!p) return highlight($('#tramites'));
  const open = p.status === 'abierto';
  openModal(`
    <div class="modal__hero">
      <div class="art art--2">${icon(PROCEDURE_ICONS[p.icon] || 'info')}</div>
      <div class="modal__hero-content">
        <span class="badge ${open ? 'badge--open' : 'badge--closed'}">${open ? 'Abierto' : 'Cerrado'}</span>
        <h2 id="modalTitle">${escapeHTML(p.title)}</h2>
      </div>
    </div>
    <div class="modal__body">
      <p>${escapeHTML(p.description)}</p>
      ${p.schedule ? `<p class="proc-card__meta">${icon('clock')}${escapeHTML(p.schedule)}</p>` : ''}
      <h3 class="mt-5">Requisitos</h3>
      ${
        p.requirements?.length
          ? `<ul class="check-list">${p.requirements.map((r) => `<li>${icon('check')}<span>${escapeHTML(r)}</span></li>`).join('')}</ul>`
          : '<p class="muted">Consultá los requisitos en Bedelía.</p>'
      }
      <div class="modal__actions">
        ${p.downloadUrl ? `<a class="btn btn--brand" href="${escapeHTML(safeUrl(p.downloadUrl))}"${externalAttrs(p.downloadUrl)}>${icon('download')}${escapeHTML(p.downloadLabel || 'Descargar requisitos')}</a>` : ''}
        <button type="button" class="btn btn--outline" data-open-chat-modal>${icon('bot')}Consultar al asistente</button>
      </div>
    </div>`);
}

function initProcedures() {
  $('#proceduresGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-procedure-id]');
    if (btn) openProcedureModal(btn.dataset.procedureId);
  });

  // Accesos rápidos que abren un trámite concreto (ej: "Boleto BEGU")
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-procedure-icon]');
    if (!link) return;
    const p = state.procedures.find((x) => x.icon === link.dataset.procedureIcon);
    if (p) {
      e.preventDefault();
      openProcedureModal(p._id);
    }
  });
}

// ─── Áreas y carreras ────────────────────────────────────────────────
function areaIcon(area) {
  const a = normalize(area);
  if (/docen|profesor|educa/.test(a)) return 'presentation';
  if (/tecno|software|informat|sistema/.test(a)) return 'dashboard';
  if (/salud|enfermer/.test(a)) return 'award';
  return 'graduation';
}

function groupAreas() {
  const map = new Map();
  state.careers.forEach((c) => {
    const area = c.area || 'Otras carreras';
    if (!map.has(area)) map.set(area, []);
    map.get(area).push(c);
  });
  return [...map].map(([name, list]) => ({ name, list, image: list.find((c) => c.imageUrl)?.imageUrl }));
}

function areaCard(area, i) {
  const modalities = [...new Set(area.list.map((c) => c.modality))].join(' · ');
  return `
    <article class="area-card">
      <div class="area-card__media">
        ${area.image ? `<img src="${escapeHTML(safeUrl(area.image, ''))}" alt="" loading="lazy">` : `<div class="${artClass(i)}">${icon(areaIcon(area.name))}</div>`}
      </div>
      <div class="area-card__body">
        <h3 class="area-card__title">${escapeHTML(area.name)}</h3>
        <p class="area-card__text">${area.list.length} ${area.list.length === 1 ? 'carrera' : 'carreras'} · ${escapeHTML(modalities)}</p>
        <button type="button" class="link-chevron" data-area="${escapeHTML(area.name)}">Ver carreras de ${escapeHTML(area.name)} ${icon('chevron-right')}</button>
      </div>
    </article>`;
}

function renderAreas() {
  const track = $('#areasTrack');
  const areas = groupAreas();
  if (!areas.length) {
    renderStatus(track, { type: 'empty', message: 'La oferta académica se publicará próximamente.' });
  } else {
    track.innerHTML = areas.map(areaCard).join('');
  }
  $('#filterArea').innerHTML =
    '<option value="all">Todas las áreas</option>' +
    areas.map((a) => `<option value="${escapeHTML(a.name)}">${escapeHTML(a.name)}</option>`).join('');
  state.carousels.areas?.refresh();
}

function careerCard(c, i) {
  const shifts = c.shifts?.length ? c.shifts.join(' / ') : 'A confirmar';
  return `
    <article class="career-card">
      <div class="career-card__media">
        ${c.area ? `<span class="career-card__area">${escapeHTML(c.area)}</span>` : ''}
        ${c.imageUrl ? `<img src="${escapeHTML(safeUrl(c.imageUrl, ''))}" alt="" loading="lazy">` : `<div class="${artClass(i)}">${icon(areaIcon(c.area || ''))}</div>`}
      </div>
      <div class="career-card__body">
        <h3 class="career-card__title">${escapeHTML(c.name)}</h3>
        <p class="career-card__degree">Título: ${escapeHTML(c.degree)}</p>
        <ul class="meta-list">
          <li>${icon('clock')}${escapeHTML(c.durationYears)} ${c.durationYears === 1 ? 'año' : 'años'}</li>
          <li>${icon('building')}${escapeHTML(c.modality)}</li>
          <li>${icon('calendar')}${escapeHTML(shifts)}</li>
        </ul>
        <div class="career-card__actions">
          <button type="button" class="link-chevron" data-career-id="${escapeHTML(c._id)}">Ver detalle ${icon('chevron-right')}</button>
          ${c.studyPlanUrl ? `<a class="link-chevron" href="${escapeHTML(safeUrl(c.studyPlanUrl))}"${externalAttrs(c.studyPlanUrl)}>${icon('download')} Plan de estudio</a>` : ''}
        </div>
      </div>
    </article>`;
}

function renderCareers() {
  const grid = $('#careersGrid');
  const { area, modality, shift } = state.filters;
  const list = state.careers.filter(
    (c) =>
      (area === 'all' || (c.area || 'Otras carreras') === area) &&
      (modality === 'all' || c.modality === modality) &&
      (shift === 'all' || c.shifts?.includes(shift))
  );

  $('#careersCount').textContent = `${list.length} ${list.length === 1 ? 'carrera' : 'carreras'}`;
  $('#filtersReset').hidden = area === 'all' && modality === 'all' && shift === 'all';

  if (!list.length) {
    renderStatus(grid, {
      type: 'empty',
      message: state.careers.length ? 'No hay carreras con esa combinación de filtros. Probá con otra.' : 'La oferta académica se publicará próximamente.',
    });
    return;
  }
  grid.innerHTML = list.map(careerCard).join('');
}

function loadCareers() {
  const grid = $('#careersGrid');
  return loadInto(grid, 'la oferta académica', async () => {
    const { items } = await api.careers();
    state.careers = items;
    renderAreas();
    renderCareers();
  });
}

function setFilter(name, value) {
  state.filters[name] = value;
  $(`#filter${name[0].toUpperCase()}${name.slice(1)}`).value = value;
  renderCareers();
}

function initCareers() {
  state.carousels.areas = createCarousel($('#areasCarousel'), { label: 'Grupo de áreas' });

  ['area', 'modality', 'shift'].forEach((name) => {
    $(`#filter${name[0].toUpperCase()}${name.slice(1)}`).addEventListener('change', (e) => setFilter(name, e.target.value));
  });
  $('#filtersReset').addEventListener('click', () => ['area', 'modality', 'shift'].forEach((n) => setFilter(n, 'all')));

  $('#areasTrack').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-area]');
    if (!btn) return;
    setFilter('area', btn.dataset.area);
    $('#careersList').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#careersGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-career-id]');
    if (btn) openCareerModal(btn.dataset.careerId);
  });
}

async function openCareerModal(id) {
  let career = state.careers.find((c) => c._id === id);
  if (!career) {
    try {
      ({ item: career } = await api.career(id));
    } catch (err) {
      return openModal(`<div class="modal__body"><h2 id="modalTitle">No encontramos la carrera</h2><p>${escapeHTML(err.message)}</p></div>`);
    }
  }

  const shifts = career.shifts?.length ? career.shifts.join(', ') : 'A confirmar';
  const preinscription = safeUrl(state.settings?.links?.preinscriptionUrl, '#carreras');
  openModal(`
    <div class="modal__hero">
      ${career.imageUrl ? `<img src="${escapeHTML(safeUrl(career.imageUrl, ''))}" alt="">` : `<div class="art">${icon(areaIcon(career.area || ''))}</div>`}
      <div class="modal__hero-content">
        ${career.area ? `<span class="tag tag--light">${escapeHTML(career.area)}</span>` : ''}
        <h2 id="modalTitle">${escapeHTML(career.name)}</h2>
      </div>
    </div>
    <div class="modal__body">
      <ul class="meta-list">
        <li>${icon('award')}${escapeHTML(career.degree)}</li>
        <li>${icon('clock')}${escapeHTML(career.durationYears)} ${career.durationYears === 1 ? 'año' : 'años'}</li>
        <li>${icon('building')}${escapeHTML(career.modality)}</li>
        <li>${icon('calendar')}Turno: ${escapeHTML(shifts)}</li>
      </ul>
      ${career.description ? `<p class="prose mt-5">${escapeHTML(career.description)}</p>` : ''}
      <div class="modal__actions">
        <a class="btn btn--cta" href="${escapeHTML(preinscription)}"${externalAttrs(preinscription)} data-close-modal>Preinscribirme</a>
        ${career.studyPlanUrl ? `<a class="btn btn--outline" href="${escapeHTML(safeUrl(career.studyPlanUrl))}"${externalAttrs(career.studyPlanUrl)}>${icon('download')}Plan de estudio</a>` : ''}
        ${
          career.cursilloUrl
            ? `<a class="btn btn--outline" href="${escapeHTML(safeUrl(career.cursilloUrl))}"${externalAttrs(career.cursilloUrl)}>${icon('calendar')}Cursillo de ingreso</a>`
            : `<a class="btn btn--outline" href="#calendario" data-close-modal data-calendar-tab="cursillo">${icon('calendar')}Fechas de cursillo</a>`
        }
      </div>
    </div>`);
}

// ─── Calendario académico ────────────────────────────────────────────
function eventItem(e) {
  const { day, month, weekday } = dateParts(e.date);
  const status = EVENT_STATUS[e.status] || EVENT_STATUS.programado;
  const meta = [
    `<li>${icon('calendar')}${escapeHTML(formatRange(e.date, e.endDate))}</li>`,
    e.shift ? `<li>${icon('clock')}${escapeHTML(e.shift === 'Todo el día' ? e.shift : `Turno ${e.shift}`)}</li>` : '',
    e.career ? `<li>${icon('graduation')}${escapeHTML(e.career)}</li>` : '',
    e.location ? `<li>${icon('map-pin')}${escapeHTML(e.location)}</li>` : '',
  ].join('');

  return `
    <li class="timeline__item" id="evt-${escapeHTML(e._id)}">
      <div class="timeline__date" aria-hidden="true">
        <span class="timeline__weekday">${escapeHTML(weekday)}</span>
        <span class="timeline__day">${escapeHTML(day)}</span>
        <span class="timeline__month">${escapeHTML(month)}</span>
      </div>
      <div>
        <div class="timeline__top">
          <h3 class="timeline__title">${escapeHTML(e.title)}</h3>
          <span class="badge ${status.badge}">${status.label}</span>
        </div>
        <ul class="timeline__meta">${meta}</ul>
        ${e.description ? `<p class="timeline__desc">${escapeHTML(e.description)}</p>` : ''}
      </div>
    </li>`;
}

function renderCalendar() {
  const panel = $('#calendarPanel');
  const items = state.events.filter((e) => e.category === state.calendarTab);
  if (!items.length) {
    renderStatus(panel, { type: 'empty', message: `No hay fechas próximas cargadas en “${CALENDAR_CATEGORIES[state.calendarTab]}”.` });
    return;
  }
  panel.innerHTML = `<ol class="timeline">${items.map(eventItem).join('')}</ol>`;
}

function setCalendarTab(category, { focus = false } = {}) {
  if (!CALENDAR_CATEGORIES[category]) return;
  state.calendarTab = category;
  $$('.tab[role="tab"]').forEach((tab) => {
    const selected = tab.dataset.category === category;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) {
      $('#calendarPanel').setAttribute('aria-labelledby', tab.id);
      if (focus) tab.focus();
    }
  });
  renderCalendar();
}

function initCalendar() {
  initTablist($$('.tab[role="tab"]'), (tab, opts) => setCalendarTab(tab.dataset.category, opts));

  // Enlaces que abren una pestaña concreta (ej: "Ver mesas de examen")
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-calendar-tab]');
    if (link) setCalendarTab(link.dataset.calendarTab);
  });
}

function loadCalendar() {
  const panel = $('#calendarPanel');
  return loadInto(panel, 'el calendario', async () => {
    const { items } = await api.calendar();
    state.events = items;
    $$('[data-count]').forEach((el) => {
      el.textContent = state.events.filter((e) => e.category === el.dataset.count).length;
    });
    renderCalendar();
  });
}

// ─── Novedades ───────────────────────────────────────────────────────
function newsCard(n, i) {
  return `
    <button type="button" class="news-card" data-news-id="${escapeHTML(n._id)}">
      <span class="news-card__media">
        ${n.imageUrl ? `<img src="${escapeHTML(safeUrl(n.imageUrl, ''))}" alt="" loading="lazy">` : `<span class="${artClass(i)}">${icon(NEWS_ICONS[n.category] || 'newspaper')}</span>`}
      </span>
      <span class="tag tag--light news-card__tag">${escapeHTML(n.category)}</span>
      <span class="news-card__body">
        <time class="news-card__date" datetime="${escapeHTML(n.date)}">${escapeHTML(formatDate(n.date))}</time>
        <span class="news-card__title">${escapeHTML(n.title)}</span>
      </span>
    </button>`;
}

function renderNews() {
  const track = $('#newsTrack');
  const list = state.news.filter((n) => state.newsTag === 'all' || n.category === state.newsTag);
  if (!list.length) {
    renderStatus(track, { type: 'empty', message: 'No hay novedades en esta categoría por ahora.' });
  } else {
    track.innerHTML = list.map(newsCard).join('');
    track.scrollLeft = 0;
  }
  state.carousels.news?.refresh();
}

function loadNews() {
  const track = $('#newsTrack');
  return loadInto(track, 'las novedades', async () => {
    const { items } = await api.news({ limit: 12 });
    state.news = items;
    renderNews();
  });
}

function initNews() {
  const carousel = $('#newsCarousel');
  state.carousels.news = createCarousel(carousel, { label: 'Grupo de novedades' });

  $$('[data-news-tag]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.newsTag = chip.dataset.newsTag;
      $$('[data-news-tag]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      renderNews();
    });
  });

  const toggle = $('#newsToggle');
  toggle.addEventListener('click', () => {
    const grid = !carousel.classList.contains('is-grid');
    carousel.classList.toggle('is-grid', grid);
    toggle.setAttribute('aria-pressed', String(grid));
    toggle.textContent = grid ? 'Ver menos' : 'Ver todas las novedades';
    if (!grid) state.carousels.news.refresh();
  });

  $('#newsTrack').addEventListener('click', (e) => {
    const card = e.target.closest('[data-news-id]');
    if (card) openNewsModal(card.dataset.newsId);
  });
}

async function openNewsModal(id) {
  let item = state.news.find((n) => n._id === id);
  if (!item) {
    try {
      ({ item } = await api.newsItem(id));
    } catch (err) {
      return openModal(`<div class="modal__body"><h2 id="modalTitle">No encontramos la noticia</h2><p>${escapeHTML(err.message)}</p></div>`);
    }
  }
  openModal(`
    <div class="modal__hero">
      ${item.imageUrl ? `<img src="${escapeHTML(safeUrl(item.imageUrl, ''))}" alt="">` : `<div class="art art--2">${icon(NEWS_ICONS[item.category] || 'newspaper')}</div>`}
      <div class="modal__hero-content">
        <span class="tag tag--light">${escapeHTML(item.category)}</span>
        <h2 id="modalTitle">${escapeHTML(item.title)}</h2>
      </div>
    </div>
    <div class="modal__body">
      <p class="muted"><time datetime="${escapeHTML(item.date)}">${escapeHTML(formatDate(item.date))}</time></p>
      <p><strong>${escapeHTML(item.summary)}</strong></p>
      ${item.content ? `<p class="prose">${escapeHTML(item.content)}</p>` : ''}
    </div>`);
}

// ─── Modal ───────────────────────────────────────────────────────────
function openModal(html) {
  const modal = $('#modal');
  $('#modalContent').innerHTML = html;
  if (!modal.open) modal.showModal();
  $('.modal__close', modal).focus();
}

function initModal() {
  const modal = $('#modal');
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-chat-modal]')) {
      modal.close();
      $('#chatToggle').click();
      return;
    }
    // Click en el backdrop o en un elemento marcado para cerrar
    if (e.target === modal || e.target.closest('[data-close-modal]')) modal.close();
  });
  modal.addEventListener('close', () => {
    $('#modalContent').innerHTML = '';
  });
}

// ─── Inicio ──────────────────────────────────────────────────────────
function init() {
  hydrateIcons();
  $('#year').textContent = new Date().getFullYear();

  initNavigation();
  initSearch();
  initCareers();
  initProcedures();
  initCalendar();
  initShowcase();
  initNews();
  initModal();
  initChatbot();

  Promise.allSettled([loadSettings(), loadSlides(), loadProcedures(), loadCareers(), loadCalendar(), loadNews()]);
}

init();
