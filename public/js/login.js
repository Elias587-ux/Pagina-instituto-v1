/**
 * Página de acceso administrativo: valida el formulario, obtiene el JWT
 * y redirige al panel.
 */
import { api, auth } from './api.js';
import { hydrateIcons } from './icons.js';
import { $ } from './utils.js';

const form = $('#loginForm');
const errorBox = $('#loginError');
const submit = $('#loginSubmit');

const showError = (message) => {
  errorBox.textContent = message;
  errorBox.hidden = false;
};

async function redirectIfLoggedIn() {
  if (!auth.getToken()) return;
  try {
    await api.me();
    window.location.replace('/admin');
  } catch {
    auth.clear();
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;

  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    showError('Ingresá tu email y contraseña.');
    (email ? form.password : form.email).focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Ingresando…';
  try {
    const { token } = await api.login(email, password);
    auth.setToken(token);
    window.location.replace('/admin');
  } catch (err) {
    showError(err.message);
    form.password.select();
  } finally {
    submit.disabled = false;
    submit.textContent = 'Ingresar';
  }
});

hydrateIcons();
redirectIfLoggedIn();
