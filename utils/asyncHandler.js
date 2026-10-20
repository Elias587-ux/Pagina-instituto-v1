/**
 * Envuelve un handler async para que los errores lleguen a next()
 * (Express 4 no captura rechazos de promesas por sí solo).
 * @param {(req, res, next) => Promise<any>} fn
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
