import "server-only";

import { isAdminEmail, type VerifiedUser } from "@/lib/auth/verify";
import { invitationForUid } from "@/lib/invitations/store";

/**
 * Where a returning visitor belongs (master_prompt.md §18, §47).
 *
 * The PWA opens at "/" and someone who installed it has no invitation link to
 * hand any more, so the landing page has to be able to answer "who are you and
 * where were you". This is that answer, derived entirely from a verified token:
 * nothing here is told to us by the client, and it only ever discloses the
 * invitation bound to the caller's own uid, so it cannot be used to enumerate.
 *
 * A participant is sent to their invitation page rather than straight to
 * /exercises on purpose. That page's /state endpoint already decides between
 * re-entering the password (the 30-day grant cookie has lapsed), completing a
 * profile, and going through to the journey -- duplicating that decision here
 * would be a second gate to keep in step with the first (§90).
 */

export type Resume =
  | { status: "admin"; destination: string }
  | { status: "found"; destination: string }
  /** Signed in, but this Google account holds no invitation. */
  | { status: "unknown" }
  /** Their invitation exists but has been paused (§31). */
  | { status: "unavailable" };

export async function resolveResume(user: VerifiedUser): Promise<Resume> {
  // Verified against the token's own email, never a client claim (§21, §90).
  if (isAdminEmail(user.email) && user.emailVerified) {
    return { status: "admin", destination: "/admin" };
  }

  const invitation = await invitationForUid(user.uid);
  if (!invitation) return { status: "unknown" };
  if (invitation.status !== "active") return { status: "unavailable" };

  return { status: "found", destination: `/invite/${invitation.inviteId}` };
}
