"use client";

import { useCallback, useEffect, useState } from "react";

import { InvitationRow, type InvitationSummaryView } from "@/components/admin/InvitationRow";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";

/**
 * Invitation management (master_prompt.md §23, §55, §65).
 *
 * Passwords come down with the listing, decrypted server-side behind the admin
 * check, and each row shows its own. Nothing here is persisted client-side
 * (§28).
 */
export function InvitationsPanel() {
  const [invitations, setInvitations] = useState<InvitationSummaryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ inviteId: string; formatted: string } | null>(
    null,
  );

  const load = useCallback(async (alive: () => boolean = () => true) => {
    const result = await apiFetch<{ invitations: InvitationSummaryView[] }>(
      "/api/admin/invitations",
    );
    if (!alive()) return;

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setInvitations(result.data.invitations);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    const result = await apiFetch<{
      inviteId: string;
      formattedPassword: string;
    }>("/api/admin/invitations", {
      method: "POST",
      body: JSON.stringify({ label: label.trim() || undefined }),
    });

    setCreating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCreated({
      inviteId: result.data.inviteId,
      formatted: result.data.formattedPassword,
    });
    setLabel("");
    await load();
  }

  /**
   * Built from the current origin rather than a configured base URL, so a link
   * copied from a preview deployment points at that deployment.
   */
  const inviteUrl = useCallback(
    (inviteId: string) =>
      `${typeof window === "undefined" ? "" : window.location.origin}/invite/${inviteId}`,
    [],
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Invitations</h1>
      <p className="mt-2 text-ink-soft">
        Each invitation is personal, and can be used by one Google account.
      </p>

      <form
        onSubmit={handleCreate}
        className="mt-8 rounded-lg border border-line bg-surface p-5"
      >
        <Field
          label="Create an invitation"
          hint="An optional note for you, such as who it's for. Participants never see it."
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Tanvi"
          maxLength={80}
        />
        <Button type="submit" className="mt-4" disabled={creating}>
          {creating ? "Creating…" : "Create invitation"}
        </Button>
      </form>

      {created ? (
        <Notice tone="success" className="mt-5">
          Invitation <span className="font-mono">{created.inviteId}</span> created. Its
          password is <span className="font-mono font-semibold">{created.formatted}</span>{" "}
          — share it now, or read it again from its row below.
        </Notice>
      ) : null}

      {error ? (
        <Notice tone="error" className="mt-5">
          {error}
        </Notice>
      ) : null}

      {invitations === null ? (
        <p role="status" className="mt-8 text-ink-soft">
          Loading invitations…
        </p>
      ) : invitations.length === 0 ? (
        <div className="mt-8 rounded-lg border border-line bg-brand-soft px-6 py-8 text-center">
          <p className="font-medium text-ink">No invitations yet</p>
          <p className="mt-2 text-sm text-ink-soft">
            Create one above, then share the link and password with the person you
            want to invite.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {invitations.map((invitation) => (
            <InvitationRow
              key={invitation.inviteId}
              invitation={invitation}
              inviteUrl={inviteUrl}
              onChanged={() => void load()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
