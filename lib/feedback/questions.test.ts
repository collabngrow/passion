import { describe, expect, it } from "vitest";

import {
  PAY_OPTION_MIDPOINTS,
  PERCEIVED_WORTH_CUSTOM_VALUE,
  PERCEIVED_WORTH_OPTIONS,
  PERCEIVED_WORTH_PRICELESS_VALUE,
  PRICING_DISCLAIMER,
  REVELATION_IMPACT_OPTIONS,
  WILLINGNESS_TO_PAY_OPTIONS,
  isValidPerceivedWorth,
  isValidRevelationImpact,
  isValidWillingnessToPay,
} from "./questions";

describe("survey option integrity", () => {
  /**
   * Option values are persisted. Renumbering or reordering them would silently
   * reinterpret every response already collected, so the numbering is pinned.
   */
  it("pins option values", () => {
    expect(REVELATION_IMPACT_OPTIONS.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
    expect(WILLINGNESS_TO_PAY_OPTIONS.map((o) => o.value)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(PERCEIVED_WORTH_OPTIONS.map((o) => o.value)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("keeps Q3 a superset of Q2, so the two can be compared", () => {
    for (const option of WILLINGNESS_TO_PAY_OPTIONS) {
      const match = PERCEIVED_WORTH_OPTIONS.find((o) => o.value === option.value);
      expect(match?.label, `value ${option.value} differs between Q2 and Q3`).toBe(
        option.label,
      );
    }
  });

  it("gives every option a non-empty label", () => {
    for (const option of [
      ...REVELATION_IMPACT_OPTIONS,
      ...PERCEIVED_WORTH_OPTIONS,
    ]) {
      expect(option.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("validators", () => {
  it("accepts valid selections", () => {
    expect(isValidWillingnessToPay(1)).toBe(true);
    expect(isValidWillingnessToPay(8)).toBe(true);
    expect(isValidRevelationImpact(5)).toBe(true);
    expect(isValidPerceivedWorth(10)).toBe(true);
  });

  it("rejects out-of-range, non-integer and non-numeric input", () => {
    for (const bad of [0, 9, -1, 1.5, "3", null, undefined, NaN, {}]) {
      expect(isValidWillingnessToPay(bad), `accepted ${String(bad)}`).toBe(false);
    }
    // 9 and 10 exist on Q3 but not on Q2.
    expect(isValidWillingnessToPay(9)).toBe(false);
    expect(isValidPerceivedWorth(9)).toBe(true);
    expect(isValidPerceivedWorth(11)).toBe(false);
    expect(isValidRevelationImpact(6)).toBe(false);
  });
});

describe("average worth mapping", () => {
  /**
   * Only the numbered brackets have a midpoint. The two ends of the scale are
   * fixed points priced in `amountFor` -- option 1 at zero, "Priceless" at the
   * ceiling -- and a midpoint here would be a second, disagreeing answer.
   */
  it("holds bracket midpoints only, not the ends of the scale", () => {
    expect(PAY_OPTION_MIDPOINTS[1]).toBeUndefined();
    expect(PAY_OPTION_MIDPOINTS[PERCEIVED_WORTH_CUSTOM_VALUE]).toBeUndefined();
    expect(PAY_OPTION_MIDPOINTS[PERCEIVED_WORTH_PRICELESS_VALUE]).toBeUndefined();
  });

  it("maps every numeric bracket, in increasing order", () => {
    const values = [2, 3, 4, 5, 6, 7, 8].map((v) => PAY_OPTION_MIDPOINTS[v]);
    expect(values.every((v) => typeof v === "number")).toBe(true);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

describe("pricing disclaimer", () => {
  /**
   * Asking about price at the start of a free experience reads as a paywall
   * unless it is disarmed. This copy is functional, not decorative.
   */
  it("states plainly that the exercise is free and nothing is charged", () => {
    const text = `${PRICING_DISCLAIMER.heading} ${PRICING_DISCLAIMER.body}`.toLowerCase();
    expect(text).toContain("free");
    expect(text).toMatch(/will not be charged|won't be charged/);
    expect(text).toContain("no payment");
  });
});
