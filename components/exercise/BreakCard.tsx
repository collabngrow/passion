"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";

/**
 * The paused journey (master_prompt.md §18, §19, §45).
 *
 * Taking a break is deliberately NOT signing out. §18 promises that closing the
 * tab or the app does not end a session, and logging out is the one thing that
 * does (§19) -- it clears the grant cookie, and returning then needs the
 * invitation password and Google again, with no password recovery (§20). A
 * break that quietly did that would punish someone for stepping away.
 *
 * So this replaces the exercise on the same page rather than navigating: the
 * session is untouched, the answers are already saved, and Continue puts the
 * participant back on the question they left.
 *
 * Log out is here too, quietly, because "I am stopping" and "I am on someone
 * else's computer" arrive at the same moment, and the second one has to be
 * reachable without hunting for it.
 */
export function BreakCard({
  name,
  partNumber,
  totalParts,
  partTitle,
  answeredCount,
  totalQuestions,
  onContinue,
  onLogout,
}: {
  name: string;
  partNumber: number;
  totalParts: number;
  partTitle: string;
  answeredCount: number;
  totalQuestions: number;
  onContinue: () => void;
  onLogout: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The exercise it replaced was the whole page. Without this, focus is left on
  // a button that no longer exists and a screen reader announces nothing (§73).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-reading flex-1 items-center px-6 py-16">
      <div className="w-full rounded-xl border border-line bg-surface px-6 py-8 text-center shadow-sm sm:px-10 sm:py-10">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight text-ink outline-none sm:text-2xl"
        >
          Everything is saved, {name}
        </h1>

        <p className="mt-3 leading-relaxed text-ink-soft">
          You&apos;re still signed in. Come back to this whenever you&apos;re
          ready — nothing expires, and nothing is lost.
        </p>

        <dl className="mt-8 flex items-center justify-center gap-8 text-sm">
          <div>
            <dt className="text-ink-soft">Where you stopped</dt>
            <dd className="mt-1 font-medium text-ink">
              Part {partNumber} of {totalParts}
            </dd>
            <dd className="text-ink-soft">{partTitle}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Answered</dt>
            <dd className="mt-1 font-medium tabular-nums text-ink">
              {answeredCount} of {totalQuestions}
            </dd>
          </div>
        </dl>

        <div className="mt-9">
          <Button size="lg" onClick={onContinue}>
            Continue where I left off
          </Button>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md px-3 py-2 text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Log out instead
          </button>
        </div>
      </div>
    </main>
  );
}
