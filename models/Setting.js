/**
 * Configuración global del sitio (documento único, key = 'site'):
 * banner de alerta urgente, datos de contacto, enlaces y contenido institucional.
 */
const mongoose = require('mongoose');
const { urlField } = require('../utils/validators');

const ALERT_LEVELS = ['info', 'warning', 'urgent'];

const authoritySchema = new mongoose.Schema(
  {
    role: { type: String, trim: true, required: [true, 'El cargo es obligatorio'], maxlength: 100 },
    name: { type: String, trim: true, required: [true, 'El nombre es obligatorio'], maxlength: 100 },
  },
  { _id: false }
);

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'site', unique: true, immutable: true },
    alert: {
      enabled: { type: Boolean, default: true },
      message: {
        type: String,
        trim: true,
        default: 'Inscripciones a Mesas Extraordinarias abiertas',
        maxlength: [200, 'El mensaje de alerta admite hasta 200 caracteres'],
      },
      linkText: { type: String, trim: true, default: 'Ver fechas', maxlength: 40 },
      linkUrl: { ...urlField('Enlace de la alerta'), default: '#calendario' },
      level: { type: String, enum: { values: ALERT_LEVELS, message: 'Nivel de alerta no válido' }, default: 'urgent' },
    },
    contact: {
      address: { type: String, trim: true, default: 'San Salvador de Jujuy, Jujuy', maxlength: 200 },
      phone: { type: String, trim: true, default: '', maxlength: 60 },
      email: { type: String, trim: true, default: '', maxlength: 120 },
      whatsapp: {
        type: String,
        trim: true,
        default: '',
        match: [/^\+?\d{0,15}$/, 'WhatsApp: ingrese sólo números con código de país (ej: 5493880000000)'],
      },
      bedeliaHours: { type: String, trim: true, default: 'Lunes a viernes. Consultá los horarios por turno en Bedelía.', maxlength: 200 },
      facebookUrl: urlField('Facebook'),
      instagramUrl: urlField('Instagram'),
      mapUrl: urlField('Mapa'),
    },
    links: {
      preinscriptionUrl: { ...urlField('Preinscripción'), default: '#carreras' },
    },
    institutional: {
      mission: {
        type: String,
        trim: true,
        maxlength: 3000,
        default:
          'Formar profesionales y docentes de nivel superior con sólida preparación académica, ética y compromiso social, capaces de contribuir al desarrollo de la comunidad jujeña.',
      },
      vision: {
        type: String,
        trim: true,
        maxlength: 3000,
        default:
          'Ser una institución de referencia en la educación superior de la provincia, reconocida por la calidad de su formación, la inclusión y su vínculo con el territorio.',
      },
      authorities: { type: [authoritySchema], default: [] },
      imageUrl: urlField('Imagen institucional'),
    },
  },
  { timestamps: true }
);

settingSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.key;
    return ret;
  },
});

/** Devuelve (o crea) el documento único de configuración. */
settingSchema.statics.getSingleton = function getSingleton() {
  return this.findOneAndUpdate(
    { key: 'site' },
    { $setOnInsert: { key: 'site' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

settingSchema.statics.ALERT_LEVELS = ALERT_LEVELS;

module.exports = mongoose.model('Setting', settingSchema);
