/**
 * Copies the local database to the cloud database (MongoDB Atlas) and moves the
 * files of public/uploads to Cloudinary, rewriting every "/uploads/…" reference
 * to its Cloudinary URL on the way. The local database is only read, never changed.
 *
 * Usage (values from .env):
 *   MONGODB_URI          local source database
 *   TARGET_MONGODB_URI   Atlas database (destination)
 *   CLOUDINARY_URL       cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 *
 *   npm run move:cloud -- --dry-run   # shows what would happen, writes nothing
 *   npm run move:cloud                # does it (destination must be empty)
 *   npm run move:cloud -- --replace   # empties the destination collections first
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { saveFile, isCloudStorage, UPLOAD_ROOT } = require('../utils/storage');

const DRY_RUN = process.argv.includes('--dry-run');
const REPLACE = process.argv.includes('--replace');
const SOURCE = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ies11';
const TARGET = process.env.TARGET_MONGODB_URI;

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

const uploaded = new Map(); // "/uploads/x/y.webp" → https URL
const missing = new Set();

async function cloudUrlFor(localUrl) {
  if (uploaded.has(localUrl)) return uploaded.get(localUrl);
  const rel = decodeURIComponent(localUrl.replace(/^\/uploads\//, '').split(/[?#]/)[0]);
  const file = path.join(UPLOAD_ROOT, rel);
  if (!file.startsWith(UPLOAD_ROOT) || !fs.existsSync(file)) {
    missing.add(localUrl);
    return localUrl;
  }
  const folder = path.dirname(rel).split(path.sep).join('/') || 'misc';
  const ext = path.extname(file).slice(1).toLowerCase();
  const name = path.basename(file, path.extname(file));
  const url = DRY_RUN ? `(cloudinary)/${folder}/${name}.${ext}` : await saveFile({ buffer: fs.readFileSync(file), folder, name, ext });
  uploaded.set(localUrl, url);
  console.log(`  ↑ ${localUrl} → ${url}`);
  return url;
}

/** Walks a document and replaces "/uploads/…" strings (keeps ObjectIds, Dates, etc. untouched). */
async function rewrite(value) {
  if (typeof value === 'string') return value.startsWith('/uploads/') ? cloudUrlFor(value) : value;
  if (Array.isArray(value)) return Promise.all(value.map(rewrite));
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await rewrite(v);
    return out;
  }
  return value;
}

async function main() {
  if (!TARGET) fail('Falta TARGET_MONGODB_URI en .env (la cadena de conexión de MongoDB Atlas).');
  if (TARGET === SOURCE) fail('TARGET_MONGODB_URI es igual a MONGODB_URI: el destino tiene que ser la base de Atlas.');
  if (!isCloudStorage() && !DRY_RUN) fail('Falta CLOUDINARY_URL en .env (cloudinary://API_KEY:API_SECRET@CLOUD_NAME).');

  console.log(DRY_RUN ? '— Simulación: no se escribe nada —' : '— Copiando a la nube —');
  const source = await mongoose.createConnection(SOURCE, { serverSelectionTimeoutMS: 8000 }).asPromise();
  const target = await mongoose.createConnection(TARGET, { serverSelectionTimeoutMS: 15000 }).asPromise();

  const collections = (await source.db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));

  // Refuse to mix data: the destination collections must be empty (or --replace)
  const busy = [];
  for (const name of collections) {
    const count = await target.db.collection(name).estimatedDocumentCount();
    if (count) busy.push(`${name} (${count})`);
  }
  if (busy.length && !REPLACE && !DRY_RUN) {
    fail(`La base de destino ya tiene datos en: ${busy.join(', ')}.\n  Si querés reemplazarlos por los de tu compu, corré: npm run move:cloud -- --replace`);
  }

  for (const name of collections) {
    const docs = await source.db.collection(name).find().toArray();
    console.log(`\n${name}: ${docs.length} documento(s)`);
    const rewritten = [];
    for (const doc of docs) rewritten.push(await rewrite(doc));
    if (DRY_RUN || !rewritten.length) continue;
    if (REPLACE) await target.db.collection(name).deleteMany({});
    await target.db.collection(name).insertMany(rewritten, { ordered: true });
  }

  console.log(`\n✔ ${collections.length} colecciones · ${uploaded.size} archivo(s) ${DRY_RUN ? 'para subir' : 'subidos'} a Cloudinary`);
  if (missing.size) console.warn(`⚠ No se encontraron en public/uploads (quedaron igual): ${[...missing].join(', ')}`);
  if (DRY_RUN && busy.length) console.warn(`⚠ El destino ya tiene datos en: ${busy.join(', ')} (hará falta --replace)`);

  await Promise.all([source.close(), target.close()]);
}

main().catch((err) => fail(err.message));
