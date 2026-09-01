import { getStoredSynthesis } from "@/lib/ai/generate";
import {
  MAX_WORTH_RUPEES,
  PERCEIVED_WORTH_CUSTOM_VALUE,
  isValidPerceivedWorth,
  isValidRevelationImpact,
  isValidWillingnessToPay,
  parseCustomWorth,
} from "@/lib/feedback/questions";
import {
  FeedbackAlreadySubmittedError,
  getFeedbackResponse,
  submitFeedback,
} from "@/lib/feedback/store";
import { ApiError, badRequest, jsonOk, readJson, withErrorHandling } from "@/lib/http";
import { requireParticipant } from "@/lib/journey/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The feedback survey (feedback_plan.md; PLAN.md S9.5).
 *
 * Locked until the reflection has been written. The survey asks how the
 * revelations landed and what they were worth, so a response given before
 * seeing them would answer a question nobody asked -- and the Q2/Q3 comparison
 * would compare two answers to the same condition.
 *
 * Eligibility is decided here rather than trusted from the page, on the same
 * principle as every other route: the client's account of what it has shown is
 * not evidence (§90).
 */

type Body = {
  revelationImpact?: unknown;
  perceivedWorth?: unknown;
  perceivedWorthCustom?: unknown;
};

export const GET = withErrorHandling("feedback", async (request: Request) => {
  const { participant } = await requireParticipant(request);

  const [synthesis, response] = await Promise.all([
    getStoredSynthesis(participant.uid),
    getFeedbackResponse(participant.uid),
  ]);

  return jsonOk({
    unlocked: synthesis !== null,
    submitted: response !== null,
    /**
     * Replayed into the survey read-only, so the participant sees the answer
     * they gave before any of this and can recognise their own shift.
     */
    willingnessToPay: participant.willingnessToPay ?? null,
  });
});

export const POST = withErrorHandling("feedback", async (request: Request) => {
  const { participant } = await requireParticipant(request);

  if (!(await getStoredSynthesis(participant.uid))) {
    throw new ApiError(
      409,
      "Your reflection hasn't been written yet.",
      "not_unlocked",
    );
  }

  const body = await readJson<Body>(request);

  if (!isValidRevelationImpact(body.revelationImpact)) {
    throw badRequest("Please choose how the reflection landed for you.");
  }
  if (!isValidPerceivedWorth(body.perceivedWorth)) {
    throw badRequest("Please choose what you think this was worth.");
  }

  // Option 9 is the only one that carries a number, and it is meaningless
  // without one. Any amount sent alongside another option is discarded rather
  // than stored, so a stray value cannot later be read as an answer.
  let perceivedWorthCustom: number | null = null;
  if (body.perceivedWorth === PERCEIVED_WORTH_CUSTOM_VALUE) {
    perceivedWorthCustom = parseCustomWorth(body.perceivedWorthCustom);
    if (perceivedWorthCustom === null) {
      // Naming the ceiling matters: without it, a rejected large number looks
      // like the form is broken rather than bounded.
      throw badRequest(
        `Please enter an amount in rupees, up to ${MAX_WORTH_RUPEES.toLocaleString("en-IN")}.`,
      );
    }
  }

  try {
    await submitFeedback({
      uid: participant.uid,
      name: participant.name,
      inviteId: participant.inviteId,
      revelationImpact: body.revelationImpact,
      willingnessToPay: isValidWillingnessToPay(participant.willingnessToPay)
        ? participant.willingnessToPay
        : null,
      perceivedWorth: body.perceivedWorth,
      perceivedWorthCustom,
    });
  } catch (error) {
    if (error instanceof FeedbackAlreadySubmittedError) {
      throw new ApiError(
        409,
        "Thanks — you've already shared your feedback.",
        "already_submitted",
      );
    }
    throw error;
  }

  return jsonOk({ submitted: true });
});
