/**
 * Error operacional con código HTTP. Los controladores lo lanzan y el
 * middleware errorHandler lo transforma en una respuesta JSON.
 */
class AppError extends Error {
  /**
   * @param {string} message Mensaje legible para el usuario.
   * @param {number} [statusCode=500]
   * @param {Array<{field: string, message: string}>} [details]
   */
  constructor(message, statusCode = 500, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = AppError;
