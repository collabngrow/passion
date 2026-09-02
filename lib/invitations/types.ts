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
   * AES-256-GCM ciphertext, so an administrator can read back a password they
   * issued (§10B, §25). Decrypted only server-side, never in a browser.
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
 * participant cannot read encrypted passwords, and neither the hash nor the
 * ciphertext has any use in a browser.
 *
 * The **plaintext** password is included, decrypted server-side behind the
 * admin check on the listing route. The administrator issues these passwords
 * and has to be able to hand them on, so a reveal step gated on a second
 * Google reauthentication only stood between them and something they are
 * already entitled to read. It is still never persisted client-side (§28).
 */
export type InvitationSummary = {
  inviteId: string;
  status: InvitationStatus;
  label?: string;

  /** Plaintext, for the admin listing. Absent only if the record cannot be decrypted. */
  password?: string;
  /** The same value grouped for reading aloud: `A2Cd-Ef3H`. */
  formattedPassword?: string;

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
