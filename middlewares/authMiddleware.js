/**
 * Autenticación JWT (header "Authorization: Bearer <token>") y control de roles.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/** Exige un token válido y carga el usuario en req.user. */
const protect = asyncHandler(async (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError('Necesitás iniciar sesión para continuar', 401);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'La sesión expiró. Volvé a iniciar sesión.' : 'Token inválido';
    throw new AppError(message, 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new AppError('Usuario no autorizado', 401);

  req.user = user;
  next();
});

/** Restringe el acceso a los roles indicados. Debe usarse después de protect. */
const authorize =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(new AppError('No tenés permisos para esta acción', 403));

module.exports = { protect, authorize };
