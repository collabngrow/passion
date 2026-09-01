import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, Timestamp } from "@/test/stubs/firestore";

/**
 * Rate limiting (master_prompt.md §53, §54).
 *
 * The window arithmetic is the part of this module with real logic in it, and
 * until now the only thing tested here was the header helper. Two of the claims
 * its comments make are load-bearing and had nothing holding them up: that a
 * rejected attempt does not push its own window further away, and that the
 * limiter fails **open** when Firestore is unavailable.
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

const {
  ADMIN_SENSITIVE_POLICY,
  AI_GENERATION_POLICY,
  PASSWORD_ATTEMPT_POLICY,
  clientIdentifier,
  consumeAttempt,
  resetAttempts,
} = await import("./rate-limit");

/** Small policy, so a test can exhaust it without twelve calls. */
const POLICY = { limit: 3, windowSeconds: 60 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("policies (§53)", () => {
  it("is forgiving of a human mistyping a long password", () => {
    // §53 is explicit that a participant must not be locked out by mistyping.
    // Ten attempts in a self-healing 15-minute window is the shape of that
    // promise; a lockout needing administrator intervention would break it.
    expect(PASSWORD_ATTEMPT_POLICY.limit).toBeGreaterThanOrEqual(5);
    expect(PASSWORD_ATTEMPT_POLICY.windowSeconds).toBeLessThanOrEqual(30 * 60);
  });

  it("bounds AI generation over a longer window than password entry (§92)", () => {
    expect(AI_GENERATION_POLICY.windowSeconds).toBeGreaterThan(
      PASSWORD_ATTEMPT_POLICY.windowSeconds,
    );
    expect(ADMIN_SENSITIVE_POLICY.limit).toBeGreaterThan(0);
  });
});

describe("consuming a window", () => {
  it("allows up to the limit and then refuses", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await consumeAttempt("test", "caller-a", POLICY));
    }

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
  });

  it("counts each identifier separately", async () => {
    for (let i = 0; i < 3; i += 1) await consumeAttempt("test", "caller-b", POLICY);

    const other = await consumeAttempt("test", "caller-c", POLICY);
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(2);
  });

  it("counts each scope separately, so one endpoint cannot exhaust another", async () => {
    for (let i = 0; i < 3; i += 1) await consumeAttempt("scope-1", "caller-d", POLICY);

    expect((await consumeAttempt("scope-2", "caller-d", POLICY)).allowed).toBe(true);
  });

  it("heals on its own once the window passes", async () => {
    for (let i = 0; i < 4; i += 1) await consumeAttempt("test", "caller-e", POLICY);

    vi.advanceTimersByTime(POLICY.windowSeconds * 1000);

    const after = await consumeAttempt("test", "caller-e", POLICY);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(2);
  });

  it("does not heal one second early", async () => {
    for (let i = 0; i < 4; i += 1) await consumeAttempt("test", "caller-f", POLICY);

    vi.advanceTimersByTime(POLICY.windowSeconds * 1000 - 1000);

    expect((await consumeAttempt("test", "caller-f", POLICY)).allowed).toBe(false);
  });

  it("does not extend its own window when it refuses", async () => {
    for (let i = 0; i < 3; i += 1) await consumeAttempt("test", "caller-g", POLICY);

    const first = await consumeAttempt("test", "caller-g", POLICY);

    // Someone hammering the endpoint through the window, hoping each rejected
    // attempt resets the clock. It must not: the reset stays where the first
    // allowed attempt put it, and the wait only ever gets shorter.
    vi.advanceTimersByTime(30 * 1000);
    const later = await consumeAttempt("test", "caller-g", POLICY);

    expect(later.allowed).toBe(false);
    expect(later.resetAt.getTime()).toBe(first.resetAt.getTime());
    expect(later.retryAfterSeconds).toBeLessThan(first.retryAfterSeconds);
  });

  it("reports a retry delay of at least a second, never zero", async () => {
    for (let i = 0; i < 3; i += 1) await consumeAttempt("test", "caller-h", POLICY);

    vi.advanceTimersByTime(POLICY.windowSeconds * 1000 - 1);
    const blocked = await consumeAttempt("test", "caller-h", POLICY);

    // "Try again in 0 seconds" would send a client into a tight retry loop.
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("resetting after a success", () => {
  it("clears the counter, so a near-miss does not follow someone to their next visit", async () => {
    for (let i = 0; i < 3; i += 1) await consumeAttempt("test", "caller-i", POLICY);

    await resetAttempts("test", "caller-i");

    const after = await consumeAttempt("test", "caller-i", POLICY);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(2);
  });

  it("is silent about an identifier that was never counted", async () => {
    await expect(resetAttempts("test", "never-seen")).resolves.toBeUndefined();
  });
});

describe("data minimisation (§12, §52)", () => {
  it("never writes the raw identifier into the document path", async () => {
    const identifier = "203.0.113.7";
    await consumeAttempt("password", identifier, POLICY);

    const written = store
      .paths()
      .filter((path) => path.startsWith("rateLimits/"));

    expect(written.length).toBeGreaterThan(0);
    expect(written.some((path) => path.includes(identifier))).toBe(false);
  });
});

describe("failing open (§53)", () => {
  it("allows the request when Firestore cannot be reached", async () => {
    // The limiter is a second line of defence behind a ~116-bit password.
    // Taking the product down because a counter could not be written would
    // punish participants for an infrastructure fault, and the password check
    // itself never degrades.
    const broken = vi
      .spyOn(store, "runTransaction")
      .mockRejectedValue(new Error("UNAVAILABLE"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await consumeAttempt("test", "caller-j", POLICY);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(POLICY.limit);
    broken.mockRestore();

    // And the log recording it must not carry the identifier (§52).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain("caller-j");
  });
});

describe("client identifier", () => {
  it("prefers the first x-forwarded-for entry, then x-real-ip, then a constant", () => {
    expect(clientIdentifier(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe(
      "1.1.1.1",
    );
    expect(clientIdentifier(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIdentifier(new Headers())).toBe("unknown");
  });
});

describe("the stubbed Timestamp behaves like the real one", () => {
  it("round-trips millis, which the window arithmetic depends on", () => {
    const stamp = Timestamp.fromMillis(1_700_000_000_000);
    expect(stamp.toMillis()).toBe(1_700_000_000_000);
    expect(stamp).toBeInstanceOf(Timestamp);
  });
});
