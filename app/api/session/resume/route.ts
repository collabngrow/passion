import { resolveResume } from "@/lib/auth/resume";
import { requireUser } from "@/lib/auth/verify";
import { jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the signed-in visitor should go from the landing page (§18, §47).
 *
 * Answers for the caller's own verified identity only. A 401 here simply means
 * "not signed in", which is the landing page's cue to offer Google.
 */
export const GET = withErrorHandling("session/resume", async (request: Request) => {
  const user = await requireUser(request);
  return jsonOk(await resolveResume(user));
});
