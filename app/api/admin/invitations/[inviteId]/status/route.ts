import { requireAdmin } from "@/lib/auth/verify";
import { recordAdminAction } from "@/lib/admin/audit";
import { badRequest, jsonOk, readJson, withErrorHandling } from "@/lib/http";
import { setInvitationStatus } from "@/lib/invitations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Enables or disables an invitation (master_prompt.md §31).
 *
 * A disabled invitation cannot authenticate, start or resume the exercise, or
 * reach the AI endpoints. Its data is retained and re-enabling restores access.
 */
export const POST = withErrorHandling(
  "admin/invitation-status",
  async (request: Request, context: { params: Promise<{ inviteId: string }> }) => {
    const { inviteId } = await context.params;
    const admin = await requireAdmin(request);

    const body = await readJson<{ status?: unknown }>(request);
    if (body.status !== "active" && body.status !== "disabled") {
      throw badRequest("That status isn't valid.");
    }

    await setInvitationStatus(inviteId, body.status);

    await recordAdminAction(
      body.status === "active" ? "invitation_enabled" : "invitation_disabled",
      admin.uid,
      { inviteId },
    );

    return jsonOk({ ok: true, status: body.status });
  },
);
