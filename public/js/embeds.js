/**
 * Turns the link of a social-network post into an embeddable player URL.
 * Hosts must stay in sync with SOCIAL_VIDEO_HOSTS (models/GalleryItem.js)
 * and the frame-src CSP directive (server.js).
 */

/**
 * @param {string} url
 * @returns {{ network: 'youtube'|'instagram'|'tiktok'|'facebook', embedUrl: string, thumbnail: string, vertical: boolean } | null}
 */
export function parseSocialVideo(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' || host === 'youtube.com') {
    let id = host === 'youtu.be' ? parts[0] : u.searchParams.get('v');
    if (!id && ['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1];
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return {
      network: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      vertical: parts[0] === 'shorts',
    };
  }

  if (host === 'instagram.com') {
    const i = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
    const code = i >= 0 ? parts[i + 1] : '';
    if (!code || !/^[\w-]+$/.test(code)) return null;
    return { network: 'instagram', embedUrl: `https://www.instagram.com/p/${code}/embed`, thumbnail: '', vertical: true };
  }

  if (host === 'tiktok.com') {
    const i = parts.indexOf('video');
    const id = i >= 0 ? parts[i + 1] : '';
    if (!/^\d+$/.test(id || '')) return null;
    return { network: 'tiktok', embedUrl: `https://www.tiktok.com/embed/v2/${id}`, thumbnail: '', vertical: true };
  }

  if (host === 'facebook.com' || host === 'fb.watch') {
    return {
      network: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.href)}&show_text=false`,
      thumbnail: '',
      vertical: parts.includes('reel'),
    };
  }

  return null;
}

export const NETWORK_LABELS = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook' };
