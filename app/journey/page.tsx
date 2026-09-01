import type { Metadata } from "next";

import { JourneyFlow } from "@/components/exercise/JourneyFlow";

export const metadata: Metadata = {
  title: "Your journey",
  robots: { index: false, follow: false },
};

/**
 * The exercise.
 *
 * Access is enforced by the API routes this page calls, not by the page itself
 * (§90): /api/journey/state re-verifies the ID token, the invitation binding
 * and the grant cookie on every request, and the component redirects home if
 * any of those fail.
 */
export default function JourneyPage() {
  return <JourneyFlow />;
}
