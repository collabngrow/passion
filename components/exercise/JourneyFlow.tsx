"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuthState } from "@/components/auth/useAuthState";
import { LogoutDialog } from "@/components/exercise/LogoutDialog";
import { QuestionBlocks } from "@/components/exercise/QuestionBlocks";
import { SectionReflection } from "@/components/exercise/SectionReflection";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";
import type { Interpretation } from "@/lib/ai/schema";
import type { Exercise, ExerciseQuestion } from "@/lib/exercise/types";

/**
 * The exercise (master_prompt.md §43, §44, §45; brand §29).
 *
 * One question per screen, with the answer field as the visual centre and
 * nothing competing with it.
 */

const AUTOSAVE_DELAY_MS = 1500;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * The end-of-part reflection (§59).
 *
 * "skipped" is a success: the part was left blank, so there is nothing to read
 * back. It is separated from "failed" because the two mean opposite things to
 * whoever reads this next -- one is the participant's choice, the other is ours
 * to apologise for.
 */
type ReflectionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; interpretation: Interpretation }
  | { status: "skipped" }
  | { status: "failed"; message: string };

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
  const [reflection, setReflection] = useState<ReflectionState>({ status: "idle" });

  // Answers held locally so moving between questions is instant and does not
  // depend on a round trip.
  const answersRef = useRef<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ questionId: string; answer: string } | null>(null);

  // One question per screen means the whole page changes on Continue while the
  // button that did it stays under the cursor. Focus is moved to the new
  // question so a screen reader reads it out and a keyboard user is not left
  // pointing at a button whose meaning has silently changed (§73).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const movedRef = useRef(false);

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

  // Only after a deliberate move. On first load focus belongs where the browser
  // put it -- a participant resuming should not have it taken from them.
  useEffect(() => {
    if (!movedRef.current) return;
    movedRef.current = false;
    // preventScroll: goTo has just scrolled to the top and the heading sits
    // there; letting focus scroll again would fight it.
    headingRef.current?.focus({ preventScroll: true });
  }, [currentId]);

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

    movedRef.current = true;
    setCurrentId(question.id);
    setDraft(answersRef.current[question.id] ?? "");
    setSaveState("idle");
    setReflection({ status: "idle" });

    // The globals.css reduced-motion block cannot reach this: an explicit
    // behavior on scrollTo wins over the CSS scroll-behavior that block
    // overrides, so the preference has to be read here (§73, brand §15).
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  /**
   * Generates (or re-reads) the reflection for the part just finished.
   *
   * The answer is flushed first: the server reads the part back out of
   * Firestore, so an unsaved last answer would be interpreted as though it were
   * never written. Regenerating is cheap on a revisit -- the stored document is
   * keyed by a fingerprint of the answers (§77), so identical answers return
   * what was already written rather than spending another model call.
   */
  async function showReflection(sectionId: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();

    setReflection({ status: "loading" });

    const result = await apiFetch<{ interpretation: Interpretation | null }>(
      "/api/journey/reflect",
      { method: "POST", body: JSON.stringify({ sectionId }) },
    );

    if (!result.ok) {
      setReflection({ status: "failed", message: result.error });
      return;
    }

    setReflection(
      result.data.interpretation
        ? { status: "ready", interpretation: result.data.interpretation }
        : { status: "skipped" },
    );
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

  const sectionQuestionIds = section?.questionIds ?? [];
  const firstInSection = sectionQuestionIds[0] === current.id;
  const lastInSection =
    sectionQuestionIds[sectionQuestionIds.length - 1] === current.id;

  /**
   * The final question ends the exercise, and the synthesis on the next screen
   * reads every answer including this part's. Offering a part reflection here
   * would spend a second model call, and a minute of waiting, to say a smaller
   * version of what the participant is about to read in full.
   */
  const partOffersReflection =
    sectionQuestionIds.length > 0 &&
    sectionQuestionIds[sectionQuestionIds.length - 1] !== questions[total - 1]?.id;
  const offerReflectionNow = lastInSection && partOffersReflection;
  const reflectionPending =
    offerReflectionNow &&
    (reflection.status === "idle" || reflection.status === "loading");

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
        {/*
          The exercise is fourteen parts, and which one you are in changes what
          the question is asking. Showing only the title made consecutive parts
          read as one long list of questions.
        */}
        <p className="text-sm font-medium text-brand">
          Part {section?.order ?? 1} of {state.exercise.sections.length}
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            {section?.title ?? ""}
          </h2>
          <p className="shrink-0 text-sm tabular-nums text-ink-soft">
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

        {/*
          Said on arrival rather than only at the boundary, so the reflection is
          something to write towards rather than a surprise (§59).
        */}
        {firstInSection && partOffersReflection ? (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            {sectionQuestionIds.length}{" "}
            {sectionQuestionIds.length === 1 ? "question" : "questions"} in this
            part. At the end of it you&apos;ll get a short analysis of your
            responses.
          </p>
        ) : null}

        {/* The question is the centre of the screen (§71, brand §29). */}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-10 text-2xl font-semibold leading-snug tracking-tight text-ink outline-none sm:text-3xl"
        >
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

        {offerReflectionNow && reflection.status === "idle" ? (
          <p className="mt-6 text-sm leading-relaxed text-ink-soft">
            That&apos;s the last question in this part. When you&apos;re ready,
            we&apos;ll read back through what you wrote in it.
          </p>
        ) : null}

        {reflection.status === "ready" ? (
          <SectionReflection
            sectionTitle={section?.title ?? ""}
            interpretation={reflection.interpretation}
          />
        ) : null}

        {/*
          A reflection that fails must never block the exercise: the answers are
          already saved, and §75 puts the participant's writing above our
          ability to interpret it. So this is a note, and Continue is live
          underneath it either way.
        */}
        {reflection.status === "failed" ? (
          <Notice tone="info" className="mt-8">
            {reflection.message}
          </Notice>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="quiet"
            onClick={() => previous && void goTo(previous)}
            disabled={!previous}
          >
            Back
          </Button>

          {reflectionPending ? (
            <Button
              size="lg"
              onClick={() => void showReflection(current.sectionId)}
              disabled={reflection.status === "loading"}
            >
              {reflection.status === "loading"
                ? "Reading your responses…"
                : "See your analysis"}
            </Button>
          ) : next ? (
            <Button size="lg" onClick={() => void goTo(next)}>
              Continue
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={async () => {
                // Flush before leaving, so the last answer is saved before the
                // synthesis reads it back.
                if (timerRef.current) clearTimeout(timerRef.current);
                await flush();
                router.push("/journey/result");
              }}
            >
              Finish
            </Button>
          )}
        </div>
      </main>

      <LogoutDialog open={loggingOut} onCancel={() => setLoggingOut(false)} />
    </>
  );
}
