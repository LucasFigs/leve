// Gera os ícones PNG do app a partir do desenho em SVG.  Uso: npm run icons
import sharp from 'sharp';

const glyph = (scale) => {
  // folha centralizada, reduzida por `scale` (área segura dos ícones "maskable")
  const t = (512 * (1 - scale)) / 2;
  return `<g transform="translate(${t} ${t}) scale(${scale})"><path d="M160 360c0-110 70-196 210-196 0 140-84 210-196 210M160 360c42-56 84-98 140-126" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></g>`;
};
const svg = ({ rounded, scale }) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="#4f46e5"/>${glyph(scale)}</svg>`,
  );

const out = [
  { file: 'public/icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'public/icon-512.png', size: 512, rounded: true, scale: 1 },
  { file: 'public/icon-maskable-512.png', size: 512, rounded: false, scale: 0.8 },
  // iOS arredonda sozinho: fundo cheio, sem transparência
  { file: 'public/apple-touch-icon.png', size: 180, rounded: false, scale: 0.9 },
];

for (const o of out) {
  await sharp(svg(o)).resize(o.size, o.size).png().toFile(o.file);
  console.log('ok', o.file);
}
