import type { Metadata } from "next";

import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "You're offline",
  robots: { index: false, follow: false },
};

/**
 * The service worker's offline fallback (master_prompt.md §46).
 *
 * Deliberately holds nothing: it is precached, so anything on this page would
 * be stored on the device for as long as the app is installed. It says what
 * happened, promises what §75 promises, and nothing else.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Logo size="lg" label="CollabNGrow" priority />

      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">
        You&apos;re offline
      </h1>

      <p className="mt-4 leading-relaxed text-ink-soft">
        Your answers are saved. Reconnect and open the app again — you&apos;ll pick
        up exactly where you left off.
      </p>
    </main>
  );
}
