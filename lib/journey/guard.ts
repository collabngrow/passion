import "server-only";

import { cookies } from "next/headers";

import { requireUser, type VerifiedUser } from "@/lib/auth/verify";
import { ApiError, genericAuthFailure } from "@/lib/http";
import { invitationForUid } from "@/lib/invitations/store";
import type { Invitation, Participant } from "@/lib/invitations/types";
import { getParticipant } from "@/lib/participants/store";
import { GRANT_COOKIE_NAME, verifyGrant } from "@/lib/security/token";

/**
 * The journey access gate (master_prompt.md §14, §16, §18, §19, §31).
 *
 * Every journey route calls this. It re-establishes all three facts on every
 * request rather than trusting anything the client sends (§90):
 *
 *   1. a verified Firebase ID token,
 *   2. an invitation bound to that uid and still active,
 *   3. a grant cookie for that same invitation, proving the password step.
 *
 * (3) is what makes §19 work. Firebase's session survives a refresh, so without
 * the cookie a participant who logged out would be silently let back in.
 */

export type JourneyContext = {
  user: VerifiedUser;
  invitation: Invitation;
};

/** Authenticated, bound and password-verified. Profile may not exist yet. */
export async function requireJourneyAccess(request: Request): Promise<JourneyContext> {
  const user = await requireUser(request);

  const invitation = await invitationForUid(user.uid);

  // No invitation, or disabled (§31): a disabled invitation cannot access an
  // existing journey or reach the AI endpoints.
  if (!invitation || invitation.status !== "active") throw genericAuthFailure();

  const grant = await verifyGrant(
    (await cookies()).get(GRANT_COOKIE_NAME)?.value,
    invitation.inviteId,
  );
  if (!grant) throw genericAuthFailure();

  return { user, invitation };
}

/** As above, and the participant profile must exist. */
export async function requireParticipant(
  request: Request,
): Promise<JourneyContext & { participant: Participant }> {
  const context = await requireJourneyAccess(request);

  const participant = await getParticipant(context.user.uid);
  if (!participant) {
    throw new ApiError(
      409,
      "Let's finish setting up your profile first.",
      "profile_required",
    );
  }

  return { ...context, participant };
}
