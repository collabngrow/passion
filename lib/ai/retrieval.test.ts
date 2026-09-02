import { describe, expect, it } from "vitest";

import { knowledgeBase } from "./knowledge-base.generated";
import {
  SECTION_THEMES,
  fullKnowledgeBase,
  renderKnowledge,
  selectKnowledge,
  themesFromText,
} from "./retrieval";

const ALWAYS_ON = ["principles", "interpretationGuidance"];

describe("knowledge base content", () => {
  it("covers every category §38K requires", () => {
    const categories = new Set(knowledgeBase.map((item) => item.category));
    for (const required of [
      "principles",
      "values",
      "concepts",
      "distinctions",
      "tensions",
      "interpretationGuidance",
      "cautions",
    ]) {
      expect(categories, `missing ${required}`).toContain(required);
    }
  });

  it("is substantive rather than a summary (§38A)", () => {
    const words = knowledgeBase.reduce(
      (sum, item) => sum + item.content.split(/\s+/).length,
      0,
    );
    expect(words).toBeGreaterThan(15000);
    for (const item of knowledgeBase) {
      expect(item.content.split(/\s+/).length, item.id).toBeGreaterThanOrEqual(60);
    }
  });

  /**
   * The corpus is authored from the source rather than paraphrased from a
   * summary of it, so the substance categories should dominate the rule
   * categories. When they did not -- 24 rule items against 32 of everything
   * else -- prompts carried more prohibition than material and the output was
   * uniformly hedged.
   */
  it("carries more substance than rules", () => {
    const rules = knowledgeBase.filter((item) =>
      ["principles", "cautions", "interpretationGuidance"].includes(item.category),
    );
    expect(rules.length * 2).toBeLessThan(knowledgeBase.length);
  });

  it("resolves every cross-reference", () => {
    const ids = new Set(knowledgeBase.map((item) => item.id));
    for (const item of knowledgeBase) {
      for (const related of item.relatedConcepts) {
        expect(ids, `${item.id} -> ${related}`).toContain(related);
      }
    }
  });

  it("versions every item (§38E)", () => {
    for (const item of knowledgeBase) {
      expect(item.sourceVersion).toBe("2.0");
    }
  });

  /**
   * §38I is a hard product requirement: the framework's provenance must never
   * be nameable from anything the engine is given. Keeping the source unnamed
   * in the knowledge base itself makes a leak structurally impossible rather
   * than merely forbidden.
   */
  it("never names the underlying source (§38I)", () => {
    const corpus = knowledgeBase
      .map((item) => `${item.title} ${item.content}`)
      .join("\n")
      .toLowerCase();

    for (const forbidden of [
      "nietzsche",
      "nietzschean",
      "zarathustra",
      "thus spake",
      "thus spoke",
      "according to the book",
      "the author says",
      "the source material",
    ]) {
      expect(corpus, `knowledge base mentions "${forbidden}"`).not.toContain(forbidden);
    }
  });

  /**
   * Each Markdown item carries a `source:` naming the passage it came from, so
   * an author can trace a claim. That string is the one piece of genuinely
   * identifying provenance in the pipeline, and build-kb.mjs deliberately drops
   * it rather than emitting it -- so the runtime cannot leak it however the
   * generated module is imported. This asserts the drop actually happened.
   */
  it("carries no passage references into the runtime corpus", () => {
    for (const item of knowledgeBase) {
      expect(item, `${item.id} still carries sourceRef`).not.toHaveProperty("sourceRef");
    }

    const corpus = JSON.stringify(knowledgeBase);
    // Chapter references are written "I.1", "III.55", "Prologue 4".
    expect(corpus).not.toMatch(/\b(?:I|II|III|IV)\.\d+\s+[A-Z]/);
    expect(corpus).not.toMatch(/\bPrologue \d/);
  });
});

