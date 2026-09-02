"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { apiFetch, reauthenticateWithGoogle, SignInCancelled } from "@/lib/auth/client";

/**
 * One invitation, with its sensitive actions (master_prompt.md §24–§31, §65).
 *
 * The password arrives with the listing, decrypted server-side behind the admin
 * check, and is shown outright. There is no reveal step: the administrator
 * issues these passwords and has to read them out to invite anyone, so a second
 * Google reauthentication only stood between them and their own data.
 *
 * It is still only ever held in component state -- never localStorage,
 * sessionStorage, IndexedDB, a URL or a log (§28) -- and goes when the page does.
 */

export type InvitationSummaryView = {
  inviteId: string;
  status: "active" | "disabled";
  label?: string;
  password?: string;
  formattedPassword?: string;
  bound: boolean;
  boundEmail?: string;
  createdAt: string;
  lastUsedAt?: string;
};

type Props = {
  invitation: InvitationSummaryView;
  inviteUrl: (inviteId: string) => string;
  onChanged: () => void;
};

export function InvitationRow({ invitation, inviteUrl, onChanged }: Props) {
  /**
   * Set only by a rotation, so the new password is on screen immediately rather
   * than after the listing refetches. Otherwise the listing's copy is the truth.
   */
  const [rotated, setRotated] = useState<{
    password: string;
    formattedPassword: string;
  } | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const password = rotated?.password ?? invitation.password;
  const formatted = rotated?.formattedPassword ?? invitation.formattedPassword ?? password;

  const url = inviteUrl(invitation.inviteId);

  async function copy(text: string, what: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} copied.`);
    } catch {
      setError("We couldn't copy that. You can select the text instead.");
    }
  }

  /**
   * Share (§29, §64). Uses the Web Share API where available, and falls back to
   * the clipboard. Nothing is fetched and nothing is reauthenticated -- the
   * password is already on screen, so asking again would confirm nothing.
   */
  async function handleShare() {
    if (!password) {
      setError("This invitation's password can't be read. Rotate it to issue a new one.");
      return;
    }

    setError(null);

    // No internal ids or implementation detail (§29).
    const text =
      `Here is your private CollabNGrow Passion Analyzer invitation.\n\n` +
      `Link:\n${url}\n\nPassword:\n${formatted ?? password}`;

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Your Passion Analyzer invitation", text });
        return;
      } catch {
        // Cancelled or unsupported in this context; fall through to clipboard.
      }
    }
    await copy(text, "Invitation");
  }

  /**
   * Rotation still requires a recent Google reauthentication (§25, §26). It is
   * destructive -- the old password stops working the instant the new one
   * starts -- which is a different question from reading one.
   */
  async function handleRotate() {
    if (
      !window.confirm(
        "Rotate this password?\n\nThe old password stops working immediately. " +
          "The participant keeps their answers and progress.",
      )
    ) {
      return;
    }

    const path = `/api/admin/invitations/${invitation.inviteId}/rotate-password`;
    setError(null);
    setNotice(null);
    setBusy("rotate");

    try {
      let result = await apiFetch<{ password: string; formattedPassword: string }>(path, {
        method: "POST",
      });

      if (!result.ok && result.code === "reauthentication_required") {
        await reauthenticateWithGoogle();
        result = await apiFetch(path, { method: "POST" });
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setRotated(result.data);
      setNotice("Password rotated. The old one no longer works.");
      onChanged();
    } catch (caught) {
      if (!(caught instanceof SignInCancelled)) {
        setError("We couldn't confirm your identity. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus() {
    const next = invitation.status === "active" ? "disabled" : "active";
    setBusy("status");
    setError(null);

    const result = await apiFetch(
      `/api/admin/invitations/${invitation.inviteId}/status`,
      { method: "POST", body: JSON.stringify({ status: next }) },
    );
    setBusy(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  const disabled = invitation.status === "disabled";

  return (
    <li className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-ink">{invitation.inviteId}</p>
          {invitation.label ? (
            <p className="mt-1 truncate text-sm text-ink-soft">{invitation.label}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status is never colour alone (brand §24). */}
          <span
            className={[
              "rounded-sm px-2 py-1 text-xs font-semibold",
              disabled ? "bg-line text-ink-soft" : "bg-positive/10 text-positive",
            ].join(" ")}
          >
            {disabled ? "Disabled" : "Active"}
          </span>
          <span
            className={[
              "rounded-sm px-2 py-1 text-xs font-semibold",
              invitation.bound ? "bg-brand-tint text-brand-dark" : "bg-line text-ink-soft",
            ].join(" ")}
          >
            {invitation.bound ? "Claimed" : "Unclaimed"}
          </span>
        </div>
      </div>

      {invitation.boundEmail ? (
        <p className="mt-3 truncate text-sm text-ink-soft">{invitation.boundEmail}</p>
      ) : null}

      <div className="mt-4">
        <span className="block text-xs font-medium uppercase tracking-wide text-ink-soft">
          Password
        </span>
        {password ? (
          <p className="mt-1 font-mono text-sm text-ink">{formatted}</p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            Unreadable — rotate it to issue a new one.
          </p>
        )}
      </div>

      {error ? (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="success" className="mt-4">
          {notice}
        </Notice>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => void handleShare()} disabled={!password}>
          Share
        </Button>

        <Button
          variant="secondary"
          onClick={() => password && void copy(password, "Password")}
          disabled={!password}
        >
          Copy password
        </Button>

        <Button variant="secondary" onClick={() => void copy(url, "Link")}>
          Copy link
        </Button>

        <Button variant="quiet" onClick={() => void handleRotate()} disabled={busy !== null}>
          {busy === "rotate" ? "Rotating…" : "Rotate password"}
        </Button>

        <Button variant="quiet" onClick={() => void handleStatus()} disabled={busy !== null}>
          {disabled ? "Enable" : "Disable"}
        </Button>
      </div>
    </li>
  );
}
