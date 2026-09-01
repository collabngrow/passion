/**
 * Exercise content model.
 *
 * master_prompt.md §57: the exercise is data, never hard-coded components.
 * §68: `content/exercise.md` is the human-readable source of truth, structured
 * at build time into `exercise.generated.ts`.
 *
 * Question prose is parsed into blocks here rather than shipped as raw Markdown
 * so the participant UI needs no runtime Markdown parser (§91).
 */

export type InlineSegment = {
  text: string;
  bold?: boolean;
};

export type ContentBlock =
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "list"; items: InlineSegment[][] };

export type ExerciseQuestion = {
  /** Stable identifier, e.g. "q7". Used as the Firestore answer document id. */
  id: string;
  /** 1-based question number as it appears in the source. */
  number: number;
  /** Owning section id, e.g. "part-3". */
  sectionId: string;
  /** Short heading, e.g. "Where Did You Stay Silent?". */
  title: string;
  /** Supporting prose and prompts beneath the heading. */
  blocks: ContentBlock[];
  /** 1-based position across the whole exercise. */
  order: number;
  type: "long_text";
};

export type ExerciseSection = {
  /** Stable identifier, e.g. "part-6" or "final-reflection". */
  id: string;
  /** Display title, e.g. "Health". */
  title: string;
  /** 1-based position. */
  order: number;
  /** Question ids in order. */
  questionIds: string[];
};

export type Exercise = {
  /**
   * Stored with each participant session (§95). Participants stay associated
   * with the version they started on unless a migration is written.
   */
  version: string;
  sections: ExerciseSection[];
  questions: ExerciseQuestion[];
};
