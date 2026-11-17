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
import { parseSocialVideo, NETWORK_LABELS } from './embeds.js';
import {
  $,
  $$,
  escapeHTML,
  safeUrl,
  isExternalUrl,
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
// Keep in sync with CATEGORIES in models/CalendarEvent.js. Colors live in components.css (.cat-*).
const CALENDAR_CATEGORIES = {
  inscripcion: 'Inscripciones',
  'inicio-clases': 'Inicio de clases',
  'mesa-ordinaria': 'Mesas Ordinarias',
  'mesa-extraordinaria': 'Mesas Extraordinarias',
  cursillo: 'Cursillos e Inscripción',
  evento: 'Eventos',
  capacitacion: 'Capacitaciones',
  feriado: 'Feriados e Inasistencias',
  'fecha-importante': 'Fechas importantes',
};

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_FMT = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
/** "YYYY-MM-DD" of a calendar date (stored as UTC midnight). */
const dayKey = (value) => new Date(value).toISOString().slice(0, 10);
const todayKey = () => {
  const now = new Date();
  return dayKey(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
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
    subtitle: 'Tecnicaturas superiores con título oficial en Jujuy.',
    ctaText: 'Conocé la propuesta',
    ctaUrl: '#carreras',
  },
];

const state = {
  settings: null,
  careers: [],
  procedures: [],
  events: [],
  examBoards: [],
  examCareer: 'all',
  news: [],
  slides: [],
  testimonials: [],
  filters: { area: 'all', modality: 'all', shift: 'all' },
  calendarTab: 'all', // category filter ('all' or a CALENDAR_CATEGORIES key)
  calendarView: 'month', // 'month' | 'list'
  calendarMonth: null, // UTC timestamp of the first day of the visible month
  calendarDay: null, // selected "YYYY-MM-DD" in month view
  heroObserver: null,
  gallery: [],
  galleryTag: 'all',
  galleryAll: false,
  showcaseTab: 'mision',
  newsTag: 'all',
  carousels: {},
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  showPageOf(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('is-highlighted');
  void el.offsetWidth; // reinicia la animación
  el.classList.add('is-highlighted');
  setTimeout(() => el.classList.remove('is-highlighted'), 2500);
};

// ─── Páginas del portal (rutas del lado del cliente) ─────────────────
// Every route serves the same index.html; each block of <main> lists in data-page the pages it belongs to.
// Off-page blocks get [data-off-page] (never `hidden`, which several sections toggle from their own data).
const PAGES = {
  home: { path: '/' },
  ingresantes: {
    path: '/ingresantes',
    label: 'Ingresantes',
    icon: 'user-plus',
    title: 'Quiero estudiar en el IES N° 11',
    lead: 'Conocé las carreras, cómo preinscribirte y lo que cuentan quienes ya estudiaron acá.',
  },
  estudiantes: {
    path: '/estudiantes',
    label: 'Estudiantes',
    icon: 'users',
    title: 'Tu cursada, al día',
    lead: 'Trámites, calendario académico y mesas de examen en un solo lugar.',
  },
  institucional: {
    path: '/institucional',
    label: 'Institucional',
    icon: 'building',
    title: 'Conocé el IES N° 11',
    lead: 'Nuestra misión, quiénes conducen el Instituto, Bedelía y la vida de todos los días.',
  },
  novedades: {
    path: '/novedades',
    label: 'Novedades',
    icon: 'newspaper',
    title: 'Novedades del Instituto',
    lead: 'Anuncios, jornadas y todo lo que está pasando en el IES N° 11.',
  },
  contacto: {
    path: '/contacto',
    label: 'Contacto',
    icon: 'mail',
    title: 'Hablemos',
    lead: 'Escribinos tu consulta, encontranos en el mapa o seguinos en redes.',
  },
};

const DEFAULT_TITLE = document.title;
const router = { enabled: false, page: null, pendingTarget: null };

const normalizePath = (path) => path.replace(/\/+$/, '') || '/';
const pageByPath = (path) => Object.keys(PAGES).find((key) => PAGES[key].path === normalizePath(path)) || null;
const blockPages = (el) => el.dataset.page.split(/\s+/);

/** Page that holds an element; null when it is global (header, footer, dialogs) or routing is off. */
function pageOf(el) {
  const block = el?.closest?.('main [data-page]');
  if (!block) return null;
  const pages = blockPages(block);
  return pages.includes(router.page) ? router.page : pages[0];
}

const targetOf = (hash) => {
  if (!hash || hash === '#') return null;
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
};

function renderPageIntro(meta) {
  if (!meta.label) return;
  $('#pageIntroCrumb').textContent = meta.label;
  $('#pageIntroIcon').innerHTML = icon(meta.icon);
  $('#pageIntroTitle').textContent = meta.title;
  $('#pageIntroLead').textContent = meta.lead;
}

function renderPage(page) {
  router.page = page;
  const meta = PAGES[page];
  $$('main [data-page]').forEach((block) => block.toggleAttribute('data-off-page', !blockPages(block).includes(page)));
  document.documentElement.dataset.currentPage = page;
  document.title = meta.label ? `${meta.label} · IES N° 11` : DEFAULT_TITLE;
  renderPageIntro(meta);
  setActiveNav();
  // Carousels measured while hidden need their pages recalculated
  requestAnimationFrame(() => Object.values(state.carousels).forEach((c) => c?.refresh()));
}

function animatePage() {
  if (prefersReducedMotion()) return;
  const main = $('#contenido');
  main.classList.remove('is-page-entering');
  void main.offsetWidth; // restarts the animation
  main.classList.add('is-page-entering');
}

/** Scrolls to a section of the current page; the first block of a page (or no target) goes to the top. */
function scrollToTarget(target, { smooth = false } = {}) {
  const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'instant';
  const visible = target && target !== document.body && target.getClientRects().length > 0;
  const first = $$('main [data-page]:not([data-off-page]):not(.page-intro)').find((el) => !el.hidden);
  if (!visible || (!smooth && target === first)) return window.scrollTo({ top: 0, behavior });
  target.scrollIntoView({ behavior, block: 'start' });
}

/** Switches page (History API) and scrolls to the URL's hash target. */
function navigate(url, { scroll = true } = {}) {
  const page = pageByPath(url.pathname) || 'home';
  const changed = page !== router.page;
  const href = `${PAGES[page].path}${url.search}${url.hash}`;
  if (href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    history.replaceState({ ...history.state, scrollY: window.scrollY }, '');
    history.pushState({ page }, '', href);
  }
  router.pendingTarget = null;
  if (changed) {
    renderPage(page);
    animatePage();
  }
  if (scroll) scrollToTarget(targetOf(url.hash), { smooth: !changed });
}

/** Before scrolling to an element (search results, preview of a modal fallback), shows its page. */
function showPageOf(el) {
  if (!router.enabled) return;
  const page = pageOf(el);
  if (page && page !== router.page) navigate(new URL(PAGES[page].path, window.location.origin), { scroll: false });
}

/** URL the router handles for an <a href>, or null to let the browser act. */
function routedUrl(href) {
  if (!href || href === '#') return null;
  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (href.startsWith('#')) {
    // In-page anchor: go to the page that holds the id (same page → native jump keeps focus behaviour)
    const page = pageOf(targetOf(url.hash));
    if (!page || page === router.page) return null;
    url.pathname = PAGES[page].path;
    return url;
  }
  return pageByPath(url.pathname) ? url : null;
}

function onRouteClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest('a[href]');
  if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
  const url = routedUrl(link.getAttribute('href'));
  if (!url) return;
  e.preventDefault();
  navigate(url);
}

function onPopState(e) {
  const page = pageByPath(window.location.pathname) || 'home';
  const changed = page !== router.page;
  if (changed) {
    renderPage(page);
    animatePage();
  } else if (!e.state) {
    return setActiveNav(); // native jump to an in-page anchor: the browser already scrolls
  }
  const y = e.state?.scrollY;
  if (typeof y === 'number') window.scrollTo({ top: y, behavior: 'instant' });
  else scrollToTarget(targetOf(window.location.hash));
}

function initRouter() {
  if (IS_PREVIEW) return; // the admin preview keeps every section visible
  router.enabled = true;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let page = pageByPath(window.location.pathname) || 'home';
  const target = targetOf(window.location.hash);
  // Old one-page links (/#calendario) land on the page that now holds that section
  const holder = pageOf(target);
  if (page === 'home' && holder && holder !== 'home') {
    page = holder;
    history.replaceState(null, '', `${PAGES[page].path}${window.location.search}${window.location.hash}`);
  }
  renderPage(page);
  if (target) {
    router.pendingTarget = target;
    requestAnimationFrame(() => scrollToTarget(target));
    // Content loads asynchronously and pushes the target down: re-aim once unless the user already moved
    const cancel = () => (router.pendingTarget = null);
    ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach((type) => window.addEventListener(type, cancel, { once: true, passive: true }));
  }
  window.addEventListener('popstate', onPopState);
}

/** After the first data load, scrolls again to the URL's hash target (layout shifted while loading). */
function settleInitialScroll() {
  if (router.pendingTarget) scrollToTarget(router.pendingTarget);
  router.pendingTarget = null;
}

// ─── Header, barra de perfiles y menú lateral ────────────────────────
/** Marks the nav item of the current page (and, inside it, of the visible section when given). */
function setActiveNav(sectionId) {
  const hash = sectionId ? `#${sectionId}` : window.location.hash;
  // The profile bar and the drawer each keep their own active item
  [$$('.profile-bar__link'), $$('.drawer__nav a')].forEach((group) => {
    const links = group
      .filter((a) => !a.dataset.procedureIcon)
      .map((a) => ({ a, url: new URL(a.getAttribute('href'), window.location.origin) }));
    let active;
    if (router.enabled) {
      const own = links.filter(({ url }) => pageByPath(url.pathname) === router.page);
      active = own.find(({ url }) => hash && url.hash === hash) || own.find(({ url }) => !url.hash) || own[0];
    } else {
      active = sectionId ? links.find(({ url }) => url.hash === hash) : null;
    }
    group.forEach((a) => {
      const on = active?.a === a;
      a.classList.toggle('is-active', on);
      if (on && router.enabled) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  });
}

function initNavigation() {
  const header = $('#siteHeader');
  const bar = $('#profileBar');

  // La barra de perfiles muestra logo + CTA cuando el header sale de pantalla
  new IntersectionObserver(([entry]) => bar.classList.toggle('is-stuck', !entry.isIntersecting)).observe(header);

  // Resalta, dentro de la página actual, la sección visible (las de otras páginas no se intersectan)
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.isIntersecting && setActiveNav(entry.target.id)),
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
    if (e.target === drawer || e.target.closest('[data-close-drawer]') || e.target.closest('a[href]')) drawer.close();
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
         <span class="hero-emblem__chip hero-emblem__chip--a">🎓 Tecnicaturas</span>
         <span class="hero-emblem__chip hero-emblem__chip--b">📜 Título oficial</span>
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
  state.slides = slides;

  $('#heroTrack').innerHTML = slides.map((s, i) => slideHTML(s, i, slides.length)).join('');
  watchHeroSlides();
  state.carousels.hero = createCarousel($('#heroCarousel'), { loop: true, autoplay: 7000, label: 'Diapositiva' });
}

/** Marks the visible slide with .is-active so its headline and photo animate in. */
function watchHeroSlides() {
  const track = $('#heroTrack');
  const slides = $$('.hero-slide', track);
  state.heroObserver?.disconnect();
  slides[0]?.classList.add('is-active');
  if (!('IntersectionObserver' in window)) return;
  state.heroObserver = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.target.classList.toggle('is-active', entry.isIntersecting)),
    { root: track, threshold: 0.6 }
  );
  slides.forEach((slide) => state.heroObserver.observe(slide));
}

