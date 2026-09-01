import { requireAdmin } from "@/lib/auth/verify";
import { listAdminActions } from "@/lib/admin/audit";
import { db } from "@/lib/firebase/admin";
import { jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dashboard overview (master_prompt.md §66, §81).
 *
 * Counts and the recent audit trail. Uses aggregate count queries so the
 * overview does not read every document to display a number (§91).
 */
export const GET = withErrorHandling("admin/overview", async (request: Request) => {
  await requireAdmin(request);

  const invitations = db().collection("invitations");

  const [total, active, bound, participants, actions] = await Promise.all([
    invitations.count().get(),
    invitations.where("status", "==", "active").count().get(),
    invitations.orderBy("boundUid").count().get(),
    db().collection("participants").count().get(),
    listAdminActions(12),
  ]);

  return jsonOk({
    counts: {
      invitations: total.data().count,
      active: active.data().count,
      claimed: bound.data().count,
      participants: participants.data().count,
    },
    recentActions: actions,
  });
});
