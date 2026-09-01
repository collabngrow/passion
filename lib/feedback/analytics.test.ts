import { describe, expect, it } from "vitest";

import {
  HIGH_VALUE_RUPEES,
  amountFor,
  labelFor,
  summariseFeedback,
  type FeedbackRecord,
} from "./analytics";
import {
  MAX_WORTH_RUPEES,
  PERCEIVED_WORTH_OPTIONS,
  PRICELESS_RUPEES,
  parseCustomWorth,
} from "./questions";

function record(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    revelationImpact: 2,
    willingnessToPay: 3,
    perceivedWorth: 4,
    perceivedWorthCustom: null,
    ...overrides,
  };
}

describe("amountFor", () => {
  it("maps the numeric brackets to their midpoints", () => {
    expect(amountFor(2, null)).toBe(200);
    expect(amountFor(6, null)).toBe(3500);
  });

  /**
   * "Priceless" is the top of the scale, not an absent answer, so it can be
   * quantified alongside everything else.
   */
  it("values 'Priceless' at the ceiling of the scale", () => {
    expect(amountFor(10, null)).toBe(PRICELESS_RUPEES);
    expect(PRICELESS_RUPEES).toBe(MAX_WORTH_RUPEES);
  });

  /**
   * A refusal to pay is not an offer of zero. Averaging it as one would put a
   * figure in someone's mouth that they explicitly declined to give.
   */
  it("refuses to turn a refusal into a number", () => {
    expect(amountFor(1, null)).toBeNull();
  });

  it("uses the written-in amount for option 9, and only a usable one", () => {
    expect(amountFor(9, 2500)).toBe(2500);
    expect(amountFor(9, null)).toBeNull();
    expect(amountFor(9, 0)).toBeNull();
    expect(amountFor(9, -100)).toBeNull();
    expect(amountFor(9, Number.NaN)).toBeNull();
  });
});

