import { describe, expect, it } from "vitest";

import {
  EncryptionError,
  decryptPassword,
  encryptPassword,
  encryptionKeyIsConfigured,
  safeEqual,
} from "./encryption";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { clientIdentifier } from "./rate-limit";
import {
  GRANT_COOKIE_NAME,
  grantCookieOptions,
  issueGrant,
  verifyGrant,
} from "./token";
import {
  formatPasswordForDisplay,
  generateInvitationPassword,
  generateInviteId,
  invitationGenerationParameters,
  normalisePasswordInput,
} from "@/lib/invitations/generate";

describe("password hashing (§10A)", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("the-real-password");
    await expect(verifyPassword("the-real-passwore", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("is case sensitive", async () => {
    const hash = await hashPassword("AbCdEf");
    await expect(verifyPassword("abcdef", hash)).resolves.toBe(false);
  });

  it("salts, so identical passwords hash differently", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
    await expect(verifyPassword("same", a)).resolves.toBe(true);
    await expect(verifyPassword("same", b)).resolves.toBe(true);
  });

  it("encodes its parameters so they can be raised later", async () => {
    const hash = await hashPassword("x");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
    expect(needsRehash(hash)).toBe(false);
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
  });

  /**
   * A corrupted or tampered stored value must read as "wrong password". If any
   * of these returned true, or threw in a way a caller treated as success, the
   * result would be an authentication bypass.
   */
  it("treats malformed stored hashes as a failed verification", async () => {
    for (const malformed of [
      "",
      "not-a-hash",
      "scrypt$32768$8$1$onlyfiveparts",
      "bcrypt$32768$8$1$c2FsdA==$aGFzaA==",
      "scrypt$abc$8$1$c2FsdA==$aGFzaA==",
      "scrypt$32768$8$1$$",
    ]) {
      await expect(
        verifyPassword("anything", malformed),
        `accepted "${malformed}"`,
      ).resolves.toBe(false);
    }
  });

  it("refuses absurd parameters from a tampered record", async () => {
    // Would otherwise attempt a multi-gigabyte derivation.
    await expect(
      verifyPassword("x", "scrypt$1073741824$8$1$c2FsdA==$aGFzaA=="),
    ).resolves.toBe(false);
  });
});

describe("password encryption (§10B)", () => {
  it("round-trips a password", () => {
    const password = generateInvitationPassword();
    expect(decryptPassword(encryptPassword(password))).toBe(password);
  });

  it("produces different ciphertext each time, via a fresh nonce", () => {
    const a = encryptPassword("same-value");
    const b = encryptPassword("same-value");
    expect(a).not.toBe(b);
    expect(decryptPassword(a)).toBe(decryptPassword(b));
  });

  it("uses the documented versioned format", () => {
    const parts = encryptPassword("x").split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    expect(Buffer.from(parts[1], "base64")).toHaveLength(12); // GCM nonce
    expect(Buffer.from(parts[2], "base64")).toHaveLength(16); // auth tag
  });

  /** GCM is authenticated: tampering must fail loudly, not decrypt to rubbish. */
  it("rejects tampered ciphertext", () => {
    const encrypted = encryptPassword("sensitive");
    const parts = encrypted.split(":");

    const ciphertext = Buffer.from(parts[3], "base64");
    ciphertext[0] ^= 0xff;
    const tampered = [parts[0], parts[1], parts[2], ciphertext.toString("base64")].join(":");

    expect(() => decryptPassword(tampered)).toThrow(EncryptionError);
  });

  it("rejects a tampered auth tag", () => {
    const parts = encryptPassword("sensitive").split(":");
    const tag = Buffer.from(parts[2], "base64");
    tag[0] ^= 0xff;
    expect(() =>
      decryptPassword([parts[0], parts[1], tag.toString("base64"), parts[3]].join(":")),
    ).toThrow(EncryptionError);
  });

  it("rejects malformed stored values", () => {
    for (const malformed of ["", "v1:only:three", "v2:a:b:c", "garbage"]) {
      expect(() => decryptPassword(malformed), `accepted "${malformed}"`).toThrow(
        EncryptionError,
      );
    }
  });

  it("refuses to encrypt an empty value", () => {
    expect(() => encryptPassword("")).toThrow(EncryptionError);
  });

  it("reports key configuration without throwing", () => {
    expect(encryptionKeyIsConfigured()).toBe(true);
  });
});

