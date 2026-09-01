/**
 * Feedback survey content (feedback_plan.md).
 *
 * Shared by two surfaces, which is why it lives here rather than in either:
 *  - Q2 is asked at onboarding, before the exercise begins.
 *  - Q1 and Q3 are asked after the revelations, with Q2 replayed read-only so
 *    the participant can see their own shift.
 *
 * Option values are stored as integers and are part of the persisted data
 * model. Reordering or renumbering them would silently reinterpret every
 * response already collected -- add new options at the end instead.
 */

export type SurveyOption = {
  value: number;
  label: string;
  /** Optional trailing clause, rendered in a lighter weight. */
  detail?: string;
};

/** Q1 — perceived impact of the revelations. Asked after. */
export const REVELATION_IMPACT_OPTIONS: SurveyOption[] = [
  {
    value: 1,
    label: "Totally unexpected and mindset-altering",
    detail: "I see things differently now",
  },
  {
    value: 2,
    label: "Very interesting",
    detail: "gave me real insights I hadn't considered",
  },
  { value: 3, label: "Somewhat interesting", detail: "a few useful takeaways" },
  { value: 4, label: "Not surprising", detail: "I already knew most of this" },
  { value: 5, label: "This was pointless", detail: "I got nothing out of it" },
];

/**
 * Q2 — willingness to pay for a passion test in general.
 *
 * Asked at onboarding, before the participant has seen anything, so that the
 * comparison against Q3 measures a genuine before/after change.
 */
export const WILLINGNESS_TO_PAY_OPTIONS: SurveyOption[] = [
  { value: 1, label: "I would never pay for a service like this" },
  { value: 2, label: "₹200" },
  { value: 3, label: "₹300 – ₹600" },
  { value: 4, label: "₹600 – ₹1,100" },
  { value: 5, label: "₹1,100 – ₹2,000" },
  { value: 6, label: "₹2,000 – ₹5,000" },
  { value: 7, label: "₹5,000 – ₹11,000" },
  { value: 8, label: "₹11,000+" },
];

/** Q3 — perceived worth of this specific experience. Asked after. */
export const PERCEIVED_WORTH_OPTIONS: SurveyOption[] = [
  ...WILLINGNESS_TO_PAY_OPTIONS,
  { value: 9, label: "Something else", detail: "enter an amount" },
  { value: 10, label: "Priceless" },
];

/** Option 9 on Q3 reveals a free-text amount. */
export const PERCEIVED_WORTH_CUSTOM_VALUE = 9;
/** Option 10, "Priceless". Still counted separately as well as valued. */
export const PERCEIVED_WORTH_PRICELESS_VALUE = 10;

/**
 * The ceiling of the scale, in rupees.
 *
 * Two things sit here by decision: the largest amount anyone may write in, and
 * the figure "Priceless" is worth. Pinning them to the same number is what
 * makes "Priceless" quantifiable -- it is the top of the scale rather than a
 * response that has to be left out of every average. It is deliberately a
 * plausible ceiling rather than a huge one, so a single extreme answer cannot
 * dominate the mean a price would be set from.
 */
export const MAX_WORTH_RUPEES = 500_000;

/** How much "Priceless" is counted as. The top of the scale. */
export const PRICELESS_RUPEES = MAX_WORTH_RUPEES;

/**
 * Midpoints in rupees, for the admin average.
 *
 * Only the numbered brackets appear here, since only they have a midpoint.
 * The two ends of the scale are fixed points rather than brackets and are
 * valued in `amountFor`: option 1 at zero, "Priceless" at the ceiling above.
 */
export const PAY_OPTION_MIDPOINTS: Record<number, number> = {
  2: 200,
  3: 450,
  4: 850,
  5: 1550,
  6: 3500,
  7: 8000,
  8: 11000,
};

export function isValidWillingnessToPay(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    WILLINGNESS_TO_PAY_OPTIONS.some((option) => option.value === value)
  );
}

export function isValidRevelationImpact(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    REVELATION_IMPACT_OPTIONS.some((option) => option.value === value)
  );
}

export function isValidPerceivedWorth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    PERCEIVED_WORTH_OPTIONS.some((option) => option.value === value)
  );
}

/**
 * The assurance shown with Q2 at onboarding.
 *
 * Asking what someone would pay, at the start of a free invitation-only
 * experience, reads as a paywall unless it is explicitly disarmed. This is not
 * decorative copy -- it is the reason the question is answerable honestly.
 */
export const PRICING_DISCLAIMER = {
  heading: "This exercise is free",
  body:
    "You will not be charged anything, now or later. There is no payment step and " +
    "no card required. We ask this only to understand what a fair price point " +
    "would be if this were ever offered more widely.",
} as const;

/** Preamble from the source document, shown above the Q2 options. */
export const WILLINGNESS_TO_PAY_PREAMBLE =
  "People tend to weigh something more seriously when they have put a price on it.";

/**
 * The written-in amount shares the ceiling of the scale.
 *
 * An upper bound matters because a single joke entry would drag the average
 * worth into meaninglessness, and that average is the number a pricing
 * decision rests on. Sharing the ceiling with "Priceless" also keeps the two
 * comparable: nobody can write in a figure that outranks the top option.
 */
export const MAX_CUSTOM_WORTH_RUPEES = MAX_WORTH_RUPEES;

/**
 * Normalises a written-in amount, or returns null when it is not usable.
 *
 * Accepts what people actually type -- "2,000", " 2000 ", "₹2000" -- because
 * rejecting a comma would read as the form quibbling rather than the person
 * being unclear.
 */
export function parseCustomWorth(input: unknown): number | null {
  const raw =
    typeof input === "number"
      ? String(input)
      : typeof input === "string"
        ? input
        : "";

  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (cleaned.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const value = Math.round(Number(cleaned));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > MAX_CUSTOM_WORTH_RUPEES) return null;

  return value;
}
