import { requireFreshAdmin } from "@/lib/auth/verify";
import { recordAdminAction } from "@/lib/admin/audit";
import { jsonOk, rateLimited, withErrorHandling } from "@/lib/http";
import { formatPasswordForDisplay } from "@/lib/invitations/generate";
import { rotateInvitationPassword } from "@/lib/invitations/store";
import {
  ADMIN_SENSITIVE_POLICY,
  consumeAttempt,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rotates an invitation password (master_prompt.md §30).
 *
 * The old password stops working immediately. Binding, participant data,
 * answers, progress and any generated report are deliberately untouched.
 */
export const POST = withErrorHandling(
  "admin/rotate-password",
  async (request: Request, context: { params: Promise<{ inviteId: string }> }) => {
    const { inviteId } = await context.params;
    const admin = await requireFreshAdmin(request);

    const limit = await consumeAttempt(
      "admin-rotate",
      admin.uid,
      ADMIN_SENSITIVE_POLICY,
    );
    if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

    const password = await rotateInvitationPassword(inviteId);

    await recordAdminAction("password_rotated", admin.uid, { inviteId });

    return jsonOk({
      password,
      formattedPassword: formatPasswordForDisplay(password),
    });
  },
);
