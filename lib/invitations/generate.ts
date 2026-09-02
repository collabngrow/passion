import "server-only";

import { randomInt } from "node:crypto";

/**
 * Invitation identifier and password generation (master_prompt.md §7, §9).
 *
 * Both are drawn from a cryptographically secure source and derived from
 * nothing -- not the participant's name, not their email, not the invite id,
 * not a timestamp, not a sequence.
 */

/**
 * Unambiguous alphabet: no 0/O, no 1/l/I.
 *
 * Passwords are read off a screen and typed by hand, or dictated over the
 * phone. Characters that are easy to confuse produce support requests that look
 * exactly like a wrong password, and §54 forbids the system from being any more
 * specific than "that did not work".
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * 10 characters over a 57-character alphabet: roughly 58 bits.
 *
 * Unguessable, and short enough to sit in a URL without looking like a hash.
 * Must never be sequential or derived from the participant (§7).
 */
const INVITE_ID_LENGTH = 10;

/**
 * 8 characters over the 57-character alphabet: roughly 46 bits.
 *
 * Short enough to read off a message and type by hand on a phone, which is how
 * these are actually delivered (§9). 46 bits is far past what online guessing
 * can reach -- at the 10-attempts-per-15-minutes limit in
 * `PASSWORD_ATTEMPT_POLICY`, an expected hit is on the order of 10^7 years --
 * but it no longer has the margin to survive an offline attack on a stolen
 * hash. The scrypt work factor in `lib/security/password.ts` is what carries
 * that case now, so it must not be lowered.
 */
const PASSWORD_LENGTH = 8;

/**
 * Random string over the unambiguous alphabet.
 *
 * randomInt is rejection-sampled by Node, so there is no modulo bias.
 */
function randomString(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** A new unpredictable invitation id, used as the public route segment. */
export function generateInviteId(): string {
  return randomString(INVITE_ID_LENGTH);
}

/** A new invitation password. Returned in plaintext exactly once, to the caller. */
export function generateInvitationPassword(): string {
  return randomString(PASSWORD_LENGTH);
}

/**
 * Groups a password for display: `A2Cd-Ef3H`.
 *
 * Grouped in fours, so an 8-character password reads as two even halves.
 * Presentation only -- the stored and verified value is always the ungrouped
 * string, and input is normalised with `normalisePasswordInput` before
 * verification.
 */
export function formatPasswordForDisplay(password: string): string {
  return (password.match(/.{1,4}/g) ?? [password]).join("-");
}

/**
 * Normalises a typed password before verification.
 *
 * Strips whitespace and the display grouping hyphens, so a participant who
 * copies the formatted form, or whose keyboard adds a trailing space, is not
 * told their password is wrong. Case is preserved -- the alphabet is
 * case-sensitive and lowering it would cost entropy.
 */
export function normalisePasswordInput(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export const invitationGenerationParameters = {
  alphabet: ALPHABET,
  inviteIdLength: INVITE_ID_LENGTH,
  passwordLength: PASSWORD_LENGTH,
} as const;
