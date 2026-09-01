/**
 * Knowledge base model (master_prompt.md §38D).
 *
 * The framework that tells the interpretation engine *how* to read an answer.
 * Kept strictly separate from the exercise content, which defines *what* the
 * participant is asked (§38O).
 */

export type KnowledgeCategory =
  | "principles"
  | "values"
  | "concepts"
  | "distinctions"
  | "tensions"
  | "interpretationGuidance"
  | "cautions";

export type KnowledgeItem = {
  id: string;
  category: KnowledgeCategory | string;
  title: string;
  /** Markdown prose. Reaches the model as framework context, never a participant. */
  content: string;
  /** Tags used to select items for a given section (§38C). */
  themes: string[];
  /** Ids of related items; validated to resolve at build time. */
  relatedConcepts: string[];
  /** Knowledge base version this item was generated from (§38E). */
  sourceVersion: string;
};
