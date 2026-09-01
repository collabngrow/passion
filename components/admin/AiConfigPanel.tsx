"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";

/**
 * AI model routing (master_prompt.md §23, §34, §37).
 *
 * Add, remove, reorder, enable and disable models, and order the key pools.
 * Keys are shown masked and are never editable here — they live in environment
 * variables and never reach the browser (§33, §37).
 */

type ModelEntry = {
  priority: number;
  provider: "gemini";
  model: string;
  enabled: boolean;
};

type ConfigResponse = {
  models: ModelEntry[];
  keyOrder: string[];
  availableKeys: { id: string; masked: string }[];
  updatedAt: string | null;
};

export function AiConfigPanel() {
  const [models, setModels] = useState<ModelEntry[] | null>(null);
  const [keys, setKeys] = useState<{ id: string; masked: string }[]>([]);
  const [keyOrder, setKeyOrder] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<ConfigResponse>("/api/admin/ai-config");
    if (!alive()) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setModels(result.data.models);
    setKeys(result.data.availableKeys);
    setKeyOrder(result.data.keyOrder);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  function move(index: number, direction: -1 | 1) {
    if (!models) return;
    const target = index + direction;
    if (target < 0 || target >= models.length) return;

    const next = [...models];
    [next[index], next[target]] = [next[target], next[index]];
    setModels(next.map((entry, i) => ({ ...entry, priority: i + 1 })));
    setSaved(false);
  }

  function toggle(index: number) {
    if (!models) return;
    const next = [...models];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    setModels(next);
    setSaved(false);
  }

  function remove(index: number) {
    if (!models) return;
    setModels(
      models.filter((_, i) => i !== index).map((entry, i) => ({ ...entry, priority: i + 1 })),
    );
    setSaved(false);
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    const model = newModel.trim();
    if (!model || !models) return;

    if (models.some((entry) => entry.model === model)) {
      setError("That model is already in the list.");
      return;
    }

    setError(null);
    setModels([
      ...models,
      { priority: models.length + 1, provider: "gemini", model, enabled: true },
    ]);
    setNewModel("");
    setSaved(false);
  }

  function moveKey(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= keyOrder.length) return;
    const next = [...keyOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setKeyOrder(next);
    setSaved(false);
  }

  async function save() {
    if (!models) return;
    setSaving(true);
    setError(null);

    const result = await apiFetch("/api/admin/ai-config", {
      method: "POST",
      body: JSON.stringify({ models, keyOrder }),
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">AI configuration</h1>
      <p className="mt-2 text-ink-soft">
        Models are tried in order. Every enabled model is tried on the first key, then the
        same sequence on the next key, and so on.
      </p>

      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}
      {saved ? (
        <Notice tone="success" className="mt-6">
          Configuration saved.
        </Notice>
      ) : null}

      <h2 className="mt-8 text-lg font-semibold text-ink">Model routing</h2>

      {models === null ? (
        <p role="status" className="mt-4 text-ink-soft">
          Loading…
        </p>
      ) : (
        <>
          <ol className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {models.map((entry, index) => (
              <li
                key={entry.model}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <span className="w-6 shrink-0 text-sm tabular-nums text-ink-soft">
                  {index + 1}
                </span>

                <span className="min-w-0 flex-1 font-mono text-sm text-ink">
                  {entry.model}
                </span>

                <span
                  className={[
                    "rounded-sm px-2 py-1 text-xs font-semibold",
                    entry.enabled
                      ? "bg-positive/10 text-positive"
                      : "bg-line text-ink-soft",
                  ].join(" ")}
                >
                  {entry.enabled ? "Enabled" : "Disabled"}
                </span>

                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${entry.model} up`}
                    className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-brand-soft disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === models.length - 1}
                    aria-label={`Move ${entry.model} down`}
                    className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-brand-soft disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    className="rounded-md px-2 py-1 text-sm text-brand hover:bg-brand-soft"
                  >
                    {entry.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-brand-soft"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ol>

          <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
            <Field
              label="Add a model"
              hint="The exact model id, e.g. gemini-3.7-flash"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="gemini-3.7-flash"
              className="min-w-64 flex-1"
            />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </>
      )}

      <h2 className="mt-10 text-lg font-semibold text-ink">API key pools</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Keys are set through environment variables and are never shown or edited here.
      </p>

      {keys.length === 0 ? (
        <Notice tone="error" className="mt-4">
          No Gemini API key is configured. Set at least{" "}
          <span className="font-mono">GEMINI_API_KEY_1</span> for the interpretation
          engine to work.
        </Notice>
      ) : (
        <ol className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
          {keyOrder.map((id, index) => {
            const key = keys.find((k) => k.id === id);
            return (
              <li key={id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 shrink-0 text-sm tabular-nums text-ink-soft">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-ink">{id}</span>
                <span className="font-mono text-sm text-ink-soft">{key?.masked}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveKey(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${id} up`}
                    className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-brand-soft disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveKey(index, 1)}
                    disabled={index === keyOrder.length - 1}
                    aria-label={`Move ${id} down`}
                    className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-brand-soft disabled:opacity-40"
                  >
                    ↓
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <Button size="lg" className="mt-8" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save configuration"}
      </Button>
    </div>
  );
}
