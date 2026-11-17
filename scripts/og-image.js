/**
 * Genera public/assets/og-image.jpg (1200×630): la vista previa que muestran
 * WhatsApp, Facebook y X al compartir el sitio. Esas redes no aceptan SVG.
 *
 * Uso: npm run og-image   (volver a correrlo si cambia el logo o el lema)
 */
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'public', 'assets');
const W = 1200;
const H = 630;
const FONT = "'DM Sans', 'Segoe UI', Arial, sans-serif";

const waves = Array.from({ length: 9 }, (_, i) => {
  const y = 360 + i * 22;
  return `<path d="M-80 ${y} C 300 ${200 + i * 30}, 760 ${640 - i * 24}, 1300 ${260 + i * 20}" />`;
}).join('');

const background = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#313E59"/>
      <stop offset="1" stop-color="#22304D"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#41EDD9"/>
      <stop offset="1" stop-color="#41D2F2"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g fill="none" stroke="#41D2F2" stroke-opacity="0.16" stroke-width="2">${waves}</g>
  <circle cx="1080" cy="90" r="220" fill="#497CBF" fill-opacity="0.18"/>
  <rect x="90" y="96" width="300" height="300" rx="56" fill="#FFFFFF" fill-opacity="0.06"/>
  <text x="460" y="214" font-family="${FONT}" font-size="34" font-weight="700" letter-spacing="4" fill="#41EDD9">JUJUY · NIVEL SUPERIOR</text>
  <text x="456" y="318" font-family="${FONT}" font-size="104" font-weight="800" fill="#FFFFFF">IES N° 11</text>
  <text x="460" y="378" font-family="${FONT}" font-size="34" font-weight="500" fill="#C9D2E3">Formando profesionales</text>
  <text x="460" y="422" font-family="${FONT}" font-size="34" font-weight="500" fill="#C9D2E3">con compromiso social</text>
  <rect x="90" y="486" width="1020" height="2" fill="#FFFFFF" fill-opacity="0.12"/>
  <rect x="90" y="526" width="420" height="58" rx="29" fill="url(#accent)"/>
  <text x="300" y="565" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="#13203A">Preinscripción online</text>
  <text x="1110" y="565" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="500" fill="#C9D2E3">Profesorados · Tecnicaturas</text>
</svg>`;

async function main() {
  const logo = await sharp(path.join(ASSETS, 'logo-ies11.svg'), { density: 600 }).resize(260, 260).png().toBuffer();
  const out = path.join(ASSETS, 'og-image.jpg');

  await sharp(Buffer.from(background))
    .composite([{ input: logo, left: 110, top: 116 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(out);

  console.log(`[og-image] Generada ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
  console.error('[og-image] Error:', err);
  process.exit(1);
});
