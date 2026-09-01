/**
 * The introduction to a part (master_prompt.md §43, §59).
 *
 * Shown on the first question of every part, on the same screen as the question
 * rather than as a step of its own: an interstitial would put a page between
 * finishing one part and starting the next, and §43 keeps the exercise moving.
 *
 * It says what the part costs and what it gives back before any of it is asked.
 * The break line belongs here for the same reason -- someone deciding whether
 * to start a part is exactly who needs to know that stopping midway is safe,
 * and that is precisely the moment they would otherwise close the tab unsure.
 */
export function PartIntro({
  partNumber,
  title,
  questionCount,
  offersAnalysis,
  closed,
}: {
  partNumber: number;
  title: string;
  questionCount: number;
  /** False for the closing part, whose analysis is the final synthesis itself. */
  offersAnalysis: boolean;
  /** True once this part's analysis exists and its answers are fixed. */
  closed: boolean;
}) {
  return (
    <section
      aria-label={`About Part ${partNumber}`}
      className="mt-8 rounded-xl border border-line bg-brand-soft px-6 py-6 sm:px-8 sm:py-7"
    >
      <h2 className="text-lg font-semibold tracking-tight text-ink">
        Part {partNumber} · {title}
      </h2>

      <p className="mt-3 leading-relaxed text-ink">
        This part contains {questionCount}{" "}
        {questionCount === 1 ? "question" : "questions"}.
        {closed
          ? " You have finished it, and your analysis is at the end. These answers stay as they were when it was written."
          : offersAnalysis
            ? " Once you have answered all of them, you'll be given an analysis of your responses in this part."
            : " It closes the exercise, and your full reflection follows it."}
      </p>

      {/*
        Dropped once the part is closed: there is nothing left to save here, and
        repeating the promise would read as though there were.
      */}
      {!closed ? (
        <p className="mt-3 leading-relaxed text-ink-soft">
          You can take a break at any point using the button above. Everything
          you write is saved as you go, and you can continue where you left off.
        </p>
      ) : null}
    </section>
  );
}
