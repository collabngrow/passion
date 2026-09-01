import type { Interpretation } from "@/lib/ai/schema";

/**
 * The reflection shown at the end of a part (master_prompt.md §59, §38I).
 *
 * §59 asks for a "concise reflection" between saving an answer and continuing,
 * with the final synthesis carrying the weight. So this is deliberately quieter
 * than the result page: rose-tinted, inside the reading column, and never
 * competing with the question that preceded it.
 *
 * Two fields of the stored interpretation are deliberately NOT rendered:
 *
 *   * `relevantThemes` holds knowledge-base theme ids. They are the framework's
 *     internal vocabulary, and §38I forbids surfacing where the reading comes
 *     from -- a participant seeing "p-respect-contradictions" learns the shape
 *     of the framework, which is exactly what that section closes.
 *   * `confidence` is an operational signal for the administrator, not a thing
 *     to tell someone about their own writing. "Moderate confidence" reads as a
 *     grade, and §42 rules out anything that functions as one.
 */
export function SectionReflection({
  sectionTitle,
  interpretation,
}: {
  sectionTitle: string;
  interpretation: Interpretation;
}) {
  return (
    <section
      aria-label={`Analysis of your responses in ${sectionTitle}`}
      className="mt-10 rounded-xl border border-line bg-brand-soft px-6 py-7 sm:px-8"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand">
        Your responses in this part
      </h2>

      <p className="mt-4 leading-relaxed text-ink">{interpretation.observation}</p>

      <p className="mt-4 leading-relaxed text-ink">{interpretation.interpretation}</p>

      {interpretation.tension ? (
        <p className="mt-4 leading-relaxed text-ink">{interpretation.tension}</p>
      ) : null}

      {interpretation.reflection ? (
        <p className="mt-6 border-t border-line pt-5 leading-relaxed text-ink-soft">
          {interpretation.reflection}
        </p>
      ) : null}
    </section>
  );
}
