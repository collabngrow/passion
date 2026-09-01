import type { Metadata } from "next";

import { ExercisesList } from "@/components/exercises/ExercisesList";

export const metadata: Metadata = {
  title: "Your exercises",
  robots: { index: false, follow: false },
};

/**
 * The hub a participant lands on after onboarding, and returns to from an
 * exercise.
 *
 * Access is enforced by /api/exercises, not by this page (§90).
 */
export default function ExercisesPage() {
  return <ExercisesList />;
}
