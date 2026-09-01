"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";

import { useAuthState } from "@/components/auth/useAuthState";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
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
 * A page of its own, reached deliberately. It is never shown inside the
 * reflection and never interrupts it: §62 asks the experience to end on its
 * final question, and participants are invited to this page separately once
 * they have had time with what they read.
 *
 * Three questions, one of which is already answered: Q2 was asked at onboarding
 * and is replayed here read-only, so the participant sees their own
 * before-and-after rather than being asked the same thing twice.
 */

type SurveyState = {
  unlocked: boolean;
  submitted: boolean;
  willingnessToPay: number | null;
};

/** Shared radio row, so the questions cannot drift apart visually. */
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

/** Page frame, so every state below arrives with the same header. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-6 py-12 sm:py-16">
      <div className="flex justify-center">
        <Logo size="lg" label="CollabNGrow" priority />
      </div>
      <h1 className="mt-8 text-center text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Your feedback
      </h1>
      {children}
    </main>
  );
}

export function SurveyView() {
  const customFieldId = useId();
  const { user, loading: authLoading } = useAuthState();

  const [state, setState] = useState<SurveyState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [worth, setWorth] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<SurveyState>("/api/feedback");
    if (!alive()) return;
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setState(result.data);
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [authLoading, user, load]);

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

  if (authLoading || (!state && !loadError && user)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p role="status" className="text-ink-soft">
          Loading…
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <Shell>
        <p className="mt-5 text-center leading-relaxed text-ink-soft">
          Open your invitation link and sign in first — the survey is tied to your
          reflection.
        </p>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <Notice tone="error" className="mt-6">
          {loadError}
        </Notice>
      </Shell>
    );
  }

  if (state && !state.unlocked) {
    return (
      <Shell>
        <p className="mt-5 text-center leading-relaxed text-ink-soft">
          This opens once your reflection has been written. There is nothing to say
          about it yet.
        </p>
        <div className="mt-8 text-center">
          <Link
            href="/journey/result"
            className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand-dark"
          >
            Go to your reflection
          </Link>
        </div>
      </Shell>
    );
  }

  if (state?.submitted) {
    return (
      <Shell>
        <p className="mt-5 text-center leading-relaxed text-ink-soft">
          {justSubmitted
            ? "Thank you. Your feedback is with us, and it genuinely shapes what this becomes."
            : "You've already shared your thoughts on this. Thank you."}
        </p>
        <div className="mt-8 text-center">
          <Link
            href="/journey/result"
            className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand-dark"
          >
            Back to your reflection
          </Link>
        </div>
      </Shell>
    );
  }

  const priorAnswer = state?.willingnessToPay ?? null;

  return (
    <Shell>
      <p className="mt-5 text-center leading-relaxed text-ink-soft">
        Three questions, under a minute. Entirely optional, and separate from your
        reflection — nothing you write here changes what you read.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-9">
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

        <div className="flex flex-wrap items-center gap-6">
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Sending…" : "Send feedback"}
          </Button>
          <Link
            href="/journey/result"
            className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Back to your reflection
          </Link>
        </div>
      </form>
    </Shell>
  );
}
