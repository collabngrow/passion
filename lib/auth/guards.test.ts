import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The authorization guards themselves (master_prompt.md §21, §89, §90).
 *
 * `auth.test.ts` covers the pure helpers around these -- `isAdminEmail`,
 * `requireFreshAuth`, the error mapping. What had no test was the path every
 * privileged route actually calls: token extraction, `verifyIdToken`, and the
 * administrator check. §89 says hiding a button is not access control, which
 * makes this the only thing standing between a stranger and the admin API.
 */

const verifyIdToken = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: () => ({ verifyIdToken }),
}));

const { isAdminEmail, requireAdmin, requireFreshAdmin, requireUser, verifyRequest } =
  await import("./verify");

/** test/setup.ts sets ADMIN_EMAIL=admin@example.test. */
const ADMIN = "admin@example.test";

function request(authorization?: string): Request {
  return new Request("https://example.test/api/admin/overview", {
    headers: authorization ? { authorization } : {},
  });
}

function token(overrides: Record<string, unknown> = {}) {
  return {
    uid: "uid-1",
    email: ADMIN,
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("extracting the bearer token", () => {
  it("reads a well-formed Authorization header", async () => {
    verifyIdToken.mockResolvedValue(token());

    await verifyRequest(request("Bearer abc.def.ghi"));

    expect(verifyIdToken).toHaveBeenCalledWith("abc.def.ghi", true);
  });

  it("accepts the scheme in any case", async () => {
    verifyIdToken.mockResolvedValue(token());

    expect(await verifyRequest(request("bearer abc.def.ghi"))).not.toBeNull();
  });

  it("rejects a missing, schemeless, wrong-scheme or empty header without a lookup", async () => {
    for (const header of [undefined, "abc.def.ghi", "Basic abc", "Bearer ", "Bearer   "]) {
      expect(await verifyRequest(request(header))).toBeNull();
    }

    // Never spend a Firebase round trip on something that cannot be a token.
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

describe("verifying the token", () => {
  it("checks for revocation, so a signed-out account cannot ride an unexpired token", async () => {
    verifyIdToken.mockResolvedValue(token());

    await verifyRequest(request("Bearer t"));

    // The second argument is checkRevoked. Dropping it would silently let a
    // logged-out session keep working until the token expired (§18, §19).
    expect(verifyIdToken).toHaveBeenCalledWith("t", true);
  });

  it("lowercases the email, so the admin comparison cannot be case-dodged", async () => {
    verifyIdToken.mockResolvedValue(token({ email: "Admin@Example.TEST" }));

    const user = await verifyRequest(request("Bearer t"));

    expect(user?.email).toBe(ADMIN);
  });

  it("treats expired, revoked, malformed and forged tokens identically", async () => {
    for (const failure of ["auth/id-token-expired", "auth/id-token-revoked", "boom"]) {
      verifyIdToken.mockRejectedValueOnce(new Error(failure));
      expect(await verifyRequest(request("Bearer t"))).toBeNull();
    }
  });

  it("rejects a verified token carrying no email", async () => {
    // Every authorization decision here is made on the email; a token without
    // one must not arrive as a user with an empty address.
    verifyIdToken.mockResolvedValue(token({ email: undefined }));

    expect(await verifyRequest(request("Bearer t"))).toBeNull();
  });

  it("defaults auth_time to 0 rather than trusting a missing claim", async () => {
    verifyIdToken.mockResolvedValue(token({ auth_time: undefined }));

    const user = await verifyRequest(request("Bearer t"));

    // 0 fails every freshness check, which is the safe direction (§25).
    expect(user?.authTime).toBe(0);
  });
});

describe("requireUser", () => {
  it("returns the verified user", async () => {
    verifyIdToken.mockResolvedValue(token({ email: "someone@example.test" }));

    expect((await requireUser(request("Bearer t"))).uid).toBe("uid-1");
  });

  it("throws a 401 with a human message when there is no valid token", async () => {
    await expect(requireUser(request())).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
      publicMessage: "Please sign in to continue.",
    });
  });
});

describe("requireAdmin (§21)", () => {
  it("admits the configured administrator", async () => {
    verifyIdToken.mockResolvedValue(token());

    expect((await requireAdmin(request("Bearer t"))).email).toBe(ADMIN);
  });

  it("refuses any other signed-in account with 403", async () => {
    verifyIdToken.mockResolvedValue(token({ email: "someone@example.test" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(requireAdmin(request("Bearer t"))).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("refuses an unverified account even when the address matches", async () => {
    // Without this, anyone who can create an account claiming the admin
    // address at a provider that does not verify it becomes an administrator.
    verifyIdToken.mockResolvedValue(token({ email_verified: false }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(requireAdmin(request("Bearer t"))).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a lookalike address", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const email of [
      "admin@example.test.evil.test",
      "xadmin@example.test",
      "admin@example.test ",
    ]) {
      verifyIdToken.mockResolvedValue(token({ email }));
      await expect(requireAdmin(request("Bearer t"))).rejects.toMatchObject({ status: 403 });
      expect(isAdminEmail(email)).toBe(false);
    }
  });

  it("refuses an empty address as unauthenticated, before it can be compared", async () => {
    // An empty email never reaches the admin comparison: verifyRequest rejects
    // it, so this is a 401 rather than a 403. Worth pinning -- an empty string
    // reaching a comparison against a misconfigured ADMIN_EMAIL is the shape
    // of a real authorization bypass.
    verifyIdToken.mockResolvedValue(token({ email: "" }));

    await expect(requireAdmin(request("Bearer t"))).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("logs the denial by uid, never by address (§52)", async () => {
    verifyIdToken.mockResolvedValue(token({ email: "someone@example.test" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(requireAdmin(request("Bearer t"))).rejects.toBeDefined();

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain("uid-1");
    expect(logged).not.toContain("someone@example.test");
  });

  it("never decides from anything the client sent (§90)", async () => {
    verifyIdToken.mockResolvedValue(token({ email: "someone@example.test" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Headers and body claiming to be the administrator, over a valid token
    // for somebody else. The decision comes from the token alone.
    const forged = new Request("https://example.test/api/admin/overview", {
      method: "POST",
      headers: {
        authorization: "Bearer t",
        "x-admin": "true",
        "x-user-email": ADMIN,
      },
      body: JSON.stringify({ email: ADMIN, isAdmin: true, role: "admin" }),
    });

    await expect(requireAdmin(forged)).rejects.toMatchObject({ status: 403 });
  });
});

describe("requireFreshAdmin (§25, §26)", () => {
  it("admits an administrator who reauthenticated just now", async () => {
    verifyIdToken.mockResolvedValue(token());

    await expect(requireFreshAdmin(request("Bearer t"))).resolves.toMatchObject({
      email: ADMIN,
    });
  });

  it("refuses an administrator on a session from this morning", async () => {
    verifyIdToken.mockResolvedValue(
      token({ auth_time: Math.floor(Date.now() / 1000) - 6 * 60 * 60 }),
    );

    await expect(requireFreshAdmin(request("Bearer t"))).rejects.toMatchObject({
      status: 401,
      code: "reauthentication_required",
    });
  });

  it("checks administrator status before freshness", async () => {
    // A non-admin must be told they lack access, not invited to reauthenticate
    // -- the second reads as "try again", which is an invitation to probe.
    verifyIdToken.mockResolvedValue(token({ email: "someone@example.test", auth_time: 0 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(requireFreshAdmin(request("Bearer t"))).rejects.toMatchObject({
      status: 403,
    });
  });
});