describe("summariseFeedback", () => {
  it("survives an empty set without dividing by zero", () => {
    const summary = summariseFeedback([]);

    expect(summary.total).toBe(0);
    expect(summary.averageWorth.rupees).toBeNull();
    expect(summary.mindsetAlteringPercent).toBe(0);
    expect(summary.worthHighPercent).toBe(0);
    expect(summary.impact.every((bucket) => bucket.count === 0)).toBe(true);
    expect(summary.impact.every((bucket) => bucket.percent === 0)).toBe(true);
  });

  it("counts every option, including the ones nobody chose", () => {
    const summary = summariseFeedback([
      record({ revelationImpact: 1 }),
      record({ revelationImpact: 1 }),
      record({ revelationImpact: 5 }),
    ]);

    expect(summary.impact).toHaveLength(5);
    expect(summary.impact[0]).toMatchObject({ value: 1, count: 2 });
    expect(summary.impact[1]).toMatchObject({ value: 2, count: 0, percent: 0 });
    expect(summary.mindsetAlteringPercent).toBeCloseTo(66.7, 1);
  });

  /**
   * Q2 was optional at onboarding. Its percentages are over the people who
   * answered it -- spreading them across everyone would understate every
   * bracket and quietly make the before/after comparison look weaker.
   */
  it("scales Q2 to the people who answered it", () => {
    const summary = summariseFeedback([
      record({ willingnessToPay: 8 }),
      record({ willingnessToPay: null }),
    ]);

    const highest = summary.willingness.find((bucket) => bucket.value === 8);
    expect(highest?.count).toBe(1);
    expect(highest?.percent).toBe(100);
    expect(summary.averageWillingness.sample).toBe(1);
  });

  it("leaves a refusal out of the average without dropping the response", () => {
    const summary = summariseFeedback([
      record({ perceivedWorth: 2 }), // ₹200
      record({ perceivedWorth: 4 }), // ₹850
      record({ perceivedWorth: 1 }), // refusal — not an amount
    ]);

    expect(summary.averageWorth.sample).toBe(2);
    expect(summary.averageWorth.rupees).toBe(525);
    expect(summary.total).toBe(3);
  });

  /**
   * "Priceless" carries the ceiling value, and is still counted on its own so
   * a mean that contains a ceiling can be read in context.
   */
  it("averages 'Priceless' at the ceiling and counts it separately", () => {
    const summary = summariseFeedback([
      record({ perceivedWorth: 2 }), // ₹200
      record({ perceivedWorth: 10 }), // ₹500,000
    ]);

    expect(summary.averageWorth.sample).toBe(2);
    expect(summary.averageWorth.rupees).toBe(Math.round((200 + PRICELESS_RUPEES) / 2));
    expect(summary.pricelessCount).toBe(1);
  });

  it("includes a written-in amount in the average", () => {
    const summary = summariseFeedback([
      record({ perceivedWorth: 9, perceivedWorthCustom: 4000 }),
      record({ perceivedWorth: 2 }),
    ]);

    expect(summary.averageWorth.rupees).toBe(2100);
  });

  describe("the before/after shift", () => {
    it("reads a move up the scale as an increase", () => {
      const summary = summariseFeedback([
        record({ willingnessToPay: 2, perceivedWorth: 6 }),
        record({ willingnessToPay: 6, perceivedWorth: 2 }),
        record({ willingnessToPay: 4, perceivedWorth: 4 }),
      ]);

      expect(summary.shift).toEqual({
        increased: 1,
        decreased: 1,
        unchanged: 1,
        sample: 3,
      });
    });

    /**
     * "I would never pay" to "₹200" is a genuine increase, so a refusal has to
     * rank below every amount for the comparison -- while still staying out of
     * the average, where treating it as ₹0 would be a different claim.
     */
    it("ranks a refusal below every amount without averaging it as zero", () => {
      const summary = summariseFeedback([
        record({ willingnessToPay: 1, perceivedWorth: 2 }),
      ]);

      expect(summary.shift.increased).toBe(1);
      expect(summary.averageWillingness.rupees).toBeNull();
      expect(summary.averageWillingness.sample).toBe(0);
    });

    it("ranks 'Priceless' above every bracket a participant could have named", () => {
      const summary = summariseFeedback([
        record({ willingnessToPay: 8, perceivedWorth: 10 }),
      ]);

      expect(summary.shift.increased).toBe(1);
    });

    it("leaves out anyone who cannot be compared", () => {
      const summary = summariseFeedback([
        // No "before" at all: Q2 was optional.
        record({ willingnessToPay: null, perceivedWorth: 6 }),
        // A Q2 value that is not a Q2 option, so it has no position on the
        // scale -- guessing one would invent a comparison.
        record({ willingnessToPay: 9 as number, perceivedWorth: 6 }),
        // Only this one can be compared.
        record({ willingnessToPay: 2, perceivedWorth: 6 }),
      ]);

      expect(summary.shift.sample).toBe(1);
      expect(summary.shift.increased).toBe(1);
      expect(summary.total).toBe(3);
    });
  });

  describe("the high-value stat cards", () => {
    it("counts 'Priceless' as high value", () => {
      const summary = summariseFeedback([record({ perceivedWorth: 10 })]);
      expect(summary.worthHighPercent).toBe(100);
    });

    /**
     * The source document lumps Q3 options 6-10 together, which would count
     * someone who wrote in ₹50 as a ₹2,000+ response. The written-in amount is
     * compared against the threshold instead.
     */
    it("judges a written-in amount by the amount, not the option number", () => {
      const low = summariseFeedback([
        record({ perceivedWorth: 9, perceivedWorthCustom: 50 }),
      ]);
      const high = summariseFeedback([
        record({
          perceivedWorth: 9,
          perceivedWorthCustom: HIGH_VALUE_RUPEES + 1,
        }),
      ]);

      expect(low.worthHighPercent).toBe(0);
      expect(high.worthHighPercent).toBe(100);
    });

    it("measures Q2's high-value share against the people who answered Q2", () => {
      const summary = summariseFeedback([
        record({ willingnessToPay: 7 }),
        record({ willingnessToPay: 2 }),
        record({ willingnessToPay: null }),
      ]);

      expect(summary.wouldPayHighPercent).toBe(50);
    });
  });
});

describe("labelFor", () => {
  it("returns the option's label", () => {
    expect(labelFor(PERCEIVED_WORTH_OPTIONS, 10)).toBe("Priceless");
  });

  /**
   * A value stored by an older version of the survey must not blank a table
   * cell -- the administrator needs to see that something was answered.
   */
  it("degrades to the raw value rather than nothing", () => {
    expect(labelFor(PERCEIVED_WORTH_OPTIONS, 99)).toBe("Option 99");
  });
});

describe("parseCustomWorth", () => {
  it("accepts what people actually type", () => {
    expect(parseCustomWorth("2000")).toBe(2000);
    expect(parseCustomWorth(" 2,000 ")).toBe(2000);
    expect(parseCustomWorth("₹2,500")).toBe(2500);
    expect(parseCustomWorth(1500)).toBe(1500);
    expect(parseCustomWorth("999.6")).toBe(1000);
  });

  it("rejects what cannot be an amount", () => {
    for (const bad of ["", "  ", "abc", "12abc", "-500", "0", null, undefined, {}]) {
      expect(parseCustomWorth(bad), `accepted ${String(bad)}`).toBeNull();
    }
  });

  /**
   * One joke entry would drag the average worth into meaninglessness, and that
   * average is the number a pricing decision would rest on. The ceiling is
   * shared with "Priceless" so nothing written in can outrank the top option.
   */
  it("rejects an amount above the ceiling of the scale", () => {
    expect(parseCustomWorth("500000")).toBe(MAX_WORTH_RUPEES);
    expect(parseCustomWorth("500001")).toBeNull();
    expect(parseCustomWorth("999999999999")).toBeNull();
  });
});
