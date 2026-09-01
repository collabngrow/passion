import { listInterpretations } from "@/lib/ai/generate";
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

  const [answers, interpretations] = await Promise.all([
    getAllAnswers(participant.uid),
    listInterpretations(participant.uid),
  ]);

  /*
   * Analyses already produced, so a returning participant sees them without a
   * POST that would have to decide all over again whether to generate (§92).
   *
   * Only the prose is sent. §76 keeps the model and provider to the admin, and
   * `promptVersion` / `knowledgeBaseVersion` describe the framework rather than
   * the participant, which §38I keeps out of their reach. Sorted oldest-first
   * by listInterpretations, so a re-generated part keeps the newest entry.
   */
  const reflections: Record<string, unknown> = {};
  for (const stored of interpretations) {
    reflections[stored.sectionId] = stored.interpretation;
  }

  return jsonOk({
    participant: toParticipantView(participant),
    exercise: {
      version: exerciseVersion,
      sections: exercise.sections,
      questions: exercise.questions,
    },
    answers,
    reflections,
  });
});
