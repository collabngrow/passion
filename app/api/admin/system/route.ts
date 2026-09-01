import { requireAdmin } from "@/lib/auth/verify";
import { adminEmail, geminiKeyPools } from "@/lib/env";
import { exerciseVersion, totalQuestions } from "@/lib/exercise";
import { knowledgeBaseVersion } from "@/lib/ai/retrieval";
import { hasAdminCredentials } from "@/lib/firebase/admin";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { encryptionKeyIsConfigured } from "@/lib/security/encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * System configuration status (master_prompt.md §98).
 *
 * Reports whether each server secret is present -- as a boolean, never a value,
 * not even masked. §51 keeps keys server-side; a masked key is still more than
 * a browser needs to know, and the only useful question here is "is it set?".
 *
 * Gemini keys are reported as a count for the same reason (§37 masks them in
 * the AI panel, where identifying which pool is which actually matters).
 */
export const GET = withErrorHandling("admin/system", async (request: Request) => {
  await requireAdmin(request);

  let geminiKeyCount = 0;
  try {
    geminiKeyCount = geminiKeyPools().length;
  } catch {
    geminiKeyCount = 0;
  }

  let inviteGrantConfigured = false;
  try {
    // Presence check only; the value never leaves the server.
    inviteGrantConfigured = Boolean(process.env.INVITE_GRANT_SECRET?.trim());
  } catch {
    inviteGrantConfigured = false;
  }

  return jsonOk({
    configuration: {
      firebaseAdmin: hasAdminCredentials(),
      encryptionKey: encryptionKeyIsConfigured(),
      inviteGrantSecret: inviteGrantConfigured,
      geminiKeyCount,
    },
    content: {
      exerciseVersion,
      totalQuestions,
      knowledgeBaseVersion,
    },
    administrator: adminEmail(),
  });
});
