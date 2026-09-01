import { exercise, exerciseVersion } from "./exercise.generated";
import type { ExerciseQuestion, ExerciseSection } from "./types";

/**
 * Exercise accessors.
 *
 * The generated module is the data; this is the only place that reads it, so
 * components and API routes never depend on the generated file's shape
 * directly (§57).
 */

export { exercise, exerciseVersion };
export type { ExerciseQuestion, ExerciseSection } from "./types";

const questionsById = new Map(exercise.questions.map((q) => [q.id, q]));
const sectionsById = new Map(exercise.sections.map((s) => [s.id, s]));

export const totalQuestions = exercise.questions.length;

export function getQuestion(id: string): ExerciseQuestion | undefined {
  return questionsById.get(id);
}

export function getSection(id: string): ExerciseSection | undefined {
  return sectionsById.get(id);
}

/** Questions in a section, in order. */
export function questionsInSection(sectionId: string): ExerciseQuestion[] {
  const section = sectionsById.get(sectionId);
  if (!section) return [];
  return section.questionIds
    .map((id) => questionsById.get(id))
    .filter((q): q is ExerciseQuestion => q !== undefined);
}

/** The first question, where a new participant starts. */
export function firstQuestion(): ExerciseQuestion {
  return exercise.questions[0];
}

/** The question after this one, or undefined at the end of the exercise. */
export function nextQuestion(id: string): ExerciseQuestion | undefined {
  const current = questionsById.get(id);
  if (!current) return undefined;
  return exercise.questions[current.order] ?? undefined;
}

/** The question before this one, or undefined at the start. */
export function previousQuestion(id: string): ExerciseQuestion | undefined {
  const current = questionsById.get(id);
  if (!current || current.order <= 1) return undefined;
  return exercise.questions[current.order - 2] ?? undefined;
}

/**
 * Whether a question completes its section.
 *
 * Drives per-section interpretation: a reflection is generated when the last
 * question of a part is answered, rather than after every answer (§59).
 */
export function isLastInSection(id: string): boolean {
  const question = questionsById.get(id);
  if (!question) return false;
  const section = sectionsById.get(question.sectionId);
  if (!section) return false;
  return section.questionIds[section.questionIds.length - 1] === id;
}

/** 1-based position of a question, for "07 / 43" style progress (§43). */
export function questionPosition(id: string): number {
  return questionsById.get(id)?.order ?? 0;
}
