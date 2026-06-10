// Generate Vaibes app icons (Wave Arcs + Drop, mint on dark) via sharp.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'assets', 'images');
const MINT = '#63E6BE';
const DARK = '#0a0a0a';

function logo(scale = 1, cx = 50, cy = 58) {
  const s = (v, c) => c + (v - c) * scale;
  return `
    <ellipse cx="${cx}" cy="${s(26, cy)}" rx="${3.6 * scale}" ry="${5.4 * scale}" fill="${MINT}"/>
    <path d="M ${s(16, cx)} ${s(58, cy)} A ${34 * scale} ${34 * scale} 0 0 0 ${s(84, cx)} ${s(58, cy)}" stroke="${MINT}" stroke-width="${3 * scale}" stroke-opacity="0.2" fill="none" stroke-linecap="round"/>
    <path d="M ${s(26, cx)} ${s(58, cy)} A ${24 * scale} ${24 * scale} 0 0 0 ${s(74, cx)} ${s(58, cy)}" stroke="${MINT}" stroke-width="${3 * scale}" stroke-opacity="0.42" fill="none" stroke-linecap="round"/>
    <path d="M ${s(36, cx)} ${s(58, cy)} A ${14 * scale} ${14 * scale} 0 0 0 ${s(64, cx)} ${s(58, cy)}" stroke="${MINT}" stroke-width="${3.5 * scale}" stroke-opacity="0.74" fill="none" stroke-linecap="round"/>
  `;
}

const full = (bg, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/>${logo(scale)}</svg>`;
const transparent = (scale, color = MINT) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">${logo(scale).replaceAll(MINT, color)}</svg>`;

async function render(svg, name) {
  const out = path.join(OUT, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('wrote', name);
}

await render(full(DARK, 0.82), 'icon.png');
await render(transparent(1.0), 'splash-icon.png');
await render(transparent(0.62), 'android-icon-foreground.png');
await render(transparent(0.62, '#ffffff'), 'android-icon-monochrome.png');
console.log('done');
