import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { invitationEncryptionKey } from "@/lib/env";

/**
 * Authenticated encryption for recoverable invitation passwords
 * (master_prompt.md §10B).
 *
 * The administrator must be able to read back a password they issued (§25, §27),
 * which a hash cannot support -- hence a second, reversible copy under
 * AES-256-GCM. GCM is authenticated, so a tampered ciphertext fails loudly
 * instead of decrypting to rubbish.
 *
 * The key is server-side only: never committed, never sent to the browser,
 * never stored in Firestore (§10, §51). Decryption happens only server-side,
 * in the admin invitation listing (§25).
 *
 * Stored format:  v1:<iv base64>:<authTag base64>:<ciphertext base64>
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, the recommended nonce size for GCM
const KEY_LENGTH = 32; // AES-256
const AUTH_TAG_LENGTH = 16;

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

function key(): Buffer {
  const raw = invitationEncryptionKey();

  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    throw new EncryptionError(
      "INVITATION_PASSWORD_ENCRYPTION_KEY is not valid base64.",
    );
  }

  if (decoded.length !== KEY_LENGTH) {
    throw new EncryptionError(
      `INVITATION_PASSWORD_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes, ` +
        `got ${decoded.length}. Generate one with: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }

  return decoded;
}

/** Encrypts a plaintext invitation password for storage. */
export function encryptPassword(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new EncryptionError("Cannot encrypt an empty value.");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a stored invitation password.
 *
 * Throws on any tampering, truncation or key mismatch. Callers must map this to
 * a generic failure message rather than surfacing it (§74).
 */
export function decryptPassword(stored: string): string {
  if (typeof stored !== "string") {
    throw new EncryptionError("Stored value is not a string.");
  }

  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new EncryptionError("Stored value is not in the expected format.");
  }

  const iv = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new EncryptionError("Stored value has invalid parameters.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Authentication failure, wrong key, or corrupted record.
    throw new EncryptionError("Could not decrypt the stored value.");
  }
}

/**
 * Whether the configured key is present and well-formed, without throwing.
 * Used by setup surfaces to report what is missing (§98).
 */
export function encryptionKeyIsConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison, for anywhere a secret is compared outside
 * the hashing path.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
