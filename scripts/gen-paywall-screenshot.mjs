// Generate Apple-review-ready paywall screenshot for the Vaibes Pro
// subscription group. Outputs a 1290×2796 PNG (iPhone 15 Pro Max resolution).
// Apple's App Store Connect accepts any 6.5"+ iPhone resolution, but newer
// devices are preferred.

import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Variant: "both" (default), "monthly", or "yearly"
const variant = process.argv[2] || 'both';
const OUT = path.join(ROOT, 'assets', `paywall-mockup-${variant}.png`);

const W = 1290;
const H = 2796;

const MINT = '#63E6BE';
const MINT_DEEP = '#1f9c7c';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a1d18"/>
      <stop offset="0.5" stop-color="#0a0a0a"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="55%">
      <stop offset="0" stop-color="#63E6BE" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#63E6BE" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ctaG" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7af0cc"/>
      <stop offset="1" stop-color="#63E6BE"/>
    </linearGradient>
  </defs>

  <!-- BG -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Logo (ripple + drop) -->
  <g transform="translate(${W / 2 - 110}, 200) scale(2.2)">
    <ellipse cx="50" cy="26" rx="4" ry="6" fill="${MINT}"/>
    <path d="M16 60 A34 34 0 0 0 84 60" stroke="${MINT}" stroke-width="3" stroke-opacity="0.22" fill="none" stroke-linecap="round"/>
    <path d="M26 60 A24 24 0 0 0 74 60" stroke="${MINT}" stroke-width="3" stroke-opacity="0.45" fill="none" stroke-linecap="round"/>
    <path d="M36 60 A14 14 0 0 0 64 60" stroke="${MINT}" stroke-width="3.5" stroke-opacity="0.75" fill="none" stroke-linecap="round"/>
  </g>

  <text x="${W / 2}" y="640" font-family="-apple-system,Helvetica,Arial" font-size="84" font-weight="300" letter-spacing="14" fill="#fff" text-anchor="middle">VAIBES PRO</text>
  <text x="${W / 2}" y="730" font-family="-apple-system,Helvetica,Arial" font-size="38" fill="rgba(255,255,255,0.75)" text-anchor="middle">Daily personalized phrases,</text>
  <text x="${W / 2}" y="782" font-family="-apple-system,Helvetica,Arial" font-size="38" fill="rgba(255,255,255,0.75)" text-anchor="middle">delivered in a soft voice.</text>

  <!-- Benefits -->
  <g font-family="-apple-system,Helvetica,Arial" font-size="36" fill="#fff">
    ${benefit(0, 'Up to 3 vibes a day, delivered at random moments')}
    ${benefit(1, 'Listen to every phrase in your chosen voice')}
    ${benefit(2, 'Switch between English, Spanish, Portuguese &amp; more')}
    ${benefit(3, 'Full vibe history, ad-free, watermark-free shares')}
    ${benefit(4, 'New voices, new themes — first access')}
  </g>

  <!-- Plan cards -->
  ${plansBlock(variant)}

  <!-- CTA -->
  <rect x="120" y="2360" rx="999" ry="999" width="${W - 240}" height="160" fill="url(#ctaG)"/>
  <text x="${W / 2}" y="2462" font-family="-apple-system,Helvetica,Arial" font-size="50" font-weight="600" fill="#000" text-anchor="middle">${ctaLabel(variant)}</text>

  <text x="${W / 2}" y="2600" font-family="-apple-system,Helvetica,Arial" font-size="28" fill="rgba(255,255,255,0.55)" text-anchor="middle">Restore Purchases · Terms · Privacy</text>
  <text x="${W / 2}" y="2660" font-family="-apple-system,Helvetica,Arial" font-size="24" fill="rgba(255,255,255,0.4)" text-anchor="middle">Renews automatically until cancelled. Manage in App Store.</text>
</svg>`;

function benefit(i, text) {
  const y = 950 + i * 110;
  return `
    <circle cx="160" cy="${y - 14}" r="14" fill="${MINT}"/>
    <text x="135" y="${y - 4}" font-size="32" font-weight="700" fill="#000" text-anchor="end" transform="translate(50, 0)">✓</text>
    <text x="220" y="${y}" font-size="36" fill="rgba(255,255,255,0.92)">${text}</text>
  `;
}

function plansBlock(v) {
  if (v === 'yearly') {
    return [
      bigPlanCard(120, 1820, 'Pro Yearly', '$14.99', '/year', 'Just $1.25 / month · save 37% vs monthly'),
    ].join('\n');
  }
  if (v === 'monthly') {
    return [
      bigPlanCard(120, 1820, 'Pro Monthly', '$1.99', '/month', 'Cancel anytime · no commitment'),
    ].join('\n');
  }
  // both
  return [
    planCard(150, 1820, true,  'Yearly',  '$14.99 / year', 'Best value · save 37%'),
    planCard(150, 2080, false, 'Monthly', '$1.99 / month', 'Cancel anytime'),
  ].join('\n');
}

function ctaLabel(v) {
  if (v === 'yearly') return 'Start Pro Yearly';
  if (v === 'monthly') return 'Start Pro Monthly';
  return 'Start Vaibes Pro';
}

function bigPlanCard(x, y, label, price, unit, sub) {
  const w = W - 2 * x;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="420" rx="32" fill="rgba(99,230,190,0.06)" stroke="${MINT}" stroke-width="5"/>
      <text x="${x + 50}" y="${y + 100}" font-family="-apple-system,Helvetica,Arial" font-size="44" font-weight="600" fill="#fff">${label}</text>
      <g transform="translate(${x + 50}, ${y + 220})">
        <text x="0" y="0" font-family="-apple-system,Helvetica,Arial" font-size="120" font-weight="300" fill="${MINT}">${price}</text>
        <text x="${price.length * 56 + 10}" y="-8" font-family="-apple-system,Helvetica,Arial" font-size="40" fill="rgba(255,255,255,0.55)">${unit}</text>
      </g>
      <text x="${x + 50}" y="${y + 340}" font-family="-apple-system,Helvetica,Arial" font-size="32" fill="rgba(255,255,255,0.75)">${sub}</text>
    </g>
  `;
}

function planCard(x, y, highlight, label, price, sub) {
  const w = W - 2 * x;
  const stroke = highlight ? MINT : 'rgba(255,255,255,0.16)';
  const sw = highlight ? 4 : 2;
  const badge = highlight
    ? `<g>
        <rect x="${W - x - 280}" y="${y + 24}" width="240" height="60" rx="14" fill="${MINT_DEEP}"/>
        <text x="${W - x - 160}" y="${y + 65}" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">BEST VALUE</text>
       </g>`
    : '';
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="220" rx="28" fill="rgba(255,255,255,0.04)" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${x + 40}" y="${y + 80}" font-family="-apple-system,Helvetica,Arial" font-size="40" font-weight="600" fill="#fff">${label}</text>
      <text x="${x + 40}" y="${y + 140}" font-family="-apple-system,Helvetica,Arial" font-size="48" font-weight="300" fill="${MINT}">${price}</text>
      <text x="${x + 40}" y="${y + 188}" font-family="-apple-system,Helvetica,Arial" font-size="28" fill="rgba(255,255,255,0.55)">${sub}</text>
      ${badge}
    </g>
  `;
}

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log('wrote', OUT, `(${W}×${H})`);
