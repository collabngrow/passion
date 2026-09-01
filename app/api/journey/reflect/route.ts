import { generateSectionInterpretation } from "@/lib/ai/generate";
import { AiNotConfiguredError, AllModelsFailedError } from "@/lib/ai/router";
import { InvalidAiOutputError } from "@/lib/ai/schema";
import { getSection } from "@/lib/exercise";
import {
  ApiError,
  badRequest,
  jsonOk,
  rateLimited,
  readJson,
  withErrorHandling,
} from "@/lib/http";
import { requireParticipant } from "@/lib/journey/guard";
import { AI_GENERATION_POLICY, consumeAttempt } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Interpretation is a model call, not a typical request.
export const maxDuration = 60;

/**
 * Generates a section reflection (master_prompt.md §59, §75).
 *
 * The answers were already saved by /api/journey/answer, so a failure here can
 * never cost the participant their writing (§75). Every AI failure maps to the
 * same reassurance: saved, not interpreted, we will try again.
 */

function aiUnavailable(): ApiError {
  return new ApiError(
    503,
    "Your reflection has been saved. We couldn't generate the interpretation right " +
      "now. You can continue, and we'll try again.",
    "ai_unavailable",
  );
}

export const POST = withErrorHandling("journey/reflect", async (request: Request) => {
  const { participant } = await requireParticipant(request);

  const limit = await consumeAttempt(
    "ai-generate",
    participant.uid,
    AI_GENERATION_POLICY,
  );
  if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

  const body = await readJson<{ sectionId?: unknown }>(request);
  const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
  if (!getSection(sectionId)) {
    throw badRequest("That section isn't part of this exercise.");
  }

  try {
    const result = await generateSectionInterpretation(participant.uid, sectionId);

    // Nothing written in the section: not an error, just nothing to reflect on.
    if (!result) return jsonOk({ interpretation: null });

    return jsonOk({
      sectionId: result.sectionId,
      interpretation: result.interpretation,
      // The participant sees the reflection, not which model produced it (§76).
      generatedAt: result.createdAt,
    });
  } catch (error) {
    if (
      error instanceof AllModelsFailedError ||
      error instanceof AiNotConfiguredError ||
      error instanceof InvalidAiOutputError
    ) {
      console.error(`journey/reflect: ${error.name}`);
      throw aiUnavailable();
    }
    throw error;
  }
});