/**
 * Hero depth: layers follow the pointer (photo, emblem, waves, glow) through CSS
 * custom properties updated at most once per frame. Off for touch, reduced motion and preview.
 */
function initHeroMotion() {
  if (IS_PREVIEW || prefersReducedMotion()) return;
  $('.hero').classList.add('is-animated');
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const viewport = $('.hero__viewport');
  let frame = 0;
  let px = 0.5;
  let py = 0.5;
  const apply = () => {
    frame = 0;
    viewport.style.setProperty('--mx', (px * 2 - 1).toFixed(3));
    viewport.style.setProperty('--my', (py * 2 - 1).toFixed(3));
    viewport.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
    viewport.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
  };
  viewport.addEventListener(
    'pointermove',
    (e) => {
      const rect = viewport.getBoundingClientRect();
      px = (e.clientX - rect.left) / rect.width;
      py = (e.clientY - rect.top) / rect.height;
      frame ||= requestAnimationFrame(apply);
    },
    { passive: true }
  );
  viewport.addEventListener('pointerleave', () => {
    px = 0.5;
    py = 0.5;
    frame ||= requestAnimationFrame(apply);
  });
}

/** "hoy", "mañana", "en 5 días" or "en curso" for the hero's next-date card. */
function relativeDay(e) {
  const today = Date.parse(todayKey());
  const start = Date.parse(dayKey(e.date));
  const days = Math.round((start - today) / 86400000);
  if (days < 0) return 'En curso';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

/** The banner informs: it shows the next date of the academic calendar. */
function renderHeroNext() {
  const card = $('#heroNext');
  const today = todayKey();
  const next = state.events
    .filter((e) => dayKey(e.endDate || e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  card.hidden = !next;
  $('.hero').classList.toggle('has-next', Boolean(next));
  if (!next) return;
  card.dataset.calendarTab = next.category;
  card.className = `hero-next cat-${next.category}`;
  card.setAttribute('aria-label', `Próxima fecha: ${next.title}, ${formatRange(next.date, next.endDate)}. Ver calendario`);
  card.innerHTML = `
    <span class="hero-next__label">${icon('calendar')}Próxima fecha</span>
    <span class="hero-next__title"><span class="cat-dot" aria-hidden="true"></span>${escapeHTML(next.title)}</span>
    <span class="hero-next__meta">${escapeHTML(formatRange(next.date, next.endDate))} · <strong>${relativeDay(next)}</strong></span>`;
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
  renderShowcaseMedia();
  renderShowcase();
  renderContact(state.settings?.contact);
  renderStats();
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

// ─── Preinscripción ──────────────────────────────────────────────────
function openPreinscriptionModal(careerName = '') {
  const p = state.settings?.preinscription || {};
  const formUrl = safeUrl(state.settings?.links?.preinscriptionUrl, '');
  // '#carreras' era el valor por defecto antiguo: sólo un formulario real muestra el botón
  const hasForm = formUrl && !formUrl.startsWith('#');
  const wa = whatsappUrl(state.settings?.contact?.whatsapp);

  const list = (items, cls, iconName) =>
    `<ul class="${cls}">${items.map((item) => `<li>${iconName ? icon(iconName) : ''}<span>${escapeHTML(item)}</span></li>`).join('')}</ul>`;

  openModal(
    `
    <div class="modal__hero">
      <div class="art art--1">${icon('user-plus')}</div>
      <div class="modal__hero-content">
        ${p.period ? `<span class="tag tag--light">${icon('calendar')}${escapeHTML(p.period)}</span>` : ''}
        <h2 id="modalTitle">${escapeHTML(p.title || 'Preinscripción online')}</h2>
      </div>
    </div>
    <div class="modal__body">
      ${careerName ? `<p class="pre-career">${icon('graduation')}<span>Carrera elegida: <strong>${escapeHTML(careerName)}</strong></span></p>` : ''}
      ${p.intro ? `<p class="prose prose--lg">${escapeHTML(p.intro)}</p>` : ''}
      ${p.steps?.length ? `<h3 class="mt-5">Cómo preinscribirte</h3>${list(p.steps, 'pre-steps')}` : ''}
      ${p.requirements?.length ? `<h3 class="mt-5">Documentación</h3>${list(p.requirements, 'check-list', 'check')}` : ''}
      ${p.note ? `<p class="pre-note">${icon('info')}<span>${escapeHTML(p.note)}</span></p>` : ''}
      <div class="modal__actions">
        ${hasForm ? `<a class="btn btn--cta btn--lg" href="${escapeHTML(formUrl)}"${externalAttrs(formUrl)}>${escapeHTML(p.buttonText || 'Completar formulario')} ${icon('arrow-right')}</a>` : ''}
        ${wa ? `<a class="btn btn--outline btn--lg" href="${escapeHTML(wa)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}Consultar por WhatsApp</a>` : ''}
        <button type="button" class="btn btn--outline btn--lg" data-open-chat-modal>${icon('bot')}Consultar al asistente</button>
      </div>
    </div>`,
    { variant: 'pre' }
  );
}

function initPreinscription() {
  // Todos los accesos a "Preinscribite" (header, menú, CTA, carreras) abren la misma ventana
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-preinscription]');
    if (!trigger) return;
    e.preventDefault();
    openPreinscriptionModal(trigger.dataset.career);
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
  const wa0 = whatsappUrl(contact.whatsapp);
  $('#contactInfo').innerHTML =
    items.join('') + (wa0 ? `<li>${icon('whatsapp')}<a href="${escapeHTML(wa0)}" target="_blank" rel="noopener noreferrer">Escribinos por WhatsApp</a></li>` : '');
  $('#contactMap').innerHTML = mapHTML(contact);

  const wa = whatsappUrl(contact.whatsapp);
  const fab = $('#fabWhatsapp');
  fab.hidden = !wa;
  if (wa) fab.href = wa;

  const social = socialLinks(contact, { whatsapp: true });
  $('#footerSocial').innerHTML = social.join('');
  $('#drawerSocial').innerHTML = social.join('');

  const band = socialLinks(contact, { variant: 'card' });
  $('#socialBandLinks').innerHTML = band.join('');
  $('#redes').hidden = !band.length;
}

const SOCIAL_NETWORKS = [
  { key: 'facebookUrl', name: 'facebook', label: 'Facebook', cta: 'Seguinos en Facebook' },
  { key: 'instagramUrl', name: 'instagram', label: 'Instagram', cta: 'Seguinos en Instagram' },
  { key: 'whatsappChannelUrl', name: 'whatsapp', label: 'Canal de WhatsApp', cta: 'Seguí nuestro canal' },
];

/**
 * Botones de redes sociales con los colores de cada marca.
 * variant "pill" (ícono + nombre) o "card" (tarjeta grande con llamado a la acción).
 */
function socialLinks(contact, { variant = 'pill', whatsapp = false } = {}) {
  contact = contact || {};
  const networks = SOCIAL_NETWORKS.map((n) => ({ ...n, url: safeUrl(contact[n.key], '') })).filter((n) => n.url);
  const wa = whatsapp && whatsappUrl(contact.whatsapp);
  if (wa) networks.push({ name: 'whatsapp', label: 'WhatsApp', cta: 'Escribinos por WhatsApp', url: wa });

  return networks.map((n) =>
    variant === 'card'
      ? `<a class="social-card social-card--${n.name}" href="${escapeHTML(n.url)}" target="_blank" rel="noopener noreferrer">
          <span class="social-card__icon">${icon(n.name)}</span>
          <span><span class="social-card__name">${n.label}</span><span class="social-card__cta">${n.cta} ${icon('arrow-right')}</span></span>
        </a>`
      : `<a class="social-btn social-btn--${n.name}" href="${escapeHTML(n.url)}" target="_blank" rel="noopener noreferrer" aria-label="${n.label} del IES N° 11">${icon(n.name)}<span>${n.label}</span></a>`
  );
}

// ─── Panel institucional (estilo "Sedes y centros") ──────────────────
function renderShowcaseMedia() {
  const img = state.settings?.institutional?.imageUrl;
  $('#showcaseMedia').innerHTML = img
    ? `<img src="${escapeHTML(safeUrl(img, ''))}" alt="Edificio del IES N° 11" loading="lazy">`
    : `<div class="art art--3"><div class="art__stack"><img class="art__logo" src="/assets/logo-ies11.svg" alt=""><p class="art__caption">Formando profesionales<br>con compromiso social</p></div></div>`;
}

/**
 * Google Maps embed without API key. Uses the admin "Mapa" link when it is already an
 * embed URL (Compartir → Insertar un mapa); otherwise searches the institute's address.
 */
function mapEmbedUrl(contact = {}) {
  const custom = safeUrl(contact.mapUrl, '');
  if (/^https:\/\/www\.google\.com\/maps\/embed\?/.test(custom)) return custom;
  const query = contact.address ? `IES N° 11, ${contact.address}` : 'IES N° 11, San Salvador de Jujuy';
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function mapHTML(contact, className = '') {
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(contact?.address || 'IES N° 11, San Salvador de Jujuy')}`;
  return `
    <div class="map-card ${className}">
      <iframe class="map-card__frame" src="${escapeHTML(mapEmbedUrl(contact))}" title="Ubicación del IES N° 11 en Google Maps"
        loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      <a class="map-card__cta" href="${escapeHTML(directions)}" target="_blank" rel="noopener noreferrer">${icon('map-pin')}Cómo llegar</a>
    </div>`;
}

/** 1 = top of the pyramid (rector/a), 2 = vice, 3 = secretaries and the rest. */
function authorityLevel(role) {
  const r = normalize(role);
  if (/vice/.test(r)) return 2;
  if (/rector|director/.test(r)) return 1;
  return 3;
}

function authoritiesHTML(list) {
  const levels = [1, 2, 3]
    .map((level) => list.filter((a) => authorityLevel(a.role) === level))
    .filter((group) => group.length);
  let index = 0;
  const card = (a) => `
    <li class="org-card" style="--i:${index++}">
      <span class="org-card__avatar" aria-hidden="true">${escapeHTML(initials(a.name.replace(/^(prof|lic|dr|dra|ing|mg|tec)\.?\s+/i, '')))}</span>
      <span class="org-card__role">${escapeHTML(a.role)}</span>
      <strong class="org-card__name">${escapeHTML(a.name)}</strong>
    </li>`;
  return `
    <div class="org-chart">
      ${levels.map((group, i) => `<ul class="org-chart__level org-chart__level--${i + 1}">${group.map(card).join('')}</ul>`).join('')}
    </div>`;
}

function renderShowcase() {
  const panel = $('#showcasePanel');
  const inst = state.settings?.institutional || {};
  const contact = state.settings?.contact || {};
  const fallback = 'Información en actualización.';

  const statement = (title, iconName, text) =>
    `<div class="showcase__statement">
       <span class="showcase__badge" aria-hidden="true">${icon(iconName)}</span>
       <h3 class="showcase__title">${title}</h3>
     </div>
     <p class="showcase__text showcase__text--lead">${escapeHTML(text || fallback)}</p>`;

  const views = {
    mision: () => statement('Misión', 'target', inst.mission),
    vision: () => statement('Visión', 'eye', inst.vision),
    autoridades: () =>
      `<h3 class="showcase__title">Equipo de gestión</h3>${
        inst.authorities?.length ? authoritiesHTML(inst.authorities) : `<p class="showcase__text">${fallback}</p>`
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
      }${mapHTML(contact, 'map-card--compact')}`;
    },
  };

  panel.innerHTML = `<div class="showcase__view">${(views[state.showcaseTab] || views.mision)()}</div>`;
}

function setShowcaseTab(tab, { focus = false } = {}) {
  state.showcaseTab = tab;
  $('#institucional .showcase').classList.toggle('is-wide', tab === 'autoridades');
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
        ${p.linkUrl && open ? `<a class="link-chevron" href="${escapeHTML(safeUrl(p.linkUrl))}"${externalAttrs(p.linkUrl)}>${icon('external-link')} ${escapeHTML(p.linkLabel || 'Hacerlo online')}</a>` : ''}
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
        ${p.linkUrl && open ? `<a class="btn btn--cta" href="${escapeHTML(safeUrl(p.linkUrl))}"${externalAttrs(p.linkUrl)}>${icon('external-link')}${escapeHTML(p.linkLabel || 'Inscribirme online')}</a>` : ''}
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
  if (/energ|ambient|segur/.test(a)) return 'target';
  if (/turism|servicio/.test(a)) return 'map-pin';
  if (/diseno|indument/.test(a)) return 'image';
  if (/gastro|cocina|aliment/.test(a)) return 'users';
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

/**
 * Area card. On /ingresantes the action is a button that filters the list below;
 * on the home it is a link to /ingresantes#careersList that applies the same filter (see initCareers).
 */
function areaCard(area, i, asLink = false) {
  const modalities = [...new Set(area.list.map((c) => c.modality))].join(' · ');
  const name = escapeHTML(area.name);
  const action = asLink
    ? `<a class="link-chevron" href="/ingresantes#careersList" data-area-filter="${name}">Ver carreras de ${name} ${icon('chevron-right')}</a>`
    : `<button type="button" class="link-chevron" data-area="${name}">Ver carreras de ${name} ${icon('chevron-right')}</button>`;
  return `
    <article class="area-card">
      <div class="area-card__media">
        ${area.image ? `<img src="${escapeHTML(safeUrl(area.image, ''))}" alt="" loading="lazy">` : `<div class="${artClass(i)}">${icon(areaIcon(area.name))}</div>`}
      </div>
      <div class="area-card__body">
        <h3 class="area-card__title">${escapeHTML(area.name)}</h3>
        <p class="area-card__text">${area.list.length} ${area.list.length === 1 ? 'carrera' : 'carreras'} · ${escapeHTML(modalities)}</p>
        ${action}
      </div>
    </article>`;
}

function renderAreas() {
  const track = $('#areasTrack');
  const areas = groupAreas();
  if (!areas.length) {
    renderStatus(track, { type: 'empty', message: 'La oferta académica se publicará próximamente.' });
  } else {
    track.innerHTML = areas.map((a, i) => areaCard(a, i)).join('');
  }
  // Home teaser: same cards, linking to the filtered list; hidden until there is an offer to show
  $('#homeAreasTrack').innerHTML = areas.map((a, i) => areaCard(a, i, true)).join('');
  $('#areasInicio').hidden = !areas.length;
  $('#filterArea').innerHTML =
    '<option value="all">Todas las áreas</option>' +
    areas.map((a) => `<option value="${escapeHTML(a.name)}">${escapeHTML(a.name)}</option>`).join('');
  state.carousels.areas?.refresh();
  state.carousels.homeAreas?.refresh();
}

/**
 * Atributos para descargar un archivo: los PDFs propios (/uploads/…) se bajan
 * con un nombre legible; los enlaces externos (ej: Drive) se abren en otra pestaña.
 */
function downloadAttrs(url, filename) {
  if (isExternalUrl(url) || !url.startsWith('/')) return externalAttrs(url);
  return ` download="${escapeHTML(filename.replace(/[\\/:*?"<>|]+/g, ''))}.pdf"`;
}

const studyPlanFilename = (career) => `Plan de estudio - ${career.name}`;

function careerLogo(c, className) {
  const src = safeUrl(c.logoUrl, '');
  return src ? `<span class="${className}"><img src="${escapeHTML(src)}" alt="Logo de ${escapeHTML(c.name)}" loading="lazy"></span>` : '';
}

function careerCard(c, i) {
  const shifts = c.shifts?.length ? c.shifts.join(' / ') : 'A confirmar';
  return `
    <article class="career-card${c.logoUrl ? ' career-card--logo' : ''}">
      <div class="career-card__media">
        ${c.area ? `<span class="career-card__area">${escapeHTML(c.area)}</span>` : ''}
        ${c.imageUrl ? `<img src="${escapeHTML(safeUrl(c.imageUrl, ''))}" alt="" loading="lazy">` : `<div class="${artClass(i)}">${c.logoUrl ? '' : icon(areaIcon(c.area || ''))}</div>`}
        ${careerLogo(c, 'career-card__logo')}
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
          ${c.studyPlanUrl ? `<a class="link-chevron" href="${escapeHTML(safeUrl(c.studyPlanUrl))}"${downloadAttrs(c.studyPlanUrl, studyPlanFilename(c))}>${icon('download')} Plan de estudio (PDF)</a>` : ''}
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
    renderStats();
  });
}

function setFilter(name, value) {
  state.filters[name] = value;
  $(`#filter${name[0].toUpperCase()}${name.slice(1)}`).value = value;
  renderCareers();
}

function initCareers() {
  state.carousels.areas = createCarousel($('#areasCarousel'), { label: 'Grupo de áreas' });
  state.carousels.homeAreas = createCarousel($('#homeAreasCarousel'), { label: 'Grupo de áreas' });

  // Links from other pages to the careers list with an area applied ("all" = every career, no filters).
  // Registered before the router's click listener, which then switches page and scrolls to #careersList.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-area-filter]');
    if (!link) return;
    const area = link.dataset.areaFilter;
    ['modality', 'shift'].forEach((n) => setFilter(n, 'all'));
    setFilter('area', area === 'all' || [...$('#filterArea').options].some((o) => o.value === area) ? area : 'all');
    if (!router.enabled) {
      // Admin preview: every section is on the same document
      e.preventDefault();
      $('#careersList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

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
  const plan = safeUrl(career.studyPlanUrl, '');
  const social = socialLinks(state.settings?.contact);

  const planCard = plan
    ? `<div class="plan-card">
        <span class="plan-card__icon" aria-hidden="true">${icon('file-text')}<small>PDF</small></span>
        <div class="plan-card__text">
          <strong>Plan de estudio</strong>
          <span>Materias por año y carga horaria. Descargalo y guardalo en tu celular.</span>
        </div>
        <a class="btn btn--brand plan-card__btn" href="${escapeHTML(plan)}"${downloadAttrs(plan, studyPlanFilename(career))}>${icon('download')}Descargar PDF</a>
      </div>`
    : `<div class="plan-card plan-card--empty">
        <span class="plan-card__icon" aria-hidden="true">${icon('file-text')}<small>PDF</small></span>
        <div class="plan-card__text">
          <strong>Plan de estudio</strong>
          <span>Estará disponible para descargar próximamente. Mientras tanto, consultalo en Bedelía.</span>
        </div>
        <button type="button" class="btn btn--outline plan-card__btn" data-open-chat-modal>${icon('bot')}Consultar</button>
      </div>`;

  openModal(
    `
    <div class="modal__hero modal__hero--career">
      ${career.imageUrl ? `<img src="${escapeHTML(safeUrl(career.imageUrl, ''))}" alt="">` : `<div class="art">${career.logoUrl ? '' : icon(areaIcon(career.area || ''))}</div>`}
      <div class="modal__hero-content career-hero">
        ${careerLogo(career, 'career-hero__logo')}
        <div>
          ${career.area ? `<span class="tag tag--light">${escapeHTML(career.area)}</span>` : ''}
          <h2 id="modalTitle">${escapeHTML(career.name)}</h2>
          <p class="career-hero__degree">${icon('award')}${escapeHTML(career.degree)}</p>
        </div>
      </div>
    </div>
    <div class="modal__body">
      <ul class="meta-list meta-list--lg">
        <li>${icon('clock')}${escapeHTML(career.durationYears)} ${career.durationYears === 1 ? 'año' : 'años'}</li>
        <li>${icon('building')}${escapeHTML(career.modality)}</li>
        <li>${icon('calendar')}Turno: ${escapeHTML(shifts)}</li>
      </ul>
      ${career.description ? `<p class="prose prose--lg">${escapeHTML(career.description)}</p>` : ''}
      ${
        career.coordinator
          ? `<p class="pre-note">${icon('user')}<span>Coordinación: <strong>${escapeHTML(career.coordinator)}</strong>${career.coordinatorSchedule ? ` · ${escapeHTML(career.coordinatorSchedule)}` : ''}</span></p>`
          : ''
      }
      ${planCard}
      <div class="modal__actions">
        <button type="button" class="btn btn--cta btn--lg" data-preinscription data-career="${escapeHTML(career.name)}">Preinscribirme</button>
        ${
          career.cursilloUrl
            ? `<a class="btn btn--outline btn--lg" href="${escapeHTML(safeUrl(career.cursilloUrl))}"${externalAttrs(career.cursilloUrl)}>${icon('calendar')}Cursillo de ingreso</a>`
            : `<a class="btn btn--outline btn--lg" href="#calendario" data-close-modal data-calendar-tab="cursillo">${icon('calendar')}Fechas de cursillo</a>`
        }
        ${
          safeUrl(career.whatsappChannelUrl, '')
            ? `<a class="btn btn--outline btn--lg" href="${escapeHTML(safeUrl(career.whatsappChannelUrl))}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}Canal de WhatsApp de la carrera</a>`
            : ''
        }
      </div>
      ${
        social.length
          ? `<div class="modal__social">
              <p>Seguinos para enterarte de las novedades de la carrera</p>
              <div class="social-links">${social.join('')}</div>
            </div>`
          : ''
      }
    </div>`,
    { variant: 'career' }
  );
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
    <li class="timeline__item cat-${escapeHTML(e.category)}" id="evt-${escapeHTML(e._id)}">
      <div class="timeline__date" aria-hidden="true">
        <span class="timeline__weekday">${escapeHTML(weekday)}</span>
        <span class="timeline__day">${escapeHTML(day)}</span>
        <span class="timeline__month">${escapeHTML(month)}</span>
      </div>
      <div>
        <span class="timeline__cat"><span class="cat-dot" aria-hidden="true"></span>${escapeHTML(CALENDAR_CATEGORIES[e.category] || e.category)}</span>
        <div class="timeline__top">
          <h3 class="timeline__title">${escapeHTML(e.title)}</h3>
          <span class="badge ${status.badge}">${status.label}</span>
        </div>
        <ul class="timeline__meta">${meta}</ul>
        ${e.description ? `<p class="timeline__desc">${escapeHTML(e.description)}</p>` : ''}
      </div>
    </li>`;
}

const filteredEvents = () =>
  state.events.filter((e) => state.calendarTab === 'all' || e.category === state.calendarTab);

const upcomingEvents = (items) => {
  const today = todayKey();
  return items.filter((e) => dayKey(e.endDate || e.date) >= today);
};

const monthStart = (value) => {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/** Map "YYYY-MM-DD" → events of the visible month; multi-day events appear on every day of their range. */
function eventsByDay(items, start) {
  const end = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 0);
  const map = new Map();
  items.forEach((e) => {
    const from = Math.max(Date.parse(dayKey(e.date)), start);
    const to = Math.min(Date.parse(dayKey(e.endDate || e.date)), end);
    for (let t = from; t <= to; t += 86400000) {
      const key = dayKey(t);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
  });
  return map;
}

function renderCalendarFilters() {
  const counts = state.events.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + 1 }), {});
  const chip = (key, label, count) => `
    <button class="chip cal-chip${key === 'all' ? '' : ` cat-${key}`}" type="button" data-cal-filter="${key}" aria-pressed="${state.calendarTab === key}">
      ${key === 'all' ? '' : '<span class="cat-dot" aria-hidden="true"></span>'}${escapeHTML(label)}<span class="cal-chip__count">${count}</span>
    </button>`;
  $('#calendarFilters').innerHTML =
    chip('all', 'Todas', state.events.length) +
    Object.entries(CALENDAR_CATEGORIES)
      .filter(([key]) => counts[key] || key === state.calendarTab)
      .map(([key, label]) => chip(key, label, counts[key] || 0))
      .join('');
}

function renderMonth(panel) {
  const start = state.calendarMonth;
  const first = new Date(start);
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // weeks start on Monday
  const byDay = eventsByDay(filteredEvents(), start);
  const today = todayKey();

  const cells = Array.from({ length: offset }, () => '<li class="cal-day is-outside" aria-hidden="true"></li>');
  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = dayKey(Date.UTC(year, month, d));
    const items = byDay.get(key) || [];
    const cls = ['cal-day', key === today && 'is-today', key < today && 'is-past', items.length && 'has-events'].filter(Boolean).join(' ');
    if (!items.length) {
      cells.push(`<li class="${cls}"><span class="cal-day__num">${d}</span></li>`);
      continue;
    }
    const label = `${formatDate(key, { day: 'numeric', month: 'long' })}: ${items.length} ${items.length === 1 ? 'fecha' : 'fechas'}`;
    const bars = items
      .slice(0, 2)
      .map((e) => `<span class="cal-day__evt cat-${escapeHTML(e.category)}">${escapeHTML(e.title)}</span>`)
      .join('');
    const dots = items.map((e) => `<span class="cat-dot cat-${escapeHTML(e.category)}"></span>`).join('');
    cells.push(`
      <li class="${cls}">
        <button class="cal-day__btn" type="button" data-cal-day="${key}" aria-pressed="${state.calendarDay === key}" aria-label="${escapeHTML(label)}">
          <span class="cal-day__num">${d}</span>
          <span class="cal-day__bars" aria-hidden="true">${bars}${items.length > 2 ? `<span class="cal-day__more">+${items.length - 2}</span>` : ''}</span>
          <span class="cal-day__dots" aria-hidden="true">${dots}</span>
        </button>
      </li>`);
  }

  const agendaItems = state.calendarDay
    ? byDay.get(state.calendarDay) || []
    : [...new Set([...byDay.values()].flat())];
  const agendaTitle = state.calendarDay
    ? formatDate(state.calendarDay, { weekday: 'long', day: 'numeric', month: 'long' })
    : `Todo ${MONTH_FMT.format(first).replace(/ de \d+$/, '')}`;

  panel.innerHTML = `
    <div class="cal-month">
      <div class="cal-month__head">
        <button class="carousel-arrow" type="button" data-cal-nav="-1" aria-label="Mes anterior">${icon('chevron-left')}</button>
        <h3 class="cal-month__title" aria-live="polite">${escapeHTML(MONTH_FMT.format(first))}</h3>
        <button class="carousel-arrow" type="button" data-cal-nav="1" aria-label="Mes siguiente">${icon('chevron-right')}</button>
        <button class="chip cal-month__today" type="button" data-cal-nav="today">Hoy</button>
      </div>
      <div class="cal-weekdays" aria-hidden="true">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
      <ol class="cal-grid">${cells.join('')}</ol>
    </div>
    <div class="cal-agenda">
      <div class="cal-agenda__head">
        <h3 class="cal-agenda__title">${escapeHTML(agendaTitle)}</h3>
        ${state.calendarDay ? '<button class="link-chevron" type="button" data-cal-day="">Ver todo el mes</button>' : ''}
      </div>
      ${agendaItems.length ? `<ol class="timeline">${agendaItems.map(eventItem).join('')}</ol>` : '<p class="cal-agenda__empty">No hay fechas cargadas para este período.</p>'}
    </div>`;
}

function renderCalendar() {
  const panel = $('#calendarPanel');
  renderCalendarFilters();
  $$('[data-cal-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calView === state.calendarView)));
  if (state.calendarView === 'month') return renderMonth(panel);

  const items = upcomingEvents(filteredEvents());
  if (!items.length) {
    const scope = state.calendarTab === 'all' ? '' : ` en “${CALENDAR_CATEGORIES[state.calendarTab]}”`;
    renderStatus(panel, { type: 'empty', message: `No hay fechas próximas cargadas${scope}.` });
    return;
  }
  panel.innerHTML = `<ol class="timeline">${items.map(eventItem).join('')}</ol>`;
}

/** Shows the upcoming list filtered by one category (used by quick links, search and preview). */
function setCalendarTab(category) {
  if (category !== 'all' && !CALENDAR_CATEGORIES[category]) return;
  state.calendarTab = category;
  state.calendarView = 'list';
  renderCalendar();
}

function initCalendar() {
  const section = $('#calendario');
  section.addEventListener('click', (e) => {
    const view = e.target.closest('[data-cal-view]');
    const filter = e.target.closest('[data-cal-filter]');
    const nav = e.target.closest('[data-cal-nav]');
    const day = e.target.closest('[data-cal-day]');
    if (view) state.calendarView = view.dataset.calView;
    else if (filter) state.calendarTab = filter.dataset.calFilter;
    else if (day) state.calendarDay = day.dataset.calDay === state.calendarDay ? null : day.dataset.calDay || null;
    else if (nav) {
      const d = new Date(state.calendarMonth);
      state.calendarMonth =
        nav.dataset.calNav === 'today' ? monthStart(Date.now()) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(nav.dataset.calNav), 1);
      state.calendarDay = null;
    } else return;
    renderCalendar();
    // Keep keyboard focus on the control that was activated
    const selector = day ? `[data-cal-day="${state.calendarDay ?? ''}"]` : nav ? `[data-cal-nav="${nav.dataset.calNav}"]` : null;
    if (selector) $(selector, section)?.focus();
  });

  // Links that open a category (e.g. "Ver mesas de examen")
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-calendar-tab]');
    if (link) setCalendarTab(link.dataset.calendarTab);
  });
}

function loadCalendar() {
  const panel = $('#calendarPanel');
  return loadInto(panel, 'el calendario', async () => {
    const { items } = await api.calendar({ scope: 'month' });
    state.events = items;
    // Open on the current month, or on the month of the next date if this one is empty
    const current = monthStart(Date.now());
    const hasCurrent = eventsByDay(items, current).size > 0;
    const next = upcomingEvents(items)[0];
    state.calendarMonth = hasCurrent || !next ? current : monthStart(dayKey(next.date));
    renderCalendar();
    renderHeroNext();
  });
}

// ─── Mesas de examen (tribunales) ────────────────────────────────────
const shortDate = (value) => formatDate(value, { day: '2-digit', month: '2-digit', year: '2-digit' });

function examRow(b) {
  const dates = [shortDate(b.date), b.secondCallDate ? `2º: ${shortDate(b.secondCallDate)}` : ''].filter(Boolean).join('<br>');
  const cell = (v) => `<td>${escapeHTML(v || '—')}</td>`;
  return `
    <tr>
      ${cell(b.career)}
      ${cell(b.subject)}
      <td class="exam-table__nowrap">${dates}</td>
      <td class="exam-table__nowrap">${escapeHTML(b.time ? `${b.time} hs` : '—')}</td>
      ${cell(b.president)}${cell(b.firstVocal)}${cell(b.secondVocal)}${cell(b.substitute)}
    </tr>`;
}

function renderExamBoards() {
  const wrap = $('#mesas');
  const boards = state.examBoards;
  wrap.hidden = !boards.length;
  if (!boards.length) return;

  const careers = [...new Set(boards.map((b) => b.career))].sort((a, b) => a.localeCompare(b, 'es'));
  if (state.examCareer !== 'all' && !careers.includes(state.examCareer)) state.examCareer = 'all';
  $('#filterExamCareer').innerHTML =
    '<option value="all">Todas las carreras</option>' +
    careers.map((c) => `<option value="${escapeHTML(c)}"${c === state.examCareer ? ' selected' : ''}>${escapeHTML(c)}</option>`).join('');

  const sessions = new Map();
  boards
    .filter((b) => state.examCareer === 'all' || b.career === state.examCareer)
    .forEach((b) => {
      if (!sessions.has(b.session)) sessions.set(b.session, []);
      sessions.get(b.session).push(b);
    });

  $('#examBoardsPanel').innerHTML = [...sessions]
    .map(
      ([session, rows]) => `
      <section class="exam-session">
        <h4 class="exam-session__title">${escapeHTML(session)}</h4>
        <div class="exam-table-wrap" tabindex="0" role="region" aria-label="${escapeHTML(session)}">
          <table class="exam-table">
            <thead><tr><th scope="col">Carrera</th><th scope="col">Materia</th><th scope="col">Llamado</th><th scope="col">Hora</th><th scope="col">Titular</th><th scope="col">1º Vocal</th><th scope="col">2º Vocal</th><th scope="col">Suplente</th></tr></thead>
            <tbody>${rows.map(examRow).join('')}</tbody>
          </table>
        </div>
      </section>`
    )
    .join('');
}

async function loadExamBoards() {
  try {
    const { items } = await api.examBoards();
    state.examBoards = items;
  } catch {
    state.examBoards = [];
  }
  renderExamBoards();
}

function initExamBoards() {
  $('#filterExamCareer').addEventListener('change', (e) => {
    state.examCareer = e.target.value;
    renderExamBoards();
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
      ${n.videoUrl ? `<span class="news-card__play" aria-label="Incluye video">${icon('play')}</span>` : ''}
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

const HOME_NEWS_LIMIT = 6;

/** Home teaser: auto-advancing carousel with the newest news items, same card as the full list. */
function renderHomeNews() {
  const box = $('#homeNews');
  const latest = [...state.news].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, HOME_NEWS_LIMIT);
  if (!latest.length) renderStatus(box, { type: 'empty', message: 'Todavía no hay novedades publicadas.', compact: true });
  else box.innerHTML = latest.map(newsCard).join('');
  box.scrollLeft = 0;
  state.carousels.homeNews?.refresh();
}

function loadNews() {
  const track = $('#newsTrack');
  renderStatus($('#homeNews'), { type: 'loading', message: 'Cargando novedades…' });
  return loadInto(track, 'las novedades', async () => {
    const { items } = await api.news({ limit: 12 });
    state.news = items;
    renderNews();
    renderHomeNews();
  }).then(() => {
    if ($('.state--error', track)) renderStatus($('#homeNews'), { type: 'error', message: 'No pudimos cargar las novedades.', onRetry: loadNews, compact: true });
  });
}

function initNews() {
  const carousel = $('#newsCarousel');
  state.carousels.news = createCarousel(carousel, { label: 'Grupo de novedades' });
  state.carousels.homeNews = createCarousel($('#homeNewsCarousel'), { loop: true, autoplay: 6000, label: 'Grupo de novedades' });

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

  [$('#newsTrack'), $('#homeNews')].forEach((list) =>
    list.addEventListener('click', (e) => {
      const card = e.target.closest('[data-news-id]');
      if (card) openNewsModal(card.dataset.newsId);
    })
  );
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
      ${
        safeUrl(item.videoUrl, '')
          ? `<video class="news-video" src="${escapeHTML(safeUrl(item.videoUrl))}" controls preload="metadata" playsinline></video>`
          : ''
      }
      ${item.content ? `<p class="prose">${escapeHTML(item.content)}</p>` : ''}
    </div>`);
}

// ─── Modal ───────────────────────────────────────────────────────────
function openModal(html, { variant } = {}) {
  const modal = $('#modal');
  modal.className = variant ? `modal modal--${variant}` : 'modal';
  $('#modalContent').innerHTML = html;
  if (!modal.open) modal.showModal();
  // En la vista previa el foco tiene que quedar en el formulario del panel
  if (!IS_PREVIEW) $('.modal__close', modal).focus();
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

// ─── Números destacados ──────────────────────────────────────────────
/** Si el panel no cargó números, se muestran datos reales calculados de la oferta. */
function automaticStats() {
  const active = state.careers;
  if (!active.length) return [];
  const areas = new Set(active.map((c) => c.area || 'Otras carreras'));
  const shifts = new Set(active.flatMap((c) => c.shifts || []));
  return [
    { value: String(active.length), label: active.length === 1 ? 'Carrera de nivel superior' : 'Carreras de nivel superior' },
    { value: String(areas.size), label: areas.size === 1 ? 'Área de formación' : 'Áreas de formación' },
    shifts.size > 1 && { value: String(shifts.size), label: 'Turnos para cursar' },
  ].filter(Boolean);
}

function renderStats() {
  const configured = state.settings?.highlights?.stats || [];
  const stats = configured.length ? configured : automaticStats();
  const band = $('#statsBand');
  const html = stats
    .map((s) => `<li class="stat"><span class="stat__value" data-value="${escapeHTML(s.value)}">${escapeHTML(s.value)}</span><span class="stat__label">${escapeHTML(s.label)}</span></li>`)
    .join('');
  band.closest('section').hidden = !stats.length;
  if (band.innerHTML === html) return;
  band.innerHTML = html;
  band.style.setProperty('--stats', stats.length);

  // En la vista previa del panel se redibuja con cada tecla: se muestra el valor final sin animar
  if (prefersReducedMotion() || IS_PREVIEW) return;
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    $$('.stat__value', band).forEach(countUp);
  }, { threshold: 0.4 });
  observer.observe(band);
}

/** Anima "+2.000" desde 0 respetando prefijo, sufijo y separador de miles. */
function countUp(el) {
  const final = el.dataset.value;
  const match = final.match(/^(\D*?)(\d[\d.]*)(.*)$/);
  if (!match) return;
  const [, prefix, digits, suffix] = match;
  const target = parseInt(digits.replace(/\./g, ''), 10);
  if (!target) return;
  const withDots = digits.includes('.');
  const duration = 1400;
  const start = performance.now();

  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const value = Math.round(target * (1 - Math.pow(1 - t, 3)));
    el.textContent = t < 1 ? `${prefix}${withDots ? value.toLocaleString('es-AR') : value}${suffix}` : final;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ─── Testimonios ─────────────────────────────────────────────────────
function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function testimonialCard(t) {
  const photo = safeUrl(t.photoUrl, '');
  return `
    <figure class="testimonial">
      <span class="testimonial__mark" aria-hidden="true">“</span>
      ${
        t.rating
          ? `<span class="testimonial__stars" role="img" aria-label="${t.rating} de 5 estrellas">${'★'.repeat(t.rating)}<span aria-hidden="true">${'★'.repeat(5 - t.rating)}</span></span>`
          : ''
      }
      <blockquote class="testimonial__quote">${escapeHTML(t.quote)}</blockquote>
      ${t.source === 'google' ? '<span class="testimonial__source">Opinión publicada en Google</span>' : ''}
      <figcaption class="testimonial__author">
        ${
          photo
            ? `<img class="testimonial__avatar" src="${escapeHTML(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
            : `<span class="testimonial__avatar testimonial__avatar--initials" aria-hidden="true">${escapeHTML(initials(t.name))}</span>`
        }
        <span>
          <strong class="testimonial__name">${escapeHTML(t.name)}</strong>
          ${t.career ? `<span class="testimonial__career">${escapeHTML(t.career)}</span>` : ''}
          ${t.role ? `<span class="testimonial__role">${escapeHTML(t.role)}</span>` : ''}
        </span>
      </figcaption>
    </figure>`;
}

async function loadTestimonials() {
  const section = $('#testimonios');
  try {
    ({ items: state.testimonials } = await api.testimonials());
    renderTestimonials();
  } catch (err) {
    // Sección opcional: si falla, simplemente no se muestra
    console.error('[ies11] Error al cargar los testimonios:', err);
    section.hidden = true;
  }
}

function renderTestimonials() {
  const section = $('#testimonios');
  section.hidden = !state.testimonials.length;
  if (section.hidden) return;
  $('#testimonialsTrack').innerHTML = state.testimonials.map(testimonialCard).join('');
  if (state.carousels.testimonials) state.carousels.testimonials.refresh();
  else state.carousels.testimonials = createCarousel($('#testimonialsCarousel'), { label: 'Grupo de testimonios' });
}

// ─── Vida institucional: galería con tarjetas que se expanden ───────
const GALLERY_PAGE = 8;

function galleryMedia(item) {
  const video = parseSocialVideo(item.videoUrl);
  const image = safeUrl(item.imageUrl, '') || video?.thumbnail || '';
  return { video, image };
}

function galleryCard(item) {
  const { video, image } = galleryMedia(item);
  return `
    <li class="gallery__item${item.featured ? ' gallery__item--featured' : ''}">
      <button class="gallery-card" type="button" data-gallery-id="${escapeHTML(item._id)}">
        <span class="gallery-card__media" data-gallery-media>
          ${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy" decoding="async">` : `<span class="${artClass(item.title.length)}"></span>`}
        </span>
        ${video ? `<span class="gallery-card__play" aria-hidden="true">${icon('play')}</span>` : ''}
        <span class="gallery-card__body">
          <span class="gallery-card__tag">${escapeHTML(item.tag)}${video ? ` · ${NETWORK_LABELS[video.network]}` : ''}</span>
          <span class="gallery-card__title">${escapeHTML(item.title)}</span>
        </span>
      </button>
    </li>`;
}

function renderGallery() {
  const items = state.gallery.filter((g) => state.galleryTag === 'all' || g.tag === state.galleryTag);
  const visible = state.galleryAll ? items : items.slice(0, GALLERY_PAGE);
  const tags = [...new Set(state.gallery.map((g) => g.tag))];
  $('#galleryFilters').innerHTML =
    tags.length > 1
      ? ['all', ...tags]
          .map((t) => `<button class="chip" type="button" data-gallery-tag="${escapeHTML(t)}" aria-pressed="${state.galleryTag === t}">${escapeHTML(t === 'all' ? 'Todo' : t)}</button>`)
          .join('')
      : '';
  $('#galleryGrid').innerHTML =
    visible.map(galleryCard).join('') +
    (items.length > visible.length
      ? `<li class="gallery__more"><button class="btn btn--outline" type="button" data-gallery-more>Ver ${items.length - visible.length} más</button></li>`
      : '');
}

function openGalleryItem(id, trigger) {
  const item = state.gallery.find((g) => g._id === id);
  if (!item) return;
  const { video, image } = galleryMedia(item);
  const media = video
    ? `<div class="gallery-view__frame${video.vertical ? ' is-vertical' : ''}">
         <iframe src="${escapeHTML(video.embedUrl)}" title="${escapeHTML(item.title)} (video de ${NETWORK_LABELS[video.network]})" loading="lazy"
           allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
       </div>`
    : `<img class="gallery-view__img" src="${escapeHTML(image)}" alt="${escapeHTML(item.title)}">`;
  const html = `
    <div class="gallery-view">
      <div class="gallery-view__media">${media}</div>
      <div class="gallery-view__body">
        <span class="gallery-card__tag">${escapeHTML(item.tag)} · ${escapeHTML(formatDate(item.date))}</span>
        <h2 id="modalTitle">${escapeHTML(item.title)}</h2>
        ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ''}
        ${
          video
            ? `<a class="link-chevron" href="${escapeHTML(safeUrl(item.videoUrl))}" target="_blank" rel="noopener noreferrer">Ver en ${NETWORK_LABELS[video.network]} ${icon('external-link')}</a>`
            : ''
        }
      </div>
    </div>`;

  // The card "grows" into the dialog with the View Transitions API (graceful fallback: plain open)
  const cardMedia = trigger?.querySelector('[data-gallery-media]');
  if (!document.startViewTransition || prefersReducedMotion() || !cardMedia) return openModal(html, { variant: 'gallery' });
  cardMedia.style.viewTransitionName = 'gallery-media';
  const transition = document.startViewTransition(() => {
    cardMedia.style.viewTransitionName = '';
    openModal(html, { variant: 'gallery' });
    $('.gallery-view__media').style.viewTransitionName = 'gallery-media';
  });
  transition.finished.finally(() => {
    const target = $('.gallery-view__media');
    if (target) target.style.viewTransitionName = '';
  });
}

function initGallery() {
  $('#vida').addEventListener('click', (e) => {
    const card = e.target.closest('[data-gallery-id]');
    const tag = e.target.closest('[data-gallery-tag]');
    if (card) return openGalleryItem(card.dataset.galleryId, card);
    if (tag) {
      state.galleryTag = tag.dataset.galleryTag;
      state.galleryAll = false;
    } else if (e.target.closest('[data-gallery-more]')) state.galleryAll = true;
    else return;
    renderGallery();
  });
}

async function loadGallery() {
  try {
    const { items } = await api.gallery();
    state.gallery = items;
  } catch (err) {
    console.error('[ies11] Error al cargar la galería:', err);
    state.gallery = [];
  }
  $('#vida').hidden = !state.gallery.length;
  if (state.gallery.length) renderGallery();
}

// ─── Consultas (formulario de contacto) ──────────────────────────────
function fillContactCareers() {
  const select = $('#cCareer');
  const names = [...new Set(state.careers.map((c) => c.name))].sort((a, b) => a.localeCompare(b, 'es'));
  select.innerHTML = '<option value="">Todavía no sé</option>' + names.map((n) => `<option>${escapeHTML(n)}</option>`).join('');
}

function setContactErrors(form, err) {
  const box = $('[data-form-error]', form);
  box.textContent = err.message;
  box.hidden = false;
  (err.details || []).forEach(({ field, message }) => {
    const target = $(`[data-error-for="${CSS.escape(field)}"]`, form);
    if (!target) return;
    target.textContent = message;
    target.hidden = false;
    form.elements[field]?.setAttribute('aria-invalid', 'true');
  });
  const firstInvalid = $('[aria-invalid="true"]', form);
  (firstInvalid || box).focus?.();
}

function clearContactErrors(form) {
  $('[data-form-error]', form).hidden = true;
  $$('[data-error-for]', form).forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
}

function initContact() {
  const form = $('#contactForm');
  const done = $('#contactDone');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearContactErrors(form);
    const data = Object.fromEntries(['name', 'email', 'phone', 'subject', 'career', 'message', 'website'].map((k) => [k, form.elements[k].value.trim()]));
    data.consent = form.elements.consent.checked;

    // Quick client-side check; the server validates everything again
    const details = [];
    if (data.name.length < 2) details.push({ field: 'name', message: 'Ingresá tu nombre' });
    if (!form.elements.email.checkValidity() || !data.email) details.push({ field: 'email', message: 'Ingresá un correo válido (ej: nombre@gmail.com)' });
    if (data.message.length < 10) details.push({ field: 'message', message: 'Contanos un poco más (mínimo 10 caracteres)' });
    if (!data.consent) details.push({ field: 'consent', message: 'Necesitamos tu permiso para responderte por correo' });
    if (details.length) return setContactErrors(form, { message: 'Revisá los campos marcados.', details });

    const button = $('#contactSubmit');
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Enviando…';
    try {
      await api.contact(data);
      $('#contactDoneEmail').textContent = data.email;
      form.hidden = true;
      done.hidden = false;
      done.focus();
      form.reset();
    } catch (err) {
      setContactErrors(form, err);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });
  $('#contactAgain').addEventListener('click', () => {
    done.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });
}

// ─── Inicio: tarjetas que giran, "próximo paso" y fotos de la portada ──
/**
 * Real images used when the admin did not upload a home photo ("Fotos de la portada"),
 * in order of preference; without any image the block keeps its brand art.
 */
const HOME_PHOTO_FALLBACKS = {
  'pathImages.tecnicatura': ['careers'],
  'pathImages.ingresante': ['careers', 'gallery'],
  'pathImages.estudiante': ['gallery'],
  'pathImages.egresado': ['gallery'],
  'pathImages.institucional': ['institutional', 'gallery'],
  'nextStepImages.tecnicaturas': ['careers'],
  'nextStepImages.cursillo': ['gallery'],
  'nextStepImages.preinscripcion': ['institutional', 'gallery'],
};
const homeArt = new WeakMap(); // [data-home-photo] → its original brand-art markup

function renderHomePhotos() {
  const pick = (list) => list.map((url) => safeUrl(url, '')).filter(Boolean);
  const sources = {
    careers: pick(state.careers.map((c) => c.imageUrl)),
    gallery: pick(state.gallery.map((g) => g.imageUrl)),
    institutional: pick([state.settings?.institutional?.imageUrl]),
  };
  const custom = (key) => {
    const [group, name] = key.split('.');
    return safeUrl(state.settings?.home?.[group]?.[name], '');
  };
  const boxes = $$('[data-home-photo]');
  // Uploaded photos are reserved first so the automatic ones do not repeat them
  const used = new Set(boxes.map((box) => custom(box.dataset.homePhoto)).filter(Boolean));
  const take = (list) => {
    const url = list.find((u) => !used.has(u));
    if (url) used.add(url);
    return url;
  };

  boxes.forEach((box) => {
    const key = box.dataset.homePhoto;
    if (!homeArt.has(box)) homeArt.set(box, box.innerHTML);
    let url = custom(key);
    for (const source of HOME_PHOTO_FALLBACKS[key] || []) url ||= take(sources[source]);
    url ||= take([...sources.careers, ...sources.gallery, ...sources.institutional]);
    if (!url) {
      box.innerHTML = homeArt.get(box);
      return;
    }
    box.innerHTML = `<img src="${escapeHTML(url)}" alt="" loading="lazy">`;
    $('img', box).addEventListener('error', () => (box.innerHTML = homeArt.get(box)), { once: true });
  });
}

const isFocusVisible = (el) => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
};

/**
 * "Elegí tu camino" cards: the front (photo) turns to show the options on the back.
 * Mouse: hover. Keyboard: focusing the toggle or a back link. Touch: tap the card or the toggle.
 */
function initFlipCards() {
  $$('[data-flip]').forEach((card) => {
    const toggle = $('.flip-card__toggle', card);
    const isFlipped = () => card.classList.contains('is-flipped');
    const setFlipped = (on) => {
      card.classList.toggle('is-flipped', on);
      toggle.setAttribute('aria-expanded', String(on));
    };

    toggle.addEventListener('click', () => setFlipped(!isFlipped()));
    $('.flip-card__front', card).addEventListener('click', () => setFlipped(true));
    $('.flip-card__back', card).addEventListener('click', (e) => {
      if (!e.target.closest('a, button')) setFlipped(false);
    });
    card.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && setFlipped(true));
    card.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && setFlipped(false));
    let ignoreFocus = false;
    card.addEventListener('focusin', (e) => !ignoreFocus && isFocusVisible(e.target) && setFlipped(true));
    card.addEventListener('focusout', (e) => !card.contains(e.relatedTarget) && setFlipped(false));
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !isFlipped()) return;
      setFlipped(false);
      ignoreFocus = true; // focus() fires focusin synchronously: keep the front visible
      toggle.focus();
      ignoreFocus = false;
    });
  });
}

function initHome() {
  initFlipCards();
  state.carousels.nextStep = createCarousel($('#nextStepCarousel'), { loop: true, autoplay: 8000, label: 'Paso' });
}

// ─── Aparición suave de secciones al hacer scroll ────────────────────
function initReveal() {
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js-reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px' }
  );
  $$('main .section').forEach((section) => observer.observe(section));
}

// ─── Vista previa en vivo del panel (/?preview=1 dentro de un iframe del admin) ───
const IS_PREVIEW = new URLSearchParams(window.location.search).has('preview') && window.parent !== window;
const PREVIEW_ID = '__preview__';
// Copia de los datos reales: cada borrador se aplica sobre ella, así no se acumulan cambios de ediciones anteriores
const previewBase = {};

const PREVIEW_LISTS = {
  careers: 'careers',
  news: 'news',
  procedures: 'procedures',
  calendar: 'events',
  examBoards: 'examBoards',
  slides: 'slides',
  testimonials: 'testimonials',
};

function withDraft(key, item) {
  previewBase[key] ??= structuredClone(state[key]);
  const list = previewBase[key];
  const exists = list.some((x) => x._id === item._id);
  return exists ? list.map((x) => (x._id === item._id ? item : x)) : [item, ...list];
}

/** Desplaza la página (sólo dentro del iframe) para centrar el elemento y lo marca. */
function focusPreview(el) {
  $$('.is-preview-target').forEach((x) => x.classList.remove('is-preview-target'));
  if (!el) return;
  el.classList.add('is-preview-target');
  const track = el.closest('[data-track]');
  if (track) track.scrollLeft += el.getBoundingClientRect().left - track.getBoundingClientRect().left;
  const rect = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + rect.top - Math.max(16, (window.innerHeight - rect.height) / 2), behavior: 'instant' });
}

function applyPreview({ resource, item, view }) {
  // Las vistas de ventana reemplazan el contenido del modal abierto (sin parpadeo)
  const modal = $('#modal');
  if (modal.open && view !== 'detail' && view !== 'preinscription') modal.close();

  if (resource === 'settings') {
    previewBase.settings ??= structuredClone(state.settings || {});
    state.settings = { ...previewBase.settings, ...item };
    renderShowcaseMedia();
    renderShowcase();
    renderContact(state.settings.contact);
    renderStats();
    renderHomePhotos();
    if (view === 'preinscription') return openPreinscriptionModal();
    if (view === 'homePaths') return focusPreview($('#accesos .paths'));
    if (view === 'homeNextStep') return focusPreview($('#nextStepCarousel'));
    if (view === 'stats') return focusPreview($('#statsBand'));
    if (view === 'institutional') return focusPreview($('#institucional .showcase'));
    if (view === 'footer') return focusPreview($('#contacto'));
    return;
  }

  const key = PREVIEW_LISTS[resource];
  if (!key) return;
  item = { ...item, _id: item._id || PREVIEW_ID };
  if (['news', 'calendar', 'examBoards'].includes(resource) && !item.date) item.date = new Date().toISOString();
  state[key] = withDraft(key, item);
  const id = CSS.escape(item._id);

  switch (resource) {
    case 'careers':
      ['area', 'modality', 'shift'].forEach((n) => (state.filters[n] = 'all'));
      renderAreas();
      renderCareers();
      renderStats();
      if (view === 'detail') return openCareerModal(item._id);
      return focusPreview($(`[data-career-id="${id}"]`)?.closest('.career-card'));
    case 'news':
      state.newsTag = 'all';
      $$('[data-news-tag]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.newsTag === 'all')));
      renderNews();
      renderHomeNews();
      if (view === 'detail') return openNewsModal(item._id);
      return focusPreview($(`[data-news-id="${id}"]`));
    case 'procedures':
      $('#proceduresGrid').innerHTML = state.procedures.map(procedureCard).join('');
      if (view === 'detail') return openProcedureModal(item._id);
      return focusPreview($(`[data-procedure-id="${id}"]`)?.closest('.proc-card'));
    case 'calendar':
      setCalendarTab(item.category);
      return focusPreview($(`#evt-${id}`));
    case 'examBoards':
      state.examCareer = 'all';
      renderExamBoards();
      return focusPreview($('#mesas'));
    case 'slides': {
      // Se muestra sólo la diapositiva editada para que el carrusel no avance solo
      $('#heroTrack').innerHTML = slideHTML(item, 0, 1);
      state.carousels.hero?.refresh();
      return window.scrollTo({ top: 0, behavior: 'instant' });
    }
    case 'testimonials':
      renderTestimonials();
      return focusPreview($$('#testimonialsTrack .testimonial')[state.testimonials.findIndex((t) => t._id === item._id)]);
  }
}

function initPreview() {
  document.documentElement.classList.add('is-preview');
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    if (e.data?.type === 'ies11:preview') applyPreview(e.data);
  });
}

// ─── Inicio ──────────────────────────────────────────────────────────
function init() {
  hydrateIcons();
  $('#year').textContent = new Date().getFullYear();

  initRouter();
  initNavigation();
  initHeroMotion();
  initSearch();
  initHome();
  initCareers();
  initProcedures();
  initCalendar();
  initExamBoards();
  initShowcase();
  initNews();
  initModal();
  initPreinscription();
  initGallery();
  initContact();
  if (IS_PREVIEW) initPreview();
  else initReveal();
  initChatbot();
  // Last on purpose: preinscription, procedure and calendar links run (and may preventDefault) first
  if (router.enabled) document.addEventListener('click', onRouteClick);

  const careersLoaded = loadCareers().then(fillContactCareers, fillContactCareers);
  Promise.allSettled([loadSettings(), loadSlides(), loadProcedures(), careersLoaded, loadCalendar(), loadExamBoards(), loadNews(), loadTestimonials(), loadGallery()]).then(() => {
    renderHomePhotos();
    if (IS_PREVIEW) window.parent.postMessage({ type: 'ies11:preview-ready' }, window.location.origin);
    else settleInitialScroll();
  });
}

init();
