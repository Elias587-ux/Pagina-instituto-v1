// Validation rules of the Mongoose models (validateSync: no database connection needed).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const GalleryItem = require('../models/GalleryItem');
const Inquiry = require('../models/Inquiry');
const Procedure = require('../models/Procedure');
const CalendarEvent = require('../models/CalendarEvent');
const Testimonial = require('../models/Testimonial');
const Setting = require('../models/Setting');

/** Field names that failed validation ([] when the document is valid). */
const invalidFields = (doc) => Object.keys(doc.validateSync()?.errors || {});

test('Inquiry: accepts a real question and rejects bad emails and header injection', () => {
  const base = { name: 'Ana Pérez', message: 'Quería saber las fechas de inscripción' };
  assert.deepEqual(invalidFields(new Inquiry({ ...base, email: 'ana@gmail.com' })), []);
  for (const email of ['nope', 'a@b', 'ana@gmail.com\r\nBcc: x@y.com', 'a@b.com, c@d.com']) {
    assert.ok(invalidFields(new Inquiry({ ...base, email })).includes('email'), email);
  }
  assert.ok(invalidFields(new Inquiry({ ...base, email: 'ana@gmail.com', message: 'hola' })).includes('message'));
});

test('Inquiry: new questions start as "nueva" and the subject must come from the list', () => {
  const ok = new Inquiry({ name: 'Ana', email: 'ana@gmail.com', message: 'Una consulta larga' });
  assert.equal(ok.status, 'nueva');
  const bad = new Inquiry({ name: 'Ana', email: 'ana@gmail.com', message: 'Una consulta larga', subject: 'Hackeo' });
  assert.ok(invalidFields(bad).includes('subject'));
});

test('GalleryItem: only videos from the four allowed social networks', () => {
  assert.deepEqual(invalidFields(new GalleryItem({ title: 'Jornada', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })), []);
  for (const videoUrl of ['https://evil.com/v', 'https://youtube.com.evil.com/x', 'javascript:alert(1)']) {
    assert.ok(invalidFields(new GalleryItem({ title: 'x', videoUrl })).includes('videoUrl'), videoUrl);
  }
});

test('GalleryItem: a post needs a photo or a video (checked on save)', async () => {
  await assert.rejects(new GalleryItem({ title: 'Sin nada' }).validate(), /imagen o el link de un video/);
  await new GalleryItem({ title: 'Con foto', imageUrl: '/uploads/image/a.webp' }).validate();
});

test('Procedure: the online link must be a safe URL', () => {
  const base = { title: 'Becas Progresar', description: 'Inscripción anual' };
  assert.deepEqual(invalidFields(new Procedure({ ...base, linkUrl: 'https://www.anses.gob.ar/progresar' })), []);
  assert.ok(invalidFields(new Procedure({ ...base, linkUrl: 'javascript:alert(1)' })).includes('linkUrl'));
});

test('CalendarEvent: accepts the nine categories and rejects unknown ones', () => {
  const date = new Date('2026-12-02');
  for (const category of Object.keys(CalendarEvent.CATEGORIES)) {
    assert.deepEqual(invalidFields(new CalendarEvent({ title: 'x', category, date })), [], category);
  }
  assert.equal(Object.keys(CalendarEvent.CATEGORIES).length, 9);
  assert.ok(invalidFields(new CalendarEvent({ title: 'x', category: 'fiesta', date })).includes('category'));
  // the end of a range cannot be before its start
  assert.ok(invalidFields(new CalendarEvent({ title: 'x', category: 'evento', date, endDate: new Date('2026-12-01') })).includes('endDate'));
});

test('Testimonial: Google ratings must be between 1 and 5 stars', () => {
  const base = { name: 'Ana', quote: 'Excelente instituto' };
  assert.deepEqual(invalidFields(new Testimonial({ ...base, rating: 5, source: 'google' })), []);
  assert.ok(invalidFields(new Testimonial({ ...base, rating: 6 })).includes('rating'));
  assert.ok(invalidFields(new Testimonial({ ...base, rating: 0 })).includes('rating'));
});

test('Setting: home photos accept https and /uploads paths but not javascript:', () => {
  const ok = new Setting({ home: { pathImages: { tecnicatura: 'https://res.cloudinary.com/x/a.webp', estudiante: '/uploads/image/b.webp' } } });
  assert.deepEqual(invalidFields(ok), []);
  const bad = new Setting({ home: { pathImages: { tecnicatura: 'javascript:alert(1)' } } });
  assert.ok(invalidFields(bad).some((f) => f.startsWith('home.')));
});
