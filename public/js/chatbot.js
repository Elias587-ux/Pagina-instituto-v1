/**
 * Asistente virtual (chatbot) del sitio público.
 * Envía las consultas a POST /api/chat y muestra las respuestas con
 * listas, enlaces y sugerencias rápidas. La conversación se conserva
 * mientras la pestaña esté abierta (sessionStorage).
 */
import { api } from './api.js';
import { icon } from './icons.js';
import { $, $$, escapeHTML, safeUrl, storage } from './utils.js';

const HISTORY_KEY = 'ies11_chat_history';
const HINT_KEY = 'ies11_chat_hint_seen';
const MAX_HISTORY = 40;

const WELCOME = {
  text: '¡Hola! 👋 Soy el asistente virtual del IES N° 11.\nTe puedo ayudar con carreras, preinscripción, mesas y tribunales, trámites (títulos, permisos, BEGU, Progresar), fechas y horarios. ¿Qué necesitás?',
  // Keep in sync with DEFAULT_SUGGESTIONS in controllers/chatController.js
  suggestions: ['¿Qué carreras hay?', '¿Cómo me preinscribo?', 'Próximas mesas de examen', 'Permisos de examen', 'Retiro de títulos'],
};

export function initChatbot() {
  const panel = $('#chatPanel');
  const toggle = $('#chatToggle');
  const log = $('#chatLog');
  const form = $('#chatForm');
  const input = $('#chatInput');
  const suggestions = $('#chatSuggestions');
  const hint = $('#chatHint');

  let history = loadHistory();
  let busy = false;

  // ─── Persistencia ───
  function loadHistory() {
    try {
      return JSON.parse(storage.get(HISTORY_KEY, 'session')) || [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    storage.set(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)), 'session');
  }

  // ─── Renderizado ───
  function botHTML(reply) {
    const list = reply.list?.length ? `<ul>${reply.list.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '';
    const links = reply.links?.length
      ? `<div class="msg__links">${reply.links
          .map((l) => {
            const href = safeUrl(l.href);
            const external = /^https?:/i.test(href);
            return `<a class="msg__link" href="${escapeHTML(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ' data-chat-nav'}>${escapeHTML(l.label)}${external ? icon('external-link') : ''}</a>`;
          })
          .join('')}</div>`
      : '';
    return `<p>${escapeHTML(reply.text)}</p>${list}${links}`;
  }

  function appendMessage(role, payload, { persist = true } = {}) {
    const el = document.createElement('div');
    el.className = `msg msg--${role}`;
    el.innerHTML = role === 'bot' ? botHTML(payload) : `<p>${escapeHTML(payload)}</p>`;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    if (persist) {
      history.push({ role, payload });
      saveHistory();
    }
  }

  function renderSuggestions(list = []) {
    suggestions.innerHTML = list
      .map((s) => `<button type="button" class="chat__chip">${escapeHTML(s)}</button>`)
      .join('');
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'msg msg--bot msg--typing';
    el.setAttribute('aria-label', 'El asistente está escribiendo');
    el.innerHTML = '<span></span><span></span><span></span>';
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // ─── Envío ───
  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    busy = true;
    input.value = '';
    renderSuggestions([]);
    appendMessage('user', message);

    const typing = showTyping();
    const started = Date.now();
    try {
      const { reply } = await api.chat(message);
      // Pequeña pausa para que la respuesta no aparezca de golpe
      await new Promise((r) => setTimeout(r, Math.max(0, 450 - (Date.now() - started))));
      typing.remove();
      appendMessage('bot', reply);
      renderSuggestions(reply.suggestions);
    } catch (err) {
      typing.remove();
      appendMessage('bot', { text: `No pude responder en este momento (${err.message}). Probá de nuevo en unos segundos.` }, { persist: false });
      renderSuggestions(WELCOME.suggestions);
    } finally {
      busy = false;
      input.focus();
    }
  }

  // ─── Abrir / cerrar ───
  function open() {
    panel.hidden = false;
    document.body.classList.add('chat-open');
    toggle.setAttribute('aria-expanded', 'true');
    hint.hidden = true;
    storage.set(HINT_KEY, '1', 'session');
    $('.fab__badge', toggle)?.remove();

    if (!log.childElementCount) {
      if (history.length) {
        history.forEach(({ role, payload }) => appendMessage(role, payload, { persist: false }));
        const last = [...history].reverse().find((m) => m.role === 'bot');
        renderSuggestions(last?.payload?.suggestions || WELCOME.suggestions);
      } else {
        appendMessage('bot', WELCOME, { persist: false });
        renderSuggestions(WELCOME.suggestions);
      }
    }
    input.focus();
  }

  function close() {
    panel.hidden = true;
    document.body.classList.remove('chat-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
  $('#chatClose').addEventListener('click', close);
  panel.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });
  suggestions.addEventListener('click', (e) => {
    const chip = e.target.closest('.chat__chip');
    if (chip) send(chip.textContent);
  });
  // Enlaces internos (#seccion): en pantallas chicas cerramos el chat para ver la sección
  log.addEventListener('click', (e) => {
    if (e.target.closest('[data-chat-nav]') && window.matchMedia('(max-width: 520px)').matches) close();
  });
  $$('[data-open-chat]').forEach((btn) =>
    btn.addEventListener('click', () => {
      $('#menuDrawer')?.close?.();
      open();
    })
  );

  // Globo de ayuda la primera vez que se visita el sitio en la sesión
  if (!storage.get(HINT_KEY, 'session')) {
    setTimeout(() => {
      if (panel.hidden) hint.hidden = false;
    }, 2500);
    setTimeout(() => (hint.hidden = true), 11000);
  }
}
