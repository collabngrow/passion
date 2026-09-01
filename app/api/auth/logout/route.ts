import type { NextResponse } from "next/server";

import { jsonOk, withErrorHandling } from "@/lib/http";
import { GRANT_COOKIE_NAME, grantCookieOptions } from "@/lib/security/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clears the invitation grant cookie (master_prompt.md §19).
 *
 * The client signs out of Firebase separately. Both are required: Firebase ends
 * the identity, this ends the proof that the password was entered, and together
 * they produce the behaviour §19 promises -- on return the participant needs
 * their invitation password and Google verification again.
 *
 * Deliberately unauthenticated. Someone whose token has already expired must
 * still be able to finish logging out, and clearing your own cookie grants
 * nothing.
 */
export const POST = withErrorHandling("auth/logout", async () => {
  const response = jsonOk({ ok: true }) as NextResponse;

  response.cookies.set(GRANT_COOKIE_NAME, "", {
    ...grantCookieOptions(),
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
});
