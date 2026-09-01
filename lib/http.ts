import "server-only";

import { NextResponse } from "next/server";

/**
 * API responses and error mapping.
 *
 * master_prompt.md §74 and brand §20: users never see raw Firebase, Firestore,
 * Gemini or stack-trace detail. Every failure leaves the server as a short
 * human sentence, while the operational detail goes to the server log.
 *
 * §52: logs carry safe operational information only -- never passwords, hashes,
 * keys, tokens, or participant answers.
 */

export class ApiError extends Error {
  readonly status: number;
  /** Shown to the user. Must be human, non-technical and actionable. */
  readonly publicMessage: string;
  /** Machine-readable discriminator for the client, never a stack trace. */
  readonly code: string;

  constructor(
    status: number,
    publicMessage: string,
    code = "error",
    internalMessage?: string,
  ) {
    super(internalMessage ?? publicMessage);
    this.name = "ApiError";
    this.status = status;
    this.publicMessage = publicMessage;
    this.code = code;
  }
}

/**
 * Deliberately uniform authentication failure (§54).
 *
 * Used for a wrong password, an unknown invitation and a disabled invitation
 * alike, so responses never disclose whether an invitation exists or whether a
 * password was close.
 */
export function genericAuthFailure(): ApiError {
  return new ApiError(
    401,
    "We couldn't verify that. Please check your details and try again.",
    "unauthenticated",
  );
}

export function notAuthorised(): ApiError {
  return new ApiError(403, "You don't have access to this.", "forbidden");
}

export function rateLimited(retryAfterSeconds: number): ApiError {
  return new ApiError(
    429,
    "Too many attempts. Please wait a few minutes and try again.",
    "rate_limited",
    `retry after ${retryAfterSeconds}s`,
  );
}

export function badRequest(publicMessage = "That request wasn't valid."): ApiError {
  return new ApiError(400, publicMessage, "bad_request");
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, { status: 200, ...init });
}

function jsonError(error: ApiError): NextResponse {
  const response = NextResponse.json(
    { error: error.publicMessage, code: error.code },
    { status: error.status },
  );
  // Invitation and admin surfaces are private; never let a proxy cache them.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Wraps a route handler so no unexpected failure reaches the client verbatim.
 *
 * An ApiError carries a message chosen for the user. Anything else is logged as
 * an operational detail and answered with a generic sentence, because an
 * unhandled error is by definition one nobody wrote a safe message for.
 */
export function withErrorHandling<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status >= 500) {
          console.error(`${routeName}: ${error.message}`);
        }
        return jsonError(error);
      }

      // Log the type and message, never the payload that produced it (§52).
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
      console.error(`${routeName}: unhandled ${detail}`);

      return jsonError(
        new ApiError(
          500,
          "We couldn't complete that request. Please try again.",
          "internal",
        ),
      );
    }
  };
}

/** Parses a JSON body, mapping malformed input to a handled error. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest();
  }
}
