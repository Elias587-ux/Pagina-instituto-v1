/**
 * Where uploaded files live.
 *  - CLOUDINARY_URL set (cloudinary://API_KEY:API_SECRET@CLOUD_NAME) → Cloudinary,
 *    required on hosts whose disk is wiped on restart (e.g. Render free).
 *  - Otherwise → public/uploads/<folder>/ on the local disk (development).
 * Uses Cloudinary's REST upload API with a signed request (no SDK dependency).
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'uploads');
const ROOT_FOLDER = 'ies11';

function cloudinaryConfig() {
  const raw = process.env.CLOUDINARY_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'cloudinary:' || !u.username || !u.password || !u.hostname) return null;
    return { apiKey: decodeURIComponent(u.username), apiSecret: decodeURIComponent(u.password), cloudName: u.hostname };
  } catch {
    return null;
  }
}

const isCloudStorage = () => Boolean(cloudinaryConfig());

const RESOURCE_TYPES = { webp: 'image', png: 'image', jpg: 'image', mp4: 'video', mov: 'video', webm: 'video', pdf: 'raw' };
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf' };

/** Cloudinary signature: SHA-1 of the sorted "key=value" params joined by "&", plus the API secret. */
function sign(params, secret) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(base + secret).digest('hex');
}

/**
 * Stores a file and returns its public URL.
 * @param {{ buffer: Buffer, folder: string, name: string, ext: string }} file
 *   `name` is the file name without extension (also used as a stable id, so re-uploading overwrites).
 */
async function saveFile({ buffer, folder, name, ext }) {
  const cfg = cloudinaryConfig();
  if (!cfg) {
    await fs.mkdir(path.join(UPLOAD_ROOT, folder), { recursive: true });
    await fs.writeFile(path.join(UPLOAD_ROOT, folder, `${name}.${ext}`), buffer);
    return `/uploads/${folder}/${name}.${ext}`;
  }

  const resourceType = RESOURCE_TYPES[ext] || 'raw';
  // Raw files keep their extension in the id so the URL ends in .pdf
  const params = {
    folder: `${ROOT_FOLDER}/${folder}`,
    overwrite: 'true',
    public_id: resourceType === 'raw' ? `${name}.${ext}` : name,
    timestamp: Math.floor(Date.now() / 1000),
  };
  const form = new FormData();
  Object.entries(params).forEach(([k, v]) => form.append(k, String(v)));
  form.append('api_key', cfg.apiKey);
  form.append('signature', sign(params, cfg.apiSecret));
  form.append('file', new Blob([buffer], { type: MIME[ext] || 'application/octet-stream' }), `${name}.${ext}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) {
    throw new Error(`Cloudinary: ${data?.error?.message || `HTTP ${res.status}`}`);
  }
  return data.secure_url;
}

module.exports = { saveFile, isCloudStorage, sign, UPLOAD_ROOT };
