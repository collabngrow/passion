import { describe, expect, it } from "vitest";

import { classifyFailure } from "./router";
import { DEFAULT_MODELS, defaultConfig } from "./config";
import {
  InvalidAiOutputError,
  interpretationSchema,
  parseJsonResponse,
  synthesisSchema,
} from "./schema";

/**
 * §36 is the constraint these cover: not every failure deserves a fallback.
 * Retrying a malformed request across nine candidates burns quota to produce
 * nine identical failures and hides a bug behind what looks like an outage.
 */
describe("failure classification (§36)", () => {
  it("advances on quota and rate limiting", () => {
    expect(classifyFailure({ status: 429 })).toBe("advance");
    expect(classifyFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"))).toBe(
      "advance",
    );
    expect(classifyFailure(new Error("Rate limit exceeded for this model"))).toBe(
      "advance",
    );
  });

  it("advances when a model is unavailable on this key", () => {
    expect(classifyFailure({ status: 404 })).toBe("advance");
    expect(classifyFailure(new Error("models/gemini-x is not found"))).toBe("advance");
    expect(classifyFailure(new Error("Model is not supported for generateContent"))).toBe(
      "advance",
    );
  });

  it("advances on provider outage and transport faults", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyFailure({ status }), `status ${status}`).toBe("advance");
    }
    expect(classifyFailure(new Error("503 UNAVAILABLE: model is overloaded"))).toBe(
      "advance",
    );
    expect(classifyFailure(new Error("ETIMEDOUT"))).toBe("advance");
    expect(classifyFailure(new Error("socket hang up"))).toBe("advance");
  });

  /**
   * The important half. A malformed request fails identically on every
   * candidate, so falling back only wastes quota and delays the real error.
   */
  it("aborts on request and credential defects", () => {
    expect(classifyFailure({ status: 400 })).toBe("abort");
    expect(classifyFailure({ status: 401 })).toBe("abort");
    expect(classifyFailure({ status: 403 })).toBe("abort");
    expect(classifyFailure(new Error("INVALID_ARGUMENT: contents is required"))).toBe(
      "abort",
    );
    expect(classifyFailure(new Error("API key not valid"))).toBe("abort");
    expect(classifyFailure(new Error("PERMISSION_DENIED"))).toBe("abort");
  });

  it("aborts on a safety refusal rather than shopping for a permissive model", () => {
    expect(classifyFailure(new Error("Response was blocked due to safety"))).toBe("abort");
  });

  /**
   * Unrecognised defaults to abort deliberately: an unknown error is more
   * likely a bug in the request than a capacity problem, and §36 warns against
   * blind fallback.
   */
  it("aborts on anything unrecognised", () => {
    expect(classifyFailure(new Error("something entirely unexpected"))).toBe("abort");
    expect(classifyFailure(null)).toBe("abort");
    expect(classifyFailure(undefined)).toBe("abort");
    expect(classifyFailure("a bare string")).toBe("abort");
  });

  it("reads a status buried in the message or a nested error", () => {
    expect(classifyFailure({ error: { code: 429 } })).toBe("advance");
    expect(classifyFailure(new Error('{"code": 503, "message": "x"}'))).toBe("advance");
  });
});

describe("default configuration (§34)", () => {
  /**
   * §34 forbids hard-coding obsolete model names. These ids were taken from the
   * live model catalogue rather than assumed; this test pins them so a rename
   * is a deliberate change.
   */
  it("uses the model sequence the specification asks for", () => {
    expect(DEFAULT_MODELS.map((entry) => entry.model)).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
    ]);
  });

  it("orders by priority and enables every default", () => {
    DEFAULT_MODELS.forEach((entry, index) => {
      expect(entry.priority).toBe(index + 1);
      expect(entry.enabled).toBe(true);
      expect(entry.provider).toBe("gemini");
    });
  });

  it("produces a usable config even with no keys present", () => {
    const config = defaultConfig();
    expect(config.models.length).toBeGreaterThan(0);
    expect(Array.isArray(config.keyOrder)).toBe(true);
  });
});

describe("output validation (§38N)", () => {
  const validInterpretation = JSON.stringify({
    observation: "You describe three occasions where you chose not to speak.",
    interpretation: "Difficulty for others may register more strongly than cost to you.",
    relevantThemes: ["courage", "relationships"],
    tension: null,
    reflection: "What would you have needed to say it?",
    confidence: "moderate",
  });

  it("parses a well-formed response", () => {
    const parsed = parseJsonResponse(validInterpretation, interpretationSchema);
    expect(parsed.observation).toContain("three occasions");
    expect(parsed.confidence).toBe("moderate");
  });

  it("tolerates a fenced code block", () => {
    const fenced = "```json\n" + validInterpretation + "\n```";
    expect(parseJsonResponse(fenced, interpretationSchema).confidence).toBe("moderate");
  });

  it("applies defaults for optional fields", () => {
    const minimal = JSON.stringify({
      observation: "A short observation.",
      interpretation: "A short interpretation.",
    });
    const parsed = parseJsonResponse(minimal, interpretationSchema);
    expect(parsed.relevantThemes).toEqual([]);
    expect(parsed.tension).toBeNull();
    expect(parsed.confidence).toBe("moderate");
  });

  /**
   * An unvalidated model response is untrusted input. Storing a malformed one
   * would break the result page for a participant who cannot regenerate it.
   */
  it("rejects malformed output", () => {
    for (const bad of [
      "not json at all",
      "{}",
      JSON.stringify({ observation: "only this" }),
      JSON.stringify({ observation: "", interpretation: "" }),
      "",
    ]) {
      expect(
        () => parseJsonResponse(bad, interpretationSchema),
        `accepted ${JSON.stringify(bad).slice(0, 40)}`,
      ).toThrow(InvalidAiOutputError);
    }
  });

  it("does not leak participant content in a validation error", () => {
    const withSecret = JSON.stringify({
      observation: "MY-PRIVATE-CONFESSION",
      // interpretation missing -> validation fails
    });

    try {
      parseJsonResponse(withSecret, interpretationSchema);
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("MY-PRIVATE-CONFESSION");
      expect((error as Error).message).toContain("interpretation");
    }
  });

  it("requires the synthesis to carry priorities and commitments", () => {
    const missing = JSON.stringify({
      coreValues: "x",
      sourcesOfMeaning: "x",
      personalPhilosophy: "x",
      threePriorities: [],
      thirtyDayCommitments: ["one"],
    });
    expect(() => parseJsonResponse(missing, synthesisSchema)).toThrow(
      InvalidAiOutputError,
    );
  });

  it("caps priorities and commitments at three", () => {
    const tooMany = JSON.stringify({
      coreValues: "x",
      sourcesOfMeaning: "x",
      relationships: "x",
      health: "x",
      wealth: "x",
      creativity: "x",
      contribution: "x",
      strengths: "x",
      challenges: "x",
      contradictions: "x",
      oldSelf: "x",
      emergingSelf: "x",
      philosophicalLens: "x",
      personalPhilosophy: "x",
      threePriorities: ["a", "b", "c", "d"],
      thirtyDayCommitments: ["a"],
    });
    expect(() => parseJsonResponse(tooMany, synthesisSchema)).toThrow(
      InvalidAiOutputError,
    );
  });
});
