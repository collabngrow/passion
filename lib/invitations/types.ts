import type { Timestamp } from "firebase-admin/firestore";

/**
 * Firestore data model (master_prompt.md §11).
 *
 * Server-side shapes. None of these documents is ever read by a browser: the
 * client SDK is authentication-only and Firestore rules deny client access, so
 * every field here reaches the UI only after a server route has decided what
 * that particular caller may see.
 */

export type InvitationStatus = "active" | "disabled";

export type Invitation = {
  inviteId: string;
  status: InvitationStatus;

  /**
   * scrypt hash, for verification.
   * NEVER returned to any client, admin included.
   */
  passwordHash: string;

  /**
   * AES-256-GCM ciphertext, for administrator reveal (§10B, §25).
   * Decrypted only inside the reveal endpoint, never in a browser.
   */
  encryptedPassword: string;

  /** Set once, atomically, on first successful use (§15, §79). */
  boundUid?: string;
  boundEmail?: string;
  boundAt?: Timestamp;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  passwordRotatedAt?: Timestamp;
  lastUsedAt?: Timestamp;

  /** Administrator's own note, e.g. a participant's name. Never shown to participants. */
  label?: string;
};

/**
 * Fields safe to send to the administrator's browser.
 *
 * Deliberately omits passwordHash and encryptedPassword — §88 requires that a
 * participant cannot read encrypted passwords, and there is no reason for an
 * admin browser to hold them either. The plaintext is returned only by the
 * reveal endpoint, only after reauthentication, and is never persisted client-side.
 */
export type InvitationSummary = {
  inviteId: string;
  status: InvitationStatus;
  label?: string;
  bound: boolean;
  boundEmail?: string;
  createdAt: string;
  boundAt?: string;
  lastUsedAt?: string;
  passwordRotatedAt?: string;
};

export type ParticipantProgress = {
  /** Question ids answered at least once. */
  answered: string[];
  /** Where the participant resumes (§45). */
  currentQuestionId: string;
  /** Section ids whose reflection has been generated. */
  reflectedSections: string[];
  completedAt?: Timestamp;
};

export type Participant = {
  uid: string;
  inviteId: string;

  /** Collected at onboarding (§56). */
  name: string;
  age: number;
  nationality: string;

  /**
   * From the verified Firebase token, never from a form (§56).
   */
  email: string;

  /**
   * Feedback survey Q2, captured at onboarding rather than with the survey so
   * the perception shift against Q3 measures a real before/after change.
   * Replayed into the survey read-only. See feedback_plan.md.
   */
  willingnessToPay?: number;

  /** The exercise version this participant started on (§95). */
  exerciseVersion: string;

  progress: ParticipantProgress;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/** Outcome of an attempt to bind an invitation to a Google identity (§15). */
export type BindResult =
  | { outcome: "bound" }
  | { outcome: "already-bound" }
  | { outcome: "mismatch" }
  | { outcome: "unavailable" };
