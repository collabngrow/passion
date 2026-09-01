import "server-only";

import { adminAuth } from "@/lib/firebase/admin";
import { adminEmail } from "@/lib/env";
import { ApiError, notAuthorised } from "@/lib/http";

/**
 * Server-side identity verification.
 *
 * master_prompt.md §90: never trust a client-supplied uid, email, role or admin
 * flag. Everything here derives from a Firebase ID token verified against
 * Google's public keys by the Admin SDK.
 *
 * §89: hiding a button is not access control. Every privileged route calls
 * these, and the client-side equivalents exist only to avoid showing people
 * doors that will not open.
 */

export type VerifiedUser = {
  uid: string;
  email: string;
  emailVerified: boolean;
  /** Seconds since epoch when the user last actually authenticated. */
  authTime: number;
  displayName?: string;
};

/** Default freshness for sensitive admin operations (§25). */
export const FRESH_AUTH_MAX_AGE_SECONDS = 5 * 60;

function unauthenticated(): ApiError {
  return new ApiError(401, "Please sign in to continue.", "unauthenticated");
}

/** Extracts a bearer token from the Authorization header. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;

  return token.trim() || null;
}

/**
 * Verifies the caller's Firebase ID token.
 *
 * `checkRevoked` is enabled so a signed-out or disabled account cannot continue
 * on a token that has not yet expired. It costs a lookup and is worth it on
 * routes that touch private data.
 */
export async function verifyRequest(request: Request): Promise<VerifiedUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  try {
    const decoded = await adminAuth().verifyIdToken(token, true);

    if (!decoded.email) return null;

    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      emailVerified: decoded.email_verified === true,
      authTime: typeof decoded.auth_time === "number" ? decoded.auth_time : 0,
      displayName: typeof decoded.name === "string" ? decoded.name : undefined,
    };
  } catch {
    // Expired, revoked, malformed or forged. All read the same to the caller.
    return null;
  }
}

/** Requires any authenticated user. */
export async function requireUser(request: Request): Promise<VerifiedUser> {
  const user = await verifyRequest(request);
  if (!user) throw unauthenticated();
  return user;
}

/**
 * Requires the single authorised administrator (§21).
 *
 * Compares against the verified token's email, not anything the client sent,
 * and requires the address to be verified by the identity provider so an
 * unverified account claiming the admin address cannot pass.
 */
export async function requireAdmin(request: Request): Promise<VerifiedUser> {
  const user = await requireUser(request);

  if (user.email !== adminEmail() || !user.emailVerified) {
    // Logged without the address, so a probing attempt does not write someone's
    // email into the logs (§52).
    console.warn(`admin authorization denied for uid=${user.uid}`);
    throw notAuthorised();
  }

  return user;
}

/**
 * Requires that the user authenticated recently (§25, §26).
 *
 * Revealing or rotating a password must sit behind a fresh Google
 * reauthentication, not merely a session that was valid this morning.
 * `auth_time` is set by Firebase and cannot be influenced by the client.
 */
export function requireFreshAuth(
  user: VerifiedUser,
  maxAgeSeconds: number = FRESH_AUTH_MAX_AGE_SECONDS,
): void {
  const age = Math.floor(Date.now() / 1000) - user.authTime;

  if (!user.authTime || age > maxAgeSeconds) {
    throw new ApiError(
      401,
      "Please confirm it's you to continue.",
      "reauthentication_required",
      `auth_time is ${age}s old, limit ${maxAgeSeconds}s`,
    );
  }
}

/** Convenience: administrator with a recent reauthentication. */
export async function requireFreshAdmin(
  request: Request,
  maxAgeSeconds: number = FRESH_AUTH_MAX_AGE_SECONDS,
): Promise<VerifiedUser> {
  const admin = await requireAdmin(request);
  requireFreshAuth(admin, maxAgeSeconds);
  return admin;
}

/** Whether an email is the configured administrator. Server-side only. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase() === adminEmail();
}
