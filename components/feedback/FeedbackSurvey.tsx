"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";
import {
  PERCEIVED_WORTH_CUSTOM_VALUE,
  PERCEIVED_WORTH_OPTIONS,
  REVELATION_IMPACT_OPTIONS,
  WILLINGNESS_TO_PAY_OPTIONS,
  type SurveyOption,
} from "@/lib/feedback/questions";

/**
 * The feedback survey (feedback_plan.md; PLAN.md S9.5).
 *
 * Appears below the reflection, once it exists. Three questions, one of which
 * is already answered: Q2 was asked at onboarding and is replayed here
 * read-only, so the participant can see their own before-and-after rather than
 * being asked the same thing twice.
 *
 * It is deliberately quiet. It sits after the reflection has finished so it
 * cannot interrupt it, and it is framed as helping rather than rating -- this
 * page is a letter, not a product to review (§61).
 */

type SurveyState = {
  unlocked: boolean;
  submitted: boolean;
  willingnessToPay: number | null;
};

/** Shared radio row, so the three questions cannot drift apart visually. */
function OptionRow({
  name,
  option,
  selected,
  disabled = false,
  onSelect,
}: {
  name: string;
  option: SurveyOption;
  selected: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-md border px-4 py-3",
        "text-[0.9375rem] leading-relaxed transition-colors duration-150",
        disabled ? "cursor-default" : "cursor-pointer",
        selected ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-soft",
        !disabled && !selected ? "hover:bg-brand-soft/60" : "",
        disabled && !selected ? "opacity-60" : "",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={option.value}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span>
        <span className={selected ? "font-medium" : ""}>{option.label}</span>
        {option.detail ? <span className="text-ink-soft"> — {option.detail}</span> : null}
      </span>
    </label>
  );
}

export function FeedbackSurvey() {
  const customFieldId = useId();

  const [state, setState] = useState<SurveyState | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [worth, setWorth] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<SurveyState>("/api/feedback");
    if (!alive()) return;
    // A survey that cannot be loaded is not worth an error on this page: the
    // reflection above it is what the participant came for.
    if (result.ok) setState(result.data);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (impact === null) {
      setError("Please choose how the reflection landed for you.");
      return;
    }
    if (worth === null) {
      setError("Please choose what you think this was worth.");
      return;
    }

    setSubmitting(true);
    const result = await apiFetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        revelationImpact: impact,
        perceivedWorth: worth,
        perceivedWorthCustom: worth === PERCEIVED_WORTH_CUSTOM_VALUE ? custom : null,
      }),
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setJustSubmitted(true);
    setState((previous) => (previous ? { ...previous, submitted: true } : previous));
  }

  if (!state || !state.unlocked) return null;

  if (state.submitted) {
    return (
      <section className="mt-10 rounded-lg border border-line bg-brand-soft px-6 py-7 text-center">
        <p className="font-medium text-ink">
          {justSubmitted ? "Thank you." : "Thanks for your feedback."}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          {justSubmitted
            ? "Your feedback is with us. It genuinely shapes what this becomes."
            : "You've already shared your thoughts on this reflection."}
        </p>
      </section>
    );
  }

  const priorAnswer = state.willingnessToPay;

  return (
    <section className="mt-10 rounded-lg border border-line bg-surface px-6 py-7 sm:px-8">
      <h2 className="text-lg font-semibold tracking-tight text-ink">
        Three quick questions
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Under a minute, and it tells us whether this was worth your time. Your answers
        are separate from your reflection.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-8">
        <fieldset>
          <legend className="font-medium text-ink">
            How did the reflection land for you?
          </legend>
          <div className="mt-3 space-y-2">
            {REVELATION_IMPACT_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                name="revelationImpact"
                option={option}
                selected={impact === option.value}
                onSelect={() => setImpact(option.value)}
              />
            ))}
          </div>
        </fieldset>

        {/*
          Q2, replayed. Shown rather than re-asked so the shift is the
          participant's to see too, not only the administrator's.
        */}
        {priorAnswer !== null ? (
          <fieldset disabled>
            <legend className="font-medium text-ink">
              Before you started, you said you&apos;d pay this for an exercise like
              this
            </legend>
            <p className="mt-2 text-sm text-ink-soft">
              Your earlier answer. It&apos;s here for context — you can&apos;t change
              it.
            </p>
            <div className="mt-3">
              {WILLINGNESS_TO_PAY_OPTIONS.filter(
                (option) => option.value === priorAnswer,
              ).map((option) => (
                <OptionRow
                  key={option.value}
                  name="priorWillingnessToPay"
                  option={option}
                  selected
                  disabled
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset>
          <legend className="font-medium text-ink">
            Having read it, what do you think this was actually worth?
          </legend>
          <div className="mt-3 space-y-2">
            {PERCEIVED_WORTH_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                name="perceivedWorth"
                option={option}
                selected={worth === option.value}
                onSelect={() => setWorth(option.value)}
              />
            ))}
          </div>

          {worth === PERCEIVED_WORTH_CUSTOM_VALUE ? (
            <div className="mt-3">
              <label
                htmlFor={customFieldId}
                className="block text-sm font-medium text-ink"
              >
                Your amount, in rupees
              </label>
              <input
                id={customFieldId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                maxLength={12}
                className="mt-2 h-12 w-40 rounded-md border border-line bg-surface px-4 text-ink"
              />
            </div>
          ) : null}
        </fieldset>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Sending…" : "Send feedback"}
        </Button>
      </form>
    </section>
  );
}
