/**
 * Autenticación del panel de administración.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

/** POST /api/auth/login — { email, password } → { token, user } */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  // typeof evita inyección de operadores ({ "$gt": "" }) en la consulta
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw new AppError('Ingresá tu email y contraseña', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  const valid = user && user.active && (await user.comparePassword(password));
  if (!valid) throw new AppError('Email o contraseña incorrectos', 401);

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.json({ token: signToken(user), user: user.toJSON() });
});

/** GET /api/auth/me — usuario autenticado actual */
exports.me = (req, res) => res.json({ user: req.user });
