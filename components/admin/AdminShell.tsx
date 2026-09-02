"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { useAuthState } from "@/components/auth/useAuthState";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import {
  SignInCancelled,
  apiFetch,
  signInWithGoogle,
  signOutUser,
  switchGoogleAccount,
} from "@/lib/auth/client";

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

type NavItem = {
  href: string;
  label: string;
  /**
   * Shown in the list only from `lg` up.
   *
   * Exercises is reference material rather than a section of the dashboard, and
   * on a phone it earns the inverted button beside the wordmark instead --
   * which also keeps the list at six, so it fills two rows of three exactly.
   */
  desktopOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/exercises", label: "Exercises", desktopOnly: true },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/ai", label: "AI configuration" },
  { href: "/admin/settings", label: "Settings" },
];

type Gate = "checking" | "signed-out" | "denied" | "allowed" | "unavailable";

/** What the server can tell us; "signed-out" is derived from auth state. */
type ServerGate = Exclude<Gate, "signed-out"> | "signed-out";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuthState();

  const [serverGate, setServerGate] = useState<ServerGate>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (alive: () => boolean) => {
    // Reset first: after switching accounts in place, holding the previous
    // verdict would show "access denied" against the new address until the
    // answer came back.
    setServerGate("checking");

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

  /**
   * `switchGoogleAccount` on the denied screen ends the session before
   * reopening Google, so one tap changes account -- signing out alone left the
   * administrator back on the sign-in screen needing a second tap.
   */
  async function handleSignIn(signIn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (caught) {
      if (!(caught instanceof SignInCancelled)) {
        setError("We couldn't complete sign-in. Please try again.");
      }
    } finally {
      setBusy(false);
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
                <GoogleButton
                  onClick={() => void handleSignIn(signInWithGoogle)}
                  pending={busy}
                />
              </div>
            </>
          ) : null}

          {gate === "denied" ? (
            <>
              {/*
                Naming the rejected address, not the authorised one: the admin
                address still never reaches the client bundle (§89), while
                whoever is looking at this can see which of their accounts the
                browser actually used.
              */}
              <p className="mt-3 leading-relaxed text-ink-soft">
                {user?.email ? (
                  <>
                    <strong className="font-semibold text-ink">{user.email}</strong>{" "}
                    isn&apos;t authorised to manage the Passion Analyzer.
                  </>
                ) : (
                  <>This account isn&apos;t authorised to manage the Passion Analyzer.</>
                )}
              </p>

              {error ? (
                <Notice tone="error" className="mt-6 text-left">
                  {error}
                </Notice>
              ) : null}

              <div className="mt-8">
                <GoogleButton
                  onClick={() => void handleSignIn(switchGoogleAccount)}
                  pending={busy}
                >
                  Use a different Google account
                </GoogleButton>
              </div>
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
          <div className="min-w-0">
            <p className="font-semibold text-on-brand">CollabNGrow</p>
            <p className="text-xs text-on-brand">Passion Analyzer</p>
          </div>

          {/*
            Inverted against the navigation on purpose: this opens the exercise
            content itself, which is reference material rather than another
            section of the dashboard, and the inversion says so before the label
            is read. `ml-auto` claims the empty space beside the wordmark.
          */}
          <Link
            href="/admin/exercises"
            aria-current={pathname.startsWith("/admin/exercises") ? "page" : undefined}
            className={
              "ml-auto shrink-0 rounded-md border border-surface bg-surface " +
              "px-3 py-2 text-sm font-semibold text-brand " +
              "transition-colors duration-150 hover:bg-brand-soft lg:hidden"
            }
          >
            Exercises
          </Link>
        </div>

        <nav aria-label="Admin sections" className="px-3 pb-4 lg:px-4">
          {/*
            Three to a row rather than one scrolling strip: six items did not fit
            a phone, and a horizontal scroll hides the last three behind a
            gesture nobody is told about. A grid wraps them at a fixed three so
            the rows stay even whatever the labels say; the sidebar returns to a
            single column from `lg` up.
          */}
          <ul className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);

              return (
                <li key={item.href} className={item.desktopOnly ? "hidden lg:block" : undefined}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "block rounded-md border px-3 py-2.5 text-center text-sm",
                      "font-medium transition-colors duration-150",
                      "lg:px-4 lg:text-left",
                      // The outline is the constant; the fill is what changes.
                      // Current page inverts to white-on-rose reversed, which is
                      // a stronger signal than a tint and survives §73's rule
                      // that state never rests on colour alone -- aria-current
                      // carries it for anyone the inversion does not reach.
                      "border-surface",
                      active
                        ? "bg-surface font-semibold text-brand"
                        : "text-on-brand hover:bg-on-brand/10",
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
          <p className="truncate px-4 text-xs text-on-brand" title={email ?? ""}>
            {email}
          </p>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="mt-2 rounded-md px-4 py-2 text-sm text-on-brand hover:bg-on-brand/10"
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
