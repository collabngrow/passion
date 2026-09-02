import { requireAdmin } from "@/lib/auth/verify";
import { jsonOk, readJson, withErrorHandling } from "@/lib/http";
import { createInvitation, listInvitations } from "@/lib/invitations/store";
import { recordAdminAction } from "@/lib/admin/audit";
import { formatPasswordForDisplay } from "@/lib/invitations/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invitation listing and creation (master_prompt.md §23, §55, §65).
 *
 * Both verify the administrator server-side. Hiding the UI is not access
 * control (§89).
 *
 * The listing carries each password in plaintext, decrypted inside
 * `toSummary`. That is the whole of the authorization for reading a password:
 * be the administrator. Passwords are never logged (§52), and the browser
 * holds them in component state only (§28).
 */

export const GET = withErrorHandling("admin/invitations", async (request: Request) => {
  await requireAdmin(request);
  return jsonOk({ invitations: await listInvitations() });
});

export const POST = withErrorHandling("admin/invitations", async (request: Request) => {
  const admin = await requireAdmin(request);

  const body = await readJson<{ label?: unknown }>(request);
  const label =
    typeof body.label === "string" && body.label.trim().length > 0
      ? body.label.trim().slice(0, 80)
      : undefined;

  const { inviteId, password } = await createInvitation(label);

  await recordAdminAction("invitation_created", admin.uid, { inviteId });

  // Not persisted client-side (§28) -- the admin copies or shares it now, or
  // reads it again from the listing later.
  return jsonOk({
    inviteId,
    password,
    formattedPassword: formatPasswordForDisplay(password),
  });
});
