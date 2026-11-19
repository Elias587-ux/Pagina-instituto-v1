// Social video links → embeddable player URLs (public/js/embeds.js).
// The iframe src must ALWAYS be on an allowed host, whatever the admin pastes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSocialVideo } from '../public/js/embeds.js';

test('YouTube watch, short and youtu.be links use the privacy-friendly player', () => {
  for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ']) {
    const v = parseSocialVideo(url);
    assert.equal(v.network, 'youtube');
    assert.equal(v.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
    assert.equal(v.thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    assert.equal(v.vertical, false);
  }
  assert.equal(parseSocialVideo('https://youtube.com/shorts/abcDEF12345').vertical, true);
});

test('Instagram, TikTok and Facebook links map to their official embed players', () => {
  assert.equal(parseSocialVideo('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x').embedUrl, 'https://www.instagram.com/p/C1a2B3c4D5e/embed');
  assert.equal(parseSocialVideo('https://www.tiktok.com/@ies11/video/7312345678901234567').embedUrl, 'https://www.tiktok.com/embed/v2/7312345678901234567');
  const fb = parseSocialVideo('https://www.facebook.com/ies11/videos/123456/');
  assert.equal(fb.network, 'facebook');
  assert.ok(fb.embedUrl.startsWith('https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fies11%2Fvideos%2F123456%2F'));
});

test('rejects unsafe or unknown links (no iframe outside the allowlist)', () => {
  for (const url of [
    'http://youtu.be/dQw4w9WgXcQ', // not https
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', // look-alike host
    'javascript:alert(1)',
    'https://www.youtube.com/watch?v="><script>', // injection attempt in the id
    'https://www.tiktok.com/@ies11', // profile, not a video
    '',
    null,
  ]) {
    assert.equal(parseSocialVideo(url), null, String(url));
  }
});
