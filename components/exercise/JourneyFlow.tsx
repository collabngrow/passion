"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuthState } from "@/components/auth/useAuthState";
import { LogoutDialog } from "@/components/exercise/LogoutDialog";
import { QuestionBlocks } from "@/components/exercise/QuestionBlocks";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";
import type { Exercise, ExerciseQuestion } from "@/lib/exercise/types";

/**
 * The exercise (master_prompt.md §43, §44, §45; brand §29).
 *
 * One question per screen, with the answer field as the visual centre and
 * nothing competing with it.
 */

const AUTOSAVE_DELAY_MS = 1500;

type SaveState = "idle" | "saving" | "saved" | "error";

type JourneyState = {
  participant: {
    name: string;
    progress: { answered: string[]; currentQuestionId: string };
  };
  exercise: Exercise;
  answers: Record<string, string>;
};

export function JourneyFlow() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthState();

  const [state, setState] = useState<JourneyState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loggingOut, setLoggingOut] = useState(false);

  // Answers held locally so moving between questions is instant and does not
  // depend on a round trip.
  const answersRef = useRef<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ questionId: string; answer: string } | null>(null);

  const load = useCallback(
    async (alive: () => boolean) => {
      const result = await apiFetch<JourneyState>("/api/journey/state");
      if (!alive()) return;

      if (!result.ok) {
        if (result.status === 401) router.replace("/");
        else if (result.code === "profile_required") router.replace("/");
        else setLoadError(result.error);
        return;
      }

      answersRef.current = result.data.answers;
      setState(result.data);
      setCurrentId(result.data.participant.progress.currentQuestionId);
      setDraft(result.data.answers[result.data.participant.progress.currentQuestionId] ?? "");
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

  const questions = useMemo(
    () => state?.exercise.questions ?? [],
    [state],
  );
  const current: ExerciseQuestion | null = useMemo(
    () => questions.find((q) => q.id === currentId) ?? null,
    [questions, currentId],
  );

  const section = useMemo(
    () => state?.exercise.sections.find((s) => s.id === current?.sectionId) ?? null,
    [state, current],
  );

  /** Sends whatever is pending, immediately. */
  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;

    pendingRef.current = null;
    setSaveState("saving");

    const result = await apiFetch("/api/journey/answer", {
      method: "POST",
      body: JSON.stringify({
        questionId: pending.questionId,
        answer: pending.answer,
        currentQuestionId: pending.questionId,
      }),
    });

    setSaveState(result.ok ? "saved" : "error");
  }, []);

  /** Debounced autosave (§44): never on every keystroke. */
  const scheduleSave = useCallback(
    (questionId: string, answer: string) => {
      answersRef.current[questionId] = answer;
      pendingRef.current = { questionId, answer };
      setSaveState("saving");

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Save on unmount so a pending edit is not lost when leaving the page.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void flush();
    };
  }, [flush]);

  function handleChange(value: string) {
    setDraft(value);
    if (current) scheduleSave(current.id, value);
  }

  async function goTo(question: ExerciseQuestion) {
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();

    setCurrentId(question.id);
    setDraft(answersRef.current[question.id] ?? "");
    setSaveState("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (authLoading || (!state && !loadError)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p role="status" className="text-ink-soft">
          Loading your journey…
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-reading">
          <Notice tone="error">{loadError}</Notice>
        </div>
      </main>
    );
  }

  if (!state || !current) return null;

  const position = current.order;
  const total = questions.length;
  const percent = Math.round((position / total) * 100);
  const previous = position > 1 ? questions[position - 2] : null;
  const next = position < total ? questions[position] : null;

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="text-sm font-medium text-ink">Your journey</span>
          </div>
          <button
            type="button"
            onClick={() => setLoggingOut(true)}
            className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-brand-soft hover:text-ink"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:py-14">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-brand">
            {section?.title ?? ""}
          </p>
          <p className="text-sm tabular-nums text-ink-soft">
            {String(position).padStart(2, "0")} / {total}
          </p>
        </div>

        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={position}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`Question ${position} of ${total}`}
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* The question is the centre of the screen (§71, brand §29). */}
        <h1 className="mt-10 text-2xl font-semibold leading-snug tracking-tight text-ink sm:text-3xl">
          {current.title}
        </h1>

        <div className="mt-6">
          <QuestionBlocks blocks={current.blocks} />
        </div>

        <div className="mt-8">
          <label htmlFor="answer" className="sr-only">
            Your answer to: {current.title}
          </label>
          <textarea
            id="answer"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            rows={12}
            placeholder="Write freely…"
            spellCheck
            className={
              "block w-full resize-y rounded-lg border border-line-strong bg-surface " +
              "px-5 py-4 text-[1.0625rem] leading-relaxed text-ink " +
              "placeholder:text-ink-soft/60 focus:outline-none " +
              "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
            }
          />

          {/* §44: subtle, and never the loudest thing on screen. */}
          <p
            role="status"
            aria-live="polite"
            className="mt-2 min-h-5 text-sm text-ink-soft"
          >
            {saveState === "saving" ? "Saving…" : null}
            {saveState === "saved" ? "Saved" : null}
            {saveState === "error" ? (
              <span className="text-critical">Unable to save — retrying</span>
            ) : null}
          </p>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="quiet"
            onClick={() => previous && void goTo(previous)}
            disabled={!previous}
          >
            Back
          </Button>

          {next ? (
            <Button size="lg" onClick={() => void goTo(next)}>
              Continue
            </Button>
          ) : (
            <Button size="lg" onClick={() => void flush()}>
              Finish
            </Button>
          )}
        </div>
      </main>

      <LogoutDialog open={loggingOut} onCancel={() => setLoggingOut(false)} />
    </>
  );
}
