import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/verify";
import { isValidWillingnessToPay } from "@/lib/feedback/questions";
import {
  ApiError,
  badRequest,
  genericAuthFailure,
  jsonOk,
  readJson,
  withErrorHandling,
} from "@/lib/http";
import { invitationForUid } from "@/lib/invitations/store";
import {
  createParticipant,
  getParticipant,
  toParticipantView,
} from "@/lib/participants/store";
import { GRANT_COOKIE_NAME, verifyGrant } from "@/lib/security/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Participant profile (master_prompt.md §56).
 *
 * Collects name, age and nationality. The email comes from the verified
 * Firebase token and is never taken from the request body -- a client-supplied
 * email is exactly what §90 says not to trust, and §56 forbids overwriting the
 * verified Google address.
 */

type Body = {
  name?: unknown;
  age?: unknown;
  nationality?: unknown;
  willingnessToPay?: unknown;
};

const MAX_NAME = 80;
const MAX_NATIONALITY = 60;
const MIN_AGE = 13;
const MAX_AGE = 120;

export const GET = withErrorHandling("participant/profile", async (request: Request) => {
  const user = await requireUser(request);
  const participant = await getParticipant(user.uid);

  if (!participant) return jsonOk({ participant: null });
  return jsonOk({ participant: toParticipantView(participant) });
});

export const POST = withErrorHandling("participant/profile", async (request: Request) => {
  const user = await requireUser(request);

  const invitation = await invitationForUid(user.uid);
  if (!invitation || invitation.status !== "active") throw genericAuthFailure();

  // The password step must have been passed for this specific invitation, not
  // merely at some point for some invitation (§14, §19).
  const grant = await verifyGrant(
    (await cookies()).get(GRANT_COOKIE_NAME)?.value,
    invitation.inviteId,
  );
  if (!grant) throw genericAuthFailure();

  if (await getParticipant(user.uid)) {
    throw new ApiError(409, "Your profile has already been set up.", "already_exists");
  }

  const body = await readJson<Body>(request);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const nationality =
    typeof body.nationality === "string" ? body.nationality.trim() : "";
  const age = typeof body.age === "number" ? body.age : Number(body.age);

  if (name.length === 0 || name.length > MAX_NAME) {
    throw badRequest("Please enter your name.");
  }
  if (nationality.length === 0 || nationality.length > MAX_NATIONALITY) {
    throw badRequest("Please enter your nationality.");
  }
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    throw badRequest("Please enter a valid age.");
  }

  // Feedback survey Q2, asked here so the later comparison measures a genuine
  // before/after change. Optional: a participant may decline to answer.
  const willingnessToPay = isValidWillingnessToPay(body.willingnessToPay)
    ? body.willingnessToPay
    : undefined;

  const participant = await createParticipant({
    uid: user.uid,
    inviteId: invitation.inviteId,
    email: user.email,
    name,
    age,
    nationality,
    willingnessToPay,
  });

  return jsonOk({ participant: toParticipantView(participant) });
});
