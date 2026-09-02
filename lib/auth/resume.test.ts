import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, Timestamp } from "@/test/stubs/firestore";
import type { VerifiedUser } from "./verify";

/**
 * Where a returning visitor is sent from the landing page (§18, §47).
 *
 * The PWA opens at "/", so this decides whether someone gets back into their
 * reflection at all. What matters here is the shape of the answer: it is
 * derived from the verified uid alone, it never names an invitation belonging
 * to anybody else, and a paused invitation is reported rather than silently
 * treated as "we don't know you".
 */

const store = new FakeFirestore();

vi.mock("@/lib/firebase/admin", async () => {
  const stubs = await import("@/test/stubs/firestore");
  return {
    db: () => store,
    Timestamp: stubs.Timestamp,
    FieldValue: stubs.FieldValue,
  };
});

const { resolveResume } = await import("./resume");

/** test/setup.ts sets ADMIN_EMAIL=admin@example.test. */
const ADMIN = "admin@example.test";

function user(overrides: Partial<VerifiedUser> = {}): VerifiedUser {
  return {
    uid: "uid-alice",
    email: "alice@example.test",
    emailVerified: true,
    authTime: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function seed(inviteId: string, data: Record<string, unknown>): void {
  store.seed(`invitations/${inviteId}`, {
    inviteId,
    status: "active",
    passwordHash: "hash-placeholder",
    encryptedPassword: "cipher-placeholder",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...data,
  });
}

beforeEach(() => {
  for (const path of store.paths()) store.remove(path);
});

describe("the administrator", () => {
  it("goes to the dashboard", async () => {
    await expect(resolveResume(user({ email: ADMIN }))).resolves.toEqual({
      status: "admin",
      destination: "/admin",
    });
  });

  it("is decided before any invitation lookup, so the address wins over a binding", async () => {
    // The administrator may also hold an invitation of their own. The dashboard
    // is the more useful destination, and it must not depend on lookup order.
    seed("inv-admin-01", { boundUid: "uid-alice" });

    await expect(resolveResume(user({ email: ADMIN }))).resolves.toMatchObject({
      status: "admin",
    });
  });

  it("is refused on an unverified address, and falls through as an ordinary visitor", async () => {
    // Matches requireAdmin: an account claiming the admin address at a provider
    // that does not verify it is not the administrator (§21).
    await expect(
      resolveResume(user({ email: ADMIN, emailVerified: false })),
    ).resolves.toEqual({ status: "unknown" });
  });
});

describe("a participant", () => {
  it("goes to their own invitation, which decides the rest of the way in", async () => {
    seed("inv-alice-01", { boundUid: "uid-alice" });

    await expect(resolveResume(user())).resolves.toEqual({
      status: "found",
      destination: "/invite/inv-alice-01",
    });
  });

  it("is unknown when no invitation is bound to them", async () => {
    seed("inv-bob-01", { boundUid: "uid-bob" });

    await expect(resolveResume(user())).resolves.toEqual({ status: "unknown" });
  });

  it("never resolves to somebody else's invitation", async () => {
    // The query filters on boundUid; a stranger signing in must not be handed
    // the first invitation in the collection.
    seed("inv-bob-01", { boundUid: "uid-bob" });
    seed("inv-carol-01", { boundUid: "uid-carol" });

    await expect(resolveResume(user({ uid: "uid-mallory" }))).resolves.toEqual({
      status: "unknown",
    });
  });

  it("is told their invitation is paused rather than that they are unknown (§31)", async () => {
    seed("inv-alice-01", { boundUid: "uid-alice", status: "disabled" });

    await expect(resolveResume(user())).resolves.toEqual({ status: "unavailable" });
  });

  it("is unknown when signed in but no invitation has ever been bound", async () => {
    seed("inv-unclaimed", {});

    await expect(resolveResume(user())).resolves.toEqual({ status: "unknown" });
  });
});
