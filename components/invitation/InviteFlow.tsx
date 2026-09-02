"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { TroubleSigningIn } from "@/components/auth/TroubleSigningIn";
import { useAuthState } from "@/components/auth/useAuthState";
import { ProfileStep } from "@/components/invitation/ProfileStep";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import {
  SignInCancelled,
  apiFetch,
  signInWithGoogle,
  switchGoogleAccount,
} from "@/lib/auth/client";

/**
 * The invitation entry flow (master_prompt.md §14, §16, §17).
 *
 *   password -> Google -> (bind) -> profile -> journey
 *
 * The server decides which step applies; this component only renders it. Every
 * transition is re-verified server-side, so manipulating state here grants
 * nothing (§89, §90).
 */

/** What the flow can render. "ready" is handled by redirecting, so it is not one. */
type Step = "loading" | "password" | "google" | "profile" | "mismatch" | "unavailable";

/** Mirrors InviteStep from app/api/invite/[inviteId]/state/route.ts. */
type ServerStep = Exclude<Step, "loading"> | "ready";

export function InviteFlow({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthState();

  const stepRef = useRef<HTMLDivElement>(null);
  const previousStepRef = useRef<Step | null>(null);

  const [step, setStep] = useState<Step>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The Google account this invitation belongs to, once the password has been
   * passed (§17, relaxed for a grant holder -- see the /state route).
   */
  const [boundEmail, setBoundEmail] = useState<string | null>(null);

  /** Whether a Firebase session is already in play on the Google step. */
  const [authenticated, setAuthenticated] = useState(false);

  /**
   * Asks the server where this visitor stands.
   *
   * `alive` guards against resolving after unmount, and against an earlier
   * request landing after a later one when auth state settles mid-flight.
   */
  const refresh = useCallback(
    async (alive: () => boolean = () => true) => {
      const result = await apiFetch<{
        step: ServerStep;
        boundEmail?: string;
        authenticated?: boolean;
      }>(`/api/invite/${inviteId}/state`);
      if (!alive()) return;

      if (!result.ok) {
        setStep("password");
        return;
      }

      if (result.data.step === "ready") {
        router.replace("/exercises");
        return;
      }

      setBoundEmail(result.data.boundEmail ?? null);
      setAuthenticated(result.data.authenticated === true);
      setStep(result.data.step);
    },
    [inviteId, router],
  );

  // Runs once Firebase has restored persisted state, since the answer depends
  // on whether a token is available to send (§18, §47).
  useEffect(() => {
    if (authLoading) return;

    let active = true;
    // The lint rule cannot see that every setState inside refresh happens after
    // an awaited fetch, not synchronously during this effect. Fetch-on-mount is
    // the intended use here, and `active` prevents a late resolution landing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(() => active);

    return () => {
      active = false;
    };
  }, [authLoading, user, refresh]);

  /*
   * Each step replaces the entire screen. The control that caused the move --
   * the Continue button, the Google button -- unmounts with it, so focus falls
   * back to <body>: a keyboard user restarts from the top of the document and a
   * screen reader announces nothing, including "this invitation belongs to
   * another account". Focus is moved to the new step instead (§73).
   */
  useEffect(() => {
    const previous = previousStepRef.current;
    previousStepRef.current = step;

    // Not on the first settle: "loading" resolving into the first real step is
    // the page arriving, and taking focus off the top of a page someone just
    // opened is the rudeness this is meant to prevent.
    if (previous === null || previous === "loading" || previous === step) return;

    stepRef.current?.focus();
  }, [step]);

  async function handlePassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const result = await apiFetch(`/api/invite/${inviteId}/verify-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPassword("");
    await refresh();
  }

  /**
   * Sign in, claim the invitation, move on.
   *
   * Parameterised by how to reach Google so that "Continue" and "use a
   * different account" are the same path -- the second only differs in ending
   * the current Firebase session first, so the person really re-chooses (§17).
   */
  async function enter(signIn: () => Promise<User>) {
    setError(null);
    setBusy(true);

    try {
      await signIn();

      const bind = await apiFetch<{ needsProfile: boolean }>(
        `/api/invite/${inviteId}/bind`,
        { method: "POST" },
      );

      if (!bind.ok) {
        // /bind will not name the account it rejected. /state will, to a grant
        // holder, so ask it rather than keeping a second copy of that answer.
        if (bind.code === "account_mismatch") await refresh();
        else setError(bind.error);
        return;
      }

      if (bind.data.needsProfile) setStep("profile");
      else router.replace("/exercises");
    } catch (caught) {
      if (!(caught instanceof SignInCancelled)) {
        setError("We couldn't complete sign-in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12 sm:py-16">
      <div className="w-full max-w-reading">
        <div className="flex justify-center">
          <Logo size="lg" label="CollabNGrow" priority />
        </div>

        <div
          ref={stepRef}
          tabIndex={-1}
          className="mt-10 outline-none"
        >
          {step === "loading" ? (
            <p className="text-center text-ink-soft" role="status">
              Loading…
            </p>
          ) : null}

          {step === "password" ? (
            <form onSubmit={handlePassword} noValidate>
              <h1 className="text-center text-2xl font-semibold tracking-tight text-ink">
                You&apos;ve been invited
              </h1>
              <p className="mt-3 text-center leading-relaxed text-ink-soft">
                This is a private reflection, prepared for you. Enter the password
                from your invitation to begin.
              </p>

              <Field
                label="Invitation password"
                className="mt-8"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />

              {error ? (
                <Notice tone="error" className="mt-5">
                  {error}
                </Notice>
              ) : null}

              <Button
                type="submit"
                size="lg"
                fullWidth
                className="mt-6"
                disabled={busy || password.length === 0}
              >
                {busy ? "Checking…" : "Continue"}
              </Button>

              <TroubleSigningIn inviteId={inviteId} className="mt-10" />
            </form>
          ) : null}

          {step === "google" ? (
            <div>
              <h1 className="text-center text-2xl font-semibold tracking-tight text-ink">
                Confirm it&apos;s you
              </h1>
              <p className="mt-3 text-center leading-relaxed text-ink-soft">
                Your invitation is linked to your Google account, so only you can
                open it. Your answers stay private to you.
              </p>

              {/*
                Named before the picker opens rather than corrected afterwards.
                Someone with more than one Google account -- or on a phone
                signed into a family member's -- otherwise has no way to know
                which one to choose until it has already gone wrong (§17).
              */}
              {boundEmail ? (
                <p className="mt-4 text-center leading-relaxed text-ink-soft">
                  This invitation is linked to{" "}
                  <strong className="font-semibold text-ink">{boundEmail}</strong>
                  . Sign in with that Google account to continue.
                </p>
              ) : null}

              {authenticated && user?.email ? (
                <p className="mt-4 text-center leading-relaxed text-ink-soft">
                  You&apos;re signed in as{" "}
                  <strong className="font-semibold text-ink">{user.email}</strong>
                  .
                </p>
              ) : null}

              {error ? (
                <Notice tone="error" className="mt-6">
                  {error}
                </Notice>
              ) : null}

              <div className="mt-8">
                <GoogleButton onClick={() => void enter(signInWithGoogle)} pending={busy}>
                  {authenticated && user?.email
                    ? `Continue as ${user.email}`
                    : undefined}
                </GoogleButton>

                {authenticated ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    className="mt-3"
                    disabled={busy}
                    onClick={() => void enter(switchGoogleAccount)}
                  >
                    Use a different Google account
                  </Button>
                ) : null}
              </div>

              <TroubleSigningIn inviteId={inviteId} className="mt-10" />
            </div>
          ) : null}

          {step === "profile" && user?.email ? (
            <ProfileStep
              email={user.email}
              onComplete={() => router.replace("/exercises")}
            />
          ) : null}

          {step === "mismatch" ? (
            <div>
              <h1 className="text-center text-2xl font-semibold tracking-tight text-ink">
                This invitation belongs to another account
              </h1>

              {/*
                §17 held that the bound account must never be named. It is named
                here because reaching this screen requires a valid grant for
                this invitation -- the password was typed. Withholding it from
                the one person who proved they hold the invitation left them
                with nothing to act on but a support email.
              */}
              <p className="mt-3 text-center leading-relaxed text-ink-soft">
                {boundEmail ? (
                  <>
                    This invitation is linked to{" "}
                    <strong className="font-semibold text-ink">{boundEmail}</strong>
                    . Sign in with that Google account to continue, or contact
                    support if it isn&apos;t yours.
                  </>
                ) : (
                  <>
                    This invitation is already associated with another Google
                    account. If you have more than one, try signing in with the
                    account you first used.
                  </>
                )}
              </p>

              {user?.email ? (
                <p className="mt-3 text-center leading-relaxed text-ink-soft">
                  You&apos;re currently signed in as{" "}
                  <strong className="font-semibold text-ink">{user.email}</strong>
                  .
                </p>
              ) : null}

              {error ? (
                <Notice tone="error" className="mt-6">
                  {error}
                </Notice>
              ) : null}

              {/*
                Without this the screen was a dead end: someone signed into the
                wrong Google account in this browser had no control to change
                it. Signing out first guarantees Google asks again.
              */}
              <div className="mt-8">
                <GoogleButton
                  onClick={() => void enter(switchGoogleAccount)}
                  pending={busy}
                >
                  Use a different Google account
                </GoogleButton>
              </div>

              <TroubleSigningIn inviteId={inviteId} className="mt-8" />
            </div>
          ) : null}

          {step === "unavailable" ? (
            <div>
              <h1 className="text-center text-2xl font-semibold tracking-tight text-ink">
                This invitation isn&apos;t available
              </h1>
              <p className="mt-3 text-center leading-relaxed text-ink-soft">
                It may have been paused. Your answers are safe — get in touch and
                we&apos;ll help.
              </p>

              <TroubleSigningIn inviteId={inviteId} className="mt-8" />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
