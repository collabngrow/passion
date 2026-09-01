"use client";

import type { ReactNode } from "react";

/**
 * "Continue with Google".
 *
 * brand §18: authentication should feel trustworthy and clear without being
 * intimidating. The Google mark keeps its own colours -- it is the one place
 * the brand palette gives way, because a recoloured Google logo reads as
 * untrustworthy, which is the opposite of what this screen needs.
 */

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

type GoogleButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  children?: ReactNode;
};

export function GoogleButton({
  onClick,
  disabled = false,
  pending = false,
  children = "Continue with Google",
}: GoogleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      // aria-busy rather than swapping the label, so screen readers announce
      // the state change without the accessible name shifting under them.
      aria-busy={pending}
      className={
        "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md " +
        "border border-line-strong bg-surface px-6 font-medium text-ink " +
        "transition-colors duration-150 hover:bg-brand-soft " +
        "disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      <GoogleMark />
      <span>{pending ? "Opening Google…" : children}</span>
    </button>
  );
}
