/**
 * Carreras / oferta académica y sus planes de estudio.
 */
const mongoose = require('mongoose');
const { urlField, toJSONOptions } = require('../utils/validators');

const MODALITIES = ['Presencial', 'Semipresencial', 'A distancia'];
const SHIFTS = ['Mañana', 'Tarde', 'Noche'];

const careerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre de la carrera es obligatorio'],
      trim: true,
      maxlength: [160, 'El nombre admite hasta 160 caracteres'],
    },
    degree: {
      type: String,
      required: [true, 'La titulación es obligatoria'],
      trim: true,
      maxlength: [200, 'La titulación admite hasta 200 caracteres'],
    },
    area: { type: String, trim: true, default: '', maxlength: 60 },
    durationYears: {
      type: Number,
      required: [true, 'La duración es obligatoria'],
      min: [1, 'La duración mínima es 1 año'],
      max: [6, 'La duración máxima es 6 años'],
    },
    modality: {
      type: String,
      required: [true, 'La modalidad es obligatoria'],
      enum: { values: MODALITIES, message: 'Modalidad no válida' },
    },
    shifts: {
      type: [{ type: String, enum: { values: SHIFTS, message: 'Turno no válido' } }],
      default: [],
    },
    description: { type: String, trim: true, default: '', maxlength: [3000, 'La descripción es demasiado larga'] },
    logoUrl: urlField('Logo'),
    imageUrl: urlField('Imagen'),
    studyPlanUrl: urlField('Plan de estudio'),
    cursilloUrl: urlField('Cursillo de ingreso'),
    coordinator: { type: String, trim: true, default: '', maxlength: [120, 'El coordinador admite hasta 120 caracteres'] },
    coordinatorSchedule: { type: String, trim: true, default: '', maxlength: [160, 'El horario admite hasta 160 caracteres'] },
    whatsappChannelUrl: urlField('Canal de WhatsApp'),
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

careerSchema.index({ active: 1, order: 1, name: 1 });
careerSchema.set('toJSON', toJSONOptions);
careerSchema.statics.MODALITIES = MODALITIES;
careerSchema.statics.SHIFTS = SHIFTS;

module.exports = mongoose.model('Career', careerSchema);
