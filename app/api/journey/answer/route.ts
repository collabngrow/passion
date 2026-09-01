import { MAX_ANSWER_LENGTH, saveAnswer } from "@/lib/answers/store";
import { getQuestion, isLastInSection } from "@/lib/exercise";
import { ApiError, badRequest, jsonOk, readJson, withErrorHandling } from "@/lib/http";
import { requireParticipant } from "@/lib/journey/guard";
import { updateProgress } from "@/lib/participants/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saves one answer (master_prompt.md §44, §45).
 *
 * Called by the debounced autosave, so it must be cheap and idempotent: writing
 * the same text twice is harmless.
 *
 * §75: the answer is saved before anything else can fail. Interpretation is a
 * separate request, so an AI outage can never cost a participant their writing.
 */

type Body = { questionId?: unknown; answer?: unknown; currentQuestionId?: unknown };

export const POST = withErrorHandling("journey/answer", async (request: Request) => {
  const { participant } = await requireParticipant(request);
  const body = await readJson<Body>(request);

  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  const question = getQuestion(questionId);
  // Rejecting unknown ids keeps the answers collection to the real exercise.
  if (!question) throw badRequest("That question isn't part of this exercise.");

  /*
   * A part closes when its analysis is generated (§59, §77).
   *
   * Enforced here rather than only in the UI (§90): the readOnly textarea is a
   * courtesy, and a saved edit would leave the stored reflection describing
   * answers that no longer exist -- then quietly spend another model call the
   * next time it was read, because the reflection is keyed by a fingerprint of
   * those answers. The check is free: requireParticipant already loaded this.
   */
  const reflected = participant.progress?.reflectedSections ?? [];
  if (reflected.includes(question.sectionId)) {
    throw new ApiError(
      409,
      "This part is complete. Your answers here are kept as they were when " +
        "your analysis was written.",
      "section_locked",
    );
  }

  if (typeof body.answer !== "string") throw badRequest();
  const answer = body.answer.slice(0, MAX_ANSWER_LENGTH);

  await saveAnswer(participant.uid, questionId, answer);

  const answered = new Set(participant.progress?.answered ?? []);
  const hasContent = answer.trim().length > 0;

  if (hasContent) answered.add(questionId);
  // Clearing an answer un-answers the question, so progress stays honest.
  else answered.delete(questionId);

  const currentQuestionId =
    typeof body.currentQuestionId === "string" && getQuestion(body.currentQuestionId)
      ? body.currentQuestionId
      : (participant.progress?.currentQuestionId ?? questionId);

  await updateProgress(participant.uid, {
    answered: [...answered],
    currentQuestionId,
  });

  return jsonOk({
    ok: true,
    answeredCount: answered.size,
    // Tells the client a section reflection can now be generated (§59).
    sectionComplete: hasContent && isLastInSection(questionId),
    sectionId: question.sectionId,
  });
});
