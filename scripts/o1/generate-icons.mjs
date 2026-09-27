#!/usr/bin/env node
// Regenerates every product icon from the pixel font of the TUI logo
// (packages/cli/src/ui/utils/logo-font.ts), in the dark theme's colours
// (packages/cli/src/ui/themes/o1-code-dark.ts). Two marks:
//   - the symbol, "O1" alone, for 32 px and under, where "CODE" cannot be read;
//   - the full mark, "O1" over "CODE", for 48 px and up.
//
// The glyphs are paths, not <text>: a favicon or an activity-bar mask renders
// wherever it is shown, with whatever fonts that machine has, and the PNGs
// must not depend on the fonts of the machine that generated them.
//
// Two copies of the symbol are inlined rather than read from disk, and this
// script does not rewrite them; `--print` shows what to paste:
//   - packages/web-shell/client/index.html (favicon data URI)
//   - packages/web-shell/client/components/sidebar/WebShellSidebar.tsx
// The export template embeds favicon.svg at build time: run
// `npm run build:templates` in packages/web-templates afterwards.
//
// Usage: node scripts/o1/generate-icons.mjs [--print]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const BACKGROUND = '#0a1220';
export const BRAND = '#6e9bff';
export const FOREGROUND = '#e6ecf5';

const SIZE = 512;
const RADIUS = 112;

// The logo font: `#` is a lit pixel.
const GLYPHS = {
  O: ['###', '#.#', '#.#', '###'],
  1: ['##.', '.#.', '.#.', '###'],
  C: ['###', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '##.'],
  E: ['###', '##.', '#..', '###'],
};

/** A word in the logo font, one square per lit pixel, letters a pixel apart. */
function wordPath(word, px, x0, y0) {
  let d = '';
  let x = x0;
  for (const ch of word) {
    const glyph = GLYPHS[ch];
    glyph.forEach((row, r) => {
      [...row].forEach((cell, c) => {
        if (cell === '#') {
          d += `M${x + c * px} ${y0 + r * px}h${px}v${px}h${-px}Z`;
        }
      });
    });
    x += (glyph[0].length + 1) * px;
  }
  return d;
}

// Symbol: "O1" at 48 px per pixel, 336 x 192, centred.
const SYMBOL = [{ path: wordPath('O1', 48, 88, 160), color: BRAND }];

// Full mark: "O1" at 44 (308 x 176) over "CODE" at 22 (330 x 88), 44 apart;
// the block is 330 x 308, centred.
const FULL = [
  { path: wordPath('O1', 44, 102, 102), color: BRAND },
  { path: wordPath('CODE', 22, 91, 322), color: FOREGROUND },
];

export const SYMBOL_PATH = SYMBOL[0].path;

const SQUARE_PATH =
  `M${RADIUS} 0H${SIZE - RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${SIZE} ${RADIUS}` +
  `V${SIZE - RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${SIZE - RADIUS} ${SIZE}` +
  `H${RADIUS}A${RADIUS} ${RADIUS} 0 0 1 0 ${SIZE - RADIUS}` +
  `V${RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${RADIUS} 0Z`;

/**
 * The full-colour icon: `full` picks the mark with "CODE", `dot` adds the
 * VS Code tab-state badge.
 */
export function colorSvg({ full = false, dot } = {}) {
  const layers = (full ? FULL : SYMBOL)
    .map((layer) => `\n  <path fill="${layer.color}" d="${layer.path}"/>`)
    .join('');
  const badge = dot
    ? `\n  <circle cx="428" cy="84" r="64" fill="${dot}" stroke="#ffffff" stroke-width="16"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <path fill="${BACKGROUND}" d="${SQUARE_PATH}"/>${layers}${badge}
</svg>
`;
}

/**
 * The single-colour symbol for hosts that tint icons themselves (the VS Code
 * activity bar, Zed): the square in `fill`, the glyphs cut out of it.
 */
export function monoSvg(fill) {
  const fillAttr = fill ? ` fill="${fill}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <path${fillAttr} fill-rule="evenodd" d="${SQUARE_PATH}${SYMBOL_PATH}"/>
</svg>
`;
}

// Editor tab icons are drawn at 16 px: the symbol, with the state badge.
const TAB_DOT_ORANGE = '#F97316';
const TAB_DOT_BLUE = '#3B82F6';

const svgFiles = [
  ['packages/web-shell/client/public/assets/icon.svg', colorSvg()],
  ['packages/web-templates/src/export-html/src/favicon.svg', colorSvg()],
  [
    'packages/vscode-ide-companion/assets/sidebar-icon.svg',
    monoSvg('currentColor'),
  ],
  ['packages/zed-extension/o1-code.svg', monoSvg()],
];

const pngFiles = [
  [
    'packages/web-shell/client/public/assets/icon-192.png',
    192,
    colorSvg({ full: true }),
  ],
  [
    'packages/web-shell/client/public/assets/icon-512.png',
    512,
    colorSvg({ full: true }),
  ],
  [
    'packages/web-shell/client/assets/o1-code-notification.png',
    128,
    colorSvg({ full: true }),
  ],
  [
    'packages/vscode-ide-companion/assets/icon.png',
    460,
    colorSvg({ full: true }),
  ],
  [
    'packages/vscode-ide-companion/assets/icon-orange.png',
    460,
    colorSvg({ dot: TAB_DOT_ORANGE }),
  ],
  [
    'packages/vscode-ide-companion/assets/icon-blue.png',
    460,
    colorSvg({ dot: TAB_DOT_BLUE }),
  ],
];

async function main() {
  if (process.argv.includes('--print')) {
    process.stdout.write(
      `favicon data URI (24x24):\ndata:image/svg+xml,${encodeURIComponent(
        colorSvg().replace('<svg ', '<svg width="24" height="24" ').trim(),
      )}\n\nsymbol path:\n${SYMBOL_PATH}\n\nsquare path:\n${SQUARE_PATH}\n`,
    );
    return;
  }
  for (const [file, content] of svgFiles) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    console.log(`wrote ${file}`);
  }
  for (const [file, size, svg] of pngFiles) {
    const target = join(root, file);
    await sharp(Buffer.from(svg), { density: (72 * size) / SIZE })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(target);
    console.log(`wrote ${file} (${size}x${size})`);
  }
}

await main();
