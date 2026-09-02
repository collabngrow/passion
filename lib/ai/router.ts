import "server-only";

import { GoogleGenAI } from "@google/genai";

import { geminiKeyPools } from "@/lib/env";

import { loadAiConfig, type ModelEntry } from "./config";

/**
 * The model router (master_prompt.md §32, §34, §35, §36).
 *
 * Walks (tier × key pool × model) candidates in configured order. §35 fixes the
 * inner shape: exhaust every configured model on key 1, then move to key 2,
 * then key 3.
 *
 * The tier is the outer loop, and it is what keeps a weak model from being
 * reached early. Every `primary` model is tried on every key before any
 * `reserve` model is tried at all -- so a 3.7 that is merely rate-limited on
 * key 1 falls to 3.6 on key 1, not to the reserve. The reserve is only reached
 * when the strong models are exhausted across all three keys, which is the one
 * situation where a weaker reading beats no reading.
 *
 * §36 is the important constraint. Not every failure deserves a fallback:
 * retrying a malformed request against every candidate burns quota to produce
 * identical failures, and masks a bug behind an outage. So failures are
 * classified, and only genuinely transient or capacity-related ones advance.
 */

export type GenerationRequest = {
  systemInstruction: string;
  prompt: string;
  /** JSON schema for structured output (§38N). */
  responseSchema?: object;
  maxOutputTokens?: number;
  temperature?: number;
  /**
   * Cap on the model's internal reasoning tokens.
   *
   * Gemini 3.x charges thinking against the output budget and, left unbounded,
   * spends 40-90 seconds on a task this size -- long enough to exceed a
   * serverless timeout and far too slow for a participant waiting on a screen.
   * A bounded budget measured 18s against 44-94s with no loss of quality on the
   * live smoke test. Note that a budget of 0 is rejected by these models.
   */
  thinkingBudget?: number;
  /**
   * Wall-clock budget for the whole fallback walk, in milliseconds.
   *
   * Vercel kills a function at its `maxDuration` and the caller gets a 504 with
   * no explanation, mid-write. A budget shorter than that cap means the last
   * word is ours instead: the walk stops, the route answers 503 with copy that
   * says the participant's writing is saved, and nothing is half-stored.
   */
  budgetMs?: number;
  /**
   * Cap on any single provider call, in milliseconds.
   *
   * Without it one hung request consumes the whole budget and no fallback
   * candidate is ever reached -- the failure S36 exists to prevent, arriving by
   * way of latency rather than an error code. Leave it unset where a slow
   * response is still a good response and cutting it short would mean the
   * participant gets nothing at all.
   */
  attemptTimeoutMs?: number;
};

export type GenerationSuccess = {
  text: string;
  /** Recorded with the result so the admin can see fallback behaviour (§76). */
  model: string;
  provider: "gemini";
  /** Pool id, never the key (§76: no internal key identifiers to participants). */
  keyPoolId: string;
  attempts: number;
};

export class AllModelsFailedError extends Error {
  readonly attempts: number;
  constructor(attempts: number, lastMessage: string) {
    super(`All configured models failed after ${attempts} attempts: ${lastMessage}`);
    this.name = "AllModelsFailedError";
    this.attempts = attempts;
  }
}

/**
 * The budget ran out before any candidate returned.
 *
 * Distinct from AllModelsFailedError because nothing failed: the provider may
 * still have been working. The routes map both to the same reassurance, but the
 * server log should not claim a model error that did not happen.
 */
export class GenerationTimedOutError extends Error {
  readonly attempts: number;
  readonly elapsedMs: number;
  constructor(attempts: number, elapsedMs: number) {
    super(`Generation budget of ${elapsedMs}ms elapsed after ${attempts} attempt(s).`);
    this.name = "GenerationTimedOutError";
    this.attempts = attempts;
    this.elapsedMs = elapsedMs;
  }
}

