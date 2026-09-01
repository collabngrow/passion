import { exercise, getQuestion, totalQuestions } from "@/lib/exercise";
import { exerciseCatalog } from "@/lib/exercises/catalog";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { requireParticipant } from "@/lib/journey/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The exercises available to this participant, with their own progress on each.
 *
 * Separate from /api/journey/state, which ships the whole exercise -- ~90 KB of
 * questions that a list of cards has no use for. This returns only the figures
 * a card shows.
 *
 * Behind `requireParticipant` like every other journey route: the catalogue is
 * not a secret, but a participant's position in it is, and there is no reason
 * for an unauthenticated caller to learn either.
 */

type ExerciseStatus = "not_started" | "in_progress" | "complete";

export const GET = withErrorHandling("exercises", async (request: Request) => {
  const { participant } = await requireParticipant(request);

  const answeredCount = participant.progress?.answered?.length ?? 0;
  const completed = Boolean(participant.progress?.completedAt);

  const status: ExerciseStatus = completed
    ? "complete"
    : answeredCount === 0
      ? "not_started"
      : "in_progress";

  // Which part they are in, resolved from where they resume rather than from
  // the count: someone who skipped a question is further along than their
  // answered total suggests, and the card should say where they actually are.
  const current = getQuestion(participant.progress?.currentQuestionId ?? "");
  const currentPart =
    exercise.sections.find((section) => section.id === current?.sectionId)?.order ?? 1;

  const exercises = exerciseCatalog.map((entry) => ({
    ...entry,
    // Only the reflection exercise has progress to report today. A second
    // exercise will need its own reading here rather than inheriting this one's.
    progress:
      entry.id === "reflection"
        ? {
            status,
            answeredCount,
            totalQuestions,
            currentPart,
            totalParts: exercise.sections.length,
          }
        : null,
  }));

  return jsonOk({ exercises });
});
