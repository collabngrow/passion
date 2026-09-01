import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Invitation password hashing (master_prompt.md §10A).
 *
 * Uses scrypt from node:crypto rather than argon2 or bcrypt. Both of those are
 * native modules whose prebuilt binaries are a recurring source of breakage
 * across a Windows development machine and a Linux serverless runtime; scrypt
 * is memory-hard, built in, and needs no build step.
 *
 * Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
 *
 * Parameters are encoded per hash, so they can be raised later without
 * invalidating existing invitations.
 */

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** ~33 MB per hash. Comfortable server-side, painful to attack in bulk. */
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Node's default cap is 32 MB, just under what N=32768, r=8 needs. */
const MAXMEM = 96 * 1024 * 1024;

const PREFIX = "scrypt";

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: n,
    r,
    p,
    maxmem: MAXMEM,
  });
}

/** Hashes an invitation password for storage in Firestore. */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Cannot hash an empty password.");
  }

  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, N, R, P);

  return [PREFIX, N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

/**
 * Verifies a candidate password against a stored hash.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupted
 * record must read as "wrong password", never as an authentication bypass.
 * Comparison is constant-time.
 */
export async function verifyPassword(
  candidate: string,
  stored: string,
): Promise<boolean> {
  if (typeof candidate !== "string" || typeof stored !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  // Refuse absurd parameters from a tampered record rather than attempting a
  // multi-gigabyte derivation.
  if (n < 1024 || n > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await derive(candidate, salt, n, r, p);
  } catch {
    return false;
  }

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Whether a stored hash was produced with the current parameters.
 *
 * Lets a future parameter increase rehash on next successful verification
 * without forcing a password rotation.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return true;
  return Number(parts[1]) !== N || Number(parts[2]) !== R || Number(parts[3]) !== P;
}
