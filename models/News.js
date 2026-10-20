/**
 * Noticias, anuncios y jornadas institucionales.
 */
const mongoose = require('mongoose');
const { urlField, toJSONOptions } = require('../utils/validators');

const CATEGORIES = ['Académico', 'Institucional', 'Eventos/Jornadas'];

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: [160, 'El título admite hasta 160 caracteres'],
    },
    summary: {
      type: String,
      required: [true, 'El resumen es obligatorio'],
      trim: true,
      maxlength: [300, 'El resumen admite hasta 300 caracteres'],
    },
    content: { type: String, trim: true, default: '', maxlength: [10000, 'El contenido es demasiado largo'] },
    category: {
      type: String,
      required: [true, 'La categoría es obligatoria'],
      enum: { values: CATEGORIES, message: 'Categoría no válida' },
    },
    date: { type: Date, required: [true, 'La fecha es obligatoria'], default: Date.now },
    imageUrl: urlField('Imagen'),
    published: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

newsSchema.index({ published: 1, date: -1 });
newsSchema.set('toJSON', toJSONOptions);
newsSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('News', newsSchema);
