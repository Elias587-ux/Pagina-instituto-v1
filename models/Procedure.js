/**
 * Trámites estudiantiles frecuentes (BEGU, Progresar, constancias, etc.).
 */
const mongoose = require('mongoose');
const { urlField, toJSONOptions } = require('../utils/validators');

const STATUSES = ['abierto', 'cerrado'];
const ICONS = ['bus', 'scholarship', 'document', 'wallet', 'diploma', 'info'];

const procedureSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: [120, 'El título admite hasta 120 caracteres'],
    },
    description: {
      type: String,
      required: [true, 'La descripción es obligatoria'],
      trim: true,
      maxlength: [600, 'La descripción admite hasta 600 caracteres'],
    },
    status: { type: String, enum: { values: STATUSES, message: 'Estado no válido' }, default: 'abierto' },
    icon: { type: String, enum: { values: ICONS, message: 'Ícono no válido' }, default: 'info' },
    requirements: {
      type: [{ type: String, trim: true, maxlength: [200, 'Cada requisito admite hasta 200 caracteres'] }],
      default: [],
    },
    downloadUrl: urlField('Descarga'),
    downloadLabel: { type: String, trim: true, default: '', maxlength: 60 },
    // Online form of the procedure (e.g. Becas Progresar, BEGU), like the preinscription link
    linkUrl: urlField('Link del trámite'),
    linkLabel: { type: String, trim: true, default: '', maxlength: 60 },
    schedule: { type: String, trim: true, default: '', maxlength: 160 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

procedureSchema.index({ order: 1, title: 1 });
procedureSchema.set('toJSON', toJSONOptions);
procedureSchema.statics.STATUSES = STATUSES;
procedureSchema.statics.ICONS = ICONS;

module.exports = mongoose.model('Procedure', procedureSchema);
