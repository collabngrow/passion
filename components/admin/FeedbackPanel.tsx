"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";
import {
  HIGH_VALUE_RUPEES,
  REFUSAL_RUPEES,
  labelFor,
  type DistributionBucket,
  type FeedbackSummary,
} from "@/lib/feedback/analytics";
import {
  PERCEIVED_WORTH_CUSTOM_VALUE,
  PERCEIVED_WORTH_OPTIONS,
  PRICELESS_RUPEES,
  REVELATION_IMPACT_OPTIONS,
  WILLINGNESS_TO_PAY_OPTIONS,
} from "@/lib/feedback/questions";

/**
 * Feedback dashboard (feedback_plan.md, "Admin Dashboard").
 *
 * The four analyses the source document asks for: Q1 distribution, Q2 against
 * Q3, average perceived worth with "Priceless" counted separately, and the
 * summary cards -- plus the individual responses.
 *
 * Bars are drawn in CSS rather than pulled in from a charting library: four
 * horizontal distributions do not justify the bundle, and a bar with its own
 * number beside it stays readable to a screen reader (§73).
 */

type Row = {
  uid: string;
  name: string;
  inviteId: string;
  revelationImpact: number;
  willingnessToPay: number | null;
  perceivedWorth: number;
  perceivedWorthCustom: number | null;
  submittedAt: string;
};

type Data = { responses: Row[]; summary: FeedbackSummary };

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** What a Q3 answer should read as, written-in amounts included. */
function worthLabel(row: Row): string {
  if (row.perceivedWorth === PERCEIVED_WORTH_CUSTOM_VALUE) {
    return row.perceivedWorthCustom !== null
      ? rupees.format(row.perceivedWorthCustom)
      : "Something else";
  }
  return labelFor(PERCEIVED_WORTH_OPTIONS, row.perceivedWorth);
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold text-brand">{value}</dd>
      {detail ? <p className="mt-1 text-xs text-ink-soft">{detail}</p> : null}
    </div>
  );
}

/**
 * A distribution as labelled bars.
 *
 * `max` is passed in so two distributions shown side by side share a scale --
 * bars normalised to their own largest value would make a 2-response bracket
 * look identical to a 20-response one.
 */
