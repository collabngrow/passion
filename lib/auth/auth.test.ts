import { describe, expect, it, vi } from "vitest";

import {
  ApiError,
  badRequest,
  genericAuthFailure,
  notAuthorised,
  rateLimited,
  withErrorHandling,
} from "@/lib/http";
import {
  FRESH_AUTH_MAX_AGE_SECONDS,
  isAdminEmail,
  requireFreshAuth,
  type VerifiedUser,
} from "./verify";

function user(overrides: Partial<VerifiedUser> = {}): VerifiedUser {
  return {
    uid: "uid-1",
    email: "someone@example.test",
    emailVerified: true,
    authTime: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe("admin identity (§21)", () => {
  it("recognises only the configured administrator", () => {
    // test/setup.ts sets ADMIN_EMAIL=admin@example.test
    expect(isAdminEmail("admin@example.test")).toBe(true);
    expect(isAdminEmail("ADMIN@EXAMPLE.TEST")).toBe(true);
    expect(isAdminEmail("someone@example.test")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("does not match on a lookalike address", () => {
    expect(isAdminEmail("admin@example.test.evil.com")).toBe(false);
    expect(isAdminEmail("xadmin@example.test")).toBe(false);
    expect(isAdminEmail(" admin@example.test")).toBe(false);
  });
});

describe("fresh authentication (§25, §26)", () => {
  it("accepts a recent authentication", () => {
    expect(() => requireFreshAuth(user())).not.toThrow();
  });

  it("accepts one just inside the window", () => {
    const authTime = Math.floor(Date.now() / 1000) - (FRESH_AUTH_MAX_AGE_SECONDS - 5);
    expect(() => requireFreshAuth(user({ authTime }))).not.toThrow();
  });

  it("rejects a stale authentication", () => {
    const authTime = Math.floor(Date.now() / 1000) - (FRESH_AUTH_MAX_AGE_SECONDS + 60);
    expect(() => requireFreshAuth(user({ authTime }))).toThrow(ApiError);

    try {
      requireFreshAuth(user({ authTime }));
    } catch (error) {
      expect((error as ApiError).code).toBe("reauthentication_required");
      expect((error as ApiError).status).toBe(401);
    }
  });

  /**
   * A token without auth_time must not be treated as freshly authenticated;
   * that would make the reveal gate bypassable by a malformed token.
   */
  it("rejects a token with no auth_time", () => {
    expect(() => requireFreshAuth(user({ authTime: 0 }))).toThrow(ApiError);
  });

  it("honours a custom window", () => {
    const authTime = Math.floor(Date.now() / 1000) - 30;
    expect(() => requireFreshAuth(user({ authTime }), 60)).not.toThrow();
    expect(() => requireFreshAuth(user({ authTime }), 10)).toThrow(ApiError);
  });
});

describe("error mapping (§74, §54)", () => {
  it("gives the same message for every authentication failure", () => {
    // §54: never disclose whether an invitation exists or a password was close.
    const first = genericAuthFailure();
    const second = genericAuthFailure();
    expect(first.publicMessage).toBe(second.publicMessage);
    expect(first.status).toBe(401);
    expect(first.publicMessage).not.toMatch(/password|invitation|exist|found/i);
  });

  it("keeps public messages human and non-technical", () => {
    for (const error of [
      genericAuthFailure(),
      notAuthorised(),
      rateLimited(120),
      badRequest(),
    ]) {
      expect(error.publicMessage).not.toMatch(
        /firebase|firestore|gemini|stack|undefined|null|Error:/i,
      );
      expect(error.publicMessage.length).toBeGreaterThan(10);
    }
  });

  it("does not leak the retry delay into the user-facing message", () => {
    const error = rateLimited(3600);
    expect(error.publicMessage).not.toContain("3600");
    expect(error.message).toContain("3600");
  });
});

describe("route error handling (§74)", () => {
  it("passes a successful response through", async () => {
    const handler = withErrorHandling("test", async () =>
      Response.json({ ok: true }) as never,
    );
    const response = await handler();
    expect(response.status).toBe(200);
  });

  it("returns the chosen message for a handled error", async () => {
    const handler = withErrorHandling("test", async () => {
      throw new ApiError(403, "You don't have access to this.", "forbidden");
    });

    const response = await handler();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You don't have access to this.",
      code: "forbidden",
    });
  });

  /**
   * The important one: an unexpected throw must never reach the client
   * verbatim, because nobody wrote a safe message for it.
   */
  it("never leaks an unexpected error to the client", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = withErrorHandling("test", async () => {
      throw new Error("FirebaseError: permission-denied on /invitations/7Hf92kLm");
    });

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("We couldn't complete that request. Please try again.");
    expect(JSON.stringify(body)).not.toMatch(/Firebase|permission-denied|7Hf92kLm/);

    consoleError.mockRestore();
  });

  it("marks error responses uncacheable", async () => {
    const handler = withErrorHandling("test", async () => {
      throw notAuthorised();
    });
    const response = await handler();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
