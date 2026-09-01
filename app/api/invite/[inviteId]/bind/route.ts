import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/verify";
import {
  ApiError,
  genericAuthFailure,
  jsonOk,
  withErrorHandling,
} from "@/lib/http";
import { bindInvitation } from "@/lib/invitations/store";
import { getParticipant } from "@/lib/participants/store";
import { GRANT_COOKIE_NAME, verifyGrant } from "@/lib/security/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Binds an invitation to the authenticated Google identity (§15, §16, §79).
 *
 * Requires both facts the journey gate is built on: a valid grant cookie
 * proving the password step was passed, and a verified Firebase ID token. An
 * authenticated user cannot simply claim an invitation (§16) -- without the
 * cookie this returns the same generic failure as a wrong password.
 */
export const POST = withErrorHandling(
  "invite/bind",
  async (request: Request, context: { params: Promise<{ inviteId: string }> }) => {
    const { inviteId } = await context.params;

    const grant = await verifyGrant(
      (await cookies()).get(GRANT_COOKIE_NAME)?.value,
      inviteId,
    );
    if (!grant) throw genericAuthFailure();

    const user = await requireUser(request);

    const result = await bindInvitation(inviteId, user.uid, user.email);

    switch (result.outcome) {
      case "mismatch":
        // §17: say that it belongs to another account, never which one.
        throw new ApiError(
          403,
          "This invitation is already associated with another Google account.",
          "account_mismatch",
        );

      case "unavailable":
        // Missing or disabled, indistinguishable by design (§31, §54).
        throw genericAuthFailure();

      case "bound":
      case "already-bound": {
        const participant = await getParticipant(user.uid);
        return jsonOk({
          ok: true,
          needsProfile: participant === null,
        });
      }
    }
  },
);
