import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GENERATION_BUDGET_MS,
  INTERPRETATION_ATTEMPT_MS,
  ROUTE_MAX_DURATION_SECONDS,
} from "./generate";

/**
 * The generation time budgets, and the platform cap they have to fit inside.
 *
 * Two numbers decide whether a participant sees an explanation or a network
 * error, and they live in different files: `maxDuration` in each route, and the
 * budget passed to the router from `generate.ts`. If the budget ever exceeds
 * the cap, the model call is still running when Vercel kills the function --
 * the 503 that says "your writing is saved" is never sent, and the Firestore
 * write that follows the call can be cut in half.
 *
 * Nothing about that relationship is visible in a diff that touches only one of
 * the two files, which is what makes it worth a test. The route values are read
 * from source rather than imported, because a route module is not importable
 * outside the Next.js runtime.
 */

const root = resolve(__dirname, "..", "..");

/** Vercel Hobby kills a function here; the number is the platform's, not ours. */
const HOBBY_CAP_SECONDS = 60;

/**
 * Time the route needs for everything that is not the model call: the answer
 * reads before it and the Firestore writes after it.
 */
const MIN_NON_MODEL_MARGIN_MS = 5_000;

const routes = [
  "app/api/journey/reflect/route.ts",
  "app/api/journey/synthesis/route.ts",
] as const;

function declaredMaxDuration(file: string): number {
  const source = readFileSync(resolve(root, file), "utf8");
  const match = source.match(/export const maxDuration = (\d+)/);
  expect(match, `${file} declares no maxDuration`).not.toBeNull();
  return Number(match![1]);
}

describe("generation time budgets", () => {
  for (const route of routes) {
    it(`${route} stays inside the Hobby function cap`, () => {
      const maxDuration = declaredMaxDuration(route);

      expect(maxDuration).toBeLessThanOrEqual(HOBBY_CAP_SECONDS);
      expect(maxDuration).toBe(ROUTE_MAX_DURATION_SECONDS);
    });

    it(`${route} leaves room around its model call`, () => {
      const maxDuration = declaredMaxDuration(route);

      // The budget must end before the function does, with enough left over for
      // the writes that follow the call -- a synthesis generated and then lost
      // to a killed function is the worst outcome available here.
      expect(GENERATION_BUDGET_MS + MIN_NON_MODEL_MARGIN_MS).toBeLessThanOrEqual(
        maxDuration * 1000,
      );
    });
  }

  it("gives the interpretation room to fall back within the budget", () => {
    // A per-attempt cap only buys a fallback if two attempts fit inside the
    // budget. At half of it they do not, because the first one starts late.
    expect(INTERPRETATION_ATTEMPT_MS * 2).toBeLessThan(GENERATION_BUDGET_MS);
  });

  it("keeps the budget well clear of how long a call actually takes", () => {
    // A measured interpretation is ~18s. A budget trimmed towards that would
    // start aborting healthy generations, which is a worse failure than the
    // 504 this whole mechanism exists to avoid: the participant waits the full
    // time and still gets nothing.
    expect(GENERATION_BUDGET_MS).toBeGreaterThanOrEqual(40_000);
  });
});
