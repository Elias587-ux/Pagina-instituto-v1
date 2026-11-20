// Gallery video links: Facebook URLs must point at a specific video or reel.
// Uses doc.validate() (async) because the URL check runs in a pre('validate') hook.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const GalleryItem = require('../models/GalleryItem');

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

/** Validation errors by field ({} when the document is valid). */
async function errorsOf(doc) {
  try {
    await doc.validate();
    return {};
  } catch (err) {
    return err.errors || {};
  }
}

const item = (videoUrl) => new GalleryItem({ title: 'Acto de colación', videoUrl });

test('rejects a Facebook link that does not point at a video, explaining how to copy the right one', async () => {
  const errors = await errorsOf(item('https://www.facebook.com/reel/?locale=es_LA'));
  assert.ok(errors.videoUrl, 'videoUrl should be invalid');
  assert.match(errors.videoUrl.message, /Compartir → Copiar enlace/);
});

test('rejects a Facebook short link that could not be converted to a video URL', async () => {
  global.fetch = async () => {
    throw new Error('network down');
  };
  const errors = await errorsOf(item('https://www.facebook.com/share/r/1AbCdEf/'));
  assert.ok(errors.videoUrl, 'videoUrl should be invalid');
});

test('accepts canonical Facebook reel and video URLs', async () => {
  assert.deepEqual(Object.keys(await errorsOf(item('https://www.facebook.com/reel/1234567890123456'))), []);
  assert.deepEqual(Object.keys(await errorsOf(item('https://www.facebook.com/ies11/videos/987654321'))), []);
});

test('still accepts YouTube and Instagram links (previous behavior)', async () => {
  assert.deepEqual(Object.keys(await errorsOf(item('https://youtu.be/dQw4w9WgXcQ'))), []);
  assert.deepEqual(Object.keys(await errorsOf(item('https://www.instagram.com/reel/Cxyz123/'))), []);
});
