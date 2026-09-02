import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";
import { describe, expect, it } from "vitest";

import { buildInterpretationPrompt } from "@/lib/ai/prompts";
import { selectKnowledge } from "@/lib/ai/retrieval";
import { interpretationResponseSchema, interpretationSchema } from "@/lib/ai/schema";
import { getSection, questionsInSection } from "@/lib/exercise";

/**
 * End-to-end smoke test for the interpretation engine.
 *
 *   npm run smoke:ai            -- the ox: what a participant took on themselves
 *   npm run smoke:ai part-12    -- any other section id
 *
 * Costs one real model call, so it runs under its own config and never as part
 * of `npm test`.
 *
 * This builds its request through `buildInterpretationPrompt` and
 * `selectKnowledge` -- the real ones. The previous version of this script kept a
 * private copy of the system instruction and sent no framework context
 * whatsoever, so it could pass while proving nothing about the knowledge base.
 * If the prompt or the retrieval changes, this has to change with it, which is
 * the point.
 *
 * It checks the rules that matter most (§38I provenance, §41 false certainty,
 * §42 generic coaching) and then prints the reflection, because whether the
 * output is actually good is a judgement no assertion makes for you.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const file of [".env", ".env.local"]) {
  let raw: string;
  try {
    raw = readFileSync(resolve(ROOT, file), "utf8");
  } catch {
    continue;
  }
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trimStart().startsWith("#")) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[line.slice(0, i).trim()] = v;
  }
}

/**
 * Answers written to be read two ways.
 *
 * A generic assistant reads this as burnout and recommends boundaries and
 * delegation. The framework should instead notice that every weight named was
 * picked up rather than imposed, that it was accepted out of regard for
 * something, and that the participant cannot say which of it is theirs -- and
 * it should not tell them to put any of it down.
 */
const ANSWERS: Record<string, string> = {
  q7: `I run the family business my father started. Nobody asked me to take it -- my
sister didn't want it and he never actually said he wanted me to. I decided it would
be mine. I also do the payroll myself even though we can afford a bookkeeper, and I
take the difficult client calls that my ops manager could handle perfectly well. If
someone on the team is struggling I end up carrying their work rather than having the
conversation.`,

  q8: `Him, mostly. He built it from nothing and never once complained where we could
hear it. There's an idea I've had since I was about twelve of the kind of man who
doesn't put things down, and I think I've been trying to be that man for thirty years.
It's not that anyone would be disappointed in me. I'd be disappointed in me.`,

  q9: `I genuinely don't know and I've been sitting here a while. The business I'd say
yes. The payroll, honestly no, I think I just like knowing. The rest of it I can't
separate. I've never been asked this and I notice I don't have an answer ready, which
bothers me more than the question does.`,

  q10: `The business, yes, all of it again. The bit where I cover for people instead of
speaking to them -- no. That one I've been doing for my own comfort and calling it
loyalty, and I've known that for a while without saying it.`,
};

const PRIOR = `What Have You Stopped Wanting?: I was going to build something of my own,
separate from the business. Not because the business is bad. Just mine. I haven't said
that out loud to anyone in about eight years, including my wife.`;

