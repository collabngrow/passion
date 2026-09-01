import { knowledgeBase, knowledgeBaseVersion } from "./knowledge-base.generated";
import type { KnowledgeItem } from "./knowledge-types";

/**
 * Knowledge selection (master_prompt.md §38C).
 *
 * The framework is ~7,500 words. Sending all of it on every call is affordable
 * but wasteful across a 15-call journey, so selection is split in two:
 *
 *  - Always-on categories carry the rules the engine must never operate
 *    without: how to interpret, how to write, and what it must not do. Dropping
 *    one of these to save tokens is how a system starts diagnosing people.
 *  - Topical categories (concepts, values, distinctions, tensions) are selected
 *    by theme overlap with the section being interpreted.
 *
 * Deliberately no vector database: §38C and §96 both rule it out at this size,
 * and theme tags authored alongside the content beat embeddings for a corpus
 * this small.
 */

export { knowledgeBaseVersion };

/** Categories included in every request, unconditionally. */
const ALWAYS_INCLUDED = new Set(["principles", "cautions", "interpretationGuidance"]);

/**
 * Themes per exercise section, used to select topical knowledge.
 *
 * Keys are section ids from lib/exercise/exercise.generated.ts. A section
 * missing here still works -- it falls back to answer-text matching -- but the
 * mapping produces better selection than keywords alone.
 */
const SECTION_THEMES: Record<string, string[]> = {
  "part-1": ["meaning", "values", "becoming", "time", "work"],
  "part-2": ["courage", "responsibility", "identity", "fear", "relationships"],
  "part-3": ["becoming", "identity", "discipline", "fear", "action"],
  "part-4": ["creativity", "work", "contribution", "impact", "meaning"],
  "part-5": ["time", "discipline", "action", "work", "freedom"],
  "part-6": ["health", "discipline", "mortality", "time"],
  "part-7": ["wealth", "security", "freedom", "family", "action"],
  "part-8": ["relationships", "family", "meaning", "mortality", "time"],
  "part-9": ["creativity", "meaning", "identity", "work"],
  "part-10": ["contribution", "impact", "meaning", "work"],
  "part-11": ["becoming", "identity", "courage", "discipline", "responsibility"],
  "part-12": ["action", "discipline", "time", "health", "wealth"],
  "part-13": ["values", "meaning", "identity", "becoming", "responsibility"],
  "final-reflection": ["mortality", "time", "meaning", "relationships", "action"],
};

/** Theme vocabulary, for matching against free text. */
const ALL_THEMES = [...new Set(knowledgeBase.flatMap((item) => item.themes))];

/**
 * Themes suggested by arbitrary text.
 *
 * A blunt containment check, used only to supplement the section mapping when
 * an answer strays into territory the section does not cover -- someone
 * answering a question about work who writes mostly about their father.
 */
function themesFromText(text: string): string[] {
  const haystack = text.toLowerCase();
  return ALL_THEMES.filter((theme) => haystack.includes(theme));
}

export type SelectionOptions = {
  /** Section being interpreted; supplies the base themes. */
  sectionId?: string;
  /** Participant text, scanned to supplement the section themes. */
  text?: string;
  /** Extra themes to force in. */
  themes?: string[];
  /** Maximum topical items returned. Always-on items are not counted. */
  maxTopical?: number;
};

/**
 * Selects the knowledge items to place in an interpretation request.
 *
 * Returns always-on items first, then topical items ranked by theme overlap.
 * Ordering is stable so that identical inputs produce an identical prompt,
 * which matters for the idempotency guarantees in §77.
 */
export function selectKnowledge({
  sectionId,
  text,
  themes = [],
  maxTopical = 8,
}: SelectionOptions = {}): KnowledgeItem[] {
  const wanted = new Set<string>([
    ...(sectionId ? (SECTION_THEMES[sectionId] ?? []) : []),
    ...themes,
    ...(text ? themesFromText(text) : []),
  ]);

  const alwaysOn = knowledgeBase.filter((item) => ALWAYS_INCLUDED.has(item.category));
  const topical = knowledgeBase.filter((item) => !ALWAYS_INCLUDED.has(item.category));

  const scored = topical
    .map((item) => ({
      item,
      score: item.themes.filter((theme) => wanted.has(theme)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, maxTopical)
    .map((entry) => entry.item);

  // Pull in directly related items where they are cheap and clarifying: a
  // tension that references the distinction underlying it reads better with
  // both present.
  const selected = new Map(scored.map((item) => [item.id, item]));
  for (const item of scored) {
    for (const relatedId of item.relatedConcepts) {
      if (selected.size >= maxTopical + 3) break;
      const related = topical.find((candidate) => candidate.id === relatedId);
      if (related && !selected.has(related.id)) selected.set(related.id, related);
    }
  }

  return [...alwaysOn, ...selected.values()];
}

/**
 * The complete framework, for the final synthesis.
 *
 * The synthesis reasons across every section at once (§38H), so narrowing by
 * theme would exclude exactly the connections it exists to find. One call per
 * participant makes the full context affordable.
 */
export function fullKnowledgeBase(): KnowledgeItem[] {
  return knowledgeBase;
}

/** Renders selected items as the framework block of a prompt. */
export function renderKnowledge(items: KnowledgeItem[]): string {
  return items
    .map((item) => `### ${item.title}\n(${item.category})\n\n${item.content}`)
    .join("\n\n");
}
