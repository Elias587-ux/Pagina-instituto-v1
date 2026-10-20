/**
 * Diapositivas del carrusel principal (hero) de la portada.
 */
const mongoose = require('mongoose');
const { urlField, toJSONOptions } = require('../utils/validators');

const slideSchema = new mongoose.Schema(
  {
    eyebrow: { type: String, trim: true, default: '', maxlength: [40, 'La etiqueta admite hasta 40 caracteres'] },
    title: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: [120, 'El título admite hasta 120 caracteres'],
    },
    highlight: { type: String, trim: true, default: '', maxlength: [80, 'El destacado admite hasta 80 caracteres'] },
    subtitle: { type: String, trim: true, default: '', maxlength: [200, 'El subtítulo admite hasta 200 caracteres'] },
    ctaText: { type: String, trim: true, default: '', maxlength: [40, 'El texto del botón admite hasta 40 caracteres'] },
    ctaUrl: urlField('Enlace del botón'),
    imageUrl: urlField('Imagen'),
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

slideSchema.index({ active: 1, order: 1 });
slideSchema.set('toJSON', toJSONOptions);

module.exports = mongoose.model('Slide', slideSchema);
