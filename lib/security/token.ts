import "server-only";

import { SignJWT, jwtVerify } from "jose";

import { inviteGrantSecret } from "@/lib/env";

/**
 * The invitation grant cookie.
 *
 * master_prompt.md sets three requirements that pull against each other:
 *
 *   §14/§16  the journey requires the invitation password AND Google identity
 *   §18      closing the tab, closing the PWA or refreshing must not sign out
 *   §19      after an explicit logout, the password is required again
 *
 * Firebase's session satisfies §18 on its own but cannot satisfy §19, since a
 * returning user would simply be signed in again. So journey access requires
 * two independent facts:
 *
 *   1. a verified Firebase ID token whose uid matches invitation.boundUid, and
 *   2. this cookie, which is issued ONLY by successful server-side password
 *      verification.
 *
 * Logout clears both. Refresh clears neither. The password itself is never in
 * the cookie, the URL or any client storage (§8).
 */

const ISSUER = "passion-analyzer";
const AUDIENCE = "invite-grant";
const ALGORITHM = "HS256";

/** Matches the cookie lifetime; both are refreshed on each successful entry. */
export const GRANT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const GRANT_COOKIE_NAME = "pa_invite_grant";

export type GrantPayload = {
  /** Invitation this grant is valid for. A grant is never portable between invitations. */
  inviteId: string;
  /** Issued-at, seconds since epoch. */
  issuedAt: number;
};

function secret(): Uint8Array {
  const raw = inviteGrantSecret();
  const decoded = Buffer.from(raw, "base64");

  // HS256 keys should be at least as long as the digest. A short secret here
  // would be the weakest link in the whole password gate.
  if (decoded.length < 32) {
    throw new Error(
      "INVITE_GRANT_SECRET must decode to at least 32 bytes. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }

  return new Uint8Array(decoded);
}

/** Issues a grant proving this visitor passed password verification. */
export async function issueGrant(inviteId: string): Promise<string> {
  if (!inviteId) throw new Error("Cannot issue a grant without an invitation id.");

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ inviteId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + GRANT_TTL_SECONDS)
    .sign(secret());
}

/**
 * Verifies a grant for a specific invitation.
 *
 * Returns null on anything wrong -- expired, tampered, wrong signature, or
 * issued for a different invitation. Callers treat null as "password required"
 * and must not distinguish the reasons to the visitor (§54).
 */
export async function verifyGrant(
  token: string | undefined,
  inviteId: string,
): Promise<GrantPayload | null> {
  if (!token || !inviteId) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });

    // A grant for invitation A must never open invitation B.
    if (payload.inviteId !== inviteId) return null;
    if (typeof payload.iat !== "number") return null;

    return { inviteId, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

/** Cookie attributes for the grant. Shared by the set and clear paths. */
export function grantCookieOptions(secure = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: GRANT_TTL_SECONDS,
  };
}
