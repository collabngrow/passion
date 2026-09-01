import type { Metadata } from "next";

import { InviteFlow } from "@/components/invitation/InviteFlow";

/**
 * The public invitation route (master_prompt.md §7).
 *
 * The id is unpredictable and is the only thing in the URL. The password is
 * never a query parameter, fragment or route segment (§8).
 */

export const metadata: Metadata = {
  title: "Your invitation",
  // Private by design; never index an invitation URL.
  robots: { index: false, follow: false },
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ inviteId: string }>;
}) {
  const { inviteId } = await params;

  // Deliberately no server-side existence check: rendering the password step
  // for every id, real or not, is what stops this route being used to
  // enumerate invitations (§54).
  return <InviteFlow inviteId={inviteId} />;
}
