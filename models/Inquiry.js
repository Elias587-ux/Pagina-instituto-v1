/**
 * Questions sent from the public contact form. The admin answers them from
 * the panel and the answer is emailed to the applicant.
 */
const mongoose = require('mongoose');
const { toJSONOptions } = require('../utils/validators');

const STATUSES = ['nueva', 'respondida', 'archivada'];
const SUBJECTS = ['Preinscripción', 'Carreras', 'Trámites', 'Becas', 'Mesas de examen', 'Otro'];
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

const replySchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    sentBy: { type: String, trim: true, default: '' },
    delivered: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const inquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Ingresá tu nombre'],
      trim: true,
      minlength: [2, 'Ingresá tu nombre'],
      maxlength: [80, 'El nombre admite hasta 80 caracteres'],
    },
    email: {
      type: String,
      required: [true, 'Ingresá tu correo'],
      trim: true,
      lowercase: true,
      maxlength: [120, 'El correo admite hasta 120 caracteres'],
      match: [EMAIL_RE, 'Ingresá un correo válido (ej: nombre@gmail.com)'],
    },
    phone: { type: String, trim: true, default: '', maxlength: [30, 'El teléfono admite hasta 30 caracteres'] },
    career: { type: String, trim: true, default: '', maxlength: 160 },
    subject: { type: String, enum: { values: SUBJECTS, message: 'Elegí un motivo de la lista' }, default: 'Otro' },
    message: {
      type: String,
      required: [true, 'Escribí tu consulta'],
      trim: true,
      minlength: [10, 'Contanos un poco más (mínimo 10 caracteres)'],
      maxlength: [2000, 'La consulta admite hasta 2000 caracteres'],
    },
    status: { type: String, enum: { values: STATUSES, message: 'Estado no válido' }, default: 'nueva' },
    notes: { type: String, trim: true, default: '', maxlength: 1000 },
    replies: { type: [replySchema], default: [] },
  },
  { timestamps: true }
);

inquirySchema.index({ status: 1, createdAt: -1 });
inquirySchema.set('toJSON', toJSONOptions);
inquirySchema.statics.STATUSES = STATUSES;
inquirySchema.statics.SUBJECTS = SUBJECTS;

module.exports = mongoose.model('Inquiry', inquirySchema);
