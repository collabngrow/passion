import "server-only";

import { Timestamp, db } from "@/lib/firebase/admin";

/**
 * Administrator audit trail (master_prompt.md §80, §81).
 *
 * Records that a sensitive action happened, who did it and to which
 * invitation. Never the plaintext password, never the hash, never the
 * ciphertext, never a key (§52, §80).
 */

const COLLECTION = "adminActions";

export type AdminActionType =
  | "invitation_created"
  /**
   * No longer written: passwords come down with the admin listing rather than
   * through a gated reveal. Kept so existing rows still render (§65).
   */
  | "password_revealed"
  | "password_rotated"
  | "invitation_disabled"
  | "invitation_enabled"
  | "ai_config_updated";

export type AdminAction = {
  type: AdminActionType;
  adminUid: string;
  inviteId?: string;
  at: Timestamp;
  /** Short, non-sensitive context. Never a credential. */
  note?: string;
};

/**
 * Writes an audit event.
 *
 * Never throws: an audit write failing must not roll back or block the action
 * the administrator actually asked for. A missing audit row is a smaller
 * problem than a rotation that appears to fail after the password has already
 * been replaced.
 */
export async function recordAdminAction(
  type: AdminActionType,
  adminUid: string,
  options: { inviteId?: string; note?: string } = {},
): Promise<void> {
  try {
    await db()
      .collection(COLLECTION)
      .add({
        type,
        adminUid,
        at: Timestamp.now(),
        ...(options.inviteId ? { inviteId: options.inviteId } : {}),
        ...(options.note ? { note: options.note } : {}),
      });
  } catch {
    console.warn(`audit: failed to record ${type}`);
  }
}

export type AdminActionView = {
  type: AdminActionType;
  inviteId?: string;
  at: string;
  note?: string;
};

/** Recent audit events, newest first, for the admin overview. */
export async function listAdminActions(limit = 50): Promise<AdminActionView[]> {
  const snapshot = await db()
    .collection(COLLECTION)
    .orderBy("at", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as AdminAction;
    return {
      type: data.type,
      inviteId: data.inviteId,
      at: data.at.toDate().toISOString(),
      note: data.note,
    };
  });
}
