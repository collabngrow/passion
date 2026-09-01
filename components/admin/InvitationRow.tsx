"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { apiFetch, reauthenticateWithGoogle, SignInCancelled } from "@/lib/auth/client";

/**
 * One invitation, with its sensitive actions (master_prompt.md §24–§31, §65).
 *
 * The password is masked by default (§24) and only ever held in component
 * state -- never localStorage, sessionStorage, IndexedDB, a URL or a log (§28).
 * It is dropped from state as soon as the row is hidden or the page changes.
 */

export type InvitationSummaryView = {
  inviteId: string;
  status: "active" | "disabled";
  label?: string;
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
  const [password, setPassword] = useState<string | null>(null);
  const [formatted, setFormatted] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const url = inviteUrl(invitation.inviteId);

  /**
   * Runs a sensitive action, prompting for a real Google reauthentication when
   * the server says the session is not fresh enough (§25, §26).
   */
  async function sensitive(
    path: string,
    action: string,
  ): Promise<{ password: string; formattedPassword: string } | null> {
    setError(null);
    setNotice(null);
    setBusy(action);

    try {
      let result = await apiFetch<{ password: string; formattedPassword: string }>(
        path,
        { method: "POST" },
      );

      if (!result.ok && result.code === "reauthentication_required") {
        await reauthenticateWithGoogle();
        result = await apiFetch(path, { method: "POST" });
      }

      if (!result.ok) {
        setError(result.error);
        return null;
      }

      return result.data;
    } catch (caught) {
      if (!(caught instanceof SignInCancelled)) {
        setError("We couldn't confirm your identity. Please try again.");
      }
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleReveal() {
    const data = await sensitive(
      `/api/admin/invitations/${invitation.inviteId}/reveal-password`,
      "reveal",
    );
    if (data) {
      setPassword(data.password);
      setFormatted(data.formattedPassword);
    }
  }

  async function handleRotate() {
    if (
      !window.confirm(
        "Rotate this password?\n\nThe old password stops working immediately. " +
          "The participant keeps their answers and progress.",
      )
    ) {
      return;
    }

    const data = await sensitive(
      `/api/admin/invitations/${invitation.inviteId}/rotate-password`,
      "rotate",
    );
    if (data) {
      setPassword(data.password);
      setFormatted(data.formattedPassword);
      setNotice("Password rotated. The old one no longer works.");
      onChanged();
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

  function hide() {
    setPassword(null);
    setFormatted(null);
    setNotice(null);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} copied.`);
    } catch {
      setError("We couldn't copy that. You can select the text instead.");
    }
  }

  /**
   * Share (§29, §64). Uses the Web Share API where available, and only sends
   * the password when the administrator explicitly asks to share.
   */
  async function handleShare() {
    if (!password) {
      const data = await sensitive(
        `/api/admin/invitations/${invitation.inviteId}/reveal-password`,
        "share",
      );
      if (!data) return;
      setPassword(data.password);
      setFormatted(data.formattedPassword);
      await share(data.formattedPassword);
      return;
    }
    await share(formatted ?? password);
  }

  async function share(pw: string) {
    // No internal ids or implementation detail (§29).
    const text =
      `Here is your private CollabNGrow Passion Analyzer invitation.\n\n` +
      `Link:\n${url}\n\nPassword:\n${pw}`;

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
        <p className="mt-1 font-mono text-sm text-ink">
          {password ? formatted ?? password : "••••••••••••"}
        </p>
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
        {password ? (
          <>
            <Button onClick={() => void copy(password, "Password")}>Copy</Button>
            <Button variant="secondary" onClick={hide}>
              Hide
            </Button>
          </>
        ) : (
          <Button onClick={() => void handleReveal()} disabled={busy !== null}>
            {busy === "reveal" ? "Confirming…" : "Reveal password"}
          </Button>
        )}

        <Button variant="secondary" onClick={() => void handleShare()} disabled={busy !== null}>
          {busy === "share" ? "Preparing…" : "Share"}
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
