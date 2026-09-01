"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { useAuthState } from "@/components/auth/useAuthState";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { SignInCancelled, apiFetch, signInWithGoogle, signOutUser } from "@/lib/auth/client";

/**
 * Administrator dashboard shell (master_prompt.md §22, §66; brand §8, §17).
 *
 * Rose navigation against a white workspace, a professional control centre
 * rather than a developer console.
 *
 * The gate here is presentation. Whether someone is the administrator is
 * decided by the server, on every request, by requireAdmin() -- this component
 * only asks /api/admin/me and renders the answer, so there is no admin address
 * in the client bundle to compare against (§89).
 */

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/ai", label: "AI configuration" },
  { href: "/admin/settings", label: "Settings" },
] as const;

type Gate = "checking" | "signed-out" | "denied" | "allowed" | "unavailable";

/** What the server can tell us; "signed-out" is derived from auth state. */
type ServerGate = Exclude<Gate, "signed-out"> | "signed-out";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuthState();

  const [serverGate, setServerGate] = useState<ServerGate>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<{ email: string }>("/api/admin/me");
    if (!alive()) return;

    if (result.ok) {
      setEmail(result.data.email);
      setServerGate("allowed");
      return;
    }

    if (result.status === 403) setServerGate("denied");
    else if (result.status === 401) setServerGate("signed-out");
    else setServerGate("unavailable");
  }, []);

  useEffect(() => {
    if (loading || !user) return;

    let active = true;
    // See the note in InviteFlow: the rule cannot see that setState happens
    // after an awaited fetch rather than synchronously in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check(() => active);
    return () => {
      active = false;
    };
  }, [loading, user, check]);

  // Derived rather than stored: being signed out is knowable from auth state
  // alone, and writing it into state during an effect would cause an extra
  // render for something already available.
  const gate: Gate = loading ? "checking" : !user ? "signed-out" : serverGate;

  async function handleSignIn() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (caught) {
      if (!(caught instanceof SignInCancelled)) {
        setError("We couldn't complete sign-in. Please try again.");
      }
    }
  }

  if (loading || gate === "checking") {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p role="status" className="text-ink-soft">
          Loading…
        </p>
      </main>
    );
  }

  if (gate === "signed-out" || gate === "denied" || gate === "unavailable") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center">
            <Logo size="lg" label="CollabNGrow" priority />
          </div>

          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">
            {gate === "signed-out" ? "Administrator sign-in" : "Access denied"}
          </h1>

          {gate === "signed-out" ? (
            <>
              <p className="mt-3 leading-relaxed text-ink-soft">
                Sign in with the administrator Google account to continue.
              </p>
              {error ? (
                <Notice tone="error" className="mt-6 text-left">
                  {error}
                </Notice>
              ) : null}
              <div className="mt-8">
                <GoogleButton onClick={handleSignIn} />
              </div>
            </>
          ) : null}

          {gate === "denied" ? (
            <>
              <p className="mt-3 leading-relaxed text-ink-soft">
                This account isn&apos;t authorised to manage the Passion Analyzer.
              </p>
              <Button
                variant="secondary"
                className="mt-8"
                onClick={() => void signOutUser()}
              >
                Sign in with a different account
              </Button>
            </>
          ) : null}

          {gate === "unavailable" ? (
            <p className="mt-3 leading-relaxed text-ink-soft">
              We couldn&apos;t check your access just now. Please try again.
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      {/*
        Every admin page puts the six-item navigation before the workspace, so
        without this a keyboard user tabs the whole nav on every page (§73).
      */}
      <a href="#admin-workspace" className="skip-link">
        Skip to content
      </a>

      {/* Rose navigation, white workspace (brand §8, §17). */}
      <header className="on-brand-surface bg-brand-dark lg:w-64 lg:shrink-0">
        <div className="flex items-center gap-3 px-5 py-4 lg:px-6 lg:py-6">
          <Logo size="sm" />
          <div>
            <p className="font-semibold text-on-brand">CollabNGrow</p>
            <p className="text-xs text-on-brand/90">Passion Analyzer</p>
          </div>
        </div>

        <nav aria-label="Admin sections" className="px-3 pb-4 lg:px-4">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);

              return (
                <li key={item.href} className="shrink-0 lg:shrink">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "block rounded-md px-4 py-2.5 text-sm font-medium",
                      "transition-colors duration-150 whitespace-nowrap",
                      active
                        ? "bg-surface text-brand"
                        : "text-on-brand/90 hover:bg-on-brand/10",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden px-4 pb-6 lg:block">
          <p className="truncate px-4 text-xs text-on-brand/90" title={email ?? ""}>
            {email}
          </p>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="mt-2 rounded-md px-4 py-2 text-sm text-on-brand/90 hover:bg-on-brand/10"
          >
            Sign out
          </button>
        </div>
      </header>

      <main
        id="admin-workspace"
        tabIndex={-1}
        className="flex-1 bg-canvas px-5 py-8 outline-none sm:px-8 lg:px-10 lg:py-10"
      >
        {children}
      </main>
    </div>
  );
}
