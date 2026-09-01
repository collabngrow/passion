import type { Metadata } from "next";

import { SurveyView } from "@/components/feedback/SurveyView";

export const metadata: Metadata = {
  title: "Your feedback",
  robots: { index: false, follow: false },
};

export default function SurveyPage() {
  return <SurveyView />;
}
