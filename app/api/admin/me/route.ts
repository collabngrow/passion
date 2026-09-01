import { requireAdmin } from "@/lib/auth/verify";
import { jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether the caller is the administrator.
 *
 * The dashboard uses this to decide what to render. The client never compares
 * emails itself: the admin address stays server-side, and the answer comes from
 * the same requireAdmin() that guards every privileged route (§21, §89).
 *
 * A non-admin gets 403 from withErrorHandling, which the shell renders as
 * access denied.
 */
export const GET = withErrorHandling("admin/me", async (request: Request) => {
  const admin = await requireAdmin(request);
  return jsonOk({ uid: admin.uid, email: admin.email });
});
