import { recordAdminAction } from "@/lib/admin/audit";
import {
  availableKeyIds,
  loadAiConfig,
  maskedKeys,
  normaliseTier,
  saveAiConfig,
  type ModelEntry,
} from "@/lib/ai/config";
import { requireAdmin } from "@/lib/auth/verify";
import { badRequest, jsonOk, readJson, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI model routing configuration (master_prompt.md §23, §37).
 *
 * Keys are never returned — only a pool id and a masked tail (§37). The keys
 * themselves live in environment variables and never reach a browser (§33).
 */

export const GET = withErrorHandling("admin/ai-config", async (request: Request) => {
  await requireAdmin(request);

  const config = await loadAiConfig();

  return jsonOk({
    models: config.models,
    keyOrder: config.keyOrder,
    availableKeys: maskedKeys(),
    updatedAt: config.updatedAt ?? null,
  });
});

export const POST = withErrorHandling("admin/ai-config", async (request: Request) => {
  const admin = await requireAdmin(request);

  const body = await readJson<{ models?: unknown; keyOrder?: unknown }>(request);

  if (!Array.isArray(body.models) || body.models.length === 0) {
    throw badRequest("Add at least one model.");
  }

  const models: ModelEntry[] = [];
  for (const raw of body.models) {
    if (typeof raw !== "object" || raw === null) throw badRequest();
    const entry = raw as Record<string, unknown>;

    const model = typeof entry.model === "string" ? entry.model.trim() : "";
    if (!model || model.length > 100) throw badRequest("That model name isn't valid.");

    // Priority is assigned from array order, so the UI reorders by moving
    // entries rather than by editing numbers that could collide.
    models.push({
      priority: models.length + 1,
      provider: "gemini",
      model,
      enabled: entry.enabled !== false,
      tier: normaliseTier(entry.tier),
    });
  }

  // A saved configuration with everything disabled would silently take the
  // interpretation engine offline.
  if (!models.some((entry) => entry.enabled)) {
    throw badRequest("At least one model must be enabled.");
  }

  // A configuration that is entirely reserve has no strong model to fall from,
  // so every participant is served the fallback as though it were the choice.
  if (!models.some((entry) => entry.enabled && entry.tier === "primary")) {
    throw badRequest("At least one enabled model must be a primary model.");
  }

  const available = availableKeyIds();
  const keyOrder = Array.isArray(body.keyOrder)
    ? body.keyOrder.filter(
        (id): id is string => typeof id === "string" && available.includes(id),
      )
    : available;

  if (keyOrder.length === 0) {
    throw badRequest("At least one API key pool must be configured and selected.");
  }

  await saveAiConfig({ models, keyOrder });

  await recordAdminAction("ai_config_updated", admin.uid, {
    note: `${models.length} models, ${keyOrder.length} key pools`,
  });

  return jsonOk({ ok: true });
});
