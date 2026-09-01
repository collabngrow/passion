import { describe, expect, it } from "vitest";

import { MAX_ANSWER_LENGTH, fingerprintAnswers } from "./store";

/**
 * The idempotency key for generated interpretations (master_prompt.md §77, §92)
 * -- the "duplicate request prevention" line of the §86 matrix.
 *
 * Two failures sit either side of this function, and they cost different
 * things. If it is unstable, a participant reopening their reflection spends a
 * model call to regenerate text they have already read, and the text may come
 * back different -- §77 promises it will not. If it is too stable, an edited
 * answer is never reflected, and the participant is shown a reading of
 * something they have since changed.
 */

const ANSWERS = [
  { questionId: "q1", answer: "I keep coming back to the same thing." },
  { questionId: "q2", answer: "Mostly at night." },
];

describe("stability (§77)", () => {
  it("gives the same key for the same answers", () => {
    expect(fingerprintAnswers(ANSWERS)).toBe(fingerprintAnswers([...ANSWERS]));
  });

  it("is stable across calls, holding no state between them", () => {
    const keys = new Set(Array.from({ length: 5 }, () => fingerprintAnswers(ANSWERS)));
    expect(keys.size).toBe(1);
  });

  it("ignores whitespace a participant added or trimmed", () => {
    // Autosave fires on a debounce, so a trailing space from a keystroke that
    // was then deleted must not read as a changed answer and buy a model call.
    const padded = ANSWERS.map((entry) => ({ ...entry, answer: `  ${entry.answer}\n` }));
    expect(fingerprintAnswers(padded)).toBe(fingerprintAnswers(ANSWERS));
  });

  it("is a short hex string, safe as a document id", () => {
    expect(fingerprintAnswers(ANSWERS)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("survives an empty set", () => {
    expect(fingerprintAnswers([])).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("sensitivity", () => {
  it("changes when an answer is edited", () => {
    const edited = [{ ...ANSWERS[0], answer: "Actually, no." }, ANSWERS[1]];
    expect(fingerprintAnswers(edited)).not.toBe(fingerprintAnswers(ANSWERS));
  });

  it("changes on a one-character edit", () => {
    const edited = [{ ...ANSWERS[0], answer: `${ANSWERS[0].answer}.` }, ANSWERS[1]];
    expect(fingerprintAnswers(edited)).not.toBe(fingerprintAnswers(ANSWERS));
  });

  it("changes when an answer is added or removed", () => {
    expect(fingerprintAnswers([ANSWERS[0]])).not.toBe(fingerprintAnswers(ANSWERS));
    expect(
      fingerprintAnswers([...ANSWERS, { questionId: "q3", answer: "Later." }]),
    ).not.toBe(fingerprintAnswers(ANSWERS));
  });

  it("changes when an answer moves to a different question", () => {
    const swapped = [
      { questionId: "q1", answer: ANSWERS[1].answer },
      { questionId: "q2", answer: ANSWERS[0].answer },
    ];
    expect(fingerprintAnswers(swapped)).not.toBe(fingerprintAnswers(ANSWERS));
  });

  it("distinguishes an emptied answer from an absent one", () => {
    const emptied = [{ ...ANSWERS[0], answer: "" }, ANSWERS[1]];
    expect(fingerprintAnswers(emptied)).not.toBe(fingerprintAnswers([ANSWERS[1]]));
  });
});

describe("the delimiter", () => {
  it("keeps an answer containing a question-id pattern from forging a boundary", () => {
    // Pairs are joined on NUL rather than a printable separator. With a comma
    // or a newline, an answer that happened to contain "q2:" could canonicalise
    // to the same string as two separate answers.
    const separate = [
      { questionId: "q1", answer: "one" },
      { questionId: "q2", answer: "two" },
    ];
    const smuggled = [{ questionId: "q1", answer: ["one", "q2:two"].join(",") }];

    expect(fingerprintAnswers(separate)).not.toBe(fingerprintAnswers(smuggled));
  });

  it("separates adjacent answers, so concatenation is not ambiguous", () => {
    const split = [
      { questionId: "q", answer: "ab" },
      { questionId: "q", answer: "c" },
    ];
    const joined = [
      { questionId: "q", answer: "a" },
      { questionId: "q", answer: "bc" },
    ];

    expect(fingerprintAnswers(split)).not.toBe(fingerprintAnswers(joined));
  });

  it("is only unforgeable to the extent an answer cannot contain a NUL", () => {
    // Pinned rather than asserted away, because this is the one input that does
    // collide: JSON can encode a NUL, so an answer carrying the delimiter
    // canonicalises exactly like two separate answers.
    //
    // Left as it is, deliberately. The fingerprint is scoped to one
    // participant, so a collision skips that person’s own next generation as a
    // duplicate. The cost is a regeneration that does not happen, not access to
    // anything, and widening the canonical form to defend against it would add
    // a length prefix nobody can read for a threat nobody has.
    const separate = [
      { questionId: "q1", answer: "one" },
      { questionId: "q2", answer: "two" },
    ];
    const withNul = [{ questionId: "q1", answer: `one${String.fromCharCode(0)}q2:two` }];

    expect(fingerprintAnswers(withNul)).toBe(fingerprintAnswers(separate));
  });
});

describe("bounds", () => {
  it("handles an answer at the documented maximum length", () => {
    const long = [{ questionId: "q1", answer: "x".repeat(MAX_ANSWER_LENGTH) }];
    expect(fingerprintAnswers(long)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("bounds a single answer generously but finitely (§43)", () => {
    expect(MAX_ANSWER_LENGTH).toBeGreaterThanOrEqual(10_000);
  });
});
