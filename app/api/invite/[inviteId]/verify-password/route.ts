import { NextResponse } from "next/server";

import { getInvitation, touchInvitation } from "@/lib/invitations/store";
import { normalisePasswordInput } from "@/lib/invitations/generate";
import {
  genericAuthFailure,
  jsonOk,
  rateLimited,
  readJson,
  withErrorHandling,
} from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import {
  PASSWORD_ATTEMPT_POLICY,
  clientIdentifier,
  consumeAttempt,
  resetAttempts,
} from "@/lib/security/rate-limit";
import {
  GRANT_COOKIE_NAME,
  grantCookieOptions,
  issueGrant,
} from "@/lib/security/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invitation password verification (master_prompt.md §8, §14, §53, §54).
 *
 * On success this sets the HttpOnly grant cookie, which is the only thing that
 * proves a visitor passed the password step. The password itself never enters a
 * URL, browser history, client storage or a log (§8, §52).
 */

/**
 * A real hash of a throwaway value, used to spend the same work when an
 * invitation does not exist.
 *
 * Without it, a missing invitation would return in a millisecond while a real
 * one costs ~400 ms of scrypt -- a timing oracle that answers exactly the
 * question §54 forbids answering. Computed once per instance, lazily.
 */
let decoyHash: Promise<string> | null = null;
function decoy(): Promise<string> {
  decoyHash ??= hashPassword("decoy-value-never-matches-any-invitation");
  return decoyHash;
}

type Body = { password?: unknown };

export const POST = withErrorHandling(
  "invite/verify-password",
  async (request: Request, context: { params: Promise<{ inviteId: string }> }) => {
    const { inviteId } = await context.params;
    const body = await readJson<Body>(request);

    const password =
      typeof body.password === "string" ? normalisePasswordInput(body.password) : "";

    // Rate limit on invitation and caller together, so one participant's
    // mistyping cannot lock out another's invitation, and a single client
    // cannot spread attempts across many invitations (§53).
    const limit = await consumeAttempt(
      "invite-password",
      `${inviteId}:${clientIdentifier(request.headers)}`,
      PASSWORD_ATTEMPT_POLICY,
    );
    if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds);

    const invitation = await getInvitation(inviteId);

    // A missing invitation, a disabled invitation and a wrong password are one
    // indistinguishable outcome (§31, §54).
    if (!invitation || invitation.status !== "active") {
      await verifyPassword(password || "x", await decoy());
      throw genericAuthFailure();
    }

    if (!password || !(await verifyPassword(password, invitation.passwordHash))) {
      throw genericAuthFailure();
    }

    // Clear the counter so earlier mistypes do not carry into the next visit.
    await resetAttempts(
      "invite-password",
      `${inviteId}:${clientIdentifier(request.headers)}`,
    );
    await touchInvitation(inviteId);

    const response = jsonOk({ ok: true }) as NextResponse;
    response.cookies.set(GRANT_COOKIE_NAME, await issueGrant(inviteId), grantCookieOptions());
    response.headers.set("Cache-Control", "no-store");

    return response;
  },
);
