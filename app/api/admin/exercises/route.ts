import { requireAdmin } from "@/lib/auth/verify";
import { exercise, exerciseVersion, totalQuestions } from "@/lib/exercise";
import { exerciseCatalog } from "@/lib/exercises/catalog";
import { jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The exercise content, for the administrator to read (master_prompt.md §22).
 *
 * Read-only by construction: there is no PUT or POST here, and the questions
 * come from `exercise.generated.ts`, which is built from `content/exercise.md`
 * (§68). Editing an exercise means editing that file and rebuilding, so an
 * endpoint that accepted a write would be offering something the pipeline
 * cannot honour.
 *
 * Deliberately NOT the participant route: `/api/exercises` returns one
 * person's progress and no question text, while this returns every question and
 * nobody's answers. Two different things behind two different guards.
 */
export const GET = withErrorHandling("admin/exercises", async (request: Request) => {
  await requireAdmin(request);

  return jsonOk({
    catalog: exerciseCatalog,
    exercise: {
      version: exerciseVersion,
      totalQuestions,
      sections: exercise.sections,
      questions: exercise.questions,
    },
  });
});
