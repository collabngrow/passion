import { describe, expect, it } from "vitest";

import { MAX_ATTEMPTS, buildCandidates, classifyFailure } from "./router";
import { DEFAULT_MODELS, defaultConfig, normaliseTier } from "./config";
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
   *
   * `gemini-3.1-flash-lite` in particular: there is no `gemini-3.1-flash`, and
   * an id that does not exist would 404 on every key on every call while
   * looking exactly like a configured fallback.
   */
  it("uses the model sequence the specification asks for", () => {
    expect(DEFAULT_MODELS.map((entry) => entry.model)).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
    ]);
  });

  /**
   * 3.7 was measured returning `503 high demand` or nothing at all inside 90s
   * on all three accounts. First in the walk, that costs every generation a
   * full attempt timeout before any working model is reached.
   */
  it("does not query gemini-3.7-flash", () => {
    expect(DEFAULT_MODELS.map((entry) => entry.model)).not.toContain("gemini-3.7-flash");
  });

  /**
   * The reserve pass is deliberately empty: the owner's decision is that only
   * these two models are queried. The mechanism stays available -- promoting a
   * model in the admin UI is all it takes -- so this pins the current intent
   * rather than the absence of the feature.
   */
  it("queries only the two configured models, with nothing in reserve", () => {
    expect(
      DEFAULT_MODELS.filter((entry) => entry.tier === "primary").map((e) => e.model),
    ).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    expect(DEFAULT_MODELS.filter((entry) => entry.tier === "reserve")).toEqual([]);
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

  /**
   * A stored configuration written before tiers existed carries no `tier`.
   * Dropping those entries would quietly shrink the walk; reading them as
   * reserve would quietly demote every model the administrator chose.
   */
  it("reads a tierless stored entry as primary", () => {
    expect(normaliseTier(undefined)).toBe("primary");
    expect(normaliseTier("nonsense")).toBe("primary");
    expect(normaliseTier("reserve")).toBe("reserve");
  });
});

/**
 * The walk order is the feature, and a regression in it is silent: nothing
 * throws, no build fails, participants are simply served a weaker model while
 * a stronger one was merely busy for a moment.
 */
describe("candidate ordering (§35)", () => {
  const POOLS = [
    { id: "key1", apiKey: "a" },
    { id: "key2", apiKey: "b" },
    { id: "key3", apiKey: "c" },
  ];
  const KEY_ORDER = ["key1", "key2", "key3"];

  const walk = () =>
    buildCandidates(DEFAULT_MODELS, KEY_ORDER, POOLS).map(
      (c) => `${c.keyPoolId}:${c.model}`,
    );

  /** The configured walk: both models on a key, then on to the next key (§35). */
  it("tries both models on a key before moving to the next key", () => {
    expect(walk()).toEqual([
      "key1:gemini-3.6-flash",
      "key1:gemini-3.5-flash-lite",
      "key2:gemini-3.6-flash",
      "key2:gemini-3.5-flash-lite",
      "key3:gemini-3.6-flash",
      "key3:gemini-3.5-flash-lite",
    ]);
  });

  /**
   * The tier mechanism, exercised against a fixture rather than the live
   * defaults, which currently configure no reserve. Keeping this covered means
   * promoting a model in the admin UI cannot quietly produce a walk nobody has
   * tested.
   */
  describe("when a reserve model is configured", () => {
    const WITH_RESERVE = [
      ...DEFAULT_MODELS,
      {
        priority: 3,
        provider: "gemini" as const,
        model: "gemini-3.1-flash-lite",
        enabled: true,
        tier: "reserve" as const,
      },
    ];

    const reserveWalk = () =>
      buildCandidates(WITH_RESERVE, KEY_ORDER, POOLS).map(
        (c) => `${c.keyPoolId}:${c.model}`,
      );

    it("exhausts every primary model on every key before any reserve", () => {
      expect(reserveWalk()).toEqual([
        "key1:gemini-3.6-flash",
        "key1:gemini-3.5-flash-lite",
        "key2:gemini-3.6-flash",
        "key2:gemini-3.5-flash-lite",
        "key3:gemini-3.6-flash",
        "key3:gemini-3.5-flash-lite",
        "key1:gemini-3.1-flash-lite",
        "key2:gemini-3.1-flash-lite",
        "key3:gemini-3.1-flash-lite",
      ]);
    });

    /**
     * The specific mistake this catches: a reserve reached on key 1 because the
     * first model was rate-limited for a moment, rather than because the strong
     * models were genuinely spent across all three accounts.
     */
    it("never reaches the reserve while any primary candidate remains", () => {
      const order = reserveWalk();
      const firstReserve = order.findIndex((c) => c.includes("3.1-flash-lite"));
      const lastPrimary = order.findLastIndex((c) => !c.includes("3.1-flash-lite"));
      expect(firstReserve).toBeGreaterThan(lastPrimary);
    });

    it("stays within the attempt ceiling", () => {
      expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(reserveWalk().length);
    });
  });

  /**
   * Without this the reserve tier is unreachable and nothing says so -- the
   * ceiling was 12 against 15 candidates, which cut off exactly the three
   * reserve candidates the tier exists to provide.
   */
  it("allows enough attempts to reach the last candidate", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(walk().length);
  });

  it("skips a key pool with no key present", () => {
    const partial = buildCandidates(DEFAULT_MODELS, KEY_ORDER, [POOLS[0]]);
    expect(partial).toHaveLength(2);
    expect(partial.every((c) => c.keyPoolId === "key1")).toBe(true);
  });

  it("omits a disabled model from the walk", () => {
    const someOff = DEFAULT_MODELS.map((entry) =>
      entry.model === "gemini-3.6-flash" ? { ...entry, enabled: false } : entry,
    );
    const order = buildCandidates(someOff, KEY_ORDER, POOLS).map((c) => c.model);
    expect(order).not.toContain("gemini-3.6-flash");
    expect(order).toHaveLength(3);
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

  /** Every prose category, so only the field under test is doing the failing. */
  const wholeSynthesis = {
    whatYouCarry: "x",
    whatYouHaveRefused: "x",
    whatYouWouldMake: "x",
    comfortableLife: "x",
    theCrossing: "x",
    body: "x",
    inheritedValues: "x",
    money: "x",
    thoseYouWalkWith: "x",
    whatYouGive: "x",
    whatWeighsOnYou: "x",
    strengths: "x",
    contradictions: "x",
    yourOwnGoodAndBad: "x",
  };

  it("requires the synthesis to carry priorities and commitments", () => {
    const missing = JSON.stringify({
      ...wholeSynthesis,
      threePriorities: [],
      thirtyDayCommitments: ["one"],
    });
    expect(() => parseJsonResponse(missing, synthesisSchema)).toThrow(
      InvalidAiOutputError,
    );
  });

  it("caps priorities and commitments at three", () => {
    const tooMany = JSON.stringify({
      ...wholeSynthesis,
      threePriorities: ["a", "b", "c", "d"],
      thirtyDayCommitments: ["a"],
    });
    expect(() => parseJsonResponse(tooMany, synthesisSchema)).toThrow(
      InvalidAiOutputError,
    );
  });

  it("accepts a complete synthesis", () => {
    const valid = JSON.stringify({
      ...wholeSynthesis,
      threePriorities: ["a", "b"],
      thirtyDayCommitments: ["a"],
    });
    expect(() => parseJsonResponse(valid, synthesisSchema)).not.toThrow();
  });
});
