import { requireFreshAdmin } from "@/lib/auth/verify";
import { recordAdminAction } from "@/lib/admin/audit";
import { ApiError, jsonOk, rateLimited, withErrorHandling } from "@/lib/http";
import { formatPasswordForDisplay } from "@/lib/invitations/generate";
import { getInvitation } from "@/lib/invitations/store";
import { decryptPassword } from "@/lib/security/encryption";
import {
  ADMIN_SENSITIVE_POLICY,
  consumeAttempt,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reveals an invitation password (master_prompt.md §25, §27).
 *
 * Requires the administrator AND a recent Google reauthentication. Decryption
 * happens here, server-side, never in the browser (§25). The plaintext is
 * returned once and never logged (§27, §52).
 */
export const POST = withErrorHandling(
  "admin/reveal-password",
  async (request: Request, context: { params: Promise<{ inviteId: string }> }) => {
    const { inviteId } = await context.params;

    // Throws reauthentication_required when auth_time is stale, which the UI
    // turns into a real Google reauthentication prompt (§26).
    const admin = await requireFreshAdmin(request);

    const limit = await consumeAttempt(
      "admin-reveal",
      admin.uid,
      ADMIN_SENSITIVE_POLICY,
    );
    if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

    const invitation = await getInvitation(inviteId);
    if (!invitation) {
      throw new ApiError(404, "That invitation no longer exists.", "not_found");
    }

    const password = decryptPassword(invitation.encryptedPassword);

    await recordAdminAction("password_revealed", admin.uid, { inviteId });

    // Never returns the hash or the key (§27).
    return jsonOk({
      password,
      formattedPassword: formatPasswordForDisplay(password),
    });
  },
);
