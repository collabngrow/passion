"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";

/** Dashboard overview (master_prompt.md §66). */

type Overview = {
  counts: {
    invitations: number;
    active: number;
    claimed: number;
    participants: number;
  };
  recentActions: { type: string; inviteId?: string; at: string }[];
};

const ACTION_LABELS: Record<string, string> = {
  invitation_created: "Invitation created",
  password_revealed: "Password revealed",
  password_rotated: "Password rotated",
  invitation_disabled: "Invitation disabled",
  invitation_enabled: "Invitation enabled",
  ai_config_updated: "AI configuration updated",
};

export function OverviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<Overview>("/api/admin/overview");
    if (!alive()) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  const stats = data
    ? [
        { label: "Invitations", value: data.counts.invitations },
        { label: "Active", value: data.counts.active },
        { label: "Claimed", value: data.counts.claimed },
        { label: "Participants", value: data.counts.participants },
      ]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Overview</h1>
      <p className="mt-2 text-ink-soft">The Passion Analyzer at a glance.</p>

      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}

      {data === null && !error ? (
        <p role="status" className="mt-8 text-ink-soft">
          Loading…
        </p>
      ) : null}

      {data ? (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-line bg-surface px-5 py-4"
              >
                <dt className="text-sm text-ink-soft">{stat.label}</dt>
                <dd className="mt-1 text-3xl font-semibold text-brand">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-10">
            <h2 className="text-lg font-semibold text-ink">Recent activity</h2>
            {data.recentActions.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                Nothing yet. Actions you take on invitations are recorded here.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
                {data.recentActions.map((action, index) => (
                  <li
                    key={`${action.at}-${index}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <span className="text-ink">
                      {ACTION_LABELS[action.type] ?? action.type}
                      {action.inviteId ? (
                        <span className="ml-2 font-mono text-xs text-ink-soft">
                          {action.inviteId}
                        </span>
                      ) : null}
                    </span>
                    <time dateTime={action.at} className="text-xs text-ink-soft">
                      {new Date(action.at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/admin/invitations"
            className="mt-8 inline-block font-medium text-brand underline underline-offset-4 hover:text-brand-dark"
          >
            Manage invitations
          </Link>
        </>
      ) : null}
    </div>
  );
}
