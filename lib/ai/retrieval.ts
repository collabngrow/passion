import { knowledgeBase, knowledgeBaseVersion } from "./knowledge-base.generated";
import type { KnowledgeItem } from "./knowledge-types";

/**
 * Knowledge selection (master_prompt.md §38C).
 *
 * The framework is ~19,000 words. Sending all of it on every call is wasteful
 * across a 15-call journey, so selection is split in two:
 *
 *  - Always-on categories carry the rules the engine must never operate
 *    without: how to read an answer and how to write the result. Dropping one
 *    of these to save tokens is how a system starts diagnosing people.
 *  - Everything else -- the framework's actual substance, plus the cautions --
 *    is selected by theme overlap with the section being interpreted.
 *
 * `cautions` is deliberately NOT always-on, which is a change from the first
 * version of this file. When it was, the three rule categories were 24 of 56
 * items and every prompt was dominated by prohibitions; the model had far more
 * instruction about what not to say than material to say anything with, and the
 * output was correspondingly hedged and generic. The cautions are still
 * reachable by theme, and the prohibitions that must never lapse -- no
 * diagnosis, no types, no invented facts, no naming the source -- are also
 * stated unconditionally in the system instruction, so nothing depends on
 * retrieval to enforce them.
 *
 * Deliberately no vector database: §38C and §96 both rule it out at this size,
 * and theme tags authored alongside the content beat embeddings for a corpus
 * this small.
 */

export { knowledgeBaseVersion };

/** Categories included in every request, unconditionally. */
const ALWAYS_INCLUDED = new Set(["principles", "interpretationGuidance"]);

/**
 * Themes per exercise section, used to select topical knowledge.
 *
 * Keys are section ids from lib/exercise/exercise.generated.ts. A section
 * missing here still works -- it falls back to answer-text matching -- but the
 * mapping produces better selection than keywords alone.
 */
export const SECTION_THEMES: Record<string, string[]> = {
  // The comfortable life
  "part-1": ["comfort", "safety", "smallness", "contempt", "appetite", "dissatisfaction"],
  // The rope
  "part-2": ["crossing", "danger", "direction", "becoming", "fear", "courage"],
  // The ox
  "part-3": ["burden", "reverence", "duty", "obedience", "weight", "inherited-values"],
  // The tiger
  "part-4": ["refusal", "freedom", "courage", "duty", "solitude", "obedience"],
  // The child
  "part-5": ["creation", "play", "beginning", "innocence", "creativity", "appetite"],
  // The body
  "part-6": ["body", "health", "passion", "evidence", "discipline", "time"],
  // Goals you did not choose
  "part-7": ["inherited-values", "chosen-values", "valuation", "values", "money", "family"],
  // Those you walk with
  "part-8": ["relationships", "friendship", "love", "solitude", "self-love", "receiving"],
  // What weighs you down
  "part-9": ["gravity", "weight", "fear", "regret", "past", "revenge"],
  // The bestowing hand
  "part-10": ["giving", "receiving", "contribution", "money", "work", "purpose"],
  // Your own tables
  "part-11": ["values", "chosen-values", "self-command", "self-obedience", "action", "discipline"],
  // Again, and innumerable times
  "part-12": ["recurrence", "affirmation", "past", "time", "mortality", "regret"],
  "final-reflection": ["becoming", "identity", "direction", "affirmation", "mortality", "purpose"],
};

/** Theme vocabulary, for matching against free text. */
const ALL_THEMES = [...new Set(knowledgeBase.flatMap((item) => item.themes))];

/**
 * Matchers for each theme, built once.
 *
 * Word-boundary anchored rather than a substring check. A plain `includes` --
 * which is what this did originally -- fires `action` on "transaction",
 * `health` on "wealthy", `past` on "pasta" and `love` on "glove", so the blunt
 * themes matched almost every answer and the supplement stopped discriminating
 * at all. Hyphenated themes also match their spaced form, so "inherited values"
 * in an answer finds `inherited-values`.
 */
const THEME_MATCHERS: [string, RegExp][] = ALL_THEMES.map((theme) => [
  theme,
  new RegExp(`\\b${theme.replace(/-/g, "[- ]")}\\b`, "i"),
]);

/**
 * Themes suggested by arbitrary text.
 *
 * Used only to supplement the section mapping when an answer strays into
 * territory the section does not cover -- someone answering a question about
 * work who writes mostly about their father.
 */
export function themesFromText(text: string): string[] {
  return THEME_MATCHERS.filter(([, pattern]) => pattern.test(text)).map(([theme]) => theme);
}

export type SelectionOptions = {
  /** Section being interpreted; supplies the base themes. */
  sectionId?: string;
  /** Participant text, scanned to supplement the section themes. */
  text?: string;
  /** Extra themes to force in. */
  themes?: string[];
  /**
   * Maximum topical items returned. Always-on items are not counted.
   *
   * Raised from 8 alongside the corpus growing to 115 items. The number is set
   * by a ratio rather than picked: the framework material the model reasons
   * *with* has to outweigh the rules it is constrained *by*, measured in words
   * rather than items, and `retrieval.test.ts` asserts it. At 8 the ratio was
   * about 0.5 and at 12 it was still 0.82 -- prompts carried more prohibition
   * than substance, which is what produced hedged, generic reflections. 18
   * puts it above 1.
   *
   * The cost of the larger block is negligible: the generation budget is time,
   * not tokens (see budget.test.ts), and the Flash-class models this routes to
   * have context to spare.
   */
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
  maxTopical = 18,
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
