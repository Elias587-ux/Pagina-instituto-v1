/**
 * Calendario académico: mesas ordinarias/extraordinarias, feriados e
 * inasistencias, y fechas de cursillos e inscripción.
 */
const mongoose = require('mongoose');
const { toJSONOptions } = require('../utils/validators');

const CATEGORIES = {
  'mesa-ordinaria': 'Mesas Ordinarias',
  'mesa-extraordinaria': 'Mesas Extraordinarias',
  feriado: 'Feriados e Inasistencias',
  cursillo: 'Cursillos e Inscripción',
};
const SHIFTS = ['Mañana', 'Tarde', 'Noche', 'Todo el día'];
const STATUSES = ['programado', 'abierto', 'cerrado', 'finalizado'];

const calendarEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: [160, 'El título admite hasta 160 caracteres'],
    },
    category: {
      type: String,
      required: [true, 'La categoría es obligatoria'],
      enum: { values: Object.keys(CATEGORIES), message: 'Categoría no válida' },
    },
    date: { type: Date, required: [true, 'La fecha es obligatoria'] },
    endDate: {
      type: Date,
      default: null,
      validate: {
        validator(value) {
          return !value || !this.date || value >= this.date;
        },
        message: 'La fecha de fin no puede ser anterior a la de inicio',
      },
    },
    shift: { type: String, enum: { values: SHIFTS, message: 'Turno no válido' }, default: 'Todo el día' },
    status: { type: String, enum: { values: STATUSES, message: 'Estado no válido' }, default: 'programado' },
    career: { type: String, trim: true, default: '', maxlength: 160 },
    location: { type: String, trim: true, default: '', maxlength: 160 },
    description: { type: String, trim: true, default: '', maxlength: [1000, 'La descripción es demasiado larga'] },
  },
  { timestamps: true }
);

calendarEventSchema.index({ category: 1, date: 1 });
calendarEventSchema.set('toJSON', toJSONOptions);
calendarEventSchema.statics.CATEGORIES = CATEGORIES;
calendarEventSchema.statics.SHIFTS = SHIFTS;
calendarEventSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
