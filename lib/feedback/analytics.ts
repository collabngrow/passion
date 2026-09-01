/**
 * Feedback aggregation (feedback_plan.md, "Grouped Analysis & Charts").
 *
 * Pure functions over plain records, deliberately free of Firestore types: the
 * arithmetic here decides what the administrator believes about willingness to
 * pay, so it is worth being able to test it directly rather than through a
 * database.
 */

import {
  PAY_OPTION_MIDPOINTS,
  PERCEIVED_WORTH_CUSTOM_VALUE,
  PERCEIVED_WORTH_OPTIONS,
  PERCEIVED_WORTH_PRICELESS_VALUE,
  PRICELESS_RUPEES,
  REVELATION_IMPACT_OPTIONS,
  WILLINGNESS_TO_PAY_OPTIONS,
  type SurveyOption,
} from "./questions";

/** One submitted survey, reduced to the fields the analysis uses. */
export type FeedbackRecord = {
  revelationImpact: number;
  /** From onboarding. Optional there, so absent for anyone who skipped it. */
  willingnessToPay: number | null;
  perceivedWorth: number;
  /** Present only when option 9 was chosen. */
  perceivedWorthCustom: number | null;
};

export type DistributionBucket = {
  value: number;
  label: string;
  count: number;
  /** Of the responses that answered this question, not of all responses. */
  percent: number;
};

export type FeedbackSummary = {
  total: number;
  impact: DistributionBucket[];
  willingness: DistributionBucket[];
  worth: DistributionBucket[];
  /** Mean rupee value, over the responses that named an amount. */
  averageWorth: { rupees: number | null; sample: number };
  averageWillingness: { rupees: number | null; sample: number };
  /** Counted as well as valued, so the mean can be read in context. */
  pricelessCount: number;
  /** Q2 against Q3 for the people who answered both. */
  shift: { increased: number; unchanged: number; decreased: number; sample: number };
  /** Headline percentages for the stat cards. */
  mindsetAlteringPercent: number;
  wouldPayHighPercent: number;
  worthHighPercent: number;
};

/** The threshold behind the two "₹2,000+" stat cards. */
export const HIGH_VALUE_RUPEES = 2000;

/**
 * The rupee figure a selection stands for, or null when it is not an amount.
 *
 * "Priceless" is valued at the top of the scale rather than excluded, so it can
 * be quantified alongside everything else. It is still counted separately in
 * the summary, because a mean that silently contains a ceiling value should be
 * readable next to how many people chose that ceiling.
 *
 * Option 1 remains absent: a refusal to pay is not an offer of zero, and
 * averaging it as one would put a figure in someone's mouth that they
 * explicitly declined to give.
 */
export function amountFor(value: number, custom: number | null): number | null {
  if (value === PERCEIVED_WORTH_PRICELESS_VALUE) return PRICELESS_RUPEES;
  if (value === PERCEIVED_WORTH_CUSTOM_VALUE) {
    return typeof custom === "number" && Number.isFinite(custom) && custom > 0
      ? custom
      : null;
  }
  return PAY_OPTION_MIDPOINTS[value] ?? null;
}

/**
 * A comparable position on the price scale, for the before/after comparison.
 *
 * This differs from `amountFor` in exactly one place, on purpose. Moving from
 * "I would never pay" to "₹200" is a real increase, so a refusal has to rank
 * below every amount -- but it is still not a claim that the exercise is worth
 * ₹0, so it stays out of the average.
 */
function rank(value: number, custom: number | null): number | null {
  if (value === 1) return 0;
  return amountFor(value, custom);
}

function percentOf(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function distribute(
  options: SurveyOption[],
  values: number[],
): DistributionBucket[] {
  return options.map((option) => {
    const count = values.filter((value) => value === option.value).length;
    return {
      value: option.value,
      label: option.label,
      count,
      percent: percentOf(count, values.length),
    };
  });
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

export function summariseFeedback(records: FeedbackRecord[]): FeedbackSummary {
  const total = records.length;

  const impactValues = records.map((r) => r.revelationImpact);
  // Q2 was optional at onboarding, so its distribution is over the people who
  // answered it -- padding it with the rest would understate every bracket.
  const willingnessValues = records
    .map((r) => r.willingnessToPay)
    .filter((value): value is number => typeof value === "number");
  const worthValues = records.map((r) => r.perceivedWorth);

  const worthAmounts = records
    .map((r) => amountFor(r.perceivedWorth, r.perceivedWorthCustom))
    .filter((value): value is number => value !== null);
  const willingnessAmounts = willingnessValues
    .map((value) => amountFor(value, null))
    .filter((value): value is number => value !== null);

  let increased = 0;
  let unchanged = 0;
  let decreased = 0;

  for (const record of records) {
    if (record.willingnessToPay === null) continue;
    const before = rank(record.willingnessToPay, null);
    const after = rank(record.perceivedWorth, record.perceivedWorthCustom);
    if (before === null || after === null) continue;

    if (after > before) increased += 1;
    else if (after < before) decreased += 1;
    else unchanged += 1;
  }

  const mindsetAltering = impactValues.filter((value) => value === 1).length;

  const wouldPayHigh = willingnessValues.filter((value) => {
    const amount = amountFor(value, null);
    return amount !== null && amount >= HIGH_VALUE_RUPEES;
  }).length;

  /**
   * Judged by the amount, which now includes "Priceless" at the top of the
   * scale. The source document lumps options 6–10 together, which would count
   * someone who wrote in "₹50" as a ₹2,000+ response.
   */
  const worthHigh = records.filter((record) => {
    const amount = amountFor(record.perceivedWorth, record.perceivedWorthCustom);
    return amount !== null && amount >= HIGH_VALUE_RUPEES;
  }).length;

  return {
    total,
    impact: distribute(REVELATION_IMPACT_OPTIONS, impactValues),
    willingness: distribute(WILLINGNESS_TO_PAY_OPTIONS, willingnessValues),
    worth: distribute(PERCEIVED_WORTH_OPTIONS, worthValues),
    averageWorth: { rupees: mean(worthAmounts), sample: worthAmounts.length },
    averageWillingness: {
      rupees: mean(willingnessAmounts),
      sample: willingnessAmounts.length,
    },
    pricelessCount: worthValues.filter(
      (value) => value === PERCEIVED_WORTH_PRICELESS_VALUE,
    ).length,
    shift: {
      increased,
      unchanged,
      decreased,
      sample: increased + unchanged + decreased,
    },
    mindsetAlteringPercent: percentOf(mindsetAltering, total),
    wouldPayHighPercent: percentOf(wouldPayHigh, willingnessValues.length),
    worthHighPercent: percentOf(worthHigh, total),
  };
}

/** The label an administrator should see for a stored selection. */
export function labelFor(options: SurveyOption[], value: number): string {
  return options.find((option) => option.value === value)?.label ?? `Option ${value}`;
}