describe("interpretation engine smoke test", () => {
  it("generates a reflection through the real prompt and knowledge base", async () => {
    const apiKey = process.env.GEMINI_API_KEY_1;
    if (!apiKey) throw new Error("GEMINI_API_KEY_1 is not set.");

    const sectionId = process.env.SMOKE_SECTION ?? "part-3";
    const model = process.env.SMOKE_MODEL ?? "gemini-3.6-flash";

    const section = getSection(sectionId);
    if (!section) throw new Error(`No such section: ${sectionId}`);

    const answers = questionsInSection(sectionId)
      .filter((question) => ANSWERS[question.id])
      .map((question) => ({ question, answer: ANSWERS[question.id] }));

    if (answers.length === 0) {
      throw new Error(
        `No sample answers for ${sectionId}. This fixture covers part-3; add answers ` +
          `keyed by question id to run another section.`,
      );
    }

    const knowledge = selectKnowledge({
      sectionId,
      text: answers.map((entry) => entry.answer).join("\n"),
    });

    const { systemInstruction, prompt } = buildInterpretationPrompt({
      section,
      answers,
      priorAnswers: [],
      knowledge,
    });

    const framework = knowledge.map((item) => item.id);
    console.log(`\nsmoke:ai — ${model}, section ${sectionId} (${section.title})`);
    console.log(
      `knowledge: ${knowledge.length} items, ` +
        `prompt ${prompt.split(/\s+/).length} words\n` +
        `  ${framework.join("\n  ")}\n`,
    );

    const ai = new GoogleGenAI({ apiKey });
    const started = Date.now();

    const response = await ai.models.generateContent({
      model,
      contents: `${prompt}\n\nEarlier answer, for continuity only:\n${PRIOR}`,
      config: {
        systemInstruction,
        temperature: 0.7,
        // Mirrors lib/ai/generate.ts exactly. A smoke test run with a roomier
        // budget than production passes while the live route truncates its JSON
        // mid-object, which is the failure this is here to catch.
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 512 },
        responseMimeType: "application/json",
        responseSchema: interpretationResponseSchema,
      },
    });

    const elapsed = Date.now() - started;
    const usage = response.usageMetadata ?? {};
    console.log(
      `finishReason=${response.candidates?.[0]?.finishReason ?? "?"} ` +
        `prompt=${usage.promptTokenCount ?? "?"} output=${usage.candidatesTokenCount ?? "?"} ` +
        `total=${usage.totalTokenCount ?? "?"} in ${elapsed} ms\n`,
    );

    const raw = (response.text ?? "")
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    const parsed = interpretationSchema.parse(JSON.parse(raw));

    console.log("--- generated reflection ---\n");
    console.log("OBSERVATION:\n" + parsed.observation + "\n");
    console.log("INTERPRETATION:\n" + parsed.interpretation + "\n");
    if (parsed.tension) console.log("TENSION:\n" + parsed.tension + "\n");
    if (parsed.reflection) console.log("REFLECTION:\n" + parsed.reflection + "\n");
    console.log("THEMES:", parsed.relevantThemes.join(", ") || "(none)");
    console.log("CONFIDENCE:", parsed.confidence, "\n");

    const output = JSON.stringify(parsed).toLowerCase();

    // §38I: provenance must never surface, however the images are used.
    for (const term of [
      "nietzsche",
      "zarathustra",
      "philosopher",
      "the book",
      "according to",
      "framework",
    ]) {
      expect(output, `leaked provenance: ${term}`).not.toContain(term);
    }

    // §41: no false certainty.
    for (const term of ["you are definitely", "you always", "you never"]) {
      expect(output, `false certainty: ${term}`).not.toContain(term);
    }

    // §42 / §38G: not generic coaching.
    for (const term of [
      "great potential",
      "believe in yourself",
      "set boundaries",
      "work-life balance",
    ]) {
      expect(output, `generic coaching: ${term}`).not.toContain(term);
    }

    // It must engage with what this person actually wrote.
    const anchored = ["payroll", "father", "sister", "bookkeeper", "loyalty", "business"];
    expect(
      anchored.some((term) => output.includes(term)),
      "reflection is not anchored in the participant's own detail",
    ).toBe(true);

    /*
     * The figure the section is built on has to be named, not paraphrased away.
     * The participant has just answered a part titled "The Ox", so the word is
     * shared language; speaking only in paraphrase ("a voluntary burden") makes
     * the reflection vaguer than the question that prompted it.
     */
    if (sectionId === "part-3") {
      expect(output, "the section's figure was never named").toContain("ox");
    }

    /* Naming the figure is not assigning a rank, and that line must hold. */
    for (const verdict of ["you are an ox", "you are a tiger", "you are the child"]) {
      expect(output, `stage verdict: ${verdict}`).not.toContain(verdict);
    }

    /*
     * Length is a hard constraint: the live route caps at 4096 output tokens
     * with 512 of that charged to thinking, and an overrun truncates the JSON
     * mid-object so the participant receives nothing at all.
     */
    const total = [
      parsed.observation,
      parsed.interpretation,
      parsed.tension ?? "",
      parsed.reflection ?? "",
    ].join(" ");
    expect(total.split(/\s+/).length, "reflection is over length").toBeLessThan(400);
    expect(response.candidates?.[0]?.finishReason).toBe("STOP");
  });
});
