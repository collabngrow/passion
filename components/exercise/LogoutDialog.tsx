"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";
import { apiFetch, signOutUser } from "@/lib/auth/client";

/**
 * Logout confirmation (master_prompt.md §19).
 *
 * The wording matters: returning requires the invitation password *and* Google
 * verification again, and a participant should know that before they choose it
 * — there is no password recovery (§20).
 *
 * Logging out clears both the Firebase session and the invitation grant cookie.
 * Clearing only the first would let a returning participant back in without the
 * password, which is exactly what §19 says must not happen.
 */
export function LogoutDialog({
  open,
  onCancel,
}: {
  open: boolean;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog and return it on close, keep Tab inside it, and
  // let Escape cancel (§73: accessible modals).
  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      // aria-modal alone does not stop Tab: without this, the third Tab leaves
      // the dialog for the journey behind it, where a keyboard user is
      // operating a page the dialog claims has been made inert. The dialog
      // holds exactly two buttons, so the ends of the list are the wrap points.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey ? active === first : active === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!dialogRef.current?.contains(active)) {
        // Focus escaped some other way (a click on the backdrop, say); bring it
        // back rather than letting Tab continue from outside.
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  async function handleLogout() {
    // Clear the grant first: if the page unloads midway, having ended the
    // password proof without the session is the safer half-state.
    await apiFetch("/api/auth/logout", { method: "POST" });
    await signOutUser();

    // A full document navigation, deliberately, rather than a client-side
    // route change. Logging out should leave nothing of this participant in
    // memory, and a soft navigation would keep their loaded answers alive in
    // React state on a shared or borrowed device.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-description"
        className="w-full max-w-md rounded-lg bg-surface p-6 shadow-lg"
      >
        <h2 id="logout-title" className="text-lg font-semibold text-ink">
          Are you sure you want to log out?
        </h2>
        <p id="logout-description" className="mt-3 leading-relaxed text-ink-soft">
          When you return, you&apos;ll need your invitation password and Google
          verification to confirm your identity again. Your answers are saved.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button onClick={() => void handleLogout()} className="sm:flex-1">
            Log out
          </Button>
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={onCancel}
            className="sm:flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
