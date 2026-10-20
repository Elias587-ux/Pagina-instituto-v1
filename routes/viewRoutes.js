/**
 * Rutas de vistas HTML. Las páginas son estáticas y cargan sus datos vía /api.
 */
const path = require('path');
const express = require('express');

const router = express.Router();
const VIEWS_DIR = path.join(__dirname, '..', 'views');

const sendView = (file) => (_req, res) => res.sendFile(path.join(VIEWS_DIR, file));

router.get('/', sendView('index.html'));
router.get('/login', sendView('login.html'));
router.get('/admin', sendView('admin-dashboard.html'));

module.exports = router;
