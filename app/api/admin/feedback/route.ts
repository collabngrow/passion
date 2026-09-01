import { requireAdmin } from "@/lib/auth/verify";
import { summariseFeedback, type FeedbackSummary } from "@/lib/feedback/analytics";
import { listFeedbackResponses, toFeedbackRecord } from "@/lib/feedback/store";
import { jsonOk, withErrorHandling } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feedback for the administrator (feedback_plan.md, "Admin Dashboard").
 *
 * The summary is computed here, from the same rows that are returned, so the
 * table and the charts can never disagree about what was collected.
 *
 * Like the participant listing (§50), this carries survey answers and identity
 * only. Nothing a participant wrote in the exercise passes through here.
 */

export type AdminFeedbackRow = {
  uid: string;
  name: string;
  inviteId: string;
  revelationImpact: number;
  willingnessToPay: number | null;
  perceivedWorth: number;
  perceivedWorthCustom: number | null;
  submittedAt: string;
};

export type AdminFeedbackResponse = {
  responses: AdminFeedbackRow[];
  summary: FeedbackSummary;
};

export const GET = withErrorHandling("admin/feedback", async (request: Request) => {
  await requireAdmin(request);

  const stored = await listFeedbackResponses();

  const responses: AdminFeedbackRow[] = stored.map((response) => ({
    uid: response.uid,
    name: response.name,
    inviteId: response.inviteId,
    revelationImpact: response.revelationImpact,
    willingnessToPay: response.willingnessToPay ?? null,
    perceivedWorth: response.perceivedWorth,
    perceivedWorthCustom: response.perceivedWorthCustom ?? null,
    submittedAt: response.submittedAt.toDate().toISOString(),
  }));

  return jsonOk({
    responses,
    summary: summariseFeedback(stored.map(toFeedbackRecord)),
  } satisfies AdminFeedbackResponse);
});
