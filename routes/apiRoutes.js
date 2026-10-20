/**
 * Rutas de la API REST (montadas en /api).
 *
 * Públicas:
 *   GET  /health
 *   GET  /settings
 *   GET  /news            GET /news/:id
 *   GET  /careers         GET /careers/:id
 *   GET  /calendar
 *   GET  /procedures
 *   GET  /search?q=
 *   GET  /slides
 *   POST /chat
 *   POST /auth/login
 *
 * Protegidas (JWT, rol admin/editor):
 *   GET  /auth/me
 *   GET  /admin/stats
 *   PUT  /admin/settings
 *   GET|POST       /admin/:resource          (news | careers | calendar | procedures | slides)
 *   PUT|DELETE     /admin/:resource/:id
 */
const express = require('express');
const rateLimit = require('express-rate-limit');

const { protect, authorize } = require('../middlewares/authMiddleware');
const { notFound, requireDB } = require('../middlewares/errorHandler');
const { isDBConnected } = require('../config/db');

const auth = require('../controllers/authController');
const news = require('../controllers/newsController');
const academic = require('../controllers/academicController');
const procedures = require('../controllers/proceduresController');
const settings = require('../controllers/settingsController');
const search = require('../controllers/searchController');
const admin = require('../controllers/adminController');
const slides = require('../controllers/slidesController');
const chat = require('../controllers/chatController');

const router = express.Router();

// Limita intentos de login para mitigar fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Demasiados intentos de inicio de sesión. Probá de nuevo en 15 minutos.' } },
});

// Limita el uso del chatbot por IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Estás enviando muchos mensajes. Esperá un minuto e intentá de nuevo.' } },
});

router.get('/health', (_req, res) => res.json({ status: 'ok', database: isDBConnected() ? 'connected' : 'disconnected' }));

router.use(requireDB);

// ─── Autenticación ───
router.post('/auth/login', loginLimiter, auth.login);
router.get('/auth/me', protect, auth.me);

// ─── Contenido público ───
router.get('/settings', settings.getSettings);
router.get('/news', news.listNews);
router.get('/news/:id', news.getNews);
router.get('/careers', academic.listCareers);
router.get('/careers/:id', academic.getCareer);
router.get('/calendar', academic.listCalendar);
router.get('/procedures', procedures.listProcedures);
router.get('/search', search.search);
router.get('/slides', slides.listSlides);
router.post('/chat', chatLimiter, chat.chat);

// ─── Panel de administración ───
const adminRouter = express.Router();
adminRouter.use(protect, authorize('admin', 'editor'));
adminRouter.get('/stats', admin.stats);
adminRouter.put('/settings', admin.updateSettings);
adminRouter.get('/:resource', admin.list);
adminRouter.post('/:resource', admin.create);
adminRouter.put('/:resource/:id', admin.update);
adminRouter.delete('/:resource/:id', admin.remove);
router.use('/admin', adminRouter);

router.use(notFound);

module.exports = router;
