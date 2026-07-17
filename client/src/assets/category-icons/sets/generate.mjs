#!/usr/bin/env node
/**
 * Generates 3 style sets × 26 category icons (64×64 SVG).
 * A = bold filled silhouette
 * B = isometric / 3⁄4 workshop view
 * C = fine technical illustration with hatching
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const wrap = (body, extras = "") => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"${extras}>
${body}
</svg>
`;

/** Style A: bold filled silhouettes (logo-like, high contrast) */
const styleA = {
  frame: `
  <path fill="currentColor" d="M12 48 L30 12 L50 48 H12 Z"/>
  <path fill="currentColor" d="M30 12 V48"/>
  <path fill="#fff" fill-rule="evenodd" d="M18 44 L30 20 L42 44 H18 Z M28 42 H32 V28 H28 Z"/>
  <circle fill="currentColor" cx="12" cy="48" r="4"/>
  <circle fill="currentColor" cx="50" cy="48" r="4"/>
  <circle fill="#fff" cx="12" cy="48" r="1.5"/>
  <circle fill="#fff" cx="50" cy="48" r="1.5"/>
  <path fill="currentColor" d="M8 42 L12 48 L6 46 Z"/>
  <path fill="currentColor" d="M54 42 L50 48 L58 46 Z"/>`,

  fork: `
  <path fill="currentColor" d="M28 6 H36 V18 H28 Z"/>
  <path fill="currentColor" d="M22 18 H42 L38 24 H26 Z"/>
  <path fill="currentColor" d="M26 22 L16 54 H24 L30 28 Z"/>
  <path fill="currentColor" d="M38 22 L48 54 H40 L34 28 Z"/>
  <path fill="currentColor" d="M12 52 H24 V58 H12 Z"/>
  <path fill="currentColor" d="M40 52 H52 V58 H40 Z"/>
  <rect fill="#fff" x="30" y="8" width="4" height="8" rx="1"/>`,

  headset: `
  <rect fill="currentColor" x="28" y="4" width="8" height="56" rx="2"/>
  <ellipse fill="currentColor" cx="32" cy="16" rx="16" ry="6"/>
  <ellipse fill="currentColor" cx="32" cy="48" rx="16" ry="6"/>
  <ellipse fill="#fff" cx="32" cy="16" rx="10" ry="3"/>
  <ellipse fill="#fff" cx="32" cy="48" rx="10" ry="3"/>
  <rect fill="currentColor" x="24" y="24" width="16" height="16" rx="1"/>
  <rect fill="#fff" x="28" y="28" width="8" height="8"/>`,

  handlebar: `
  <path fill="currentColor" d="M10 22 C10 12 20 8 32 8 C44 8 54 12 54 22 V28 C54 40 48 50 40 54 V42 C44 40 46 34 46 28 V22 C46 18 40 14 32 14 C24 14 18 18 18 22 V28 C18 34 20 40 24 42 V54 C16 50 10 40 10 28 Z"/>
  <rect fill="currentColor" x="28" y="6" width="8" height="10" rx="2"/>`,

  stem: `
  <rect fill="currentColor" x="6" y="20" width="16" height="24" rx="3"/>
  <rect fill="currentColor" x="20" y="28" width="24" height="8" rx="1"/>
  <rect fill="currentColor" x="42" y="16" width="16" height="32" rx="3"/>
  <circle fill="#fff" cx="14" cy="28" r="2"/>
  <circle fill="#fff" cx="14" cy="36" r="2"/>
  <circle fill="#fff" cx="50" cy="24" r="2"/>
  <circle fill="#fff" cx="50" cy="40" r="2"/>
  <rect fill="#fff" x="24" y="30" width="16" height="4"/>`,

  "bar-tape": `
  <path fill="currentColor" d="M8 20 C22 10 40 12 50 24 C58 34 56 48 44 54 C34 58 24 54 18 48 L24 42 C28 46 34 48 40 46 C46 44 48 36 44 30 C38 22 26 20 16 26 Z"/>
  <path fill="#fff" d="M20 22 C26 18 34 18 40 22 L38 26 C34 23 28 23 24 26 Z"/>
  <path fill="#fff" d="M26 28 C32 24 40 26 44 32 L40 36 C38 32 32 30 28 32 Z"/>
  <path fill="#fff" d="M30 38 C36 36 42 38 44 44 L40 46 C38 42 34 40 32 42 Z"/>
  <circle fill="currentColor" cx="18" cy="50" r="5"/>
  <circle fill="#fff" cx="18" cy="50" r="2"/>
  <circle fill="currentColor" cx="54" cy="14" r="7"/>
  <circle fill="#fff" cx="54" cy="14" r="2.5"/>`,

  "shift-levers": `
  <path fill="currentColor" d="M14 8 H36 C44 8 48 14 48 22 V32 H40 V24 C40 20 38 16 34 16 H22 V32 H14 Z"/>
  <path fill="currentColor" d="M22 30 H30 V58 H22 Z"/>
  <path fill="currentColor" d="M32 28 L52 52 H42 L30 36 Z"/>
  <path fill="#fff" d="M18 12 H32 V18 H18 Z"/>`,

  "brake-levers": `
  <rect fill="currentColor" x="4" y="12" width="40" height="10" rx="3"/>
  <rect fill="currentColor" x="22" y="8" width="14" height="18" rx="3"/>
  <path fill="currentColor" d="M28 24 C42 24 52 34 52 46 L48 58 H40 L44 48 C44 40 38 32 28 32 Z"/>
  <circle fill="#fff" cx="29" cy="17" r="2.5"/>`,

  "front-derailleur": `
  <circle fill="currentColor" cx="22" cy="40" r="16"/>
  <circle fill="#fff" cx="22" cy="40" r="10"/>
  <circle fill="currentColor" cx="22" cy="40" r="4"/>
  <path fill="currentColor" d="M34 10 H50 V20 H34 Z"/>
  <path fill="currentColor" d="M36 20 H52 L50 52 H34 L36 20 Z"/>
  <path fill="#fff" d="M40 28 H48 V44 H40 Z"/>`,

  "rear-derailleur": `
  <path fill="currentColor" d="M10 6 H38 L44 18 H28 L24 10 H10 Z"/>
  <path fill="currentColor" d="M24 16 H42 L48 30 H30 Z"/>
  <circle fill="currentColor" cx="24" cy="38" r="9"/>
  <circle fill="#fff" cx="24" cy="38" r="3.5"/>
  <path fill="currentColor" d="M28 44 L40 54"/>
  <circle fill="currentColor" cx="42" cy="54" r="7"/>
  <circle fill="#fff" cx="42" cy="54" r="2.5"/>
  <path fill="currentColor" d="M30 28 L24 36 H32 Z"/>`,

  crankset: `
  <circle fill="currentColor" cx="26" cy="34" r="20"/>
  <circle fill="#fff" cx="26" cy="34" r="13"/>
  <circle fill="currentColor" cx="26" cy="34" r="5"/>
  <!-- teeth -->
  <path fill="currentColor" d="M26 12 L28 16 H24 Z M40 22 L38 26 L42 24 Z M46 34 L42 36 V32 Z M40 46 L38 42 L42 44 Z M26 56 L24 52 H28 Z M12 46 L14 42 L10 44 Z M6 34 L10 32 V36 Z M12 22 L14 26 L10 24 Z"/>
  <path fill="currentColor" d="M30 34 L56 16 L58 22 L34 38 Z"/>
  <circle fill="currentColor" cx="56" cy="16" r="3"/>
  <circle fill="#fff" cx="56" cy="16" r="1.2"/>`,

  "bottom-bracket": `
  <rect fill="currentColor" x="20" y="18" width="24" height="28" rx="4"/>
  <ellipse fill="currentColor" cx="16" cy="32" rx="6" ry="12"/>
  <ellipse fill="currentColor" cx="48" cy="32" rx="6" ry="12"/>
  <rect fill="currentColor" x="2" y="28" width="12" height="8" rx="1"/>
  <rect fill="currentColor" x="50" y="28" width="12" height="8" rx="1"/>
  <ellipse fill="#fff" cx="16" cy="32" rx="2.5" ry="6"/>
  <ellipse fill="#fff" cx="48" cy="32" rx="2.5" ry="6"/>
  <circle fill="#fff" cx="32" cy="32" r="4"/>`,

  cassette: `
  <ellipse fill="currentColor" cx="32" cy="14" rx="24" ry="6"/>
  <path fill="currentColor" d="M8 14 V20 H56 V14 Z"/>
  <ellipse fill="currentColor" cx="32" cy="20" rx="20" ry="5"/>
  <path fill="currentColor" d="M12 20 V26 H52 V20 Z"/>
  <ellipse fill="currentColor" cx="32" cy="26" rx="16" ry="4.5"/>
  <path fill="currentColor" d="M16 26 V32 H48 V26 Z"/>
  <ellipse fill="currentColor" cx="32" cy="32" rx="12" ry="4"/>
  <path fill="currentColor" d="M20 32 V38 H44 V32 Z"/>
  <ellipse fill="currentColor" cx="32" cy="38" rx="9" ry="3.5"/>
  <path fill="currentColor" d="M23 38 V44 H41 V38 Z"/>
  <ellipse fill="currentColor" cx="32" cy="44" rx="6" ry="3"/>
  <rect fill="currentColor" x="26" y="44" width="12" height="12" rx="1"/>
  <ellipse fill="currentColor" cx="32" cy="56" rx="6" ry="2.5"/>
  <ellipse fill="#fff" cx="32" cy="14" rx="8" ry="2"/>
  <path fill="#fff" d="M14 12 L12 8 L16 11 Z M32 8 V12 M50 12 L52 8 L48 11 Z"/>`,

  chain: `
  <rect fill="currentColor" x="2" y="22" width="18" height="20" rx="5"/>
  <rect fill="#fff" x="6" y="28" width="10" height="8" rx="2"/>
  <rect fill="currentColor" x="14" y="26" width="14" height="12" rx="3"/>
  <rect fill="currentColor" x="24" y="22" width="18" height="20" rx="5"/>
  <rect fill="#fff" x="28" y="28" width="10" height="8" rx="2"/>
  <rect fill="currentColor" x="36" y="26" width="14" height="12" rx="3"/>
  <rect fill="currentColor" x="46" y="22" width="16" height="20" rx="5"/>
  <rect fill="#fff" x="50" y="28" width="8" height="8" rx="2"/>
  <circle fill="currentColor" cx="11" cy="32" r="2.5"/>
  <circle fill="currentColor" cx="33" cy="32" r="2.5"/>
  <circle fill="currentColor" cx="54" cy="32" r="2.5"/>`,

  brakes: `
  <circle fill="currentColor" cx="26" cy="32" r="24"/>
  <circle fill="#fff" cx="26" cy="32" r="16"/>
  <circle fill="currentColor" cx="26" cy="32" r="7"/>
  <circle fill="#fff" cx="26" cy="32" r="3"/>
  <path fill="#fff" d="M18 20 C22 24 22 40 18 44 H22 C26 40 26 24 22 20 Z"/>
  <path fill="#fff" d="M30 20 C34 24 34 40 30 44 H34 C38 40 38 24 34 20 Z"/>
  <rect fill="currentColor" x="44" y="14" width="16" height="36" rx="3"/>
  <rect fill="#fff" x="47" y="20" width="4" height="24" rx="1"/>
  <rect fill="#fff" x="53" y="20" width="4" height="24" rx="1"/>`,

  "front-wheel": `
  <circle fill="currentColor" cx="32" cy="32" r="28"/>
  <circle fill="#fff" cx="32" cy="32" r="22"/>
  <circle fill="currentColor" cx="32" cy="32" r="6"/>
  <path stroke="currentColor" stroke-width="2.5" d="M32 10 V26 M32 38 V54 M10 32 H26 M38 32 H54 M16 16 L26 26 M38 38 L48 48 M48 16 L38 26 M26 38 L16 48"/>
  <circle fill="#fff" cx="32" cy="32" r="2.5"/>`,

  "rear-wheel": `
  <circle fill="currentColor" cx="32" cy="32" r="28"/>
  <circle fill="#fff" cx="32" cy="32" r="22"/>
  <circle fill="currentColor" cx="32" cy="32" r="12"/>
  <circle fill="#fff" cx="32" cy="32" r="8"/>
  <circle fill="currentColor" cx="32" cy="32" r="5"/>
  <path stroke="currentColor" stroke-width="2" d="M32 10 V20 M32 44 V54 M10 32 H20 M44 32 H54 M16 16 L24 24 M40 40 L48 48 M48 16 L40 24 M24 40 L16 48"/>
  <circle fill="#fff" cx="32" cy="32" r="2"/>`,

  hubs: `
  <rect fill="currentColor" x="4" y="28" width="10" height="8" rx="1"/>
  <rect fill="currentColor" x="50" y="28" width="10" height="8" rx="1"/>
  <rect fill="currentColor" x="16" y="22" width="32" height="20" rx="4"/>
  <rect fill="currentColor" x="18" y="14" width="6" height="36" rx="2"/>
  <rect fill="currentColor" x="40" y="14" width="6" height="36" rx="2"/>
  <circle fill="#fff" cx="21" cy="18" r="1.5"/>
  <circle fill="#fff" cx="21" cy="26" r="1.5"/>
  <circle fill="#fff" cx="21" cy="34" r="1.5"/>
  <circle fill="#fff" cx="21" cy="42" r="1.5"/>
  <circle fill="#fff" cx="43" cy="18" r="1.5"/>
  <circle fill="#fff" cx="43" cy="26" r="1.5"/>
  <circle fill="#fff" cx="43" cy="34" r="1.5"/>
  <circle fill="#fff" cx="43" cy="42" r="1.5"/>
  <circle fill="#fff" cx="32" cy="32" r="3"/>`,

  rims: `
  <circle fill="currentColor" cx="38" cy="32" r="22"/>
  <circle fill="#fff" cx="38" cy="32" r="16"/>
  <circle fill="currentColor" cx="38" cy="32" r="13"/>
  <circle fill="#fff" cx="38" cy="32" r="10"/>
  <path fill="currentColor" d="M4 16 H14 V20 L16 24 V40 L14 44 H4 V48 H16 L20 42 V22 L16 16 H4 Z"/>
  <circle fill="currentColor" cx="38" cy="14" r="2"/>
  <circle fill="currentColor" cx="38" cy="50" r="2"/>
  <circle fill="currentColor" cx="20" cy="32" r="2"/>
  <circle fill="currentColor" cx="56" cy="32" r="2"/>`,

  spokes: `
  <circle fill="currentColor" cx="32" cy="32" r="10"/>
  <circle fill="#fff" cx="32" cy="32" r="4"/>
  <path stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M32 6 V22 M32 42 V58 M6 32 H22 M42 32 H58 M12 12 L24 24 M40 40 L52 52 M52 12 L40 24 M24 40 L12 52"/>
  <circle fill="currentColor" cx="32" cy="6" r="3"/>
  <circle fill="currentColor" cx="32" cy="58" r="3"/>
  <circle fill="currentColor" cx="6" cy="32" r="3"/>
  <circle fill="currentColor" cx="58" cy="32" r="3"/>`,

  "front-tire": `
  <circle fill="currentColor" cx="32" cy="32" r="28"/>
  <circle fill="#fff" cx="32" cy="32" r="18"/>
  <path fill="currentColor" d="M32 4 L34 12 H30 Z M48 10 L46 18 L50 16 Z M58 24 L50 26 L52 22 Z M60 32 L52 34 V30 Z M58 40 L50 38 L52 42 Z M48 54 L46 46 L50 48 Z M32 60 L30 52 H34 Z M16 54 L18 46 L14 48 Z M6 40 L14 38 L12 42 Z M4 32 L12 30 V34 Z M6 24 L14 26 L12 22 Z M16 10 L18 18 L14 16 Z"/>
  <path fill="currentColor" d="M28 26 L32 20 L36 26 V40 H28 Z"/>`,

  "rear-tire": `
  <circle fill="currentColor" cx="32" cy="32" r="28"/>
  <circle fill="#fff" cx="32" cy="32" r="18"/>
  <path fill="currentColor" d="M32 4 L34 12 H30 Z M48 10 L46 18 L50 16 Z M58 24 L50 26 L52 22 Z M60 32 L52 34 V30 Z M58 40 L50 38 L52 42 Z M48 54 L46 46 L50 48 Z M32 60 L30 52 H34 Z M16 54 L18 46 L14 48 Z M6 40 L14 38 L12 42 Z M4 32 L12 30 V34 Z M6 24 L14 26 L12 22 Z M16 10 L18 18 L14 16 Z"/>
  <rect fill="currentColor" x="22" y="22" width="20" height="4" rx="1"/>
  <rect fill="currentColor" x="22" y="30" width="20" height="4" rx="1"/>
  <rect fill="currentColor" x="22" y="38" width="20" height="4" rx="1"/>`,

  saddle: `
  <path fill="currentColor" d="M6 30 C10 18 22 16 32 24 C42 14 54 16 58 28 C52 42 40 44 32 36 C24 44 12 42 6 30 Z"/>
  <path fill="#fff" d="M18 28 C24 32 40 32 46 28 C42 34 36 36 32 32 C28 36 22 34 18 28 Z"/>
  <rect fill="currentColor" x="22" y="36" width="4" height="14" rx="1"/>
  <rect fill="currentColor" x="38" y="36" width="4" height="14" rx="1"/>
  <rect fill="currentColor" x="20" y="48" width="24" height="4" rx="1"/>`,

  seatpost: `
  <rect fill="currentColor" x="26" y="16" width="12" height="44" rx="2"/>
  <rect fill="#fff" x="30" y="22" width="4" height="32"/>
  <rect fill="currentColor" x="22" y="10" width="20" height="12" rx="2"/>
  <rect fill="currentColor" x="16" y="4" width="32" height="8" rx="2"/>
  <circle fill="#fff" cx="28" cy="16" r="2"/>
  <circle fill="#fff" cx="36" cy="16" r="2"/>`,

  pedals: `
  <rect fill="currentColor" x="2" y="28" width="12" height="8" rx="1"/>
  <rect fill="currentColor" x="12" y="16" width="44" height="32" rx="4"/>
  <rect fill="#fff" x="18" y="22" width="4" height="20" rx="1"/>
  <rect fill="#fff" x="28" y="22" width="4" height="20" rx="1"/>
  <rect fill="#fff" x="38" y="22" width="4" height="20" rx="1"/>
  <rect fill="#fff" x="48" y="22" width="4" height="20" rx="1"/>
  <circle fill="currentColor" cx="20" cy="20" r="2"/>
  <circle fill="currentColor" cx="30" cy="20" r="2"/>
  <circle fill="currentColor" cx="40" cy="20" r="2"/>
  <circle fill="currentColor" cx="50" cy="20" r="2"/>
  <circle fill="currentColor" cx="20" cy="44" r="2"/>
  <circle fill="currentColor" cx="30" cy="44" r="2"/>
  <circle fill="currentColor" cx="40" cy="44" r="2"/>
  <circle fill="currentColor" cx="50" cy="44" r="2"/>`,

  other: `
  <path fill="currentColor" d="M12 8 C20 8 26 14 26 22 C26 26 24 28 22 30 L40 48 L36 52 L18 34 C16 36 12 38 8 38 C0 38 -2 28 4 20 L10 26 C12 24 14 22 14 20 C14 16 12 12 8 12 Z"/>
  <path fill="currentColor" d="M38 12 L50 18 V30 L38 36 L26 30 V18 Z"/>
  <circle fill="#fff" cx="38" cy="24" r="4"/>
  <path fill="currentColor" d="M42 50 L54 38 L58 42 L46 54 Z"/>`,
};

