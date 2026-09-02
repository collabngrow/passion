# Knowledge base

The interpretive framework behind the Passion Analyzer. This is a **core dependency of the
interpretation engine** (master_prompt.md §38A), not optional reference material.

Keep it strictly separate from `content/exercise.md`, which defines *what* the participant is
asked. This directory defines *how* their answers are read (§38O).

## Where it comes from

Version 2.0 was authored by reading the source book chapter by chapter. Run
`npm run extract:source` to segment the PDF into `content/source/` — one file per chapter,
with a `part` / `chapter` / `title` header — and write from those.

The PDF is kept outside the repository and `content/source/` is gitignored: both are
build-time material for authoring this directory, not runtime dependencies. Nothing in the
application reads them.

**Do not generate items by summarising a chapter with a model.** Version 1.0 of this
knowledge base was written from the exercise document and a list of concept names rather than
from the text, and the result was a fluent second-hand paraphrase — 56 items, mostly generic
life-domain buckets, which produced exactly the vague interpretations the rebuild was meant to
fix. A machine précis of each chapter would reproduce that failure with more steps.

## Format

Each file holds several items separated by a line containing only `===`. Every item carries its
own YAML frontmatter:

```markdown
---
id: c-the-ox
title: The ox, and the weight taken up willingly
category: concepts
themes: [burden, reverence, duty, obedience, work, family]
related: [c-three-transformations, d-taken-up-vs-imposed]
source: I.1 The Three Metamorphoses
---

Prose. Several paragraphs. Substance, not a summary.
```

| Field | Meaning |
| --- | --- |
| `id` | Unique, stable. Prefixed by category: `p-`, `v-`, `c-`, `d-`, `t-`, `ig-`, `ca-`. |
| `category` | One of the seven below. |
| `themes` | Selection tags. An item with no themes can never be retrieved. |
| `related` | Ids of related items. Validated to resolve; a dangling reference fails the build. |
| `source` | Part and chapter the item was drawn from. Required. Build-time only — see below. |

Run `npm run generate` after editing. It regenerates `lib/ai/knowledge-base.generated.ts` and is
wired into `predev`, `prebuild` and `pretest`, so a broken knowledge base cannot ship.

## Categories

| File | Category | Purpose |
| --- | --- | --- |
| `principles.md` | `principles` | How interpretation must behave |
| `values.md` | `values` | What the framework treats as value, and how values work |
| `concepts.md` | `concepts` | The interpretive concepts themselves |
| `distinctions.md` | `distinctions` | Pairs the engine must not collapse |
| `tensions.md` | `tensions` | Contradictions worth surfacing |
| `interpretation-guidance.md` | `interpretationGuidance` | How to compose a reflection |
| `cautions.md` | `cautions` | Guards against misinterpretation |

`principles` and `interpretationGuidance` are sent on **every** request. Everything else,
`cautions` included, is selected by theme overlap with the section being interpreted (§38C).
See `lib/ai/retrieval.ts`.

`cautions` was always-on in version 1.0 and is not any more. With three rule categories pinned,
24 of 56 items in every prompt were prohibitions; the model received far more instruction about
what not to say than material to say anything with, and hedged accordingly. The prohibitions
that must never lapse are stated unconditionally in `systemInstruction()` instead, so nothing
depends on retrieval to enforce them.

## The source stays unnamed

§38I forbids the participant-facing experience from identifying where these ideas come from.
As amended, it permits the source's **images** — the one who carries, the one who refuses, the
child who begins, the rope over the drop — and continues to forbid its **provenance** without
exception.

So this knowledge base uses the images freely and names no author, book, chapter or tradition
anywhere in its prose. `lib/ai/retrieval.test.ts` asserts that against the built corpus.

The `source:` field is the one place a passage is named, and it never reaches the runtime:
`scripts/build-kb.mjs` validates it and then deliberately omits it from the generated module,
so an author can trace any claim while no identifying string exists at run time however that
module is imported. A test asserts the drop.

**Do not add the source name when editing, and do not emit `sourceRef`.**

## §38L quality checklist

Each row states where the requirement is actually enforced, not merely asserted.

| Requirement | Status | Enforced by |
| --- | --- | --- |
| Source material inspected | Yes | The book itself, segmented into `content/source/` by `scripts/extract-source.mjs` and read chapter by chapter |
| All major concepts extracted | Yes | 30 items in `concepts.md`, each carrying its passage in `source:` |
| Core values represented | Yes | 16 items in `values.md` |
| Important distinctions represented | Yes | 15 items in `distinctions.md` |
| Relevant tensions represented | Yes | 15 items in `tensions.md`, drawn from the source's own contradictions |
| Interpretive guidance represented | Yes | 10 principles + 16 guidance items |
| Contradictions / cautions represented | Yes | 13 items in `cautions.md` |
| Knowledge base versioned | Yes | `sourceVersion` per item; `KNOWLEDGE_BASE_VERSION` in `scripts/build-kb.mjs` |
| Not a shallow summary | Yes | 60-word floor per item in `scripts/build-kb.mjs`; 15,000-word corpus floor and a substance-over-rules ratio asserted in `retrieval.test.ts` |
| Cross-references resolve | Yes | `scripts/build-kb.mjs`, asserted again in `retrieval.test.ts` |
| Interpretation engine can retrieve it | Yes | `lib/ai/retrieval.ts`, covered by `retrieval.test.ts` |
| Final synthesis can access it | Yes | `fullKnowledgeBase()` returns the complete corpus (§38H) |
| Source identity hidden from participant | Yes | Corpus names nothing; `source:` never emitted; both asserted in `retrieval.test.ts` |

**Current corpus:** 115 items, 67 themes, ~19,200 words.

One row remains outstanding and is tracked where the work is rather than claimed here: that
generated output is verified free of provenance in practice, which needs a real generation via
`npm run smoke:ai` and a read of what comes back.
