"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { TroubleSigningIn } from "@/components/auth/TroubleSigningIn";
import { useAuthState } from "@/components/auth/useAuthState";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import {
  SignInCancelled,
  apiFetch,
  signInWithGoogle,
  switchGoogleAccount,
} from "@/lib/auth/client";

/**
 * The way back in for someone who has been here before (§18, §47).
 *
 * The installed PWA opens at "/", and by then the invitation email is long
 * gone, so this is the only route home. When a session has survived -- which
 * §18 promises it will -- it resolves silently and forwards; otherwise it
 * offers Google. Nothing here is a gate: the server re-decides everything on
 * the page it forwards to (§89, §90).
 */

type Resume =
  | { status: "admin" | "found"; destination: string }
  | { status: "unknown" }
  | { status: "unavailable" };

type Outcome =
  /** Signed out, or a popup was closed: offer Google. */
  | { kind: "idle" }
  | { kind: "resolving" }
  /** Signed in with an account that holds no invitation. */
  | { kind: "unknown" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

const SIGN_IN_FAILED = "We couldn't complete sign-in. Please try again.";

export function ResumeSignIn() {
  const router = useRouter();
  const { user, loading } = useAuthState();

  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  /** The uid already resolved, so a re-render does not ask a second time. */
  const resolvedFor = useRef<string | null>(null);

  const resume = useCallback(async () => {
    setOutcome({ kind: "resolving" });

    const result = await apiFetch<Resume>("/api/session/resume");

    if (!result.ok) {
      // 401 means the session lapsed between the auth listener and this call;
      // offering Google again is the right answer, not an error.
      setOutcome(
        result.status === 401 ? { kind: "idle" } : { kind: "error", message: result.error },
      );
      return;
    }

    if (result.data.status === "unknown") {
      setOutcome({ kind: "unknown" });
      return;
    }

    if (result.data.status === "unavailable") {
      setOutcome({ kind: "unavailable" });
      return;
    }

    // Left in "resolving" deliberately: the navigation is what ends this state,
    // and flipping to idle first would flash the sign-in prompt on the way out.
    router.replace(result.data.destination);
  }, [router]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      resolvedFor.current = null;
      return;
    }

    if (resolvedFor.current === user.uid) return;
    resolvedFor.current = user.uid;

    void resume();
  }, [loading, user, resume]);

  async function enter(signIn: () => Promise<User>) {
    setOutcome({ kind: "resolving" });

    try {
      const signedIn = await signIn();
      // Recorded here as well as in the effect: choosing the *same* account
      // again leaves the uid unchanged, so the effect would not re-run.
      resolvedFor.current = signedIn.uid;
      await resume();
    } catch (caught) {
      setOutcome(
        caught instanceof SignInCancelled
          ? { kind: "idle" }
          : { kind: "error", message: SIGN_IN_FAILED },
      );
    }
  }

  // §18: never render a signed-out view while Firebase is still restoring.
  if (loading) return null;

  const busy = outcome.kind === "resolving";

  if (outcome.kind === "unknown" || outcome.kind === "unavailable") {
    return (
      <section className="mt-8 rounded-lg border border-line bg-surface px-6 py-8 text-left sm:px-8">
        <h2 className="text-base font-semibold text-ink">
          {outcome.kind === "unknown"
            ? "We don't recognise this account"
            : "This invitation isn't available"}
        </h2>

        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
          {outcome.kind === "unknown" ? (
            <>
              {user?.email ? <strong className="font-semibold text-ink">{user.email}</strong> : "This account"}{" "}
              isn&apos;t linked to an invitation. Open the invitation link you were
              sent, or try the Google account you first used.
            </>
          ) : (
            <>Your invitation may have been paused. Your answers are safe — get in touch and we&apos;ll help.</>
          )}
        </p>

        {outcome.kind === "unknown" ? (
          <div className="mt-6">
            <GoogleButton onClick={() => void enter(switchGoogleAccount)} pending={busy}>
              Use a different Google account
            </GoogleButton>
          </div>
        ) : null}

        <TroubleSigningIn className="mt-8" />
      </section>
    );
  }

  if (user) {
    return (
      <section className="mt-8 rounded-lg border border-line bg-surface px-6 py-8 text-left sm:px-8">
        {outcome.kind === "error" ? (
          <>
            <Notice tone="error">{outcome.message}</Notice>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button fullWidth onClick={() => void resume()}>
                Try again
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => void enter(switchGoogleAccount)}
              >
                Use a different Google account
              </Button>
            </div>
          </>
        ) : (
          <p role="status" className="text-[0.9375rem] leading-relaxed text-ink-soft">
            Signing you in as{" "}
            <strong className="font-semibold text-ink">{user.email}</strong>…
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-line bg-surface px-6 py-8 text-left sm:px-8">
      <h2 className="text-base font-semibold text-ink">Already registered?</h2>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
        If you have opened your invitation before, continue with the Google
        account you used and we&apos;ll take you back to where you left off.
      </p>

      {outcome.kind === "error" ? (
        <Notice tone="error" className="mt-5">
          {outcome.message}
        </Notice>
      ) : null}

      <div className="mt-6">
        <GoogleButton onClick={() => void enter(signInWithGoogle)} pending={busy} />
      </div>
    </section>
  );
}
