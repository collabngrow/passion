import { generateSynthesis, getStoredSynthesis } from "@/lib/ai/generate";
import {
  AiNotConfiguredError,
  AllModelsFailedError,
  GenerationTimedOutError,
} from "@/lib/ai/router";
import { InvalidAiOutputError } from "@/lib/ai/schema";
import { totalQuestions } from "@/lib/exercise";
import { ApiError, jsonOk, rateLimited, withErrorHandling } from "@/lib/http";
import { requireParticipant } from "@/lib/journey/guard";
import { AI_GENERATION_POLICY, consumeAttempt } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The synthesis reasons across every answer and emits sixteen sections; it is by
// far the longest call the product makes. 58 rather than 300 because Vercel's
// Hobby plan caps a function at 60 seconds and kills it there with a 504 -- the
// participant would see a network error rather than the copy below, and the
// Firestore write could be cut in half. SYNTHESIS_BUDGET_MS stops the model call
// before this cap is reached, so the timeout is ours to answer.
export const maxDuration = 58;

/**
 * The final synthesis (master_prompt.md §60, §92).
 *
 * GET returns the stored result without generating, so opening the result page
 * never spends a call (§92). POST generates, and returns the stored result
 * unchanged when the answers have not changed since it was written.
 */

function aiUnavailable(): ApiError {
  return new ApiError(
    503,
    "Your answers are saved. We couldn't put your reflection together just now — " +
      "please try again in a few minutes.",
    "ai_unavailable",
  );
}

export const GET = withErrorHandling("journey/synthesis", async (request: Request) => {
  const { participant } = await requireParticipant(request);

  const stored = await getStoredSynthesis(participant.uid);

  return jsonOk({
    synthesis: stored?.synthesis ?? null,
    generatedAt: stored?.generatedAt ?? null,
    answeredCount: participant.progress?.answered?.length ?? 0,
    totalQuestions,
  });
});

export const POST = withErrorHandling("journey/synthesis", async (request: Request) => {
  const { participant } = await requireParticipant(request);

  const limit = await consumeAttempt(
    "ai-generate",
    participant.uid,
    AI_GENERATION_POLICY,
  );
  if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

  try {
    const result = await generateSynthesis(participant.uid);

    if (!result) {
      throw new ApiError(
        409,
        "There's nothing to reflect on yet. Answer a few questions first.",
        "no_answers",
      );
    }

    return jsonOk({
      synthesis: result.synthesis,
      generatedAt: result.generatedAt,
    });
  } catch (error) {
    if (
      error instanceof AllModelsFailedError ||
      error instanceof GenerationTimedOutError ||
      error instanceof AiNotConfiguredError ||
      error instanceof InvalidAiOutputError
    ) {
      console.error(`journey/synthesis: ${error.name}`);
      throw aiUnavailable();
    }
    throw error;
  }
});
