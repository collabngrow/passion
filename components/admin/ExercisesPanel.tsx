"use client";

import { useCallback, useEffect, useState } from "react";

import { QuestionBlocks } from "@/components/exercise/QuestionBlocks";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";
import type { ExerciseCatalogEntry } from "@/lib/exercises/catalog";
import type { ExerciseQuestion, ExerciseSection } from "@/lib/exercise/types";

/**
 * The exercise content, for the administrator to read (§22).
 *
 * Read-only, and not incidentally: the questions are generated from
 * `content/exercise.md` (§68), so editing here would offer something the build
 * pipeline cannot honour. The panel says so rather than leaving the absence of
 * an edit control to be discovered.
 *
 * Parts collapse rather than paginate. Forty-three questions across fourteen
 * parts is a document to scan, not a flow to step through, and an administrator
 * checking what a participant is being asked usually wants one part.
 */

type Data = {
  catalog: ExerciseCatalogEntry[];
  exercise: {
    version: string;
    totalQuestions: number;
    sections: ExerciseSection[];
    questions: ExerciseQuestion[];
  };
};

export function ExercisesPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPart, setOpenPart] = useState<string | null>(null);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<Data>("/api/admin/exercises");
    if (!alive()) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    let active = true;
    // The rule cannot see that setState happens after an awaited fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Exercises</h1>
        <Notice tone="error" className="mt-8">
          {error}
        </Notice>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Exercises</h1>
        <p role="status" className="mt-8 text-ink-soft">
          Loading…
        </p>
      </div>
    );
  }

  const { catalog, exercise } = data;

  function questionsIn(section: ExerciseSection): ExerciseQuestion[] {
    return section.questionIds
      .map((id) => exercise.questions.find((question) => question.id === id))
      .filter((question): question is ExerciseQuestion => Boolean(question));
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Exercises</h1>
      <p className="mt-3 max-w-reading leading-relaxed text-ink-soft">
        What participants are asked. Read-only — the questions are generated from{" "}
        <code className="rounded bg-brand-soft px-1.5 py-0.5 text-sm">
          content/exercise.md
        </code>
        , so changing one means editing that file and rebuilding.
      </p>

      <ul className="mt-8 space-y-3">
        {catalog.map((entry) => (
          <li
            key={entry.id}
            className="rounded-lg border border-line bg-surface px-5 py-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                {entry.title}
              </h2>
              <p className="text-sm text-ink-soft">
                {entry.available ? "Live" : "Not yet available"}
              </p>
            </div>
            <p className="mt-2 max-w-reading leading-relaxed text-ink-soft">
              {entry.description}
            </p>
            {entry.id === "reflection" ? (
              <p className="mt-2 text-sm tabular-nums text-ink-soft">
                Version {exercise.version} · {exercise.sections.length} parts ·{" "}
                {exercise.totalQuestions} questions
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-lg font-semibold tracking-tight text-ink">
        The Reflection Exercise, part by part
      </h2>

      <ul className="mt-4 space-y-2">
        {exercise.sections.map((section) => {
          const open = openPart === section.id;
          const questions = questionsIn(section);

          return (
            <li
              key={section.id}
              className="overflow-hidden rounded-lg border border-line bg-surface"
            >
              <h3>
                <button
                  type="button"
                  onClick={() => setOpenPart(open ? null : section.id)}
                  aria-expanded={open}
                  className="flex w-full items-baseline justify-between gap-4 px-5 py-4 text-left hover:bg-brand-soft"
                >
                  <span className="font-medium text-ink">
                    Part {section.order} · {section.title}
                  </span>
                  <span className="shrink-0 text-sm text-ink-soft">
                    {questions.length}{" "}
                    {questions.length === 1 ? "question" : "questions"}
                    {/* A word beside the caret: the caret alone is colour and
                        shape carrying state, which §73 does not allow. */}
                    <span className="ml-3">{open ? "Hide" : "Show"}</span>
                  </span>
                </button>
              </h3>

              {open ? (
                <ol className="border-t border-line">
                  {questions.map((question) => (
                    <li
                      key={question.id}
                      className="border-b border-line px-5 py-6 last:border-0"
                    >
                      <p className="text-sm tabular-nums text-ink-soft">
                        Question {question.order} of {exercise.totalQuestions}
                      </p>
                      <h4 className="mt-1 text-base font-semibold text-ink">
                        {question.title}
                      </h4>
                      <div className="mt-3 max-w-reading">
                        <QuestionBlocks blocks={question.blocks} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
