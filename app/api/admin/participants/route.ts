import { requireAdmin } from "@/lib/auth/verify";
import { db } from "@/lib/firebase/admin";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { totalQuestions } from "@/lib/exercise";
import type { Participant } from "@/lib/invitations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Participant listing for the administrator (master_prompt.md §23, §50).
 *
 * §50: admin access to participant data is deliberate, not a window onto the
 * whole database. This returns identity and progress -- what the administrator
 * needs to see that someone is bound and moving -- and deliberately does NOT
 * return answers, interpretations or the synthesis. Those are the participant's
 * private reflection, and nothing in the product requires the admin to read
 * them from a listing.
 */

export type AdminParticipantView = {
  uid: string;
  inviteId: string;
  name: string;
  email: string;
  age: number;
  nationality: string;
  answeredCount: number;
  totalQuestions: number;
  currentQuestionId: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export const GET = withErrorHandling("admin/participants", async (request: Request) => {
  await requireAdmin(request);

  const snapshot = await db()
    .collection("participants")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const participants: AdminParticipantView[] = snapshot.docs.map((doc) => {
    const p = doc.data() as Participant;
    return {
      uid: p.uid,
      inviteId: p.inviteId,
      name: p.name,
      email: p.email,
      age: p.age,
      nationality: p.nationality,
      answeredCount: p.progress?.answered?.length ?? 0,
      totalQuestions,
      currentQuestionId: p.progress?.currentQuestionId ?? "",
      completed: Boolean(p.progress?.completedAt),
      createdAt: p.createdAt.toDate().toISOString(),
      updatedAt: p.updatedAt.toDate().toISOString(),
    };
  });

  return jsonOk({ participants });
});
