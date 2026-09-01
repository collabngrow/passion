import type { Metadata } from "next";

import { SynthesisView } from "@/components/synthesis/SynthesisView";

export const metadata: Metadata = {
  title: "Your reflection",
  robots: { index: false, follow: false },
};

export default function ResultPage() {
  return <SynthesisView />;
}
