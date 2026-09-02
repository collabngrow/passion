/**
 * The catalogue of exercises a participant can open.
 *
 * There is one today. It is a list rather than a hard-coded page because more
 * are coming, and the shape of "what exercises exist" should be data that a new
 * entry joins -- not a component someone has to edit around (§57, the same
 * principle that keeps the exercise itself out of the components).
 *
 * Progress is deliberately NOT here. This module is a static description of
 * what exists; how far a particular participant has gone is answered per
 * request by /api/exercises, which reads their own progress and nobody else's.
 */

export type ExerciseCatalogEntry = {
  /** Stable id. Used as a React key and in the progress lookup. */
  id: string;
  title: string;
  /** One or two sentences: what it asks of someone, and what they get back. */
  description: string;
  /** Where opening it leads. */
  href: string;
  /**
   * False for an exercise that is listed but not yet openable.
   *
   * Nothing is listed unavailable today. The field exists so that announcing a
   * forthcoming exercise does not require a second, parallel way of listing
   * things -- which is how a "coming soon" section ends up drifting out of step
   * with the real one.
   */
  available: boolean;
};

export const exerciseCatalog: ExerciseCatalogEntry[] = [
  {
    id: "reflection",
    title: "The Reflection Exercise",
    description:
      "Forty-three questions across thirteen parts, on what you carry, what you " +
      "have refused, and what you would make. You get a reflection after each " +
      "part, and a full one at the end.",
    href: "/journey",
    available: true,
  },
];
