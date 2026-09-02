import { z } from "zod";

/**
 * Structured AI output (master_prompt.md §38N).
 *
 * The model is asked for JSON against these shapes and the result is validated
 * before anything is stored or rendered. §38N: "Validate AI output before
 * storing/rendering it" -- an unvalidated model response is untrusted input,
 * and storing it unchecked would let a malformed generation break the result
 * page for a participant who cannot regenerate it.
 */

/* -------------------------------------------------------------------------
 * Section reflection
 * ---------------------------------------------------------------------- */

export const interpretationSchema = z.object({
  /** What is actually present in the answers. */
  observation: z.string().min(1).max(2000),
  /** What it may indicate, marked as inference. */
  interpretation: z.string().min(1).max(4000),
  relevantThemes: z.array(z.string().max(60)).max(8).default([]),
  /** Meaningful tension, where one genuinely exists (§38N, §p-respect-contradictions). */
  tension: z.string().max(2000).nullable().default(null),
  /** Something to sit with. */
  reflection: z.string().max(2000).nullable().default(null),
  confidence: z.enum(["low", "moderate", "high"]).default("moderate"),
});

export type Interpretation = z.infer<typeof interpretationSchema>;

/**
 * JSON schema handed to the provider.
 *
 * Written out rather than derived, because the provider's schema dialect is
 * narrower than JSON Schema and a generated one tends to include keywords it
 * rejects.
 */
export const interpretationResponseSchema = {
  type: "object",
  properties: {
    observation: { type: "string" },
    interpretation: { type: "string" },
    relevantThemes: { type: "array", items: { type: "string" } },
    tension: { type: "string" },
    reflection: { type: "string" },
    confidence: { type: "string", enum: ["low", "moderate", "high"] },
  },
  required: ["observation", "interpretation"],
} as const;

/* -------------------------------------------------------------------------
 * Final synthesis
 * ---------------------------------------------------------------------- */

const section = z.string().max(6000);

/**
 * The sixteen categories §60 requires, following the exercise's own arc.
 *
 * Field names describe what the participant wrote about rather than naming any
 * framework concept: §38I forbids provenance anywhere in the data model,
 * because field names surface in exports and in the admin view. "whatYouCarry"
 * is safe in a way that a term of art would not be.
 */
export const synthesisSchema = z.object({
  whatYouCarry: section,
  whatYouHaveRefused: section,
  whatYouWouldMake: section,
  comfortableLife: section,
  theCrossing: section,
  body: section,
  inheritedValues: section,
  money: section,
  thoseYouWalkWith: section,
  whatYouGive: section,
  whatWeighsOnYou: section,
  strengths: section,
  contradictions: section,
  yourOwnGoodAndBad: section,
  threePriorities: z.array(z.string().max(1000)).min(1).max(3),
  thirtyDayCommitments: z.array(z.string().max(1000)).min(1).max(3),
  /** Short opening statement for the result page. */
  opening: z.string().max(2000).default(""),
});

export type Synthesis = z.infer<typeof synthesisSchema>;

export const synthesisResponseSchema = {
  type: "object",
  properties: {
    opening: { type: "string" },
    whatYouCarry: { type: "string" },
    whatYouHaveRefused: { type: "string" },
    whatYouWouldMake: { type: "string" },
    comfortableLife: { type: "string" },
    theCrossing: { type: "string" },
    body: { type: "string" },
    inheritedValues: { type: "string" },
    money: { type: "string" },
    thoseYouWalkWith: { type: "string" },
    whatYouGive: { type: "string" },
    whatWeighsOnYou: { type: "string" },
    strengths: { type: "string" },
    contradictions: { type: "string" },
    yourOwnGoodAndBad: { type: "string" },
    threePriorities: { type: "array", items: { type: "string" } },
    thirtyDayCommitments: { type: "array", items: { type: "string" } },
  },
  required: [
    "whatYouCarry",
    "whatYouHaveRefused",
    "whatYouWouldMake",
    "yourOwnGoodAndBad",
    "threePriorities",
    "thirtyDayCommitments",
  ],
} as const;

/* -------------------------------------------------------------------------
 * Parsing
 * ---------------------------------------------------------------------- */

export class InvalidAiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAiOutputError";
  }
}

/**
 * Parses a model response into a validated shape.
 *
 * Tolerates a fenced code block, which models still emit occasionally despite
 * a JSON response type being requested.
 */
export function parseJsonResponse<T>(raw: string, schema: z.ZodType<T>): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new InvalidAiOutputError("Response was not valid JSON.");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    // The issue paths describe the shape, never the participant's content (§52).
    const paths = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new InvalidAiOutputError(`Response did not match the expected shape: ${paths}`);
  }

  return result.data;
}
