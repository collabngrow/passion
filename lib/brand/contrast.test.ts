import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Text contrast on brand surfaces (master_prompt.md §73, brand §24).
 *
 * S12 found three failures of the same shape: white text set at an opacity on
 * a rose background. `text-on-brand/70` looks deliberate and reads fine to
 * anyone with good vision on a good screen, and it is 3.6:1.
 *
 * Nothing about a ratio is visible in a diff, which is what makes this worth a
 * test rather than a note. The check computes the ratio from the tokens in
 * `globals.css` and the opacity in the utility, so it keeps working if the
 * palette is retuned -- it is not a list of forbidden strings.
 */

const root = resolve(__dirname, "..", "..");

const TREES = ["app", "components"];

/** WCAG 2.2 AA for body text. Large text may go to 3:1; nothing here is large. */
const AA_NORMAL_TEXT = 4.5;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (![".ts", ".tsx"].includes(extname(entry.name))) return [];
    if (entry.name.includes(".test.")) return [];
    return [full];
  });
}

/** Reads the `@theme` block, so the test follows the palette rather than pinning it. */
function tokens(): Record<string, [number, number, number]> {
  const css = readFileSync(join(root, "app", "globals.css"), "utf8");
  const out: Record<string, [number, number, number]> = {};

  for (const [, name, hex] of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    out[name] = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
  return out;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(
  foreground: [number, number, number],
  background: [number, number, number],
): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** What a semi-transparent foreground actually renders as over an opaque background. */
function composite(
  foreground: [number, number, number],
  background: [number, number, number],
  alpha: number,
): [number, number, number] {
  return [0, 1, 2].map(
    (i) => foreground[i] * alpha + background[i] * (1 - alpha),
  ) as [number, number, number];
}

const palette = tokens();
const files = TREES.flatMap((tree) => sourceFiles(join(root, tree)));

/** The rose surfaces `text-on-brand` is used against. */
const BRAND_SURFACES = ["brand", "brand-dark"] as const;

describe("the palette is readable", () => {
  it("found the tokens and the sources", () => {
    // A rename that silently emptied either would make every case below vacuous.
    expect(Object.keys(palette)).toEqual(
      expect.arrayContaining(["brand", "brand-dark", "on-brand", "ink", "ink-soft", "canvas"]),
    );
    expect(files.length).toBeGreaterThan(20);
  });

  it("clears AA for body text on white", () => {
    for (const name of ["ink", "ink-soft", "brand", "critical"]) {
      expect(contrast(palette[name], palette.canvas)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("clears AA for on-brand text against every rose surface", () => {
    for (const surface of BRAND_SURFACES) {
      expect(contrast(palette["on-brand"], palette[surface])).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });
});

describe("no on-brand text is faded below AA", () => {
  const sources = files.map((file) => ({
    file: file.slice(root.length + 1).split(sep).join("/"),
    source: readFileSync(file, "utf8"),
  }));

  it("can see the utility it is scanning for", () => {
    // The faded list below is allowed to be empty -- that is the healthy state
    // -- so something else has to prove the scan is looking at real files with
    // real class names. If this fails, every case below is passing vacuously.
    const plain = sources.filter(({ source }) => /text-on-brand\b/.test(source));
    expect(plain.length).toBeGreaterThan(0);
  });

  it("renders every faded usage at 4.5:1 or better", () => {
    const usages = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/text-on-brand\/(\d{1,3})\b/g)].map((match) => ({
        file,
        utility: match[0],
        alpha: Number(match[1]) / 100,
      })),
    );

    const failures = usages
      .flatMap((usage) =>
        BRAND_SURFACES.map((surface) => ({
          ...usage,
          surface,
          // Checked against both rose surfaces, not the one the element happens
          // to sit on today. A gradient runs between them, and a ratio that
          // passes against brand-dark can still fail against brand -- which is
          // exactly how the synthesis panel hid a 3.79:1 through S12.
          ratio: contrast(
            composite(palette["on-brand"], palette[surface], usage.alpha),
            palette[surface],
          ),
        })),
      )
      .filter((result) => result.ratio < AA_NORMAL_TEXT);

    expect(
      failures.map(
        (f) => `${f.file}: ${f.utility} on ${f.surface} = ${f.ratio.toFixed(2)}:1`,
      ),
    ).toEqual([]);
  });

  it("says what the cutoff costs: even 90% white fails on the lighter rose", () => {
    // Recorded because it is the non-obvious part. White at 90% reads as a
    // deliberate, safe-looking choice and clears AA on the sidebar at 5.05:1,
    // but only reaches 4.15:1 on --color-brand. There is no headroom to fade
    // white on rose at all, which is why the product now never does.
    expect(
      contrast(composite(palette["on-brand"], palette.brand, 0.9), palette.brand),
    ).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrast(palette["on-brand"], palette.brand)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });
});

describe("the focus ring is visible where it lands", () => {
  const css = readFileSync(join(root, "app", "globals.css"), "utf8");

  it("does not use the rose ring on a rose surface", () => {
    // The default `:focus-visible` outline is --color-brand, which against
    // --color-brand-dark is 1.2:1 -- not a focus indicator at all. The
    // .on-brand-surface rule is what makes the admin sidebar navigable by
    // keyboard, so its absence is a regression, not a style change.
    expect(css).toContain(".on-brand-surface :focus-visible");

    const ring = contrast(palette.brand, palette["brand-dark"]);
    expect(ring).toBeLessThan(3);

    // WCAG 2.2 non-text contrast: an indicator needs 3:1 against its adjacent
    // surface. White clears it on both rose surfaces.
    for (const surface of BRAND_SURFACES) {
      expect(contrast(palette["on-brand"], palette[surface])).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the reduced-motion block, which no build step would restore", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
