# Knowledge base

The interpretive framework behind the Passion Analyzer. This is a **core dependency of the
interpretation engine** (master_prompt.md §38A), not optional reference material.

Keep it strictly separate from `content/exercise.md`, which defines *what* the participant is
asked. This directory defines *how* their answers are read (§38O).

## Format

Each file holds several items separated by a line containing only `===`. Every item carries its
own YAML frontmatter:

```markdown
---
id: c-self-overcoming
title: Self-overcoming
category: concepts
themes: [becoming, discipline, courage]
related: [c-becoming, v-responsibility]
---

Prose. Several paragraphs. Substance, not a summary.
```

| Field | Meaning |
| --- | --- |
| `id` | Unique, stable. Prefixed by category: `p-`, `v-`, `c-`, `d-`, `t-`, `ig-`, `ca-`. |
| `category` | One of the seven below. |
| `themes` | Selection tags. An item with no themes can never be retrieved. |
| `related` | Ids of related items. Validated to resolve; a dangling reference fails the build. |

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

`principles`, `cautions` and `interpretationGuidance` are sent on **every** request. The other
four are selected by theme overlap with the section being interpreted (§38C). See
`lib/ai/retrieval.ts`.

## The source stays unnamed

§38I forbids the participant-facing experience from identifying where these ideas come from.
This knowledge base therefore does not name the source anywhere — the concepts are written on
their own terms. That makes a leak structurally impossible rather than merely forbidden, since
the model is never given the name in the first place.

`lib/ai/retrieval.test.ts` asserts this against the built corpus. **Do not add the source name
when editing.**

## §38L quality checklist

Each row states where the requirement is actually enforced, not merely asserted.

| Requirement | Status | Enforced by |
| --- | --- | --- |
| Source material inspected | Yes | `exercise_content_1.md` interpretive principles and the concepts named in `master_prompt.md` |
| All major concepts extracted | Yes | 8 items in `concepts.md` |
| Core values represented | Yes | 8 items in `values.md` |
| Important distinctions represented | Yes | 8 items in `distinctions.md` |
| Relevant tensions represented | Yes | 8 items in `tensions.md` |
| Interpretive guidance represented | Yes | 8 principles + 7 guidance items |
| Contradictions / cautions represented | Yes | 9 items in `cautions.md` |
| Knowledge base versioned | Yes | `sourceVersion` per item; `KNOWLEDGE_BASE_VERSION` in `scripts/build-kb.mjs` |
| Not a shallow summary | Yes | 60-word floor per item, enforced in `scripts/build-kb.mjs`; 4,000-word corpus floor in `retrieval.test.ts` |
| Cross-references resolve | Yes | `scripts/build-kb.mjs`, asserted again in `retrieval.test.ts` |
| Interpretation engine can retrieve it | Yes | `lib/ai/retrieval.ts`, covered by `retrieval.test.ts` |
| Final synthesis can access it | Yes | `fullKnowledgeBase()` returns the complete corpus (§38H) |
| Source identity hidden from participant | Yes | Corpus never names it; asserted in `retrieval.test.ts` |

**Current corpus:** 56 items, 28 themes, ~7,500 words.

Two rows remain outstanding until S8 wires the engine, and are tracked there rather than
claimed here: that the prompts actually carry this context, and that generated output is
verified free of framework vocabulary.