export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/**
 * Hard ceiling regardless of configuration size (§36: no infinite retries).
 *
 * This has to be at least the number of candidates the configuration produces,
 * or the tail of the walk is unreachable and nothing says so -- and the tail is
 * precisely the reserve tier, the part that exists for the day the strong
 * models run out. The previous ceiling of 12 would have cut off a 15-candidate
 * walk exactly where it was needed.
 *
 * 15 leaves room for five models across the three keys. `router.test.ts` fails
 * if a configuration outgrows it, so adding models is caught here rather than
 * discovered as a reserve that never fires.
 */
export const MAX_ATTEMPTS = 15;

/**
 * Below this much remaining budget, no further candidate is started.
 *
 * A call begun with two seconds left cannot finish, and its abort would be
 * logged as a model failure that never happened.
 */
const MIN_ATTEMPT_MS = 5_000;

type Classification = "advance" | "abort";

/**
 * Decides whether a failure should move to the next candidate.
 *
 * Advance on: quota, rate limit, model unavailable or not found, provider
 * overload, transient 5xx, timeouts.
 *
 * Abort on: malformed request, authentication or permission failure, safety
 * refusal, and anything unrecognised. Unrecognised defaults to abort
 * deliberately -- an unknown error is more likely a bug in the request than a
 * capacity problem, and §36 warns specifically against blind fallback.
 */
export function classifyFailure(error: unknown): Classification {
  const status = extractStatus(error);

  if (status !== null) {
    if (status === 429) return "advance"; // quota / rate limit
    if (status === 404) return "advance"; // model not available on this key
    if (status === 500 || status === 502 || status === 503 || status === 504) {
      return "advance";
    }
    if (status === 400 || status === 401 || status === 403) return "abort";
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  const transient = [
    "resource_exhausted",
    "quota",
    "rate limit",
    "ratelimit",
    "unavailable",
    "overloaded",
    "try again later",
    "deadline_exceeded",
    "timeout",
    "etimedout",
    "econnreset",
    "socket hang up",
    "aborted",
    "not found",
    "is not supported",
  ];
  if (transient.some((needle) => message.includes(needle))) return "advance";

  const fatal = [
    "invalid_argument",
    "permission_denied",
    "unauthenticated",
    "api key not valid",
    "api_key_invalid",
    "safety",
    "blocked",
  ];
  if (fatal.some((needle) => message.includes(needle))) return "abort";

  return "abort";
}

function extractStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as Record<string, unknown>;

  for (const key of ["status", "code", "statusCode"]) {
    const value = candidate[key];
    if (typeof value === "number" && value >= 100 && value < 600) return value;
  }

  const nested = candidate.error;
  if (typeof nested === "object" && nested !== null) {
    const code = (nested as Record<string, unknown>).code;
    if (typeof code === "number" && code >= 100 && code < 600) return code;
  }

  // The SDK often surfaces the status only in the message text.
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/\[(\d{3})[^\]]*\]|"code"\s*:\s*(\d{3})|\b(429|404|503|500)\b/);
  if (match) {
    const found = match[1] ?? match[2] ?? match[3];
    if (found) return Number(found);
  }

  return null;
}

export type Candidate = {
  model: string;
  keyPoolId: string;
  apiKey: string;
  tier: ModelEntry["tier"];
};

/**
 * Candidate list: every enabled primary model on key 1, then on key 2, then key
 * 3 (§35) -- and only once all of those are spent, the same walk over the
 * reserve models.
 *
 * Exported for the test, because the ordering *is* the feature. A regression
 * here does not throw or fail a build; it quietly starts serving a weaker model
 * to participants whose stronger models were merely busy for a moment.
 */
