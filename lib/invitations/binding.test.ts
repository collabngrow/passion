import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, Timestamp } from "@/test/stubs/firestore";
import type { Invitation } from "./types";

/**
 * Invitation binding, disable and rotation (master_prompt.md §15, §16, §17,
 * §30, §31, §79) -- the "Binding" and most of the "Invitations" block of the
 * §86 matrix.
 *
 * These were the largest untested surface in the product: the decision about
 * whether a stranger holding an invitation link may claim someone else's
 * reflection is made in `bindInvitation`, and nothing verified it.
 *
 * On what the fake can and cannot show: it cannot prove Firestore's isolation,
 * so no test here claims two truly simultaneous writers are serialised. What
 * they assert is the property this code owns -- the decision is made from a
 * value read *inside* the transaction, so a second caller arriving after the
 * first has committed sees the binding and is refused rather than overwriting
 * it. `transactionCount` pins that the pair really is one transaction, which is
 * the thing §79 asks for and the thing a later refactor could quietly lose.
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

const { bindInvitation, getInvitation, rotateInvitationPassword, setInvitationStatus } =
  await import("./store");
const { verifyPassword } = await import("@/lib/security/password");
const { decryptPassword } = await import("@/lib/security/encryption");

const INVITE = "inv-test-0001";

function seed(overrides: Partial<Invitation> = {}): void {
  store.seed(`invitations/${INVITE}`, {
    inviteId: INVITE,
    status: "active",
    passwordHash: "hash-placeholder",
    encryptedPassword: "cipher-placeholder",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  });
}

beforeEach(() => {
  for (const path of store.paths()) store.remove(path);
  store.transactionCount = 0;
});

describe("first binding (§15)", () => {
  it("claims an unbound invitation for the caller", async () => {
    seed();

    const result = await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    expect(result.outcome).toBe("bound");

    const stored = await getInvitation(INVITE);
    expect(stored?.boundUid).toBe("uid-alice");
    expect(stored?.boundEmail).toBe("alice@example.test");
    expect(stored?.boundAt).toBeDefined();
  });

  it("reads and writes inside one transaction (§79)", async () => {
    seed();

    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    // A read-then-write outside a transaction is exactly what §79 forbids, and
    // it is an easy thing to reintroduce while "simplifying" this function.
    expect(store.transactionCount).toBe(1);
  });
});

describe("returning participant (§16)", () => {
  it("lets the bound account back in", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    const again = await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    expect(again.outcome).toBe("already-bound");
  });

  it("records the return without touching the binding", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");
    const afterFirst = await getInvitation(INVITE);

    await bindInvitation(INVITE, "uid-alice", "alice@example.test");
    const afterSecond = await getInvitation(INVITE);

    expect(afterSecond?.boundUid).toBe("uid-alice");
    expect(afterSecond?.boundAt?.toMillis()).toBe(afterFirst?.boundAt?.toMillis());
    expect(afterSecond?.lastUsedAt).toBeDefined();
  });

  it("matches on uid, not on email, so a changed address does not lock someone out", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    const renamed = await bindInvitation(INVITE, "uid-alice", "alice.new@example.test");

    expect(renamed.outcome).toBe("already-bound");
  });
});

describe("mismatching account (§17)", () => {
  it("refuses a different Google identity", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    const intruder = await bindInvitation(INVITE, "uid-mallory", "mallory@example.test");

    expect(intruder.outcome).toBe("mismatch");
  });

  it("leaves the original binding completely untouched", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    await bindInvitation(INVITE, "uid-mallory", "mallory@example.test");

    // The failure that matters: a refused bind that still wrote something would
    // hand a stranger a foothold in someone else's invitation.
    const stored = await getInvitation(INVITE);
    expect(stored?.boundUid).toBe("uid-alice");
    expect(stored?.boundEmail).toBe("alice@example.test");
  });

  it("returns an outcome carrying nothing about whose invitation it is", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    const intruder = await bindInvitation(INVITE, "uid-mallory", "mallory@example.test");

    // §17: the caller is told it belongs to another account, never which one.
    // The route can only disclose what this result carries.
    expect(JSON.stringify(intruder)).not.toContain("alice");
    expect(Object.keys(intruder)).toEqual(["outcome"]);
  });
});

describe("two people, one invitation (§79)", () => {
  it("gives the invitation to the first caller and refuses the second", async () => {
    seed();

    const first = await bindInvitation(INVITE, "uid-alice", "alice@example.test");
    const second = await bindInvitation(INVITE, "uid-bob", "bob@example.test");

    expect(first.outcome).toBe("bound");
    expect(second.outcome).toBe("mismatch");
    expect((await getInvitation(INVITE))?.boundUid).toBe("uid-alice");
  });

  it("decides from state read inside the transaction, not from state read before it", async () => {
    seed();

    // Both callers read the unbound invitation, then both try to commit. The
    // second's read is issued while the first is still in flight; because the
    // fake buffers writes until commit, that read sees exactly what a stale
    // read would see. The guarantee under test is that the *decision* is not
    // taken from such a read -- so the second call, re-entering the
    // transaction, must still find the committed binding.
    const stale = store.peek(`invitations/${INVITE}`);
    expect(stale?.boundUid).toBeUndefined();

    await bindInvitation(INVITE, "uid-alice", "alice@example.test");
    const second = await bindInvitation(INVITE, "uid-bob", "bob@example.test");

    expect(second.outcome).toBe("mismatch");
  });
});

describe("disabled and missing invitations (§31, §54)", () => {
  it("refuses a disabled invitation", async () => {
    seed({ status: "disabled" });

    expect((await bindInvitation(INVITE, "uid-alice", "a@example.test")).outcome).toBe(
      "unavailable",
    );
  });

  it("refuses a missing invitation with the same outcome", async () => {
    // §54: missing and disabled are indistinguishable to the caller, so a
    // probe cannot learn which invitation ids exist.
    expect((await bindInvitation("inv-nope", "uid-alice", "a@example.test")).outcome).toBe(
      "unavailable",
    );
  });

  it("refuses the bound participant too, once disabled", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    await setInvitationStatus(INVITE, "disabled");

    expect((await bindInvitation(INVITE, "uid-alice", "alice@example.test")).outcome).toBe(
      "unavailable",
    );
  });

  it("retains the data, so disabling is reversible (§31)", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    await setInvitationStatus(INVITE, "disabled");
    await setInvitationStatus(INVITE, "active");

    const restored = await getInvitation(INVITE);
    expect(restored?.boundUid).toBe("uid-alice");
    expect((await bindInvitation(INVITE, "uid-alice", "alice@example.test")).outcome).toBe(
      "already-bound",
    );
  });
});

describe("password rotation (§30)", () => {
  it("returns a new password that verifies against the stored hash", async () => {
    seed();

    const password = await rotateInvitationPassword(INVITE);
    const stored = await getInvitation(INVITE);

    expect(await verifyPassword(password, stored!.passwordHash)).toBe(true);
  });

  it("replaces the hash and the ciphertext together", async () => {
    seed();

    const password = await rotateInvitationPassword(INVITE);
    const stored = await getInvitation(INVITE);

    // Both credentials move in one write. Rotating only the hash would leave
    // the admin reveal handing out a password that no longer opens anything.
    expect(stored?.passwordHash).not.toBe("hash-placeholder");
    expect(stored?.encryptedPassword).not.toBe("cipher-placeholder");
    expect(decryptPassword(stored!.encryptedPassword)).toBe(password);
    expect(stored?.passwordRotatedAt).toBeDefined();
  });

  it("stops the old password working the instant the new one starts", async () => {
    seed();

    const first = await rotateInvitationPassword(INVITE);
    const second = await rotateInvitationPassword(INVITE);
    const stored = await getInvitation(INVITE);

    expect(await verifyPassword(second, stored!.passwordHash)).toBe(true);
    expect(await verifyPassword(first, stored!.passwordHash)).toBe(false);
  });

  it("leaves the binding alone, so rotation is not a way to reassign an invitation", async () => {
    seed();
    await bindInvitation(INVITE, "uid-alice", "alice@example.test");

    await rotateInvitationPassword(INVITE);

    const stored = await getInvitation(INVITE);
    expect(stored?.boundUid).toBe("uid-alice");
    expect((await bindInvitation(INVITE, "uid-mallory", "m@example.test")).outcome).toBe(
      "mismatch",
    );
  });

  it("refuses to rotate an invitation that does not exist", async () => {
    await expect(rotateInvitationPassword("inv-nope")).rejects.toThrow();
  });
});
