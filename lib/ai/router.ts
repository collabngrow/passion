import "server-only";

import { GoogleGenAI } from "@google/genai";

import { geminiKeyPools } from "@/lib/env";

import { loadAiConfig, type ModelEntry } from "./config";

/**
 * The model router (master_prompt.md §32, §34, §35, §36).
 *
 * Walks (key pool × model) candidates in configured order. §35 fixes the shape:
 * exhaust every configured model on key 1, then move to key 2, then key 3.
 *
 * §36 is the important constraint. Not every failure deserves a fallback:
 * retrying a malformed request against nine candidates burns quota to produce
 * nine identical failures, and masks a bug behind an outage. So failures are
 * classified, and only genuinely transient or capacity-related ones advance.
 */

export type GenerationRequest = {
  systemInstruction: string;
  prompt: string;
  /** JSON schema for structured output (§38N). */
  responseSchema?: object;
  maxOutputTokens?: number;
  temperature?: number;
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

export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** Hard ceiling regardless of configuration size (§36: no infinite retries). */
const MAX_ATTEMPTS = 12;

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

/** Candidate list: every enabled model on key 1, then on key 2, then key 3 (§35). */
function buildCandidates(
  models: ModelEntry[],
  keyOrder: string[],
  pools: { id: string; apiKey: string }[],
): { model: string; keyPoolId: string; apiKey: string }[] {
  const byId = new Map(pools.map((pool) => [pool.id, pool.apiKey]));
  const enabled = models
    .filter((entry) => entry.enabled)
    .sort((a, b) => a.priority - b.priority);

  const candidates: { model: string; keyPoolId: string; apiKey: string }[] = [];

  for (const keyPoolId of keyOrder) {
    const apiKey = byId.get(keyPoolId);
    if (!apiKey) continue;
    for (const entry of enabled) {
      candidates.push({ model: entry.model, keyPoolId, apiKey });
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

  let attempts = 0;
  let lastMessage = "no attempts made";

  for (const candidate of candidates) {
    if (attempts >= MAX_ATTEMPTS) break;
    attempts += 1;

    try {
      const client = new GoogleGenAI({ apiKey: candidate.apiKey });

      const response = await client.models.generateContent({
        model: candidate.model,
        contents: request.prompt,
        config: {
          systemInstruction: request.systemInstruction,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxOutputTokens ?? 2048,
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
        `ai: request failed model=${candidate.model} ` +
          `keyPool=${candidate.keyPoolId} action=${classification}`,
      );

      if (classification === "abort") {
        throw error;
      }
    }
  }

  throw new AllModelsFailedError(attempts, lastMessage);
}
