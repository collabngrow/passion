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
/** Option 10 is excluded from the average and reported separately. */
export const PERCEIVED_WORTH_PRICELESS_VALUE = 10;

/**
 * Midpoints in rupees, for the admin average.
 *
 * Open-ended and non-numeric options are absent by design: option 1 is a
 * refusal rather than zero willingness to pay, and "Priceless" is not a large
 * number. Averaging either as a figure would misrepresent the response, so both
 * are counted separately in the dashboard.
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
