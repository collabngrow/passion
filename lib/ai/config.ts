import "server-only";

import { Timestamp, db } from "@/lib/firebase/admin";
import { geminiKeyPools } from "@/lib/env";

/**
 * AI model routing configuration (master_prompt.md §34, §37).
 *
 * The administrator owns the sequence; this module supplies a sensible default
 * and persists overrides to /system/aiConfig.
 *
 * §34 forbids hard-coding obsolete model names, so the defaults below were
 * taken from the live model catalogue rather than assumed. The sequence the
 * specification asks for -- 3.6 Flash, then 3.5 Flash, then 3.5 Lite -- maps
 * onto models that genuinely exist, so it is used verbatim. Newer models
 * (gemini-3.7-flash, for one) can be added through the admin UI without a code
 * change, which is exactly what §34 asks for.
 */

const DOC_PATH = { collection: "system", doc: "aiConfig" } as const;

/**
 * Which pass of the walk a model belongs to.
 *
 * `primary` models are tried first, every one of them on every key, before any
 * `reserve` model is touched. The reserve exists so that exhausting the strong
 * models does not mean the participant gets nothing: a weaker model on a
 * separate daily quota is still a reflection, and every model receives the same
 * system instruction and framework context, so the reserve produces the same
 * kind of reading rather than a degraded one.
 */
export type ModelTier = "primary" | "reserve";

export type ModelEntry = {
  /** Priority order, 1-based, across the whole list. */
  priority: number;
  provider: "gemini";
  /** Exact model id as the provider expects it. */
  model: string;
  enabled: boolean;
  tier: ModelTier;
};

export type AiConfig = {
  models: ModelEntry[];
  /** Key pool ids, in the order they are tried (§35). */
  keyOrder: string[];
  updatedAt?: string;
};

/**
 * Default sequence (§34).
 *
 * Flash-class models throughout: the interpretation task is long-context and
 * runs 13 times per participant, where a Pro model would cost far more for
 * output the quality bar does not require.
 *
 * Two models per key: 3.6 Flash, then 3.5 Flash-Lite, then the next key. Both
 * were verified live against the real prompt (see MEMORY.md, Sprint 18).
 *
 * **No model is in the reserve tier**, so the reserve pass is currently empty
 * and the walk is a single pass. The tier mechanism is still live: promoting a
 * model to reserve in the admin UI makes it run only after every primary is
 * spent on every key. Nothing here needs to change to use it.
 *
 * `gemini-3.7-flash` is deliberately absent. It is in the catalogue and the key
 * accepts it, but every live attempt across all three accounts returned either
 * `503 high demand` or no response at all inside 90 seconds. A model that is
 * first in the walk and unavailable costs each generation a full attempt
 * timeout before anything else is tried -- the participant waits, and the
 * budget that should have paid for a fallback is already spent.
 *
 * If a 3.1 model is ever added, the id is `gemini-3.1-flash-lite`. There is no
 * `gemini-3.1-flash` in the live catalogue -- only the lite, pro-preview and
 * image/tts/live variants -- and naming a model that does not exist costs a 404
 * round-trip on every key, on every call, forever, because `classifyFailure`
 * correctly reads 404 as "try the next candidate" rather than as a
 * configuration error.
 */
export const DEFAULT_MODELS: ModelEntry[] = [
  { priority: 1, provider: "gemini", model: "gemini-3.6-flash", enabled: true, tier: "primary" },
  { priority: 2, provider: "gemini", model: "gemini-3.5-flash-lite", enabled: true, tier: "primary" },
];

export function defaultConfig(): AiConfig {
  return {
    models: DEFAULT_MODELS.map((entry) => ({ ...entry })),
    keyOrder: availableKeyIds(),
  };
}

/** Key pool ids that actually have a key set. Never the keys themselves. */
export function availableKeyIds(): string[] {
  try {
    return geminiKeyPools().map((pool) => pool.id);
  } catch {
    return [];
  }
}

function isModelEntry(value: unknown): value is Omit<ModelEntry, "tier"> {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.model === "string" &&
    entry.model.trim().length > 0 &&
    typeof entry.enabled === "boolean" &&
    typeof entry.priority === "number"
  );
}

/**
 * A stored entry written before tiers existed has no `tier`, and must not be
 * dropped for it -- silently discarding a configured model is how the engine
 * ends up running on fewer candidates than the administrator can see.
 * "primary" is the safe reading: it preserves the old single-pass behaviour.
 */
export function normaliseTier(value: unknown): ModelTier {
  return value === "reserve" ? "reserve" : "primary";
}

/** Loads the configuration, falling back to the default. */
export async function loadAiConfig(): Promise<AiConfig> {
  try {
    const snapshot = await db()
      .collection(DOC_PATH.collection)
      .doc(DOC_PATH.doc)
      .get();

    if (!snapshot.exists) return defaultConfig();

    const data = snapshot.data() as Partial<AiConfig> & { updatedAt?: Timestamp };
    const models: ModelEntry[] = (Array.isArray(data.models) ? data.models : [])
      .filter(isModelEntry)
      .map((entry) => ({
        ...entry,
        tier: normaliseTier((entry as { tier?: unknown }).tier),
      }));

    // A stored configuration with nothing usable in it must not silently
    // disable the whole interpretation engine.
    if (models.length === 0) return defaultConfig();

    const available = availableKeyIds();
    const keyOrder =
      Array.isArray(data.keyOrder) && data.keyOrder.length > 0
        ? data.keyOrder.filter((id) => available.includes(id))
        : available;

    return {
      models: [...models].sort((a, b) => a.priority - b.priority),
      keyOrder: keyOrder.length > 0 ? keyOrder : available,
      updatedAt: data.updatedAt?.toDate().toISOString(),
    };
  } catch {
    // Configuration being unreadable must not take the engine down.
    console.warn("ai config: falling back to defaults");
    return defaultConfig();
  }
}

export async function saveAiConfig(config: {
  models: ModelEntry[];
  keyOrder: string[];
}): Promise<void> {
  await db()
    .collection(DOC_PATH.collection)
    .doc(DOC_PATH.doc)
    .set(
      {
        models: config.models
          .filter(isModelEntry)
          .map((entry, index) => ({
            ...entry,
            priority: index + 1,
            tier: normaliseTier((entry as { tier?: unknown }).tier),
          })),
        keyOrder: config.keyOrder,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
}

/** Masked key representation for the admin UI (§37). Never the key itself. */
export function maskedKeys(): { id: string; masked: string }[] {
  try {
    return geminiKeyPools().map((pool) => ({
      id: pool.id,
      masked: `••••••••${pool.apiKey.slice(-4)}`,
    }));
  } catch {
    return [];
  }
}
