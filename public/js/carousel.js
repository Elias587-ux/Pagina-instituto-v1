/**
 * Carrusel accesible basado en scroll-snap.
 *
 * Estructura esperada dentro de `root`:
 *   [data-track]  contenedor desplazable con los ítems
 *   [data-prev] / [data-next]  botones de navegación (opcionales)
 *   [data-dots]   contenedor de indicadores (opcional)
 *   [data-pause]  botón pausar/reanudar (opcional, sólo con autoplay)
 *
 * Avanza por "páginas" (el ancho visible del track), así funciona igual
 * con 1 ítem por vista (hero) o con 3 (tarjetas).
 */
import { icon } from './icons.js';
import { $, $$, debounce } from './utils.js';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} root
 * @param {{ loop?: boolean, autoplay?: number, label?: string }} [options]
 * @returns {{ refresh: () => void, goTo: (index: number) => void }}
 */
export function createCarousel(root, { loop = false, autoplay = 0, label = 'Página' } = {}) {
  const track = $('[data-track]', root);
  const prev = $('[data-prev]', root);
  const next = $('[data-next]', root);
  const dots = $('[data-dots]', root);
  const pauseBtn = $('[data-pause]', root);

  const pageWidth = () => track.clientWidth || 1;
  const pageCount = () => Math.max(1, Math.ceil((track.scrollWidth - 4) / pageWidth()));
  const current = () => Math.min(pageCount() - 1, Math.round(track.scrollLeft / pageWidth()));

  function goTo(index) {
    const total = pageCount();
    const target = loop ? (index + total) % total : Math.max(0, Math.min(index, total - 1));
    track.scrollTo({ left: target * pageWidth(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function update() {
    const index = current();
    const total = pageCount();
    $$('.carousel__dot', dots || root).forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
    if (!loop) {
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index >= total - 1;
    }
  }

  function refresh() {
    const total = pageCount();
    root.classList.toggle('is-static', total <= 1);
    if (dots) {
      dots.innerHTML =
        total > 1
          ? Array.from({ length: total }, (_, i) => `<button type="button" class="carousel__dot" aria-label="${label} ${i + 1} de ${total}"></button>`).join('')
          : '';
    }
    update();
  }

  prev?.addEventListener('click', () => goTo(current() - 1));
  next?.addEventListener('click', () => goTo(current() + 1));
  dots?.addEventListener('click', (e) => {
    const dot = e.target.closest('.carousel__dot');
    if (dot) goTo($$('.carousel__dot', dots).indexOf(dot));
  });
  track.addEventListener('scroll', debounce(update, 60), { passive: true });
  new ResizeObserver(debounce(refresh, 100)).observe(track);

  // ─── Reproducción automática (pausable, WCAG 2.2.2) ───
  if (autoplay && !prefersReducedMotion()) {
    let userPaused = false;
    let hovered = false;

    const setPauseUI = () => {
      if (!pauseBtn) return;
      pauseBtn.innerHTML = icon(userPaused ? 'play' : 'pause');
      pauseBtn.setAttribute('aria-label', userPaused ? 'Reanudar carrusel' : 'Pausar carrusel');
    };

    setInterval(() => {
      if (!userPaused && !hovered && !document.hidden && pageCount() > 1) goTo(current() + 1);
    }, autoplay);

    root.addEventListener('mouseenter', () => (hovered = true));
    root.addEventListener('mouseleave', () => (hovered = false));
    root.addEventListener('focusin', () => (hovered = true));
    root.addEventListener('focusout', () => (hovered = false));
    pauseBtn?.addEventListener('click', () => {
      userPaused = !userPaused;
      setPauseUI();
    });
    setPauseUI();
  } else if (pauseBtn) {
    pauseBtn.hidden = true;
  }

  refresh();
  return { refresh, goTo };
}