describe("selection", () => {
  it("always includes the behavioural categories", () => {
    const selected = selectKnowledge({ sectionId: "part-6" });
    const categories = new Set(selected.map((item) => item.category));
    for (const category of ALWAYS_ON) {
      expect(categories, `dropped ${category}`).toContain(category);
    }
  });

  it("includes every always-on item, not a sample of them", () => {
    const selected = selectKnowledge({ sectionId: "part-1" });
    const expected = knowledgeBase.filter((item) => ALWAYS_ON.includes(item.category));
    const selectedIds = new Set(selected.map((item) => item.id));
    for (const item of expected) {
      expect(selectedIds, `dropped ${item.id}`).toContain(item.id);
    }
  });

  it("selects topical knowledge matching the section", () => {
    const body = selectKnowledge({ sectionId: "part-6" }).map((item) => item.id);
    expect(body).toContain("c-body-as-great-reason");
    expect(body).toContain("t-knowing-the-body-and-deferring-it");

    const relationships = selectKnowledge({ sectionId: "part-8" }).map((i) => i.id);
    expect(relationships).toContain("c-friend-as-arrow");
    expect(relationships).toContain("d-friend-vs-neighbour");
  });

  /** The parts carrying the exercise's spine must reach their own material. */
  it("selects the transformation material for the parts built on it", () => {
    const ox = selectKnowledge({ sectionId: "part-3" }).map((item) => item.id);
    expect(ox).toContain("c-the-ox");

    const tiger = selectKnowledge({ sectionId: "part-4" }).map((item) => item.id);
    expect(tiger).toContain("c-the-tiger");

    const child = selectKnowledge({ sectionId: "part-5" }).map((item) => item.id);
    expect(child).toContain("c-the-child");

    const again = selectKnowledge({ sectionId: "part-12" }).map((item) => item.id);
    expect(again).toContain("c-recurrence");
  });

  it("varies topical selection by section", () => {
    const topicalFor = (sectionId: string) =>
      selectKnowledge({ sectionId })
        .filter((item) => !ALWAYS_ON.includes(item.category))
        .map((item) => item.id)
        .sort()
        .join(",");

    expect(topicalFor("part-6")).not.toBe(topicalFor("part-7"));
  });

  it("supplements section themes from the answer text", () => {
    // A question about the body answered mostly about money should pull money in.
    const withText = selectKnowledge({
      sectionId: "part-6",
      text: "Honestly I spend the time worrying about money and about giving enough.",
    }).map((item) => item.id);

    expect(withText).toContain("v-wealth-as-capacity-to-give");
  });

  /**
   * The text supplement used a substring check, which fired `action` on
   * "transaction", `health` on "wealthy" and `past` on "pasta" -- so nearly
   * every answer matched nearly every theme and the supplement stopped
   * discriminating.
   */
  it("matches themes on word boundaries, not substrings", () => {
    const themes = themesFromText(
      "The transaction left me wealthy enough, and I ate pasta in a glove factory.",
    );

    expect(themes).not.toContain("action");
    expect(themes).not.toContain("health");
    expect(themes).not.toContain("past");
    expect(themes).not.toContain("love");
  });

  it("matches a hyphenated theme written as two words", () => {
    expect(themesFromText("these are inherited values from my father")).toContain(
      "inherited-values",
    );
  });

  it("is deterministic, so identical input yields an identical prompt (§77)", () => {
    const once = selectKnowledge({ sectionId: "part-12", text: "discipline and time" });
    const twice = selectKnowledge({ sectionId: "part-12", text: "discipline and time" });
    expect(once.map((i) => i.id)).toEqual(twice.map((i) => i.id));
  });

  it("bounds topical selection", () => {
    const topical = selectKnowledge({
      sectionId: "part-1",
      themes: ["body", "money", "relationships", "creation", "time", "action"],
      maxTopical: 4,
    }).filter((item) => !ALWAYS_ON.includes(item.category));

    // maxTopical plus at most three related items pulled in for clarity.
    expect(topical.length).toBeLessThanOrEqual(7);
  });

  it("still returns the behavioural rules for an unknown section", () => {
    const selected = selectKnowledge({ sectionId: "does-not-exist" });
    expect(selected.length).toBeGreaterThan(0);
    const categories = new Set(selected.map((item) => item.category));
    for (const category of ALWAYS_ON) {
      expect(categories).toContain(category);
    }
  });

  it("gives the synthesis the whole framework (§38H)", () => {
    expect(fullKnowledgeBase()).toHaveLength(knowledgeBase.length);
  });

  /**
   * The point of the retrieval rebalance, asserted where it actually matters.
   *
   * A corpus can be substance-heavy while every individual prompt is still
   * dominated by rules, which is precisely what used to happen: the always-on
   * categories were pinned and only 8 topical items came with them, so the
   * model got more instruction about what not to say than material to say
   * anything with. Measured in words rather than items, because the rule items
   * are not shorter than the substance ones.
   */
  it("sends more substance than rules in every section's prompt", () => {
    const words = (text: string) => text.split(/\s+/).length;

    for (const sectionId of Object.keys(SECTION_THEMES)) {
      const selected = selectKnowledge({ sectionId });
      const rules = selected
        .filter((item) => ALWAYS_ON.includes(item.category))
        .reduce((sum, item) => sum + words(item.content), 0);
      const substance = selected
        .filter((item) => !ALWAYS_ON.includes(item.category))
        .reduce((sum, item) => sum + words(item.content), 0);

      expect(substance, `${sectionId} is rule-heavy`).toBeGreaterThan(rules);
    }
  });
});

describe("rendering", () => {
  it("renders titles and content for the prompt", () => {
    const rendered = renderKnowledge(selectKnowledge({ sectionId: "part-6" }));
    expect(rendered).toContain("### ");
    expect(rendered.length).toBeGreaterThan(1000);
  });
});
