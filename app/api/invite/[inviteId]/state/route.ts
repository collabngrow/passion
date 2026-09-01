import { cookies } from "next/headers";

import { verifyRequest } from "@/lib/auth/verify";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { getInvitation } from "@/lib/invitations/store";
import { getParticipant } from "@/lib/participants/store";
import { GRANT_COOKIE_NAME, verifyGrant } from "@/lib/security/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where this visitor is in the entry flow, so the invitation page renders the
 * right step without flashing through the wrong ones.
 *
 * §54 governs the whole endpoint: an invitation that does not exist and one
 * that has not been unlocked return exactly the same "password" step, so this
 * cannot be used to enumerate invitations. Nothing here grants access -- every
 * privileged route re-checks independently (§90).
 */

export type InviteStep =
  | "password" // no valid grant cookie
  | "google" // password passed, not signed in
  | "profile" // signed in and bound, no participant profile yet
  | "ready" // fully set up; go to the journey
  | "mismatch" // signed in as an account bound to a different invitation
  | "unavailable"; // disabled after this visitor already bound it

export const GET = withErrorHandling(
  "invite/state",
  async (request: Request, context: { params: Promise<{ inviteId: string }> }) => {
    const { inviteId } = await context.params;

    const grant = await verifyGrant(
      (await cookies()).get(GRANT_COOKIE_NAME)?.value,
      inviteId,
    );

    // Reveals nothing about whether the invitation exists.
    if (!grant) return jsonOk({ step: "password" satisfies InviteStep });

    const user = await verifyRequest(request);
    if (!user) return jsonOk({ step: "google" satisfies InviteStep });

    const invitation = await getInvitation(inviteId);

    // Past the password step the visitor already holds a valid grant for this
    // invitation, so reporting that it is unavailable discloses nothing new and
    // is far more useful than a generic error (§31).
    if (!invitation || invitation.status !== "active") {
      return jsonOk({ step: "unavailable" satisfies InviteStep });
    }

    if (invitation.boundUid && invitation.boundUid !== user.uid) {
      return jsonOk({ step: "mismatch" satisfies InviteStep });
    }

    // Unbound: the client posts to /bind to claim it atomically.
    if (!invitation.boundUid) {
      return jsonOk({ step: "google" satisfies InviteStep, authenticated: true });
    }

    const participant = await getParticipant(user.uid);
    return jsonOk({
      step: (participant ? "ready" : "profile") satisfies InviteStep,
    });
  },
);
