"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthState } from "@/components/auth/useAuthState";
import { LogoutDialog } from "@/components/exercise/LogoutDialog";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";
import type { ExerciseCatalogEntry } from "@/lib/exercises/catalog";

/**
 * The exercises a participant can open (the hub they land on after onboarding).
 *
 * Access is enforced by the route this calls, not by the page (§90):
 * /api/exercises re-verifies the token, the binding and the grant cookie on
 * every request, and this redirects home if any of that fails.
 */

type Progress = {
  status: "not_started" | "in_progress" | "complete";
  answeredCount: number;
  totalQuestions: number;
  currentPart: number;
  totalParts: number;
};

type Entry = ExerciseCatalogEntry & { progress: Progress | null };

const STATUS_LABEL: Record<Progress["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

export function ExercisesList() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthState();

  const [exercises, setExercises] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(
    async (alive: () => boolean) => {
      const result = await apiFetch<{ exercises: Entry[] }>("/api/exercises");
      if (!alive()) return;

      if (!result.ok) {
        // No profile yet means onboarding was never finished; the root page is
        // the one that can work out where this person belongs.
        if (result.status === 401 || result.code === "profile_required") {
          router.replace("/");
          return;
        }
        setError(result.error);
        return;
      }

      setExercises(result.data.exercises);
    },
    [router],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }

    let active = true;
    // The rule cannot see that setState happens after an awaited fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [authLoading, user, load, router]);

  if (authLoading || (!exercises && !error)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p role="status" className="text-ink-soft">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center justify-between">
            <Logo size="sm" />
            <button
              type="button"
              onClick={() => setLoggingOut(true)}
              className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-brand-soft hover:text-ink"
            >
              Log out
            </button>
          </div>
          <p className="mt-2 text-center text-sm font-semibold tracking-tight text-ink">
            Your exercises
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Choose where to begin
        </h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Everything you write is saved as you go. You can leave an exercise at
          any point and pick it up where you left off.
        </p>

        {error ? (
          <Notice tone="error" className="mt-8">
            {error}
          </Notice>
        ) : null}

        <ul className="mt-8 space-y-4">
          {exercises?.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-line bg-surface px-6 py-6 sm:px-8 sm:py-7"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  {entry.title}
                </h2>
                {/* A word, not a colour (§73, brand §24). */}
                {entry.progress ? (
                  <p className="text-sm text-ink-soft">
                    {STATUS_LABEL[entry.progress.status]}
                  </p>
                ) : null}
              </div>

              <p className="mt-3 leading-relaxed text-ink-soft">
                {entry.description}
              </p>

              {entry.progress && entry.progress.status !== "not_started" ? (
                <p className="mt-4 text-sm tabular-nums text-ink">
                  Part {entry.progress.currentPart} of {entry.progress.totalParts}
                  {" · "}
                  {entry.progress.answeredCount} of {entry.progress.totalQuestions}{" "}
                  answered
                </p>
              ) : null}

              <div className="mt-6">
                {entry.available ? (
                  <Button size="lg" onClick={() => router.push(entry.href)}>
                    {entry.progress?.status === "not_started"
                      ? "Begin"
                      : entry.progress?.status === "complete"
                        ? "Open"
                        : "Continue"}
                  </Button>
                ) : (
                  <p className="text-sm text-ink-soft">Coming soon</p>
                )}
              </div>

              {entry.progress?.status === "complete" ? (
                <p className="mt-4 text-sm">
                  <Link
                    href="/journey/result"
                    className="font-medium text-brand underline underline-offset-4 hover:text-brand-dark"
                  >
                    Read your reflection
                  </Link>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </main>

      <LogoutDialog open={loggingOut} onCancel={() => setLoggingOut(false)} />
    </>
  );
}
