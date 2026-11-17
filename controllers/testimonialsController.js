/**
 * Testimonios de la portada (lectura pública) e importación de opiniones de Google.
 */
const Testimonial = require('../models/Testimonial');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/testimonials */
exports.listTestimonials = asyncHandler(async (_req, res) => {
  const items = await Testimonial.find({ active: true })
    .sort({ order: 1, createdAt: 1 })
    .limit(12)
    .select('-__v -googleReviewId')
    .lean();
  res.json({ items, total: items.length });
});

const QUOTE_MAX = 400;
const trimQuote = (text) => (text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1).trimEnd()}…` : text);

/**
 * POST /api/admin/testimonials/import-google
 * Reads the place's reviews from the Google Places API (New) and stores the ones
 * that pass the filter (minimum rating + real text) as hidden testimonials, so an
 * admin approves each one before it is published. Already imported reviews are skipped.
 * Env: GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID, GOOGLE_REVIEWS_MIN_RATING (default 4).
 */
exports.importGoogleReviews = asyncHandler(async (_req, res) => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!key || !placeId) {
    throw new AppError('Falta configurar GOOGLE_PLACES_API_KEY y GOOGLE_PLACE_ID en el servidor (.env).', 400);
  }
  const minRating = Math.min(5, Math.max(1, Number(process.env.GOOGLE_REVIEWS_MIN_RATING) || 4));

  let data;
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'reviews' },
      signal: AbortSignal.timeout(10000),
    });
    data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  } catch (err) {
    console.error('[google-reviews]', err.message);
    throw new AppError(`Google no respondió: ${err.message}`, 502);
  }

  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const existing = new Set(
    (await Testimonial.find({ source: 'google' }).select('googleReviewId').lean()).map((t) => t.googleReviewId)
  );

  const accepted = reviews.filter((r) => {
    const text = (r.originalText?.text || r.text?.text || '').trim();
    return r.rating >= minRating && text.length >= 20 && r.name && !existing.has(r.name);
  });

  const created = await Testimonial.insertMany(
    accepted.map((r) => ({
      name: (r.authorAttribution?.displayName || 'Opinión de Google').slice(0, 80),
      role: 'Opinión en Google',
      quote: trimQuote((r.originalText?.text || r.text?.text).trim()),
      photoUrl: /^https:\/\//.test(r.authorAttribution?.photoUri || '') ? r.authorAttribution.photoUri.slice(0, 500) : '',
      source: 'google',
      rating: r.rating,
      googleReviewId: r.name,
      active: false,
      order: 100,
    })),
    // One invalid review must not abort the rest of the batch
    { ordered: false, rawResult: true }
  ).catch((err) => ({ insertedCount: err.insertedDocs?.length ?? err.result?.insertedCount ?? 0 }));

  res.json({ imported: created.insertedCount ?? 0, received: reviews.length, minRating });
});