function Bars({
  buckets,
  max,
  tint = "bg-brand",
}: {
  buckets: DistributionBucket[];
  max: number;
  tint?: string;
}) {
  const scale = Math.max(max, 1);

  return (
    <ul className="mt-4 space-y-2.5">
      {buckets.map((bucket) => (
        <li key={bucket.value} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <span className="text-sm text-ink">{bucket.label}</span>
          <span className="text-sm tabular-nums text-ink-soft">
            {bucket.count} · {bucket.percent}%
          </span>
          <span
            aria-hidden="true"
            className="col-span-2 block h-2 overflow-hidden rounded-full bg-line"
          >
            <span
              className={`block h-full rounded-full ${tint}`}
              style={{ width: `${(bucket.count / scale) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FeedbackPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<Data>("/api/admin/feedback");
    if (!alive()) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  const summary = data?.summary ?? null;

  /** Shared scale for the Q2/Q3 comparison. */
  const payScale = useMemo(() => {
    if (!summary) return 1;
    return Math.max(
      ...summary.willingness.map((b) => b.count),
      ...summary.worth.map((b) => b.count),
      1,
    );
  }, [summary]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Feedback</h1>
      <p className="mt-2 text-ink-soft">
        What participants said once their reflection had been written.
      </p>

      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}

      {data === null && !error ? (
        <p role="status" className="mt-8 text-ink-soft">
          Loading feedback…
        </p>
      ) : null}

      {data && summary && summary.total === 0 ? (
        <div className="mt-8 rounded-lg border border-line bg-brand-soft px-6 py-8 text-center">
          <p className="font-medium text-ink">No feedback yet</p>
          <p className="mt-2 text-sm text-ink-soft">
            The survey unlocks for a participant once their reflection has been
            written, so responses appear here after the first one finishes.
          </p>
        </div>
      ) : null}

      {data && summary && summary.total > 0 ? (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Responses" value={String(summary.total)} />
            <StatCard
              label="Found it mindset-altering"
              value={`${summary.mindsetAlteringPercent}%`}
              detail="Chose the strongest option on Q1"
            />
            <StatCard
              label={`Would pay ${rupees.format(HIGH_VALUE_RUPEES)}+`}
              value={`${summary.wouldPayHighPercent}%`}
              detail={`Before starting · ${summary.averageWillingness.sample} answered`}
            />
            <StatCard
              label={`Rate it ${rupees.format(HIGH_VALUE_RUPEES)}+`}
              value={`${summary.worthHighPercent}%`}
              detail="After reading, priceless included"
            />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-surface px-6 py-5">
              <h2 className="font-semibold text-ink">How the reflection landed</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Q1, across {summary.total}{" "}
                {summary.total === 1 ? "response" : "responses"}.
              </p>
              <Bars buckets={summary.impact} max={summary.total} />
            </section>

            <section className="rounded-lg border border-line bg-surface px-6 py-5">
              <h2 className="font-semibold text-ink">Average perceived worth</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Q3, across {summary.averageWorth.sample}{" "}
                {summary.averageWorth.sample === 1 ? "response" : "responses"}.
              </p>

              <p className="mt-4 text-4xl font-semibold text-brand">
                {summary.averageWorth.rupees === null
                  ? "—"
                  : rupees.format(summary.averageWorth.rupees)}
              </p>

              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">Before starting (Q2)</dt>
                  <dd className="tabular-nums text-ink">
                    {summary.averageWillingness.rupees === null
                      ? "—"
                      : rupees.format(summary.averageWillingness.rupees)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">Said priceless / would never pay</dt>
                  <dd className="tabular-nums text-ink">
                    {summary.pricelessCount} / {summary.refusalCount}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">Valued it higher afterwards</dt>
                  <dd className="tabular-nums text-ink">
                    {summary.shift.increased} of {summary.shift.sample}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">Unchanged / lower</dt>
                  <dd className="tabular-nums text-ink">
                    {summary.shift.unchanged} / {summary.shift.decreased}
                  </dd>
                </div>
              </dl>

              {/*
                An average built from a scale with fixed ends has to name them,
                or it reads as a market price rather than a mean over a scale.
              */}
              <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                Every response is priced: &ldquo;Priceless&rdquo; at{" "}
                {rupees.format(PRICELESS_RUPEES)}, the top of the scale, and
                &ldquo;I would never pay&rdquo; at {rupees.format(REFUSAL_RUPEES)}.
                Both ends are counted on their own above.
              </p>
            </section>
          </div>

          <section className="mt-6 rounded-lg border border-line bg-surface px-6 py-5">
            <h2 className="font-semibold text-ink">
              Before and after, on the same scale
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Q2 was asked at onboarding, before anything had been seen. Q3 after the
              reflection.
            </p>

            <div className="mt-5 grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  Before · would pay in general
                </h3>
                <Bars
                  buckets={summary.willingness}
                  max={payScale}
                  tint="bg-ink-soft"
                />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                  After · worth of this
                </h3>
                <Bars buckets={summary.worth} max={payScale} />
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="font-semibold text-ink">Individual responses</h2>
            <div
              tabIndex={0}
              role="region"
              aria-label="Individual responses"
              className="mt-3 overflow-x-auto rounded-lg border border-line"
            >
              <table className="w-full min-w-[52rem] border-collapse bg-surface text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-brand-soft">
                    <th scope="col" className="px-4 py-3 font-semibold text-ink">
                      Participant
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-ink">
                      Submitted
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-ink">
                      Q1 · How it landed
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-ink">
                      Q2 · Would pay
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-ink">
                      Q3 · Worth
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.responses.map((row) => (
                    <tr key={row.uid} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">
                        {row.name}
                        <span className="block font-mono text-xs text-ink-soft">
                          {row.inviteId}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        <time dateTime={row.submittedAt}>
                          {new Date(row.submittedAt).toLocaleDateString()}
                        </time>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {labelFor(REVELATION_IMPACT_OPTIONS, row.revelationImpact)}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {row.willingnessToPay === null
                          ? "Not answered"
                          : labelFor(
                              WILLINGNESS_TO_PAY_OPTIONS,
                              row.willingnessToPay,
                            )}
                      </td>
                      <td className="px-4 py-3 text-ink">{worthLabel(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
