import "server-only";

import { fingerprintAnswers, getAllAnswers, getAnswersFor } from "@/lib/answers/store";
import { exercise, getQuestion, getSection, questionsInSection } from "@/lib/exercise";
import { Timestamp, db } from "@/lib/firebase/admin";

import {
  INTERPRETATION_PROMPT_VERSION,
  SYNTHESIS_PROMPT_VERSION,
  buildInterpretationPrompt,
  buildSynthesisPrompt,
} from "./prompts";
import { fullKnowledgeBase, knowledgeBaseVersion, selectKnowledge } from "./retrieval";
import { generate } from "./router";
import {
  interpretationResponseSchema,
  interpretationSchema,
  parseJsonResponse,
  synthesisResponseSchema,
  synthesisSchema,
  type Interpretation,
  type Synthesis,
} from "./schema";

/**
 * Interpretation and synthesis generation
 * (master_prompt.md §59, §76, §77, §92, §93).
 */

export type StoredInterpretation = {
  id: string;
  sectionId: string;
  interpretation: Interpretation;
  model: string;
  provider: string;
  promptVersion: string;
  knowledgeBaseVersion: string;
  createdAt: string;
};

function interpretationsRef(uid: string) {
  return db().collection("participants").doc(uid).collection("interpretations");
}

function synthesisRef(uid: string) {
  return db().collection("participants").doc(uid).collection("synthesis");
}

/**
 * Generates a section reflection, or returns the existing one.
 *
 * §77 and §92: the document id is the section plus a fingerprint of that
 * section's answers, so submitting the same answers again returns the stored
 * result instead of spending another call, while genuinely edited answers
 * produce a new one.
 */
export async function generateSectionInterpretation(
  uid: string,
  sectionId: string,
): Promise<StoredInterpretation | null> {
  const section = getSection(sectionId);
  if (!section) return null;

  const questions = questionsInSection(sectionId);
  const answers = await getAnswersFor(
    uid,
    questions.map((q) => q.id),
  );

  // Nothing written in this section: there is nothing to interpret, and
  // generating anyway would produce exactly the generic content §38G forbids.
  if (answers.length === 0) return null;

  const id = `${sectionId}_${fingerprintAnswers(answers)}`;

  const existing = await interpretationsRef(uid).doc(id).get();
  if (existing.exists) return existing.data() as StoredInterpretation;

  const answerPairs = answers
    .map((entry) => ({ question: getQuestion(entry.questionId)!, answer: entry.answer }))
    .filter((entry) => entry.question);

  const combinedText = answers.map((entry) => entry.answer).join(" ");

  const { systemInstruction, prompt } = buildInterpretationPrompt({
    section,
    answers: answerPairs,
    knowledge: selectKnowledge({ sectionId, text: combinedText }),
  });

  const result = await generate({
    systemInstruction,
    prompt,
    responseSchema: interpretationResponseSchema,
    // 1600 truncated the JSON mid-object on the live smoke test: thinking
    // tokens are charged against this budget, and consumed most of it.
    maxOutputTokens: 4096,
    thinkingBudget: 512,
    temperature: 0.7,
  });

  const interpretation = parseJsonResponse(result.text, interpretationSchema);

  const stored: StoredInterpretation = {
    id,
    sectionId,
    interpretation,
    // §76: which model produced this, so fallback behaviour is visible.
    model: result.model,
    provider: result.provider,
    promptVersion: INTERPRETATION_PROMPT_VERSION,
    knowledgeBaseVersion,
    createdAt: new Date().toISOString(),
  };

  await interpretationsRef(uid).doc(id).set({ ...stored, storedAt: Timestamp.now() });

  return stored;
}

export type StoredSynthesis = {
  synthesis: Synthesis;
  model: string;
  provider: string;
  promptVersion: string;
  knowledgeBaseVersion: string;
  exerciseVersion: string;
  answersFingerprint: string;
  generatedAt: string;
};

/**
 * The final synthesis (§60, §38H, §93).
 *
 * `active` is the current result; each generation is also written to a history
 * document, so regenerating creates a new version rather than silently
 * overwriting (§93).
 *
 * Returns the stored result unchanged when the answers have not changed, so
 * opening the result page never regenerates (§92).
 */
export async function generateSynthesis(
  uid: string,
  options: { force?: boolean } = {},
): Promise<StoredSynthesis | null> {
  const all = await getAllAnswers(uid);

  const answered = exercise.questions
    .filter((question) => typeof all[question.id] === "string")
    .map((question) => ({
      question,
      section: getSection(question.sectionId)?.title ?? question.sectionId,
      answer: all[question.id],
    }));

  if (answered.length === 0) return null;

  const fingerprint = fingerprintAnswers(
    answered.map((entry) => ({ questionId: entry.question.id, answer: entry.answer })),
  );

  const activeRef = synthesisRef(uid).doc("active");

  if (!options.force) {
    const existing = await activeRef.get();
    if (existing.exists) {
      const stored = existing.data() as StoredSynthesis;
      // Same answers, same synthesis. Never regenerate on a page view (§92).
      if (stored.answersFingerprint === fingerprint) return stored;
    }
  }

  const { systemInstruction, prompt } = buildSynthesisPrompt({
    answers: answered,
    // The whole framework: narrowing by theme would exclude exactly the
    // cross-section connections the synthesis exists to find (§38H).
    knowledge: fullKnowledgeBase(),
  });

  const result = await generate({
    systemInstruction,
    prompt,
    responseSchema: synthesisResponseSchema,
    // Sixteen prose sections plus two lists, over every answer in the exercise.
    maxOutputTokens: 16384,
    thinkingBudget: 2048,
    temperature: 0.7,
  });

  const synthesis = parseJsonResponse(result.text, synthesisSchema);

  const stored: StoredSynthesis = {
    synthesis,
    model: result.model,
    provider: result.provider,
    promptVersion: SYNTHESIS_PROMPT_VERSION,
    knowledgeBaseVersion,
    exerciseVersion: exercise.version,
    answersFingerprint: fingerprint,
    generatedAt: new Date().toISOString(),
  };

  const batch = db().batch();
  batch.set(activeRef, { ...stored, storedAt: Timestamp.now() });
  // History, so a regeneration does not destroy what came before (§93).
  batch.set(synthesisRef(uid).doc(`v_${Date.now()}`), {
    ...stored,
    storedAt: Timestamp.now(),
  });
  await batch.commit();

  return stored;
}

/** The stored synthesis, without generating one. */
export async function getStoredSynthesis(uid: string): Promise<StoredSynthesis | null> {
  const snapshot = await synthesisRef(uid).doc("active").get();
  if (!snapshot.exists) return null;
  return snapshot.data() as StoredSynthesis;
}

/** Stored section reflections, newest first. */
export async function listInterpretations(uid: string): Promise<StoredInterpretation[]> {
  const snapshot = await interpretationsRef(uid).get();
  return snapshot.docs
    .map((doc) => doc.data() as StoredInterpretation)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
