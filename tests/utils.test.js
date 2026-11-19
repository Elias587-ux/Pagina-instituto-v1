// Pure helpers of the server (no database, no network).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalFromHtml, isVideoUrl, needsResolution } = require('../utils/resolveSocialUrl');
const { sign } = require('../utils/storage');

test('Facebook short share links are detected for resolution; canonical ones are not', () => {
  assert.equal(needsResolution('https://www.facebook.com/share/v/1ABCdef/'), true);
  assert.equal(needsResolution('https://fb.watch/abcDEF123/'), true);
  assert.equal(needsResolution('https://www.facebook.com/ies11/videos/123/'), false);
  assert.equal(needsResolution('https://youtu.be/dQw4w9WgXcQ'), false);
});

test('only URLs pointing at a specific Facebook video or reel count as resolved', () => {
  for (const url of [
    'https://www.facebook.com/ies11/videos/123/',
    'https://www.facebook.com/ies11/videos/vb.1/123/',
    'https://www.facebook.com/reel/987',
    'https://www.facebook.com/watch/?v=55',
  ]) {
    assert.equal(isVideoUrl(url), true, url);
  }
  for (const url of [
    'https://www.facebook.com/watch/', // no video id
    'https://www.facebook.com/login/',
    'https://www.facebook.com/share/v/abc/', // still a short link
    'https://web.facebook.com/reel/1', // host not accepted by the gallery model
    'https://evil.com/reel/1',
  ]) {
    assert.equal(isVideoUrl(url), false, url);
  }
});

test('reads the canonical URL from og:url or rel=canonical', () => {
  assert.equal(
    canonicalFromHtml('<meta property="og:url" content="https://www.facebook.com/ies11/videos/123456789/" />'),
    'https://www.facebook.com/ies11/videos/123456789/'
  );
  assert.equal(canonicalFromHtml('<link rel="canonical" href="https://www.facebook.com/reel/987654321">'), 'https://www.facebook.com/reel/987654321');
  assert.equal(canonicalFromHtml('<p>no tags</p>'), '');
});

test('Cloudinary signature matches the example in Cloudinary docs', () => {
  // https://cloudinary.com/documentation/authentication_signatures
  assert.equal(sign({ public_id: 'sample_image', timestamp: 1315060510 }, 'abcd'), 'b4ad47fb4e25c7bf5f92a20089f9db59bc302313');
  // parameter order must not matter (they are sorted)
  assert.equal(sign({ timestamp: 1315060510, public_id: 'sample_image' }, 'abcd'), 'b4ad47fb4e25c7bf5f92a20089f9db59bc302313');
});
