import { describe, expect, it } from "vitest";

import { knowledgeBase } from "./knowledge-base.generated";
import { fullKnowledgeBase, renderKnowledge, selectKnowledge } from "./retrieval";

const ALWAYS_ON = ["principles", "cautions", "interpretationGuidance"];

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
    expect(words).toBeGreaterThan(4000);
    for (const item of knowledgeBase) {
      expect(item.content.split(/\s+/).length, item.id).toBeGreaterThanOrEqual(60);
    }
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
      expect(item.sourceVersion).toBe("1.0");
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
      "according to the book",
      "the author says",
      "the source material",
    ]) {
      expect(corpus, `knowledge base mentions "${forbidden}"`).not.toContain(forbidden);
    }
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
    const health = selectKnowledge({ sectionId: "part-6" }).map((item) => item.id);
    expect(health).toContain("v-health-as-foundation");
    expect(health).toContain("t-health-vs-priorities");

    const relationships = selectKnowledge({ sectionId: "part-8" }).map((i) => i.id);
    expect(relationships).toContain("v-relationships-and-presence");
    expect(relationships).toContain("t-relationships-vs-time");
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
    // A wealth question answered mostly about family should pull family in.
    const withText = selectKnowledge({
      sectionId: "part-7",
      text: "Mostly I think about my family and the relationships I have neglected.",
    }).map((item) => item.id);

    expect(withText).toContain("v-relationships-and-presence");
  });

  it("is deterministic, so identical input yields an identical prompt (§77)", () => {
    const once = selectKnowledge({ sectionId: "part-12", text: "discipline and time" });
    const twice = selectKnowledge({ sectionId: "part-12", text: "discipline and time" });
    expect(once.map((i) => i.id)).toEqual(twice.map((i) => i.id));
  });

  it("bounds topical selection", () => {
    const topical = selectKnowledge({
      sectionId: "part-1",
      themes: ["health", "wealth", "relationships", "creativity", "time", "action"],
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
});

describe("rendering", () => {
  it("renders titles and content for the prompt", () => {
    const rendered = renderKnowledge(selectKnowledge({ sectionId: "part-6" }));
    expect(rendered).toContain("### ");
    expect(rendered.length).toBeGreaterThan(1000);
  });
});
