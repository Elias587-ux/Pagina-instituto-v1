/**
 * Subida de archivos del panel (logos, imágenes y PDFs de planes de estudio).
 * El archivo llega como cuerpo binario (Content-Type del archivo) y se guarda
 * con utils/storage.js (Cloudinary si CLOUDINARY_URL está definida; si no,
 * public/uploads/<tipo>/). El tipo real se verifica por su firma (magic bytes),
 * no por la extensión ni por el Content-Type que declara el navegador.
 * Las imágenes se optimizan al subirlas: se corrige la orientación, se reducen
 * a un tamaño máximo y se convierten a WebP (mucho más livianas para celulares).
 */
const crypto = require('crypto');
const sharp = require('sharp');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { saveFile } = require('../utils/storage');

const MB = 1024 * 1024;

const SIGNATURES = [
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: 'pdf', test: (b) => b.toString('ascii', 0, 5) === '%PDF-' },
  // ISO base media: "ftyp" box at offset 4; brand "qt  " is QuickTime (.mov, iPhone videos)
  { ext: 'mov', test: (b) => b.toString('ascii', 4, 8) === 'ftyp' && b.toString('ascii', 8, 12) === 'qt  ' },
  { ext: 'mp4', test: (b) => b.toString('ascii', 4, 8) === 'ftyp' },
  { ext: 'webm', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
];

/** Tipos de subida admitidos: carpeta destino, extensiones válidas y tamaño máximo. */
const KINDS = {
  logo: { exts: ['png', 'jpg', 'webp'], maxSize: 5 * MB, maxDim: 512, label: 'El logo debe ser PNG, JPG o WebP' },
  image: { exts: ['png', 'jpg', 'webp'], maxSize: 12 * MB, maxDim: 1920, label: 'La imagen debe ser PNG, JPG o WebP' },
  pdf: { exts: ['pdf'], maxSize: 15 * MB, label: 'El archivo debe ser un PDF' },
  video: { exts: ['mp4', 'mov', 'webm'], maxSize: 60 * MB, label: 'El video debe ser MP4, MOV o WebM' },
};

/** Límite del parser binario de la ruta (el mayor de todos los tipos). */
exports.MAX_UPLOAD_SIZE = Math.max(...Object.values(KINDS).map((k) => k.maxSize));

const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Reduce la imagen para que su lado mayor no supere maxDim y la convierte a WebP. */
async function optimizeImage(buffer, maxDim) {
  try {
    return await sharp(buffer)
      .rotate() // respeta la orientación EXIF de las fotos de celular
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
  } catch {
    throw new AppError('No se pudo procesar la imagen. Probá con otro archivo.', 415);
  }
}

/**
 * POST /api/admin/uploads?kind=logo|image|pdf|video&name=<nombre sugerido>
 * Body: binario del archivo. Responde { url, size }.
 */
exports.upload = asyncHandler(async (req, res) => {
  const kind = KINDS[req.query.kind];
  if (!kind) throw new AppError('Tipo de archivo no válido (use logo, image, pdf o video)', 400);

  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new AppError('No se recibió ningún archivo', 400);
  if (buffer.length > kind.maxSize) throw new AppError(`El archivo supera el máximo de ${kind.maxSize / MB} MB`, 413);

  const ext = SIGNATURES.find((s) => s.test(buffer))?.ext;
  if (!ext || !kind.exts.includes(ext)) throw new AppError(kind.label, 415);

  const output = kind.maxDim ? await optimizeImage(buffer, kind.maxDim) : buffer;
  const outExt = kind.maxDim ? 'webp' : ext;

  const folder = req.query.kind;
  const base = slugify(req.query.name) || folder;
  const name = `${base}-${crypto.randomBytes(4).toString('hex')}`;

  let url;
  try {
    url = await saveFile({ buffer: output, folder, name, ext: outExt });
  } catch (err) {
    console.error('[upload]', err.message);
    throw new AppError('No se pudo guardar el archivo. Probá de nuevo en unos minutos.', 502);
  }

  res.status(201).json({ url, size: output.length });
});
