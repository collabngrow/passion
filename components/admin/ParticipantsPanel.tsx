"use client";

import { useCallback, useEffect, useState } from "react";

import { Notice } from "@/components/ui/Notice";
import { apiFetch } from "@/lib/auth/client";

/**
 * Participant listing (master_prompt.md §23, §50).
 *
 * Shows identity, binding and progress. Deliberately not answers,
 * interpretations or the synthesis: §50 asks that admin access to participant
 * data be considered rather than a window onto everything, and a participant's
 * written reflection is not something this screen needs.
 */

type Participant = {
  uid: string;
  inviteId: string;
  name: string;
  email: string;
  age: number;
  nationality: string;
  answeredCount: number;
  totalQuestions: number;
  completed: boolean;
  createdAt: string;
};

export function ParticipantsPanel() {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (alive: () => boolean) => {
    const result = await apiFetch<{ participants: Participant[] }>(
      "/api/admin/participants",
    );
    if (!alive()) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setParticipants(result.data.participants);
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
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Participants</h1>
      <p className="mt-2 text-ink-soft">
        Who has started, and how far they have gone. Their answers stay private to them.
      </p>

      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}

      {participants === null ? (
        <p role="status" className="mt-8 text-ink-soft">
          Loading participants…
        </p>
      ) : participants.length === 0 ? (
        <div className="mt-8 rounded-lg border border-line bg-brand-soft px-6 py-8 text-center">
          <p className="font-medium text-ink">Nobody has started yet</p>
          <p className="mt-2 text-sm text-ink-soft">
            Participants appear here once they open their invitation and set up their
            profile.
          </p>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label="Participants"
          className="mt-8 overflow-x-auto rounded-lg border border-line"
        >
          <table className="w-full min-w-[42rem] border-collapse bg-surface text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-brand-soft">
                <th scope="col" className="px-4 py-3 font-semibold text-ink">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink">Email</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink">Invitation</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold text-ink">Progress</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const percent = Math.round((p.answeredCount / p.totalQuestions) * 100);
                // Derived from what the row already carries rather than stored:
                // a status field would be a third copy of the same fact, able to
                // disagree with the count printed beside it.
                const status = p.completed
                  ? "Complete"
                  : p.answeredCount === 0
                    ? "Not started"
                    : "Partially completed";
                return (
                  <tr key={p.uid} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-ink">
                      {p.name}
                      <span className="block text-xs text-ink-soft">
                        {p.age} · {p.nationality}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{p.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                      {p.inviteId}
                    </td>
                    {/*
                      A word, not a colour (§73, brand §24). The progress bar
                      beside it is decorative; this column is the fact.
                    */}
                    <td className="px-4 py-3 whitespace-nowrap text-ink">{status}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink">
                        {p.answeredCount} / {p.totalQuestions}
                      </span>
                      <span
                        className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-line"
                        role="img"
                        aria-label={`${percent}% answered`}
                      >
                        <span
                          className="block h-full bg-brand"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
