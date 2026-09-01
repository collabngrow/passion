"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Labelled text input.
 *
 * brand §11 and §24, master_prompt §73: a real, visible label bound to the
 * input, a rose focus ring, a comfortable touch target, and errors announced
 * rather than signalled by colour alone -- hence the error text plus
 * aria-invalid and aria-describedby, not just a red border.
 */

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function Field({ label, hint, error, className = "", ...rest }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>

      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={[
          "mt-2 block min-h-12 w-full rounded-md border bg-surface px-4",
          "text-ink placeholder:text-ink-soft/70",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:border-brand focus-visible:ring-2",
          "focus-visible:ring-brand/30",
          error ? "border-critical" : "border-line-strong",
        ].join(" ")}
        {...rest}
      />

      {error ? (
        <p id={errorId} className="mt-2 text-sm font-medium text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
