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

export type ModelEntry = {
  /** Priority order, 1-based. */
  priority: number;
  provider: "gemini";
  /** Exact model id as the provider expects it. */
  model: string;
  enabled: boolean;
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
 * runs ~15 times per participant, where a Pro model would cost far more for
 * output the quality bar does not require.
 */
export const DEFAULT_MODELS: ModelEntry[] = [
  { priority: 1, provider: "gemini", model: "gemini-3.6-flash", enabled: true },
  { priority: 2, provider: "gemini", model: "gemini-3.5-flash", enabled: true },
  { priority: 3, provider: "gemini", model: "gemini-3.5-flash-lite", enabled: true },
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

function isModelEntry(value: unknown): value is ModelEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.model === "string" &&
    entry.model.trim().length > 0 &&
    typeof entry.enabled === "boolean" &&
    typeof entry.priority === "number"
  );
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
    const models = Array.isArray(data.models) ? data.models.filter(isModelEntry) : [];

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
          .map((entry, index) => ({ ...entry, priority: index + 1 })),
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
