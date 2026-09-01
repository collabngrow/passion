import "server-only";

import { Timestamp, db } from "@/lib/firebase/admin";
import { exerciseVersion, firstQuestion } from "@/lib/exercise";
import type { Participant, ParticipantProgress } from "@/lib/invitations/types";

/**
 * Participant persistence (master_prompt.md §11, §12, §45).
 *
 * §12 data minimisation: the profile holds only what the exercise requires --
 * name, age, nationality, the verified Google email, the Firebase uid, the
 * invitation id, and progress. Nothing else is collected.
 */

const COLLECTION = "participants";

function ref(uid: string) {
  return db().collection(COLLECTION).doc(uid);
}

export async function getParticipant(uid: string): Promise<Participant | null> {
  const snapshot = await ref(uid).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as Participant;
}

export type CreateParticipantInput = {
  uid: string;
  inviteId: string;
  /** From the verified Firebase token, never from the form (§56). */
  email: string;
  name: string;
  age: number;
  nationality: string;
  /** Feedback survey Q2, captured before the exercise begins. */
  willingnessToPay?: number;
};

/**
 * Creates the participant profile at the end of onboarding.
 *
 * Uses `create` rather than `set`, so a duplicate submission cannot silently
 * reset an existing participant's progress back to question one.
 */
export async function createParticipant(
  input: CreateParticipantInput,
): Promise<Participant> {
  const now = Timestamp.now();

  const participant: Participant = {
    uid: input.uid,
    inviteId: input.inviteId,
    email: input.email,
    name: input.name,
    age: input.age,
    nationality: input.nationality,
    willingnessToPay: input.willingnessToPay,
    exerciseVersion,
    progress: {
      answered: [],
      currentQuestionId: firstQuestion().id,
      reflectedSections: [],
    },
    createdAt: now,
    updatedAt: now,
  };

  await ref(input.uid).create(participant);
  return participant;
}

/** Updates progress after an answer is saved (§45). */
export async function updateProgress(
  uid: string,
  progress: Partial<ParticipantProgress>,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };

  for (const [key, value] of Object.entries(progress)) {
    if (value !== undefined) update[`progress.${key}`] = value;
  }

  await ref(uid).update(update);
}

/**
 * Fields safe to send to the participant's own browser.
 *
 * The participant may see all of their own profile; this shape exists to keep
 * Firestore Timestamps out of the client and to make the boundary explicit.
 */
export type ParticipantView = {
  name: string;
  email: string;
  inviteId: string;
  exerciseVersion: string;
  progress: {
    answered: string[];
    currentQuestionId: string;
    reflectedSections: string[];
    completedAt?: string;
  };
  willingnessToPay?: number;
};

export function toParticipantView(participant: Participant): ParticipantView {
  return {
    name: participant.name,
    email: participant.email,
    inviteId: participant.inviteId,
    exerciseVersion: participant.exerciseVersion,
    progress: {
      answered: participant.progress?.answered ?? [],
      currentQuestionId:
        participant.progress?.currentQuestionId ?? firstQuestion().id,
      reflectedSections: participant.progress?.reflectedSections ?? [],
      completedAt: participant.progress?.completedAt?.toDate().toISOString(),
    },
    willingnessToPay: participant.willingnessToPay,
  };
}
