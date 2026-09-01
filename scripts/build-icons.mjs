/**
 * Generates the PWA icon set from public/brand/logo.png.
 *
 * master_prompt.md §46 asks for icons and installability; brand_guidelines.md
 * §7 forbids recreating or recolouring the mark, so every icon here is the
 * supplied asset scaled uniformly onto a background -- never redrawn.
 *
 * Two shapes are produced for a reason:
 *
 *   - `icon-512.png` is the plain mark, edge to edge.
 *   - `icon-maskable-512.png` insets the mark to 60% of the canvas. Android
 *     crops a maskable icon to whatever shape the launcher uses, and anything
 *     outside the inner 80% circle can be cut. An un-inset icon survives a
 *     square launcher and loses its edges on a round one.
 *
 * The background is white rather than transparent: a transparent PWA icon
 * renders on whatever the launcher supplies, and the rose mark on a dark
 * launcher background is exactly the contrast failure §73 rules out.
 *
 *   node scripts/build-icons.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "brand", "logo.png");
const outDir = join(root, "public", "icons");

/** brand_guidelines.md: the surface the mark sits on. */
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * `contain` rather than `cover`: cropping the supplied mark to fill a square
 * would be a modification, which brand §7 does not permit.
 */
async function render(size, { inset = 0 } = {}) {
  const mark = Math.round(size * (1 - inset));

  const scaled = await sharp(source)
    .resize(mark, mark, { fit: "contain", background: { ...BACKGROUND, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: scaled, gravity: "centre" }])
    .png()
    .toBuffer();
}

const TARGETS = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // 40% total inset keeps the mark inside the safe circle of a maskable icon.
  { file: "icon-maskable-512.png", size: 512, inset: 0.4 },
  // iOS does not read the manifest for its home-screen icon, and composites
  // any transparency onto black. This one is deliberately opaque and padded.
  { file: "apple-touch-icon.png", size: 180, inset: 0.12 },
  { file: "favicon-32.png", size: 32 },
];

async function main() {
  mkdirSync(outDir, { recursive: true });

  for (const target of TARGETS) {
    const buffer = await render(target.size, { inset: target.inset ?? 0 });
    writeFileSync(join(outDir, target.file), buffer);
    console.log(`icons: ${target.file} (${target.size}px)`);
  }
}

main().catch((error) => {
  console.error(`icons: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
