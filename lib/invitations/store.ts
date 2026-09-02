import "server-only";

import { FieldValue, Timestamp, db } from "@/lib/firebase/admin";
import { decryptPassword, encryptPassword } from "@/lib/security/encryption";
import { hashPassword } from "@/lib/security/password";

import {
  formatPasswordForDisplay,
  generateInviteId,
  generateInvitationPassword,
} from "./generate";
import type {
  BindResult,
  Invitation,
  InvitationStatus,
  InvitationSummary,
} from "./types";

/**
 * Invitation persistence (master_prompt.md §11, §15, §30, §31, §78, §79).
 *
 * Every function here runs server-side behind an authorization check. Firestore
 * rules deny client access outright, so this module is the only way invitation
 * documents are ever touched.
 */

const COLLECTION = "invitations";

function ref(inviteId: string) {
  return db().collection(COLLECTION).doc(inviteId);
}

export async function getInvitation(inviteId: string): Promise<Invitation | null> {
  if (!inviteId || typeof inviteId !== "string") return null;

  const snapshot = await ref(inviteId).get();
  if (!snapshot.exists) return null;

  return snapshot.data() as Invitation;
}

/**
 * Creates an invitation (§55).
 *
 * Returns the plaintext password to the caller. It is never stored in
 * plaintext; the recoverable copy is the AES-GCM ciphertext, which the admin
 * listing decrypts server-side.
 */
export async function createInvitation(
  label?: string,
): Promise<{ inviteId: string; password: string }> {
  const password = generateInvitationPassword();
  const [passwordHash, encryptedPassword] = await Promise.all([
    hashPassword(password),
    Promise.resolve(encryptPassword(password)),
  ]);

  // Collisions are astronomically unlikely at 58 bits, but a silent overwrite
  // would destroy an existing participant's binding, so create fails loudly if
  // the id is taken and retries with a fresh one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteId = generateInviteId();
    const now = Timestamp.now();

    try {
      await ref(inviteId).create({
        inviteId,
        status: "active" satisfies InvitationStatus,
        passwordHash,
        encryptedPassword,
        createdAt: now,
        updatedAt: now,
        ...(label ? { label } : {}),
      });

      return { inviteId, password };
    } catch (error) {
      const code = (error as { code?: number | string }).code;
      // 6 / ALREADY_EXISTS
      if (code === 6 || code === "already-exists") continue;
      throw error;
    }
  }

  throw new Error("Could not allocate a unique invitation id.");
}

/**
 * Binds an invitation to a Google identity, atomically (§15, §79).
 *
 * Two people opening the same invitation simultaneously must not both bind it,
 * so the read and the write happen inside one transaction. A read-then-write
 * without transaction protection is exactly what §79 forbids.
 */
export async function bindInvitation(
  inviteId: string,
  uid: string,
  email: string,
): Promise<BindResult> {
  return db().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref(inviteId));
    if (!snapshot.exists) return { outcome: "unavailable" };

    const invitation = snapshot.data() as Invitation;

    // A disabled invitation cannot authenticate or bind (§31).
    if (invitation.status !== "active") return { outcome: "unavailable" };

    const now = Timestamp.now();

    if (!invitation.boundUid) {
      tx.update(snapshot.ref, {
        boundUid: uid,
        boundEmail: email,
        boundAt: now,
        lastUsedAt: now,
        updatedAt: now,
      });
      return { outcome: "bound" };
    }

    if (invitation.boundUid === uid) {
      tx.update(snapshot.ref, { lastUsedAt: now, updatedAt: now });
      return { outcome: "already-bound" };
    }

    // §17: bound to someone else. The caller must not be told whose.
    return { outcome: "mismatch" };
  });
}

/**
 * Rotates the password (§30).
 *
 * Replaces both credentials in one write so the old password stops working the
 * instant the new one starts. Binding, participant data, answers, progress and
 * any generated report are deliberately untouched.
 */
export async function rotateInvitationPassword(inviteId: string): Promise<string> {
  const password = generateInvitationPassword();
  const passwordHash = await hashPassword(password);
  const encryptedPassword = encryptPassword(password);
  const now = Timestamp.now();

  await db().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref(inviteId));
    if (!snapshot.exists) throw new Error("Invitation not found.");

    tx.update(snapshot.ref, {
      passwordHash,
      encryptedPassword,
      passwordRotatedAt: now,
      updatedAt: now,
    });
  });

  return password;
}

/** Enables or disables an invitation (§31). Data is retained either way. */
export async function setInvitationStatus(
  inviteId: string,
  status: InvitationStatus,
): Promise<void> {
  await ref(inviteId).update({ status, updatedAt: Timestamp.now() });
}

/** Records a successful entry, for the admin listing. */
export async function touchInvitation(inviteId: string): Promise<void> {
  try {
    await ref(inviteId).update({ lastUsedAt: FieldValue.serverTimestamp() });
  } catch {
    // Never fail a participant's entry because a timestamp did not update.
  }
}

/** The invitation bound to a uid, or null. Used to authorise journey access. */
export async function invitationForUid(uid: string): Promise<Invitation | null> {
  const snapshot = await db()
    .collection(COLLECTION)
    .where("boundUid", "==", uid)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as Invitation;
}

function iso(value: Timestamp | undefined): string | undefined {
  return value ? value.toDate().toISOString() : undefined;
}

/**
 * Projects an invitation for the admin UI.
 *
 * Drops passwordHash and encryptedPassword — neither is any use in a browser,
 * and §88 requires that encrypted passwords are unreadable to clients — and
 * carries the decrypted plaintext instead, so the listing needs no separate
 * reveal round trip.
 *
 * A record that will not decrypt (a rotated or missing key) yields a summary
 * with no password rather than throwing: one unreadable invitation must not
 * take down the whole listing, and the row shows that it needs rotating.
 */
export function toSummary(invitation: Invitation): InvitationSummary {
  let password: string | undefined;
  try {
    password = decryptPassword(invitation.encryptedPassword);
  } catch {
    password = undefined;
  }

  return {
    inviteId: invitation.inviteId,
    status: invitation.status,
    label: invitation.label,
    password,
    formattedPassword: password ? formatPasswordForDisplay(password) : undefined,
    bound: Boolean(invitation.boundUid),
    boundEmail: invitation.boundEmail,
    createdAt: iso(invitation.createdAt) ?? new Date(0).toISOString(),
    boundAt: iso(invitation.boundAt),
    lastUsedAt: iso(invitation.lastUsedAt),
    passwordRotatedAt: iso(invitation.passwordRotatedAt),
  };
}

/** All invitations, newest first, for the admin listing (§65). */
export async function listInvitations(limit = 200): Promise<InvitationSummary[]> {
  const snapshot = await db()
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => toSummary(doc.data() as Invitation));
}
