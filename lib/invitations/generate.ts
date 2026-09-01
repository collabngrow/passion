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
 * 20 characters: roughly 116 bits.
 *
 * Long enough that the rate limiter is a second line of defence rather than the
 * only one, short enough to type (§9).
 */
const PASSWORD_LENGTH = 20;

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
 * Groups a password for display: `A2Cd-Ef3H-...`.
 *
 * Presentation only -- the stored and verified value is always the ungrouped
 * string, and input is normalised with `normalisePasswordInput` before
 * verification.
 */
export function formatPasswordForDisplay(password: string): string {
  return (password.match(/.{1,5}/g) ?? [password]).join("-");
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
