/**
 * "Vida institucional": photos and social-network videos (YouTube, Instagram,
 * TikTok, Facebook) shown as expandable cards on the home page.
 */
const mongoose = require('mongoose');
const { urlField, toJSONOptions } = require('../utils/validators');
const { resolveSocialUrl, needsResolution } = require('../utils/resolveSocialUrl');

// Keep in sync with public/js/embeds.js
const SOCIAL_VIDEO_HOSTS = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|fb\.watch)\//i;
const TAGS = ['Jornadas', 'Prácticas', 'Comunidad', 'Deportes y cultura', 'Egresos', 'Instalaciones'];

const galleryItemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'El título es obligatorio'],
      trim: true,
      maxlength: [120, 'El título admite hasta 120 caracteres'],
    },
    tag: { type: String, enum: { values: TAGS, message: 'Categoría no válida' }, default: 'Jornadas' },
    description: { type: String, trim: true, default: '', maxlength: [600, 'La descripción admite hasta 600 caracteres'] },
    date: { type: Date, default: Date.now },
    imageUrl: urlField('Imagen'),
    videoUrl: {
      ...urlField('Video'),
      validate: {
        validator: (v) => !v || SOCIAL_VIDEO_HOSTS.test(v),
        message: 'Video: pegá el link de una publicación de YouTube, Instagram, TikTok o Facebook (https://…)',
      },
    },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Facebook short share links can't be embedded: store the canonical video URL instead
galleryItemSchema.pre('validate', async function resolveVideoUrl() {
  // Not limited to isModified: re-saving an old post with a short link also fixes it
  if (needsResolution(this.videoUrl)) {
    this.videoUrl = await resolveSocialUrl(this.videoUrl);
  }
});

galleryItemSchema.pre('validate', function requireMedia(next) {
  if (!this.imageUrl && !this.videoUrl) this.invalidate('imageUrl', 'Cargá una imagen o el link de un video');
  next();
});

galleryItemSchema.index({ active: 1, order: 1, date: -1 });
galleryItemSchema.set('toJSON', toJSONOptions);
galleryItemSchema.statics.TAGS = TAGS;

module.exports = mongoose.model('GalleryItem', galleryItemSchema);
