/**
 * Vista previa en vivo para el panel: carga el sitio público real (/?preview=1)
 * en un iframe y le envía el borrador del formulario con postMessage. El sitio
 * lo dibuja con el mismo código que usa para los datos publicados (ver
 * "Vista previa en vivo" en main.js), así se ve exactamente como va a quedar.
 */
import { icon } from './icons.js';
import { $, $$, escapeHTML } from './utils.js';

const DEVICES = {
  desktop: { width: 1280, label: 'Computadora', icon: 'monitor' },
  mobile: { width: 390, label: 'Celular', icon: 'smartphone' },
};

const segmented = (name, items, current) =>
  `<div class="segmented" role="group" aria-label="${escapeHTML(name)}">${items
    .map(
      (it) =>
        `<button type="button" data-value="${escapeHTML(it.id)}" aria-pressed="${it.id === current}"${it.icon ? ` title="${escapeHTML(it.label)}"` : ''}>${
          it.icon ? `${icon(it.icon)}<span class="sr-only">${escapeHTML(it.label)}</span>` : escapeHTML(it.label)
        }</button>`
    )
    .join('')}</div>`;

/**
 * @param {HTMLElement} host Contenedor donde se dibuja la vista previa.
 * @param {{ views?: {id: string, label: string}[], getMessage: (view: string) => ({ resource: string, item: object } | null) }} options
 * @returns {{ update: () => void, refresh: () => void, setViews: (views: {id: string, label: string}[]) => void }}
 */
export function createLivePreview(host, { views = [], getMessage }) {
  let view = views[0]?.id || '';
  let device = 'desktop';
  let ready = false;
  let timer = null;
  let sentAt = 0;
  let lastField = null;

  host.innerHTML = `
    <div class="live-preview">
      <div class="live-preview__bar">
        <span class="live-preview__label"><span class="live-dot" aria-hidden="true"></span>Vista previa en vivo</span>
        <span class="live-preview__views" data-views></span>
        <span data-devices>${segmented('Dispositivo', Object.entries(DEVICES).map(([id, d]) => ({ id, ...d })), device)}</span>
      </div>
      <div class="live-preview__stage" data-stage>
        <span class="spinner live-preview__loading" role="status" aria-label="Cargando vista previa"></span>
        <iframe class="live-preview__frame" title="Vista previa del sitio" src="/?preview=1" tabindex="-1"></iframe>
      </div>
      <p class="live-preview__note">${icon('info')}Así se va a ver en el sitio. Nada se publica hasta que guardes.</p>
    </div>`;

  const root = $('.live-preview', host);
  const stage = $('[data-stage]', host);
  const frame = $('iframe', host);

  function renderViews() {
    $('[data-views]', host).innerHTML = views.length > 1 ? segmented('Qué mostrar', views, view) : '';
  }

  function fit() {
    const width = DEVICES[device].width;
    const scale = Math.min(1, stage.clientWidth / width);
    frame.style.width = `${width}px`;
    frame.style.height = `${stage.clientHeight / scale}px`;
    frame.style.left = `${Math.max(0, (stage.clientWidth - width * scale) / 2)}px`;
    frame.style.transform = `scale(${scale})`;
  }

  function refresh() {
    clearTimeout(timer);
    if (!ready) return;
    const message = getMessage(view);
    if (!message) return;
    lastField = document.activeElement;
    sentAt = performance.now();
    frame.contentWindow.postMessage({ type: 'ies11:preview', view, ...message }, window.location.origin);
  }

  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 200);
  };

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== window.location.origin) return;
    if (e.data?.type === 'ies11:preview-ready') {
      ready = true;
      root.classList.add('is-ready');
      refresh();
    }
  });

  // Si el sitio toma el foco al redibujar (ej: al abrir una ventana), se devuelve al campo que se estaba editando
  window.addEventListener('blur', () =>
    setTimeout(() => {
      if (document.activeElement === frame && performance.now() - sentAt < 600 && lastField && lastField !== frame && lastField.isConnected) {
        lastField.focus({ preventScroll: true });
      }
    })
  );

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented [data-value]');
    if (!btn) return;
    const group = btn.closest('[data-views], [data-devices]');
    if (group.matches('[data-devices]')) {
      device = btn.dataset.value;
      root.classList.toggle('live-preview--mobile', device === 'mobile');
      fit();
    } else {
      view = btn.dataset.value;
      refresh();
    }
    $$('[data-value]', group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });

  new ResizeObserver(fit).observe(stage);
  renderViews();

  return {
    update,
    refresh,
    setViews(next) {
      views = next;
      if (!views.some((v) => v.id === view)) view = views[0]?.id || '';
      renderViews();
    },
  };
}
