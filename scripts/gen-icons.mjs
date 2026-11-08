// Generates the PWA icons into public/icons using headless Chromium (Playwright).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const svg = (maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3d9cff"/><stop offset="1" stop-color="#bfe9ff"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5fd3ff"/><stop offset="1" stop-color="#1f8fd6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${maskable ? 0 : 110}" fill="url(#sky)"/>
  <g transform="${maskable ? 'translate(51 51) scale(0.8)' : ''}">
    <!-- tower -->
    <rect x="300" y="90" width="44" height="330" rx="8" fill="#f2e6d0"/>
    <polygon points="290,96 354,96 322,52" fill="#ff7a1a"/>
    <!-- slider -->
    <path d="M330 120 C 470 150, 470 230, 322 245 C 170 262, 150 330, 300 350 C 380 362, 380 400, 250 420"
          fill="none" stroke="#ff7a1a" stroke-width="44" stroke-linecap="round"/>
    <path d="M330 120 C 470 150, 470 230, 322 245 C 170 262, 150 330, 300 350 C 380 362, 380 400, 250 420"
          fill="none" stroke="#ffe066" stroke-width="26" stroke-linecap="round"/>
    <path d="M330 120 C 470 150, 470 230, 322 245 C 170 262, 150 330, 300 350 C 380 362, 380 400, 250 420"
          fill="none" stroke="#9ae6ff" stroke-width="10" stroke-linecap="round" stroke-dasharray="20 14"/>
    <!-- pool -->
    <ellipse cx="200" cy="440" rx="170" ry="48" fill="#fff"/>
    <ellipse cx="200" cy="440" rx="152" ry="38" fill="url(#water)"/>
    <!-- splash -->
    <g fill="#ffffff">
      <circle cx="120" cy="400" r="14"/><circle cx="96" cy="380" r="9"/><circle cx="150" cy="372" r="10"/>
      <circle cx="86" cy="410" r="7"/>
    </g>
    <!-- cat on float -->
    <g transform="translate(140 300)">
      <ellipse cx="0" cy="70" rx="70" ry="24" fill="#ff4f8b"/>
      <ellipse cx="0" cy="66" rx="34" ry="10" fill="#c22f63"/>
      <polygon points="-58,-30 -40,-88 -10,-48" fill="#f4a259"/>
      <polygon points="58,-30 40,-88 10,-48" fill="#f4a259"/>
      <polygon points="-48,-40 -40,-72 -24,-50" fill="#ffc0cb"/>
      <polygon points="48,-40 40,-72 24,-50" fill="#ffc0cb"/>
      <ellipse cx="0" cy="0" rx="72" ry="64" fill="#f4a259"/>
      <ellipse cx="-26" cy="-4" rx="10" ry="13" fill="#1a1a1a"/>
      <ellipse cx="26" cy="-4" rx="10" ry="13" fill="#1a1a1a"/>
      <circle cx="-22" cy="-9" r="4" fill="#fff"/><circle cx="30" cy="-9" r="4" fill="#fff"/>
      <ellipse cx="-46" cy="18" rx="12" ry="7" fill="#ff8fa3"/>
      <ellipse cx="46" cy="18" rx="12" ry="7" fill="#ff8fa3"/>
      <ellipse cx="0" cy="18" rx="18" ry="12" fill="#fff1d6"/>
      <ellipse cx="0" cy="12" rx="6" ry="4" fill="#332222"/>
      <path d="M-8 22 Q0 30 8 22" stroke="#332222" stroke-width="3" fill="none"/>
    </g>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];
for (const [name, size, maskable] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(maskable).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons generated');