export function buildCandidates(
  models: ModelEntry[],
  keyOrder: string[],
  pools: { id: string; apiKey: string }[],
): Candidate[] {
  const byId = new Map(pools.map((pool) => [pool.id, pool.apiKey]));
  const enabled = models
    .filter((entry) => entry.enabled)
    .sort((a, b) => a.priority - b.priority);

  const candidates: Candidate[] = [];

  // Tier is the outer loop: the whole primary pass, across every key, before
  // the reserve pass begins.
  for (const tier of ["primary", "reserve"] as const) {
    const inTier = enabled.filter((entry) => entry.tier === tier);
    if (inTier.length === 0) continue;

    for (const keyPoolId of keyOrder) {
      const apiKey = byId.get(keyPoolId);
      if (!apiKey) continue;
      for (const entry of inTier) {
        candidates.push({ model: entry.model, keyPoolId, apiKey, tier });
      }
    }
  }

  return candidates;
}

/**
 * Generates content, falling back across models and keys.
 *
 * Never logs the prompt or the participant's text (§52) -- only the model, the
 * pool id and the failure class.
 */
export async function generate(
  request: GenerationRequest,
): Promise<GenerationSuccess> {
  const config = await loadAiConfig();

  let pools: { id: string; apiKey: string }[];
  try {
    pools = geminiKeyPools();
  } catch (error) {
    throw new AiNotConfiguredError(
      error instanceof Error ? error.message : "No Gemini API key configured.",
    );
  }

  const candidates = buildCandidates(config.models, config.keyOrder, pools);
  if (candidates.length === 0) {
    throw new AiNotConfiguredError(
      "No enabled model is paired with an available Gemini API key. " +
        "Check the AI configuration in the admin dashboard.",
    );
  }

  const startedAt = Date.now();
  const deadline =
    request.budgetMs === undefined ? null : startedAt + request.budgetMs;

  let attempts = 0;
  let lastMessage = "no attempts made";

  for (const candidate of candidates) {
    if (attempts >= MAX_ATTEMPTS) break;

    // Checked before the attempt, not after: the point is to stop starting work
    // that cannot finish inside the function's own lifetime.
    const remainingMs = deadline === null ? null : deadline - Date.now();
    if (remainingMs !== null && remainingMs < MIN_ATTEMPT_MS) {
      throw new GenerationTimedOutError(attempts, Date.now() - startedAt);
    }

    attempts += 1;

    // Whichever is tighter: what is left of the budget, or the per-call cap.
    const attemptMs = Math.min(
      request.attemptTimeoutMs ?? Number.POSITIVE_INFINITY,
      remainingMs ?? Number.POSITIVE_INFINITY,
    );
    const abortSignal = Number.isFinite(attemptMs)
      ? AbortSignal.timeout(attemptMs)
      : undefined;

    try {
      const client = new GoogleGenAI({ apiKey: candidate.apiKey });

      const response = await client.models.generateContent({
        model: candidate.model,
        contents: request.prompt,
        config: {
          ...(abortSignal ? { abortSignal } : {}),
          systemInstruction: request.systemInstruction,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxOutputTokens ?? 4096,
          ...(request.thinkingBudget
            ? { thinkingConfig: { thinkingBudget: request.thinkingBudget } }
            : {}),
          ...(request.responseSchema
            ? {
                responseMimeType: "application/json",
                responseSchema: request.responseSchema,
              }
            : {}),
        },
      });

      const text = response.text;
      if (typeof text !== "string" || text.trim().length === 0) {
        // An empty completion is a capacity or filtering artefact rather than a
        // request defect, so it is worth trying the next candidate.
        throw new Error("unavailable: model returned no content");
      }

      return {
        text,
        model: candidate.model,
        provider: "gemini",
        keyPoolId: candidate.keyPoolId,
        attempts,
      };
    } catch (error) {
      const classification = classifyFailure(error);
      lastMessage = error instanceof Error ? error.message : "unknown error";

      console.warn(
        `ai: request failed model=${candidate.model} tier=${candidate.tier} ` +
          `keyPool=${candidate.keyPoolId} action=${classification}`,
      );

      if (classification === "abort") {
        throw error;
      }
    }
  }

  // Ran out of candidates rather than out of time, so the budget -- if there was
  // one -- is not what stopped this.
  throw new AllModelsFailedError(attempts, lastMessage);
}
