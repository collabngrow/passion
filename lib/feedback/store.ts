import "server-only";

import { Timestamp, db } from "@/lib/firebase/admin";

import type { FeedbackRecord } from "./analytics";

/**
 * Feedback survey persistence (feedback_plan.md).
 *
 * The document id is the participant's uid, so there is exactly one response
 * per person by construction rather than by a check that could race. Writes use
 * `create`, mirroring createParticipant: a second submission fails loudly
 * instead of quietly replacing an answer already given.
 */

const COLLECTION = "feedbackResponses";

export type FeedbackResponse = {
  uid: string;
  /** Denormalised so the admin table needs one read, not one read per row. */
  name: string;
  inviteId: string;

  /** Q1. */
  revelationImpact: number;
  /**
   * Q2, copied from the profile at submission time.
   *
   * Held here as well as on the participant because the shift analysis pairs
   * the two answers as they stood together at this moment. Reading it back from
   * the profile later would silently rewrite history if it ever changed.
   */
  willingnessToPay: number | null;

  /** Q3, with the written-in amount when option 9 was chosen. */
  perceivedWorth: number;
  perceivedWorthCustom: number | null;

  submittedAt: Timestamp;
};

function ref(uid: string) {
  return db().collection(COLLECTION).doc(uid);
}

export async function getFeedbackResponse(
  uid: string,
): Promise<FeedbackResponse | null> {
  const snapshot = await ref(uid).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as FeedbackResponse;
}

export class FeedbackAlreadySubmittedError extends Error {
  constructor() {
    super("feedback already submitted");
    this.name = "FeedbackAlreadySubmittedError";
  }
}

/** gRPC ALREADY_EXISTS, which is what `create` returns for an existing doc. */
const ALREADY_EXISTS = 6;

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === ALREADY_EXISTS
  );
}

export type SubmitFeedbackInput = Omit<FeedbackResponse, "submittedAt">;

export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<FeedbackResponse> {
  const response: FeedbackResponse = { ...input, submittedAt: Timestamp.now() };

  try {
    await ref(input.uid).create(response);
  } catch (error) {
    // Only ALREADY_EXISTS means "you have answered this". Collapsing every
    // failure into that would tell someone their feedback was already recorded
    // during an outage, when in fact nothing was stored.
    if (isAlreadyExists(error)) throw new FeedbackAlreadySubmittedError();
    throw error;
  }

  return response;
}

/** Newest first, for the administrator's table. */
export async function listFeedbackResponses(
  limit = 500,
): Promise<FeedbackResponse[]> {
  const snapshot = await db()
    .collection(COLLECTION)
    .orderBy("submittedAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as FeedbackResponse);
}

export function toFeedbackRecord(response: FeedbackResponse): FeedbackRecord {
  return {
    revelationImpact: response.revelationImpact,
    willingnessToPay: response.willingnessToPay,
    perceivedWorth: response.perceivedWorth,
    perceivedWorthCustom: response.perceivedWorthCustom,
  };
}
