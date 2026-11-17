/**
 * Testimonios de egresados/as y estudiantes que se muestran en la portada.
 */
const mongoose = require('mongoose');
const { urlField, toJSONOptions } = require('../utils/validators');

const testimonialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      maxlength: [80, 'El nombre admite hasta 80 caracteres'],
    },
    career: { type: String, trim: true, default: '', maxlength: [160, 'La carrera admite hasta 160 caracteres'] },
    role: { type: String, trim: true, default: '', maxlength: [120, 'La ocupación admite hasta 120 caracteres'] },
    quote: {
      type: String,
      required: [true, 'El testimonio es obligatorio'],
      trim: true,
      maxlength: [400, 'El testimonio admite hasta 400 caracteres'],
    },
    photoUrl: urlField('Foto'),
    // Google reviews are imported hidden (active: false) until an admin approves them
    source: { type: String, enum: ['manual', 'google'], default: 'manual' },
    rating: { type: Number, min: [1, 'Mínimo 1 estrella'], max: [5, 'Máximo 5 estrellas'], default: null },
    googleReviewId: { type: String, trim: true, default: '', maxlength: 300 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

testimonialSchema.index({ active: 1, order: 1 });
testimonialSchema.set('toJSON', toJSONOptions);

module.exports = mongoose.model('Testimonial', testimonialSchema);
