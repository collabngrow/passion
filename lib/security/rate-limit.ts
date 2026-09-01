import "server-only";

import { createHash } from "node:crypto";

import { Timestamp, db } from "@/lib/firebase/admin";

/**
 * Rate limiting (master_prompt.md §53, §54).
 *
 * Backed by Firestore rather than Redis: §96 rules out infrastructure the
 * product does not need, and the volumes here are invitation-scale, not
 * internet-scale. Each check is a single transaction on one document.
 *
 * The policy is deliberately forgiving of humans and hostile to scripts. A
 * participant mistyping a 20-character password several times must not be
 * locked out (§53), so the window is short and self-healing rather than a
 * lockout requiring administrator intervention.
 */

const COLLECTION = "rateLimits";

export type RateLimitPolicy = {
  /** Attempts permitted inside the window. */
  limit: number;
  /** Rolling window in seconds. */
  windowSeconds: number;
};

/**
 * Password verification. Generous enough to absorb genuine mistyping, tight
 * enough that online guessing against a ~116-bit password is hopeless.
 */
export const PASSWORD_ATTEMPT_POLICY: RateLimitPolicy = {
  limit: 10,
  windowSeconds: 15 * 60,
};

/** Administrator reveal and rotate. Low volume by nature (§53). */
export const ADMIN_SENSITIVE_POLICY: RateLimitPolicy = {
  limit: 30,
  windowSeconds: 15 * 60,
};

/** AI generation, to bound cost as much as abuse (§53, §92). */
export const AI_GENERATION_POLICY: RateLimitPolicy = {
  limit: 40,
  windowSeconds: 60 * 60,
};

export type RateLimitResult = {
  allowed: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** When the window resets. */
  resetAt: Date;
  /** Seconds to wait, when not allowed. */
  retryAfterSeconds: number;
};

/**
 * Hashes an identifier before it becomes a document id.
 *
 * Keeps raw IP addresses out of Firestore (§12 data minimisation) and keeps
 * invitation ids out of document paths that other tooling might surface.
 */
function keyFor(scope: string, identifier: string): string {
  const digest = createHash("sha256")
    .update(`${scope}:${identifier}`)
    .digest("base64url")
    .slice(0, 32);
  return `${scope}_${digest}`;
}

/**
 * Consumes one attempt against a policy.
 *
 * Fails **open** when Firestore is unavailable. This is a deliberate trade: the
 * limiter is a second line of defence behind a high-entropy password, and
 * taking the whole product down because the counter cannot be written would
 * punish legitimate participants for an infrastructure fault. The password
 * check itself never degrades.
 */
export async function consumeAttempt(
  scope: string,
  identifier: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const ref = db().collection(COLLECTION).doc(keyFor(scope, identifier));
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;

  try {
    return await db().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data();

      const startedAt =
        data?.windowStartedAt instanceof Timestamp
          ? data.windowStartedAt.toMillis()
          : 0;
      const expired = now - startedAt >= windowMs;

      const windowStart = expired ? now : startedAt;
      const used = expired ? 0 : ((data?.count as number | undefined) ?? 0);
      const next = used + 1;
      const resetAt = new Date(windowStart + windowMs);

      if (next > policy.limit) {
        // Record the rejection without extending the window, so a caller
        // hammering the endpoint cannot push their own reset further away.
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000)),
        };
      }

      tx.set(
        ref,
        {
          count: next,
          windowStartedAt: Timestamp.fromMillis(windowStart),
          updatedAt: Timestamp.fromMillis(now),
        },
        { merge: true },
      );

      return {
        allowed: true,
        remaining: policy.limit - next,
        resetAt,
        retryAfterSeconds: 0,
      };
    });
  } catch {
    // Never log the identifier (§52).
    console.warn(`rate limit: check failed for scope=${scope}, allowing request`);
    return {
      allowed: true,
      remaining: policy.limit,
      resetAt: new Date(now + windowMs),
      retryAfterSeconds: 0,
    };
  }
}

/**
 * Clears a counter after a successful attempt.
 *
 * Without this, a participant who mistypes nine times and then succeeds would
 * still be one attempt from a block on their next visit.
 */
export async function resetAttempts(scope: string, identifier: string): Promise<void> {
  try {
    await db().collection(COLLECTION).doc(keyFor(scope, identifier)).delete();
  } catch {
    // A stale counter expires on its own; nothing here is worth failing for.
  }
}

/**
 * Best-effort client address from proxy headers.
 *
 * Only ever used as rate-limit input, never for authorization -- these headers
 * are client-supplied and trivially forged (§90). Combined with the invitation
 * id so that a forged header cannot lift the per-invitation limit.
 */
export function clientIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