describe("constant-time comparison", () => {
  it("compares equal and unequal strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("invitation grant token (§14, §16, §19)", () => {
  it("issues a grant that verifies for its own invitation", async () => {
    const token = await issueGrant("7Hf92kLm23");
    const payload = await verifyGrant(token, "7Hf92kLm23");
    expect(payload?.inviteId).toBe("7Hf92kLm23");
  });

  /** A grant for one invitation must never open another. */
  it("rejects a grant issued for a different invitation", async () => {
    const token = await issueGrant("invitationA");
    await expect(verifyGrant(token, "invitationB")).resolves.toBeNull();
  });

  it("rejects a tampered or absent token", async () => {
    const token = await issueGrant("abc1234567");
    await expect(verifyGrant(`${token}x`, "abc1234567")).resolves.toBeNull();
    await expect(verifyGrant(undefined, "abc1234567")).resolves.toBeNull();
    await expect(verifyGrant("", "abc1234567")).resolves.toBeNull();
    await expect(verifyGrant("a.b.c", "abc1234567")).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ inviteId: "abc1234567" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("passion-analyzer")
      .setAudience("invite-grant")
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(new Uint8Array(Buffer.alloc(32, 99)));

    await expect(verifyGrant(forged, "abc1234567")).resolves.toBeNull();
  });

  it("rejects an expired grant", async () => {
    const { SignJWT } = await import("jose");
    const past = Math.floor(Date.now() / 1000) - 60 * 60;
    const expired = await new SignJWT({ inviteId: "abc1234567" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("passion-analyzer")
      .setAudience("invite-grant")
      .setIssuedAt(past - 10)
      .setExpirationTime(past)
      .sign(new Uint8Array(Buffer.from(process.env.INVITE_GRANT_SECRET!, "base64")));

    await expect(verifyGrant(expired, "abc1234567")).resolves.toBeNull();
  });

  it("never carries the password (§8)", async () => {
    const token = await issueGrant("abc1234567");
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    expect(Object.keys(claims).sort()).toEqual(
      ["aud", "exp", "iat", "inviteId", "iss"].sort(),
    );
  });

  it("sets a cookie the browser cannot read", () => {
    const options = grantCookieOptions(true);
    expect(GRANT_COOKIE_NAME).toBe("pa_invite_grant");
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("lax");
  });
});

describe("invitation generation (§7, §9)", () => {
  it("generates ids and passwords of the documented length", () => {
    const { inviteIdLength, passwordLength, alphabet } = invitationGenerationParameters;
    expect(generateInviteId()).toHaveLength(inviteIdLength);
    expect(generateInvitationPassword()).toHaveLength(passwordLength);

    for (const ch of generateInvitationPassword()) {
      expect(alphabet, `"${ch}" is outside the alphabet`).toContain(ch);
    }
  });

  it("excludes visually ambiguous characters", () => {
    const { alphabet } = invitationGenerationParameters;
    for (const ambiguous of ["0", "O", "1", "l", "I"]) {
      expect(alphabet, `alphabet contains "${ambiguous}"`).not.toContain(ambiguous);
    }
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, generateInviteId));
    expect(ids.size).toBe(500);

    const passwords = new Set(Array.from({ length: 500 }, generateInvitationPassword));
    expect(passwords.size).toBe(500);
  });

  it("normalises display formatting back to the stored value", () => {
    const password = generateInvitationPassword();
    expect(normalisePasswordInput(formatPasswordForDisplay(password))).toBe(password);
    expect(normalisePasswordInput(`  ${password}  `)).toBe(password);
  });

  it("preserves case when normalising, so entropy is not lost", () => {
    expect(normalisePasswordInput("AbCd-EfGh")).toBe("AbCdEfGh");
  });
});

describe("rate limit client identifier", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" });
    expect(clientIdentifier(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientIdentifier(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
    expect(clientIdentifier(new Headers())).toBe("unknown");
  });
});
