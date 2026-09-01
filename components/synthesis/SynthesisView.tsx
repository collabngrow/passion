"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useAuthState } from "@/components/auth/useAuthState";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";

/**
 * The final reflection (master_prompt.md §61, §62; brand §30).
 *
 * No score, no rating, no type. This is about self-understanding, not
 * judgement, so the page reads as a letter rather than a report.
 *
 * Generation is explicit. Opening this page issues a GET, which never spends a
 * model call (§92); the participant asks for it to be written.
 */

type Synthesis = {
  opening?: string;
  coreValues: string;
  sourcesOfMeaning: string;
  relationships: string;
  health: string;
  wealth: string;
  creativity: string;
  contribution: string;
  strengths: string;
  challenges: string;
  contradictions: string;
  oldSelf: string;
  emergingSelf: string;
  philosophicalLens: string;
  personalPhilosophy: string;
  threePriorities: string[];
  thirtyDayCommitments: string[];
};

type StateResponse = {
  synthesis: Synthesis | null;
  generatedAt: string | null;
  answeredCount: number;
  totalQuestions: number;
};

/** A prose section. Rendered only when there is something behind it. */
function Passage({ title, body }: { title: string; body?: string }) {
  if (!body || body.trim().length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
        {title}
      </h2>
      <div className="mt-3 space-y-4">
        {body
          .split(/\n{2,}/)
          .filter((paragraph) => paragraph.trim().length > 0)
          .map((paragraph, index) => (
            <p key={index} className="text-[1.0625rem] leading-relaxed text-ink">
              {paragraph.trim()}
            </p>
          ))}
      </div>
    </section>
  );
}

export function SynthesisView() {
  const { user, loading: authLoading } = useAuthState();

  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<StateResponse>("/api/journey/synthesis");
    if (!alive()) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
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

  async function generate() {
    setGenerating(true);
    setError(null);

    const result = await apiFetch<{ synthesis: Synthesis; generatedAt: string }>(
      "/api/journey/synthesis",
      { method: "POST" },
    );

    setGenerating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setData((previous) => ({
      synthesis: result.data.synthesis,
      generatedAt: result.data.generatedAt,
      answeredCount: previous?.answeredCount ?? 0,
      totalQuestions: previous?.totalQuestions ?? 43,
    }));
  }

  if (authLoading || (!data && !error)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p role="status" className="text-ink-soft">
          Loading…
        </p>
      </main>
    );
  }

  const synthesis = data?.synthesis ?? null;

  return (
    <main className="mx-auto w-full max-w-reading flex-1 px-6 py-12 sm:py-16">
      {!synthesis ? (
        <div className="text-center">
          <div className="flex justify-center">
            <Logo size="lg" label="CollabNGrow" priority />
          </div>

          <h1 className="mt-10 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Your reflection
          </h1>

          <p className="mt-4 leading-relaxed text-ink-soft">
            {data && data.answeredCount > 0
              ? `You've answered ${data.answeredCount} of ${data.totalQuestions} questions. ` +
                "When you're ready, we'll read back through everything you've written."
              : "Your journey hasn't started yet. When you're ready, begin your reflection."}
          </p>

          {error ? (
            <Notice tone="error" className="mt-6 text-left">
              {error}
            </Notice>
          ) : null}

          <div className="mt-8 flex flex-col items-center gap-3">
            {data && data.answeredCount > 0 ? (
              <Button size="lg" onClick={() => void generate()} disabled={generating}>
                {generating ? "Reading your answers…" : "Write my reflection"}
              </Button>
            ) : null}

            <Link
              href="/journey"
              className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand-dark"
            >
              {data && data.answeredCount > 0 ? "Back to your journey" : "Begin"}
            </Link>
          </div>

          {generating ? (
            <p className="mt-6 text-sm text-ink-soft" role="status">
              This takes a moment. We&apos;re reading across everything you wrote,
              not summarising it.
            </p>
          ) : null}
        </div>
      ) : (
        <article>
          <header className="text-center">
            <div className="flex justify-center">
              <Logo size="lg" label="CollabNGrow" priority />
            </div>
            <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Your reflection
            </h1>
            {synthesis.opening ? (
              <p className="mt-5 text-lg leading-relaxed text-ink-soft">
                {synthesis.opening}
              </p>
            ) : null}
          </header>

          <Passage title="What appears to matter most to you" body={synthesis.coreValues} />
          <Passage title="Where meaning comes from" body={synthesis.sourcesOfMeaning} />
          <Passage title="The people in your life" body={synthesis.relationships} />
          <Passage title="Your health" body={synthesis.health} />
          <Passage title="What wealth means to you" body={synthesis.wealth} />
          <Passage title="What you want to create" body={synthesis.creativity} />
          <Passage title="What you want to contribute" body={synthesis.contribution} />
          <Passage title="Your strengths" body={synthesis.strengths} />

          <Passage title="Who you have been" body={synthesis.oldSelf} />
          <Passage title="The person you are becoming" body={synthesis.emergingSelf} />

          <Passage title="What may be holding you back" body={synthesis.challenges} />
          <Passage title="Tensions worth sitting with" body={synthesis.contradictions} />

          <Passage title="A way of seeing this" body={synthesis.philosophicalLens} />
          <Passage title="Your philosophy, in your own words" body={synthesis.personalPhilosophy} />

          {synthesis.threePriorities.length > 0 ? (
            <section className="mt-12 rounded-lg border border-line bg-brand-soft px-6 py-7">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                Your priorities
              </h2>
              <ol className="mt-4 space-y-4">
                {synthesis.threePriorities.map((priority, index) => (
                  <li key={index} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="text-lg font-semibold tabular-nums text-brand"
                    >
                      {index + 1}
                    </span>
                    <span className="leading-relaxed text-ink">{priority}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {synthesis.thirtyDayCommitments.length > 0 ? (
            <section className="mt-6 rounded-lg border border-line bg-surface px-6 py-7">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                Your next thirty days
              </h2>
              <ol className="mt-4 space-y-4">
                {synthesis.thirtyDayCommitments.map((commitment, index) => (
                  <li key={index} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="text-lg font-semibold tabular-nums text-brand"
                    >
                      {index + 1}
                    </span>
                    <span className="leading-relaxed text-ink">{commitment}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* §62: the experience culminates here. */}
          <section className="mt-14 rounded-lg bg-gradient-to-br from-brand to-brand-dark px-8 py-12 text-center">
            <h2 className="text-2xl font-semibold leading-snug text-on-brand sm:text-3xl">
              Who are you choosing to become?
            </h2>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-on-brand/85">
              Nobody else can answer that. But everything above is already your
              answer, in your own words.
            </p>
          </section>

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link
                href="/journey"
                className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand-dark"
              >
                Back to your answers
              </Link>
              {/*
                The survey lives on its own page and is never surfaced inside
                the reflection: §62 asks the experience to end on its final
                question, and a form here would make the last thing someone
                reads a rating exercise. This is a quiet way back to it for
                anyone who has been asked to fill it in.
              */}
              <Link
                href="/journey/survey"
                className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                Feedback survey
              </Link>
            </div>
            {data?.generatedAt ? (
              <time dateTime={data.generatedAt} className="text-xs text-ink-soft">
                Written {new Date(data.generatedAt).toLocaleDateString()}
              </time>
            ) : null}
          </footer>
        </article>
      )}
    </main>
  );
}
