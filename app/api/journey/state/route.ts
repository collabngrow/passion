import { getAllAnswers } from "@/lib/answers/store";
import { exercise, exerciseVersion } from "@/lib/exercise";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { requireParticipant } from "@/lib/journey/guard";
import { toParticipantView } from "@/lib/participants/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the journey needs to render and resume (master_prompt.md §45).
 *
 * The exercise itself is served here rather than imported into the client
 * bundle: it is ~90 KB of generated content that only an authenticated,
 * password-verified participant should receive, and shipping it statically
 * would put the whole exercise in reach of anyone who loaded the page (§91).
 */
export const GET = withErrorHandling("journey/state", async (request: Request) => {
  const { participant } = await requireParticipant(request);

  const answers = await getAllAnswers(participant.uid);

  return jsonOk({
    participant: toParticipantView(participant),
    exercise: {
      version: exerciseVersion,
      sections: exercise.sections,
      questions: exercise.questions,
    },
    answers,
  });
});