/** Style B: isometric / 3⁄4 workshop views */
const styleB = {
  frame: `
  <g stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.12">
    <path d="M14 44 L28 16 L36 20 L22 48 Z"/>
    <path d="M28 16 L48 40 L40 46 L22 22 Z"/>
    <path d="M22 48 L40 46 L48 40 L14 44 Z"/>
  </g>
  <g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linejoin="round">
    <path d="M14 44 L28 16 L48 40 L40 46 L22 48 Z"/>
    <path d="M28 16 L22 48"/>
    <path d="M22 22 L40 46"/>
  </g>
  <ellipse cx="14" cy="44" rx="4" ry="2.5" fill="currentColor"/>
  <ellipse cx="48" cy="40" rx="4" ry="2.5" fill="currentColor"/>`,

  fork: `
  <path fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2" d="M30 8 L38 12 L36 22 L28 18 Z"/>
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M24 20 L42 28 L40 34 L22 26 Z"/>
  <path fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M26 28 L14 54"/>
  <path fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M36 32 L50 54"/>
  <ellipse cx="14" cy="54" rx="6" ry="3" fill="none" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="50" cy="54" rx="6" ry="3" fill="none" stroke="currentColor" stroke-width="2"/>
  <path stroke="currentColor" stroke-width="2" d="M8 54 H20 M44 54 H56"/>`,

  headset: `
  <ellipse cx="32" cy="12" rx="14" ry="5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2"/>
  <path fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2" d="M18 12 V20 C18 24 24 26 32 26 C40 26 46 24 46 20 V12"/>
  <ellipse cx="32" cy="20" rx="12" ry="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <rect x="26" y="26" width="12" height="14" rx="1" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="32" cy="44" rx="12" ry="4" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M20 44 V50 C20 54 26 56 32 56 C38 56 44 54 44 50 V44"/>
  <ellipse cx="32" cy="50" rx="14" ry="5" fill="none" stroke="currentColor" stroke-width="2"/>
  <line x1="32" y1="6" x2="32" y2="58" stroke="currentColor" stroke-width="2"/>`,

  handlebar: `
  <path fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M12 40 C10 28 16 18 28 16 C30 14 34 14 36 16 C48 18 54 28 52 40"/>
  <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M12 40 C8 48 8 54 10 56"/>
  <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M52 40 C56 48 56 54 54 56"/>
  <ellipse cx="18" cy="30" rx="4" ry="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="46" cy="30" rx="4" ry="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
  <rect x="28" y="12" width="8" height="8" rx="1" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2"/>`,

  stem: `
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M8 24 L20 18 L24 34 L12 40 Z"/>
  <path fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2" d="M20 28 L44 18 L48 26 L24 36 Z"/>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M44 14 L58 20 L54 42 L40 36 Z"/>
  <circle cx="14" cy="30" r="2" fill="currentColor"/>
  <circle cx="18" cy="36" r="2" fill="currentColor"/>
  <circle cx="48" cy="24" r="2" fill="currentColor"/>
  <circle cx="50" cy="34" r="2" fill="currentColor"/>`,

  "bar-tape": `
  <path fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2.5" d="M10 22 C24 12 40 14 50 28 C56 38 52 50 40 54 C30 57 20 52 16 46"/>
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none">
    <path d="M14 20 C20 26 22 34 18 40"/>
    <path d="M22 16 C28 24 30 34 26 44"/>
    <path d="M30 16 C36 26 36 38 32 48"/>
    <path d="M38 20 C44 30 42 42 36 50"/>
    <path d="M46 30 C48 40 44 48 38 52"/>
  </g>
  <ellipse cx="16" cy="48" rx="5" ry="3.5" fill="currentColor"/>
  <ellipse cx="54" cy="16" rx="7" ry="5" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="54" cy="16" rx="2.5" ry="1.8" fill="currentColor"/>`,

  "shift-levers": `
  <path fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2" d="M16 10 L38 6 L44 16 L42 30 L20 34 L14 22 Z"/>
  <path fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2" d="M24 32 L32 30 L34 56 L26 58 Z"/>
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M36 28 L54 44 L48 50 L32 36 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M20 14 L36 10"/>
  <circle cx="28" cy="18" r="2" fill="currentColor"/>`,

  "brake-levers": `
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M4 18 L36 10 L40 20 L8 28 Z"/>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M22 12 L34 8 L38 24 L26 28 Z"/>
  <path fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M30 26 C44 28 52 40 50 54"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M28 30 C40 34 44 44 44 52"/>
  <circle cx="28" cy="18" r="2.5" fill="currentColor"/>`,

  "front-derailleur": `
  <ellipse cx="20" cy="40" rx="14" ry="8" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="20" cy="40" rx="8" ry="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="20" cy="40" rx="3" ry="1.8" fill="currentColor"/>
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M34 10 L50 16 L48 24 L32 18 Z"/>
  <path fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2" d="M34 22 L52 30 L48 54 L30 46 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M36 34 H48 M34 42 H46"/>`,

  "rear-derailleur": `
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M10 8 L34 4 L40 14 L16 18 Z"/>
  <path fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2" d="M22 16 L40 20 L36 34 L18 30 Z"/>
  <ellipse cx="22" cy="40" rx="8" ry="5" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="22" cy="40" rx="3" ry="2" fill="currentColor"/>
  <path stroke="currentColor" stroke-width="2" d="M28 44 L38 52"/>
  <ellipse cx="42" cy="54" rx="7" ry="4.5" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="42" cy="54" rx="2.5" ry="1.5" fill="currentColor"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M30 22 L24 34"/>`,

  crankset: `
  <ellipse cx="24" cy="36" rx="18" ry="10" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="24" cy="36" rx="11" ry="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="24" cy="36" rx="4" ry="2.2" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <path d="M24 24 V28 M36 30 L34 33 M40 36 H36 M36 42 L34 39 M24 48 V44 M12 42 L14 39 M8 36 H12 M12 30 L14 33"/>
  </g>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.2" d="M28 36 L54 20 L58 26 L34 40 Z"/>
  <ellipse cx="56" cy="22" rx="4" ry="2.5" fill="currentColor"/>`,

  "bottom-bracket": `
  <ellipse cx="32" cy="28" rx="18" ry="8" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <path fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2" d="M14 28 V40 C14 46 22 50 32 50 C42 50 50 46 50 40 V28"/>
  <ellipse cx="32" cy="40" rx="18" ry="8" fill="none" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="14" cy="34" rx="5" ry="10" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="50" cy="34" rx="5" ry="10" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2"/>
  <path stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M4 34 H10 M54 34 H60"/>
  <ellipse cx="32" cy="34" rx="4" ry="2" fill="currentColor"/>`,

  cassette: `
  <g stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.14">
    <ellipse cx="30" cy="16" rx="22" ry="7"/>
    <path d="M8 16 V22 C8 26 18 30 30 30 C42 30 52 26 52 22 V16"/>
    <ellipse cx="30" cy="22" rx="18" ry="6"/>
    <path d="M12 22 V28 C12 32 20 35 30 35 C40 35 48 32 48 28 V22"/>
    <ellipse cx="30" cy="28" rx="14" ry="5"/>
    <path d="M16 28 V34 C16 37 22 40 30 40 C38 40 44 37 44 34 V28"/>
    <ellipse cx="30" cy="34" rx="10" ry="4"/>
    <path d="M20 34 V40 C20 43 24 46 30 46 C36 46 40 43 40 40 V34"/>
    <ellipse cx="30" cy="40" rx="7" ry="3"/>
    <path d="M24 40 V50 C24 54 27 56 30 56 C33 56 36 54 36 50 V40"/>
    <ellipse cx="30" cy="52" rx="6" ry="2.5"/>
  </g>
  <g stroke="currentColor" stroke-width="1.5" fill="none">
    <path d="M12 14 L10 10 M30 9 V13 M48 14 L50 10"/>
  </g>`,

  chain: `
  <g stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.18">
    <path d="M4 28 L16 22 L22 34 L10 40 Z"/>
    <path d="M14 30 L26 24 L32 36 L20 42 Z"/>
    <path d="M24 28 L36 22 L42 34 L30 40 Z"/>
    <path d="M34 30 L46 24 L52 36 L40 42 Z"/>
    <path d="M44 28 L56 22 L60 30 L48 36 Z"/>
  </g>
  <circle cx="13" cy="31" r="2.5" fill="currentColor"/>
  <circle cx="33" cy="31" r="2.5" fill="currentColor"/>
  <circle cx="52" cy="30" r="2.5" fill="currentColor"/>`,

  brakes: `
  <ellipse cx="24" cy="32" rx="20" ry="12" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="24" cy="32" rx="7" ry="4" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
  <g stroke="currentColor" stroke-width="1.5" fill="none">
    <path d="M14 26 C18 30 18 34 14 38"/>
    <path d="M34 26 C30 30 30 34 34 38"/>
    <path d="M18 22 C24 24 28 24 34 22"/>
  </g>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M40 18 L58 26 L54 50 L36 42 Z"/>
  <path fill="#fff" fill-opacity="0.5" stroke="currentColor" stroke-width="1.5" d="M44 28 L50 30 L48 44 L42 42 Z"/>
  <path fill="#fff" fill-opacity="0.5" stroke="currentColor" stroke-width="1.5" d="M50 30 L56 32 L54 46 L48 44 Z"/>`,

  "front-wheel": `
  <ellipse cx="32" cy="34" rx="26" ry="16" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="2.5"/>
  <ellipse cx="32" cy="34" rx="20" ry="12" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="32" cy="34" rx="5" ry="3" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.5">
    <path d="M32 18 V30 M32 38 V50 M10 34 H26 M38 34 H54"/>
    <path d="M16 24 L26 30 M38 38 L48 44 M48 24 L38 30 M26 38 L16 44"/>
  </g>
  <path stroke="currentColor" stroke-width="2" d="M18 34 H46"/>
  <path stroke="currentColor" stroke-width="1.5" d="M16 30 V38 M48 30 V38"/>`,

  "rear-wheel": `
  <ellipse cx="32" cy="34" rx="26" ry="16" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="2.5"/>
  <ellipse cx="32" cy="34" rx="20" ry="12" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="32" cy="34" rx="10" ry="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="32" cy="34" rx="6" ry="3.5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="32" cy="34" rx="3" ry="1.8" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.5">
    <path d="M32 18 V26 M32 42 V50 M10 34 H20 M44 34 H54"/>
    <path d="M16 24 L24 30 M40 38 L48 44 M48 24 L40 30 M24 38 L16 44"/>
  </g>`,

  hubs: `
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M16 24 L48 16 L52 36 L20 44 Z"/>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M14 18 L22 16 L26 42 L18 44 Z"/>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M46 14 L54 12 L58 38 L50 40 Z"/>
  <path stroke="currentColor" stroke-width="2.5" d="M4 34 L16 30 M52 22 L62 18"/>
  <circle cx="20" cy="22" r="1.8" fill="currentColor"/>
  <circle cx="22" cy="30" r="1.8" fill="currentColor"/>
  <circle cx="24" cy="38" r="1.8" fill="currentColor"/>
  <circle cx="52" cy="18" r="1.8" fill="currentColor"/>
  <circle cx="54" cy="26" r="1.8" fill="currentColor"/>
  <circle cx="56" cy="34" r="1.8" fill="currentColor"/>`,

  rims: `
  <ellipse cx="38" cy="34" rx="20" ry="12" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2.5"/>
  <ellipse cx="38" cy="34" rx="14" ry="8" fill="none" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="38" cy="34" rx="10" ry="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M4 20 L14 16 L18 44 L8 48 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M8 24 H16 M10 34 H18 M8 44 H16"/>
  <circle cx="38" cy="22" r="2" fill="currentColor"/>
  <circle cx="38" cy="46" r="2" fill="currentColor"/>
  <circle cx="22" cy="34" r="2" fill="currentColor"/>
  <circle cx="54" cy="34" r="2" fill="currentColor"/>`,

  spokes: `
  <ellipse cx="32" cy="34" rx="8" ry="5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2"/>
  <ellipse cx="32" cy="34" rx="3" ry="2" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M32 12 V28 M32 40 V56 M10 34 H24 M40 34 H54"/>
    <path d="M14 18 L26 28 M38 40 L50 50 M50 18 L38 28 M26 40 L14 50"/>
  </g>
  <ellipse cx="32" cy="12" rx="3" ry="2" fill="currentColor"/>
  <ellipse cx="32" cy="56" rx="3" ry="2" fill="currentColor"/>
  <ellipse cx="10" cy="34" rx="3" ry="2" fill="currentColor"/>
  <ellipse cx="54" cy="34" rx="3" ry="2" fill="currentColor"/>`,

  "front-tire": `
  <ellipse cx="32" cy="34" rx="26" ry="16" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="3"/>
  <ellipse cx="32" cy="34" rx="16" ry="10" fill="none" stroke="currentColor" stroke-width="2"/>
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M32 16 V22 M50 22 L46 26 M56 34 H50 M50 46 L46 42 M32 52 V46 M14 46 L18 42 M8 34 H14 M14 22 L18 26"/>
  </g>
  <path fill="currentColor" d="M28 30 L32 24 L36 30 V40 H28 Z"/>`,

  "rear-tire": `
  <ellipse cx="32" cy="34" rx="26" ry="16" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="3"/>
  <ellipse cx="32" cy="34" rx="16" ry="10" fill="none" stroke="currentColor" stroke-width="2"/>
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M32 16 V22 M50 22 L46 26 M56 34 H50 M50 46 L46 42 M32 52 V46 M14 46 L18 42 M8 34 H14 M14 22 L18 26"/>
  </g>
  <rect x="22" y="26" width="20" height="3" rx="1" fill="currentColor"/>
  <rect x="22" y="33" width="20" height="3" rx="1" fill="currentColor"/>
  <rect x="22" y="40" width="20" height="3" rx="1" fill="currentColor"/>`,

  saddle: `
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M8 32 C14 18 28 16 36 26 C44 14 56 18 58 30 C52 44 42 48 34 40 C26 50 12 46 8 32 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M18 30 C26 34 40 34 48 28"/>
  <path stroke="currentColor" stroke-width="2" d="M24 40 V52 M40 38 V50"/>
  <path stroke="currentColor" stroke-width="2" d="M22 52 H42"/>
  <ellipse cx="32" cy="28" rx="6" ry="3" fill="currentColor" fill-opacity="0.15"/>`,

  seatpost: `
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2" d="M26 18 L38 14 L42 54 L30 58 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M30 28 L38 25 M30 38 L38 35 M30 48 L38 45"/>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M22 12 L44 6 L46 16 L24 22 Z"/>
  <path fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" d="M16 6 L48 0 L50 8 L18 14 Z"/>
  <circle cx="30" cy="14" r="2" fill="currentColor"/>
  <circle cx="38" cy="11" r="2" fill="currentColor"/>`,

  pedals: `
  <path fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2" d="M14 20 L54 10 L58 36 L18 46 Z"/>
  <path stroke="currentColor" stroke-width="2" d="M4 36 L16 32"/>
  <path stroke="currentColor" stroke-width="1.5" d="M4 32 V40"/>
  <g stroke="currentColor" stroke-width="1.8">
    <path d="M22 24 L24 40 M32 21 L34 38 M42 18 L44 36 M50 16 L52 34"/>
  </g>
  <circle cx="24" cy="22" r="2" fill="currentColor"/>
  <circle cx="34" cy="19" r="2" fill="currentColor"/>
  <circle cx="44" cy="16" r="2" fill="currentColor"/>
  <circle cx="26" cy="42" r="2" fill="currentColor"/>
  <circle cx="36" cy="39" r="2" fill="currentColor"/>
  <circle cx="46" cy="36" r="2" fill="currentColor"/>`,

  other: `
  <path fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2.2" d="M10 14 C18 8 28 12 30 22 C30 28 26 32 22 34 L38 50 L32 56 L16 40 C12 42 6 40 4 32 C2 22 6 16 10 14 Z"/>
  <path fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" d="M40 10 L54 16 L50 30 L36 24 Z"/>
  <ellipse cx="44" cy="20" rx="4" ry="2.5" fill="none" stroke="currentColor" stroke-width="2"/>
  <path fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" d="M44 46 L58 36 L62 42 L48 52 Z"/>`,
};

