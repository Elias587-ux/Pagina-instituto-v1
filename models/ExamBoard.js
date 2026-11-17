/**
 * Mesas de examen (tribunales): una fila por materia, con el formato de la
 * planilla de Bedelía: carrera, materia, fecha del llamado, hora, titular,
 * 1º vocal, 2º vocal y suplente. "session" agrupa las filas de un mismo
 * turno (ej: "Mesas Extraordinarias Octubre 2026").
 */
const mongoose = require('mongoose');
const { toJSONOptions } = require('../utils/validators');

const TYPES = ['Extraordinaria', 'Ordinaria'];

const person = (label) => ({ type: String, trim: true, default: '', maxlength: [80, `${label}: hasta 80 caracteres`] });

const examBoardSchema = new mongoose.Schema(
  {
    session: {
      type: String,
      required: [true, 'El turno de mesas es obligatorio'],
      trim: true,
      maxlength: [120, 'El turno admite hasta 120 caracteres'],
    },
    type: { type: String, enum: { values: TYPES, message: 'Tipo de mesa no válido' }, default: 'Extraordinaria' },
    career: { type: String, required: [true, 'La carrera es obligatoria'], trim: true, maxlength: 160 },
    subject: { type: String, required: [true, 'La materia es obligatoria'], trim: true, maxlength: 200 },
    date: { type: Date, required: [true, 'La fecha del 1er llamado es obligatoria'] },
    secondCallDate: {
      type: Date,
      default: null,
      validate: {
        validator(value) {
          return !value || !this.date || value >= this.date;
        },
        message: 'El 2º llamado no puede ser anterior al 1º',
      },
    },
    time: {
      type: String,
      trim: true,
      default: '',
      match: [/^$|^([01]?\d|2[0-3])(:[0-5]\d)?$/, 'Hora no válida (ej: 15 o 20:30)'],
    },
    president: person('Titular'),
    firstVocal: person('1º vocal'),
    secondVocal: person('2º vocal'),
    substitute: person('Suplente'),
    published: { type: Boolean, default: true },
  },
  { timestamps: true }
);

examBoardSchema.index({ published: 1, date: 1 });
examBoardSchema.set('toJSON', toJSONOptions);
examBoardSchema.statics.TYPES = TYPES;

module.exports = mongoose.model('ExamBoard', examBoardSchema);
