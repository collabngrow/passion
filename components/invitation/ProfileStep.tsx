"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";
import {
  PRICING_DISCLAIMER,
  WILLINGNESS_TO_PAY_OPTIONS,
  WILLINGNESS_TO_PAY_PREAMBLE,
} from "@/lib/feedback/questions";

/**
 * Onboarding (master_prompt.md §56).
 *
 * Collects name, age and nationality. The Google email is shown but not
 * editable -- it comes from the verified token and the server ignores any email
 * in the request body regardless.
 *
 * Also asks feedback survey Q2, before the participant has seen anything, so
 * the later comparison against Q3 measures a genuine change rather than two
 * answers to the same condition.
 */

type ProfileStepProps = {
  email: string;
  onComplete: () => void;
};

export function ProfileStep({ email, onComplete }: ProfileStepProps) {
  const priceGroupId = useId();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [nationality, setNationality] = useState("");
  const [willingnessToPay, setWillingnessToPay] = useState<number | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (name.trim().length === 0) next.name = "Please enter your name.";
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 120) {
      next.age = "Please enter your age as a number.";
    }
    if (nationality.trim().length === 0) {
      next.nationality = "Please enter your nationality.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    const result = await apiFetch("/api/participant/profile", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        age: Number(age),
        nationality: nationality.trim(),
        willingnessToPay,
      }),
    });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    onComplete();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Before you begin
      </h1>
      <p className="mt-3 leading-relaxed text-ink-soft">
        A few details, so this reflection is yours.
      </p>

      <div className="mt-8 space-y-6">
        <Field
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoComplete="name"
          maxLength={80}
          required
        />

        <Field
          label="Your age"
          type="number"
          inputMode="numeric"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          error={errors.age}
          min={13}
          max={120}
          required
        />

        <Field
          label="Your nationality"
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          error={errors.nationality}
          autoComplete="country-name"
          maxLength={60}
          required
        />

        <div>
          <span className="block text-sm font-medium text-ink">
            Your Google account
          </span>
          <p className="mt-2 flex min-h-12 items-center rounded-md border border-line bg-brand-soft px-4 text-ink-soft">
            {email}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            This is the account your invitation is linked to, so it can&apos;t be
            changed here.
          </p>
        </div>
      </div>

      {/* Feedback survey Q2. Asked now, before anything has been seen. */}
      <fieldset className="mt-10 rounded-lg border border-line p-5 sm:p-6">
        <legend className="px-2 text-sm font-semibold text-ink">
          One quick question
        </legend>

        {/*
          Asking about price at the start of a free experience reads as a
          paywall unless it is disarmed plainly. This assurance is the reason
          the question can be answered honestly.
        */}
        <div className="rounded-md border border-positive/30 bg-positive/5 px-4 py-3">
          <p className="text-sm font-semibold text-ink">
            {PRICING_DISCLAIMER.heading}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {PRICING_DISCLAIMER.body}
          </p>
        </div>

        <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-soft">
          {WILLINGNESS_TO_PAY_PREAMBLE}
        </p>

        <p id={priceGroupId} className="mt-4 font-medium text-ink">
          In general, what would you pay for an exercise like this?
        </p>

        <div
          role="radiogroup"
          aria-labelledby={priceGroupId}
          className="mt-4 space-y-2"
        >
          {WILLINGNESS_TO_PAY_OPTIONS.map((option) => {
            const selected = willingnessToPay === option.value;
            return (
              <label
                key={option.value}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3",
                  "text-[0.9375rem] transition-colors duration-150",
                  selected
                    ? "border-brand bg-brand-soft font-medium text-ink"
                    : "border-line text-ink-soft hover:bg-brand-soft/60",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="willingnessToPay"
                  value={option.value}
                  checked={selected}
                  onChange={() => setWillingnessToPay(option.value)}
                  className="h-4 w-4 accent-brand"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>

        <p className="mt-3 text-sm text-ink-soft">
          Answering is optional — you can continue without choosing.
        </p>
      </fieldset>

      {formError ? (
        <Notice tone="error" className="mt-6">
          {formError}
        </Notice>
      ) : null}

      <Button
        type="submit"
        size="lg"
        fullWidth
        className="mt-8"
        disabled={submitting}
      >
        {submitting ? "Saving…" : "Begin"}
      </Button>
    </form>
  );
}
