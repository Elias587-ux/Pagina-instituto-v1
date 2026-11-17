/**
 * Rutas de vistas HTML. Las páginas son estáticas y cargan sus datos vía /api.
 */
const fs = require('fs/promises');
const path = require('path');
const express = require('express');

const router = express.Router();
const VIEWS_DIR = path.join(__dirname, '..', 'views');

const sendView = (file) => (_req, res) => res.sendFile(path.join(VIEWS_DIR, file));

/**
 * Las redes sociales exigen URLs absolutas en las etiquetas og:*, así que la
 * portada reemplaza {{SITE_URL}} por el dominio público (SITE_URL en .env)
 * o, si no está definido, por el host desde el que se pidió la página.
 */
const sendPortal = async (req, res, next) => {
  try {
    const siteUrl = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const html = await fs.readFile(path.join(VIEWS_DIR, 'index.html'), 'utf8');
    res.type('html').send(html.replaceAll('{{SITE_URL}}', siteUrl));
  } catch (err) {
    next(err);
  }
};

/**
 * El portal es una sola vista dividida en páginas del lado del cliente
 * (public/js/main.js); cada ruta pública sirve el mismo HTML.
 */
const PORTAL_PATHS = ['/', '/ingresantes', '/estudiantes', '/institucional', '/novedades', '/contacto'];
router.get(PORTAL_PATHS, sendPortal);
router.get('/login', sendView('login.html'));
router.get('/admin', sendView('admin-dashboard.html'));

module.exports = router;
