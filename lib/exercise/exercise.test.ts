import { describe, expect, it } from "vitest";

import {
  exercise,
  exerciseVersion,
  firstQuestion,
  getQuestion,
  isLastInSection,
  nextQuestion,
  previousQuestion,
  questionsInSection,
  totalQuestions,
} from "./index";

/**
 * These assert the shape the application depends on. The build script performs
 * the same checks and fails the build; these catch a regression introduced by
 * editing the accessors rather than the content.
 */

describe("exercise content", () => {
  it("carries every question and section from the source", () => {
    expect(totalQuestions).toBe(43);
    expect(exercise.sections).toHaveLength(14);
    expect(exerciseVersion).toBe("1.0");
  });

  it("numbers questions contiguously from 1", () => {
    exercise.questions.forEach((question, index) => {
      expect(question.number).toBe(index + 1);
      expect(question.order).toBe(index + 1);
      expect(question.id).toBe(`q${index + 1}`);
    });
  });

  it("assigns every question to a section that claims it", () => {
    for (const question of exercise.questions) {
      const section = exercise.sections.find((s) => s.id === question.sectionId);
      expect(section, `${question.id} has no section`).toBeDefined();
      expect(section!.questionIds).toContain(question.id);
    }
  });

  it("gives every section at least one question", () => {
    for (const section of exercise.sections) {
      expect(questionsInSection(section.id).length).toBeGreaterThan(0);
    }
  });

  it("gives every question body content", () => {
    for (const question of exercise.questions) {
      expect(question.blocks.length, `${question.id} is empty`).toBeGreaterThan(0);
      expect(question.title.length).toBeGreaterThan(0);
    }
  });

  it("preserves inline emphasis from the source", () => {
    // Question 2 asks the participant to complete "I lived a good life."
    const q2 = getQuestion("q2");
    const bold = q2!.blocks
      .flatMap((block) => (block.kind === "paragraph" ? block.segments : []))
      .filter((segment) => segment.bold);
    expect(bold.length).toBeGreaterThan(0);
  });

  it("preserves bullet guidance from the source", () => {
    // Question 5 lists candidate weaknesses as bullets.
    const q5 = getQuestion("q5");
    const lists = q5!.blocks.filter((block) => block.kind === "list");
    expect(lists.length).toBeGreaterThan(0);
  });
});

describe("navigation", () => {
  it("starts at the first question and ends without a next", () => {
    expect(firstQuestion().id).toBe("q1");
    expect(previousQuestion("q1")).toBeUndefined();
    expect(nextQuestion("q43")).toBeUndefined();
  });

  it("walks the whole exercise forwards", () => {
    let current = firstQuestion();
    let visited = 1;
    while (visited < totalQuestions) {
      const next = nextQuestion(current.id);
      expect(next, `no question after ${current.id}`).toBeDefined();
      current = next!;
      visited += 1;
    }
    expect(current.id).toBe("q43");
  });

  it("steps backwards symmetrically", () => {
    expect(previousQuestion("q2")!.id).toBe("q1");
    expect(nextQuestion("q1")!.id).toBe("q2");
  });

  it("identifies exactly one section-final question per section", () => {
    const finals = exercise.questions.filter((q) => isLastInSection(q.id));
    expect(finals).toHaveLength(exercise.sections.length);
    // Section reflections are generated on these boundaries (§59).
    expect(isLastInSection("q2")).toBe(true); // last of part-1
    expect(isLastInSection("q1")).toBe(false);
    expect(isLastInSection("q43")).toBe(true); // last of final-reflection
  });
});