/** Style C: fine technical illustration with hatching */
const hatch = `
  <defs>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4">
      <path d="M0 4 L4 0" stroke="currentColor" stroke-width="0.7" opacity="0.35"/>
    </pattern>
    <pattern id="hatch2" patternUnits="userSpaceOnUse" width="3" height="3">
      <path d="M0 3 L3 0" stroke="currentColor" stroke-width="0.6" opacity="0.25"/>
    </pattern>
  </defs>`;

const styleC = {
  frame: `${hatch}
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.8" d="M12 48 L30 10 L52 48 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.8" d="M30 10 V48 M12 48 H52"/>
  <path fill="none" stroke="currentColor" stroke-width="1.4" d="M30 10 L34 6 M32 6 V12"/>
  <path fill="none" stroke="currentColor" stroke-width="1.4" d="M30 26 L44 40"/>
  <circle cx="12" cy="48" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="52" cy="48" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="30" cy="48" r="2" fill="currentColor"/>
  <path stroke="currentColor" stroke-width="1.3" d="M8 42 L12 48 M56 42 L52 48"/>
  <g stroke="currentColor" stroke-width="0.8" opacity="0.5">
    <path d="M18 44 L30 22 L42 44"/>
  </g>`,

  fork: `${hatch}
  <rect x="29" y="4" width="6" height="16" rx="1" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.6" d="M22 18 H42 L38 26 H26 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M28 24 C26 36 20 46 16 56"/>
  <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M36 24 C38 36 44 46 48 56"/>
  <path stroke="currentColor" stroke-width="1.5" d="M10 56 H22 M42 56 H54"/>
  <circle cx="16" cy="56" r="2" fill="currentColor"/>
  <circle cx="48" cy="56" r="2" fill="currentColor"/>
  <path stroke="currentColor" stroke-width="1" opacity="0.5" d="M30 28 V40 M34 28 V40"/>`,

  headset: `${hatch}
  <line x1="32" y1="4" x2="32" y2="60" stroke="currentColor" stroke-width="1.8"/>
  <ellipse cx="32" cy="14" rx="15" ry="4.5" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="32" cy="20" rx="11" ry="3" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <rect x="25" y="26" width="14" height="12" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3"/>
  <ellipse cx="32" cy="44" rx="11" ry="3" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <ellipse cx="32" cy="50" rx="15" ry="4.5" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <g fill="currentColor">
    <circle cx="24" cy="14" r="1.2"/><circle cx="32" cy="14" r="1.2"/><circle cx="40" cy="14" r="1.2"/>
    <circle cx="24" cy="50" r="1.2"/><circle cx="32" cy="50" r="1.2"/><circle cx="40" cy="50" r="1.2"/>
  </g>
  <path stroke="currentColor" stroke-width="1" d="M26 8 H38 M28 6 H36"/>`,

  handlebar: `${hatch}
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.8" d="M12 48 C12 30 18 16 32 16 C46 16 52 30 52 48"/>
  <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 48 C10 54 8 56 6 56 M52 48 C54 54 56 56 58 56"/>
  <path fill="none" stroke="currentColor" stroke-width="1.4" d="M18 28 C16 36 16 42 18 46 M46 28 C48 36 48 42 46 46"/>
  <rect x="28" y="12" width="8" height="8" rx="1" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4"/>
  <path stroke="currentColor" stroke-width="1" opacity="0.45" d="M20 20 C28 18 36 18 44 20"/>`,

  stem: `${hatch}
  <rect x="6" y="20" width="16" height="24" rx="2" fill="url(#hatch)" stroke="currentColor" stroke-width="1.6"/>
  <rect x="20" y="28" width="24" height="8" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5"/>
  <rect x="42" y="14" width="16" height="32" rx="2" fill="url(#hatch)" stroke="currentColor" stroke-width="1.6"/>
  <g fill="none" stroke="currentColor" stroke-width="1.2">
    <circle cx="14" cy="28" r="2.2"/><circle cx="14" cy="36" r="2.2"/>
    <circle cx="50" cy="24" r="2.2"/><circle cx="50" cy="40" r="2.2"/>
  </g>
  <path stroke="currentColor" stroke-width="1" d="M48 10 H56 V14"/>`,

  "bar-tape": `${hatch}
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.8" d="M8 20 C24 10 42 12 50 26 C58 38 54 50 40 54 C28 58 18 52 14 46 L20 40 C24 46 32 48 38 46 C46 42 48 34 44 28 C38 20 26 18 16 24 Z"/>
  <g stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round">
    <path d="M14 18 C20 24 22 32 18 38"/>
    <path d="M22 15 C28 22 30 34 26 44"/>
    <path d="M30 15 C36 24 36 38 32 48"/>
    <path d="M38 18 C44 28 42 42 36 50"/>
    <path d="M46 28 C48 38 44 48 38 52"/>
  </g>
  <circle cx="18" cy="50" r="4.5" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="54" cy="14" r="6.5" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="54" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/>`,

  "shift-levers": `${hatch}
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.6" d="M14 8 H36 C44 8 48 14 48 22 V30 H40 V22 C40 18 38 14 34 14 H22 V30 H14 Z"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5" d="M22 28 H30 V56 H22 Z"/>
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.5" d="M32 26 L52 50 H42 L28 34 Z"/>
  <path stroke="currentColor" stroke-width="1.1" d="M18 12 H32 M26 18 H26"/>
  <circle cx="26" cy="20" r="1.8" fill="currentColor"/>`,

  "brake-levers": `${hatch}
  <rect x="4" y="14" width="38" height="8" rx="2" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5"/>
  <rect x="22" y="10" width="14" height="16" rx="2" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M30 24 C44 24 52 36 50 52"/>
  <path fill="none" stroke="currentColor" stroke-width="1.2" d="M28 28 C40 30 44 42 44 50"/>
  <circle cx="29" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <path stroke="currentColor" stroke-width="1.2" d="M34 10 V6 H44"/>`,

  "front-derailleur": `${hatch}
  <circle cx="20" cy="40" r="15" fill="url(#hatch)" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="20" cy="40" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="20" cy="40" r="3" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1" stroke-linecap="round">
    <path d="M20 25 V28 M31 32 L29 34 M35 40 H32 M31 48 L29 46 M20 55 V52 M9 48 L11 46 M5 40 H8 M9 32 L11 34"/>
  </g>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4" d="M34 8 H50 V18 H34 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.5" d="M36 18 V50 H50 V18"/>
  <path stroke="currentColor" stroke-width="1.2" d="M36 34 H50 M36 42 H50"/>`,

  "rear-derailleur": `${hatch}
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.5" d="M10 6 H36 L42 16 H28 L24 10 H10 Z"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4" d="M22 14 H42 L48 28 H28 Z"/>
  <circle cx="22" cy="38" r="8" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="22" cy="38" r="2.5" fill="currentColor"/>
  <path stroke="currentColor" stroke-width="1.5" d="M28 44 L38 52"/>
  <circle cx="42" cy="54" r="6.5" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="42" cy="54" r="2" fill="currentColor"/>
  <path stroke="currentColor" stroke-width="1.1" d="M30 20 L24 32 M36 22 L32 30"/>
  <circle cx="18" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/>`,

  crankset: `${hatch}
  <circle cx="24" cy="34" r="20" fill="url(#hatch)" stroke="currentColor" stroke-width="1.7"/>
  <circle cx="24" cy="34" r="12" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="24" cy="34" r="4" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
    <path d="M24 12 L26 16 H22 Z" fill="currentColor" stroke="none"/>
    <path d="M40 20 L38 24" /><path d="M44 34 H40"/><path d="M40 48 L38 44"/>
    <path d="M24 56 L22 52 H26 Z" fill="currentColor" stroke="none"/>
    <path d="M8 48 L10 44"/><path d="M4 34 H8"/><path d="M8 20 L10 24"/>
  </g>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.7" d="M28 34 L54 16 L58 22 L34 38 Z"/>
  <circle cx="56" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>`,

  "bottom-bracket": `${hatch}
  <rect x="22" y="20" width="20" height="24" rx="2" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="18" cy="32" rx="5" ry="11" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="46" cy="32" rx="5" ry="11" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5"/>
  <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 32 H14 M50 32 H60"/>
  <path stroke="currentColor" stroke-width="1.3" d="M4 28 V36 M60 28 V36"/>
  <g fill="currentColor">
    <circle cx="18" cy="26" r="1.3"/><circle cx="18" cy="32" r="1.3"/><circle cx="18" cy="38" r="1.3"/>
    <circle cx="46" cy="26" r="1.3"/><circle cx="46" cy="32" r="1.3"/><circle cx="46" cy="38" r="1.3"/>
  </g>
  <circle cx="32" cy="32" r="3.5" fill="none" stroke="currentColor" stroke-width="1.3"/>`,

  cassette: `${hatch}
  <g stroke="currentColor" stroke-width="1.4" fill="url(#hatch)">
    <ellipse cx="32" cy="12" rx="22" ry="5"/>
  </g>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3" d="M10 12 V18 H54 V12"/>
  <ellipse cx="32" cy="18" rx="19" ry="4.5" fill="url(#hatch)" stroke="currentColor" stroke-width="1.3"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.2" d="M13 18 V24 H51 V18"/>
  <ellipse cx="32" cy="24" rx="15" ry="4" fill="url(#hatch)" stroke="currentColor" stroke-width="1.2"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.2" d="M17 24 V30 H47 V24"/>
  <ellipse cx="32" cy="30" rx="12" ry="3.5" fill="url(#hatch)" stroke="currentColor" stroke-width="1.2"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.1" d="M20 30 V36 H44 V30"/>
  <ellipse cx="32" cy="36" rx="9" ry="3" fill="url(#hatch)" stroke="currentColor" stroke-width="1.1"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.1" d="M23 36 V42 H41 V36"/>
  <ellipse cx="32" cy="42" rx="6" ry="2.5" fill="url(#hatch)" stroke="currentColor" stroke-width="1.1"/>
  <rect x="27" y="42" width="10" height="12" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.1"/>
  <ellipse cx="32" cy="54" rx="5" ry="2" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <g stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
    <path d="M14 11 L12 7 M32 7 V11 M50 11 L52 7 M20 9 L19 12 M44 9 L45 12"/>
  </g>`,

  chain: `${hatch}
  <g stroke="currentColor" stroke-width="1.5">
    <rect x="2" y="24" width="16" height="16" rx="4" fill="url(#hatch)"/>
    <rect x="14" y="28" width="12" height="8" rx="2" fill="url(#hatch2)"/>
    <rect x="22" y="24" width="16" height="16" rx="4" fill="url(#hatch)"/>
    <rect x="34" y="28" width="12" height="8" rx="2" fill="url(#hatch2)"/>
    <rect x="42" y="24" width="16" height="16" rx="4" fill="url(#hatch)"/>
    <rect x="54" y="28" width="8" height="8" rx="2" fill="url(#hatch2)"/>
  </g>
  <g fill="currentColor">
    <circle cx="10" cy="32" r="2"/><circle cx="30" cy="32" r="2"/><circle cx="50" cy="32" r="2"/>
  </g>
  <path stroke="currentColor" stroke-width="1" opacity="0.5" d="M8 28 V36 M28 28 V36 M48 28 V36"/>`,

  brakes: `${hatch}
  <circle cx="24" cy="32" r="22" fill="url(#hatch)" stroke="currentColor" stroke-width="1.7"/>
  <circle cx="24" cy="32" r="7" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="24" cy="32" r="2.5" fill="currentColor"/>
  <g fill="none" stroke="currentColor" stroke-width="1.2">
    <path d="M16 22 C20 26 20 38 16 42"/>
    <path d="M32 22 C28 26 28 38 32 42"/>
    <path d="M18 18 C24 20 28 20 34 18"/>
    <circle cx="24" cy="22" r="1.5"/><circle cx="24" cy="42" r="1.5"/>
    <circle cx="14" cy="32" r="1.5"/><circle cx="34" cy="32" r="1.5"/>
  </g>
  <rect x="44" y="14" width="14" height="36" rx="2" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5"/>
  <rect x="46" y="22" width="4" height="20" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <rect x="52" y="22" width="4" height="20" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="51" cy="32" r="2" fill="currentColor"/>`,

  "front-wheel": `${hatch}
  <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="32" cy="32" r="23" fill="url(#hatch)" stroke="currentColor" stroke-width="1.2" fill-opacity="0.35"/>
  <circle cx="32" cy="32" r="6" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4"/>
  <g stroke="currentColor" stroke-width="1.2">
    <path d="M32 9 V26 M32 38 V55 M9 32 H26 M38 32 H55"/>
    <path d="M15 15 L26 26 M38 38 L49 49 M49 15 L38 26 M26 38 L15 49"/>
    <path d="M20 10 L28 24 M44 40 L52 54 M52 10 L44 24 M28 40 L20 54" opacity="0.55"/>
  </g>
  <circle cx="32" cy="32" r="2.2" fill="currentColor"/>
  <path stroke="currentColor" stroke-width="1.3" d="M18 32 H46 M16 28 V36 M48 28 V36"/>`,

  "rear-wheel": `${hatch}
  <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="32" cy="32" r="23" fill="url(#hatch)" stroke="currentColor" stroke-width="1.2" fill-opacity="0.35"/>
  <circle cx="32" cy="32" r="11" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="32" cy="32" r="4" fill="currentColor"/>
  <g stroke="currentColor" stroke-width="1.2">
    <path d="M32 9 V20 M32 44 V55 M9 32 H20 M44 32 H55"/>
    <path d="M15 15 L24 24 M40 40 L49 49 M49 15 L40 24 M24 40 L15 49"/>
  </g>
  <path stroke="currentColor" stroke-width="1.1" d="M38 28 A8 8 0 0 1 38 36"/>`,

  hubs: `${hatch}
  <rect x="4" y="28" width="10" height="8" rx="1" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3"/>
  <rect x="50" y="28" width="10" height="8" rx="1" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3"/>
  <rect x="16" y="22" width="32" height="20" rx="3" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <rect x="18" y="12" width="6" height="40" rx="2" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4"/>
  <rect x="40" y="12" width="6" height="40" rx="2" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4"/>
  <g fill="currentColor">
    <circle cx="21" cy="16" r="1.4"/><circle cx="21" cy="24" r="1.4"/><circle cx="21" cy="32" r="1.4"/><circle cx="21" cy="40" r="1.4"/><circle cx="21" cy="48" r="1.4"/>
    <circle cx="43" cy="16" r="1.4"/><circle cx="43" cy="24" r="1.4"/><circle cx="43" cy="32" r="1.4"/><circle cx="43" cy="40" r="1.4"/><circle cx="43" cy="48" r="1.4"/>
  </g>
  <circle cx="32" cy="32" r="3" fill="none" stroke="currentColor" stroke-width="1.3"/>`,

  rims: `${hatch}
  <circle cx="40" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="40" cy="32" r="15" fill="url(#hatch)" stroke="currentColor" stroke-width="1.4"/>
  <circle cx="40" cy="32" r="11" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <g fill="currentColor">
    <circle cx="40" cy="14" r="1.5"/><circle cx="40" cy="50" r="1.5"/>
    <circle cx="22" cy="32" r="1.5"/><circle cx="58" cy="32" r="1.5"/>
    <circle cx="27" cy="19" r="1.5"/><circle cx="53" cy="19" r="1.5"/>
    <circle cx="27" cy="45" r="1.5"/><circle cx="53" cy="45" r="1.5"/>
  </g>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4" d="M4 16 H14 V20 L16 24 V40 L14 44 H4 V48 H16 L20 42 V22 L16 16 H4 Z"/>
  <path stroke="currentColor" stroke-width="1.1" d="M12 32 H18"/>`,

  spokes: `${hatch}
  <circle cx="32" cy="32" r="9" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="32" cy="32" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <path d="M32 6 V23 M32 41 V58 M6 32 H23 M41 32 H58"/>
    <path d="M12 12 L24 24 M40 40 L52 52 M52 12 L40 24 M24 40 L12 52"/>
    <path d="M20 8 L28 22 M44 42 L52 56" opacity="0.55"/>
  </g>
  <g fill="url(#hatch2)" stroke="currentColor" stroke-width="1.1">
    <circle cx="32" cy="6" r="2.5"/><circle cx="32" cy="58" r="2.5"/>
    <circle cx="6" cy="32" r="2.5"/><circle cx="58" cy="32" r="2.5"/>
    <circle cx="12" cy="12" r="2.5"/><circle cx="52" cy="52" r="2.5"/>
  </g>`,

  "front-tire": `${hatch}
  <circle cx="32" cy="32" r="27" fill="url(#hatch)" stroke="currentColor" stroke-width="2"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <path d="M32 5 V12 M49 9 L45 15 M59 24 L52 26 M59 40 L52 38 M49 55 L45 49 M32 59 V52 M15 55 L19 49 M5 40 L12 38 M5 24 L12 26 M15 9 L19 15"/>
  </g>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3" d="M28 26 L32 20 L36 26 V40 H28 Z"/>`,

  "rear-tire": `${hatch}
  <circle cx="32" cy="32" r="27" fill="url(#hatch)" stroke="currentColor" stroke-width="2"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <path d="M32 5 V12 M49 9 L45 15 M59 24 L52 26 M59 40 L52 38 M49 55 L45 49 M32 59 V52 M15 55 L19 49 M5 40 L12 38 M5 24 L12 26 M15 9 L19 15"/>
  </g>
  <rect x="22" y="22" width="20" height="3.5" rx="1" fill="url(#hatch2)" stroke="currentColor" stroke-width="1"/>
  <rect x="22" y="30" width="20" height="3.5" rx="1" fill="url(#hatch2)" stroke="currentColor" stroke-width="1"/>
  <rect x="22" y="38" width="20" height="3.5" rx="1" fill="url(#hatch2)" stroke="currentColor" stroke-width="1"/>`,

  saddle: `${hatch}
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.7" d="M6 30 C12 16 24 16 32 24 C40 14 52 16 58 28 C52 42 40 44 32 36 C24 44 12 42 6 30 Z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.2" d="M18 28 C26 34 38 34 46 28"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3" d="M22 36 V50 H26 V38 M38 36 V50 H42 V38"/>
  <path stroke="currentColor" stroke-width="1.4" d="M20 50 H44"/>
  <path stroke="currentColor" stroke-width="1" opacity="0.45" d="M14 26 C22 22 42 22 50 26"/>`,

  seatpost: `${hatch}
  <rect x="26" y="16" width="12" height="44" rx="2" fill="url(#hatch)" stroke="currentColor" stroke-width="1.5"/>
  <path stroke="currentColor" stroke-width="1.1" d="M28 26 H36 M28 36 H36 M28 46 H36"/>
  <rect x="22" y="10" width="20" height="12" rx="2" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.4"/>
  <rect x="16" y="4" width="32" height="8" rx="1.5" fill="url(#hatch)" stroke="currentColor" stroke-width="1.4"/>
  <circle cx="28" cy="16" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="36" cy="16" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/>`,

  pedals: `${hatch}
  <rect x="2" y="28" width="12" height="8" rx="1" fill="url(#hatch2)" stroke="currentColor" stroke-width="1.3"/>
  <rect x="12" y="16" width="44" height="32" rx="3" fill="url(#hatch)" stroke="currentColor" stroke-width="1.6"/>
  <g stroke="currentColor" stroke-width="1.4">
    <path d="M20 22 V42 M30 22 V42 M40 22 V42 M50 22 V42"/>
  </g>
  <g fill="currentColor">
    <circle cx="20" cy="20" r="1.6"/><circle cx="30" cy="20" r="1.6"/><circle cx="40" cy="20" r="1.6"/><circle cx="50" cy="20" r="1.6"/>
    <circle cx="20" cy="44" r="1.6"/><circle cx="30" cy="44" r="1.6"/><circle cx="40" cy="44" r="1.6"/><circle cx="50" cy="44" r="1.6"/>
  </g>
  <circle cx="32" cy="32" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/>`,

  other: `${hatch}
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.6" d="M12 10 C22 8 28 16 26 24 C26 28 24 30 20 32 L38 50 L32 56 L14 38 C10 40 4 38 4 28 C4 18 8 12 12 10 Z"/>
  <path fill="url(#hatch2)" stroke="currentColor" stroke-width="1.5" d="M40 12 L52 18 V28 L40 34 L28 28 V18 Z"/>
  <circle cx="40" cy="23" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path fill="url(#hatch)" stroke="currentColor" stroke-width="1.4" d="M42 48 L56 36 L60 40 L46 52 Z"/>`,
};

const CATEGORIES = [
  "frame",
  "fork",
  "headset",
  "handlebar",
  "stem",
  "bar-tape",
  "shift-levers",
  "brake-levers",
  "front-derailleur",
  "rear-derailleur",
  "crankset",
  "bottom-bracket",
  "cassette",
  "chain",
  "brakes",
  "front-wheel",
  "rear-wheel",
  "hubs",
  "rims",
  "spokes",
  "front-tire",
  "rear-tire",
  "saddle",
  "seatpost",
  "pedals",
  "other",
];

const sets = [
  { dir: "a-silhouette", label: "A", style: styleA },
  { dir: "b-isometric", label: "B", style: styleB },
  { dir: "c-technical", label: "C", style: styleC },
];

let written = 0;
for (const set of sets) {
  const outDir = join(root, set.dir);
  mkdirSync(outDir, { recursive: true });
  for (const id of CATEGORIES) {
    const body = set.style[id];
    if (!body) throw new Error(`Missing ${set.label}/${id}`);
    writeFileSync(join(outDir, `${id}.svg`), wrap(body));
    written++;
  }
  console.log(`Wrote ${CATEGORIES.length} icons → ${set.dir}`);
}
console.log(`Done: ${written} SVGs`);
