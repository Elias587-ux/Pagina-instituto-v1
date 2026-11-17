/**
 * Facebook "Compartir → Copiar enlace" gives short links (facebook.com/share/v/…,
 * /share/r/…, fb.watch/…) that the Facebook video player plugin cannot embed.
 * This resolves them once, when the post is saved, to the canonical video/reel URL
 * by following redirects and, if needed, reading og:url / rel=canonical.
 * On any failure it returns the original URL (the site still links to the post).
 */
const SHORT_LINK = /^https:\/\/((www\.|m\.)?facebook\.com\/share\/|fb\.watch\/)/i;
const FACEBOOK = /^https:\/\/(www\.|m\.)?facebook\.com\//i; // same hosts GalleryItem accepts
const MAX_HOPS = 4;

const needsResolution = (url) => SHORT_LINK.test(String(url || ''));

function canonicalFromHtml(html) {
  const tag =
    html.match(/<meta[^>]+property=["']og:url["'][^>]*>/i)?.[0] || html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] || '';
  const href = tag.match(/(?:content|href)=["']([^"']+)["']/i)?.[1] || '';
  return href.replace(/&amp;/g, '&');
}

/** A canonical Facebook URL that points at a specific video or reel. */
const isVideoUrl = (url) => FACEBOOK.test(url) && /\/(videos|reel)\/(?:[\w.-]+\/)?\d+|[?&]v=\d+/.test(url) && !SHORT_LINK.test(url);

async function resolveSocialUrl(url) {
  if (!needsResolution(url)) return url;
  let current = url;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop += 1) {
      const res = await fetch(current, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IES11-Portal/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(6000),
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).href;
        if (isVideoUrl(current)) return current.split('#')[0];
        continue;
      }
      if (res.ok) {
        const canonical = canonicalFromHtml((await res.text()).slice(0, 300000));
        if (isVideoUrl(canonical)) return canonical;
      }
      break;
    }
  } catch (err) {
    console.warn('[social-url] No se pudo resolver el enlace:', err.message);
  }
  return url;
}

module.exports = { resolveSocialUrl, needsResolution, canonicalFromHtml, isVideoUrl };
