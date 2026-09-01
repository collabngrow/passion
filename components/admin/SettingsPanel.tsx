"use client";

import { useCallback, useEffect, useState } from "react";

import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";

/**
 * System settings (master_prompt.md §66, §98).
 *
 * Read-only. Secrets are configured through environment variables, never
 * through a form -- a UI that writes keys would have to hold them in a browser,
 * which §51 rules out.
 */

type SystemStatus = {
  configuration: {
    firebaseAdmin: boolean;
    encryptionKey: boolean;
    inviteGrantSecret: boolean;
    geminiKeyCount: number;
  };
  content: {
    exerciseVersion: string;
    totalQuestions: number;
    knowledgeBaseVersion: string;
  };
  administrator: string;
};

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
      <span className="text-sm text-ink">{label}</span>
      <span className="flex items-baseline gap-3">
        <span className="text-xs text-ink-soft">{detail}</span>
        {/* Never colour alone (brand §24). */}
        <span
          className={[
            "rounded-sm px-2 py-1 text-xs font-semibold",
            ok ? "bg-positive/10 text-positive" : "bg-critical/10 text-critical",
          ].join(" ")}
        >
          {ok ? "Configured" : "Missing"}
        </span>
      </span>
    </li>
  );
}

export function SettingsPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<SystemStatus>("/api/admin/system");
    if (!alive()) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(result.data);
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
      <p className="mt-2 text-ink-soft">
        Configuration is set through environment variables. Values are never shown here
        — only whether each one is present.
      </p>

      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}

      {status ? (
        <>
          <h2 className="mt-8 text-lg font-semibold text-ink">Server configuration</h2>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            <StatusRow
              label="Firebase Admin credentials"
              ok={status.configuration.firebaseAdmin}
              detail="FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
            />
            <StatusRow
              label="Invitation encryption key"
              ok={status.configuration.encryptionKey}
              detail="INVITATION_PASSWORD_ENCRYPTION_KEY"
            />
            <StatusRow
              label="Invitation grant secret"
              ok={status.configuration.inviteGrantSecret}
              detail="INVITE_GRANT_SECRET"
            />
            <StatusRow
              label="Gemini API keys"
              ok={status.configuration.geminiKeyCount > 0}
              detail={`${status.configuration.geminiKeyCount} of 3 configured`}
            />
          </ul>

          <h2 className="mt-10 text-lg font-semibold text-ink">Content</h2>
          <dl className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            <div className="flex justify-between px-5 py-3 text-sm">
              <dt className="text-ink">Exercise version</dt>
              <dd className="text-ink-soft">
                {status.content.exerciseVersion} · {status.content.totalQuestions} questions
              </dd>
            </div>
            <div className="flex justify-between px-5 py-3 text-sm">
              <dt className="text-ink">Knowledge base version</dt>
              <dd className="text-ink-soft">{status.content.knowledgeBaseVersion}</dd>
            </div>
            <div className="flex justify-between px-5 py-3 text-sm">
              <dt className="text-ink">Administrator</dt>
              <dd className="text-ink-soft">{status.administrator}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </div>
  );
}
