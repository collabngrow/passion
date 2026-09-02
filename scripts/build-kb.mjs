/**
 * Structures content/knowledge-base/*.md into lib/ai/knowledge-base.generated.ts.
 *
 * master_prompt.md §38A–§38E: the framework is a core dependency of the
 * interpretation engine, must stay structured, searchable and versioned, and
 * must not be a shallow summary.
 *
 * Each source file holds several items separated by a line containing only
 * `===`. Every item carries its own YAML frontmatter:
 *
 *   ---
 *   id: c-the-ox
 *   title: The ox, and the weight taken up willingly
 *   category: concepts
 *   themes: [burden, reverence, duty]
 *   related: [c-three-transformations]
 *   source: I.1 The Three Metamorphoses
 *   ---
 *
 *   Prose...
 *
 * The script validates ids, cross-references and content depth, and exits
 * non-zero on failure -- a knowledge base that has quietly degraded into a
 * summary is the specific outcome §38A forbids.
 *
 *   node scripts/build-kb.mjs
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = resolve(ROOT, "content/knowledge-base");
const OUTPUT = resolve(ROOT, "lib/ai/knowledge-base.generated.ts");

/** Bumped when the framework content changes; stored with every result (§38E). */
const KNOWLEDGE_BASE_VERSION = "2.0";

const ITEM_SEPARATOR = /^===\s*$/m;

/** Every category §38K requires must be present and populated. */
const REQUIRED_CATEGORIES = [
  "principles",
  "values",
  "concepts",
  "distinctions",
  "tensions",
  "interpretationGuidance",
  "cautions",
];

/** Below this, an item is a summary rather than substance (§38A). */
const MIN_WORDS_PER_ITEM = 60;

/* --------------------------------------------------------------------------
 * Parsing
 * ----------------------------------------------------------------------- */

function parseFile(filename) {
  const raw = readFileSync(join(SOURCE_DIR, filename), "utf8");

  return raw
    .split(ITEM_SEPARATOR)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk, index) => {
      const { data, content } = matter(chunk);
      const where = `${filename} (item ${index + 1})`;

      for (const field of ["id", "title", "category"]) {
        if (typeof data[field] !== "string" || data[field].trim() === "") {
          throw new Error(`${where}: missing or invalid "${field}".`);
        }
      }

      const body = content.trim();
      if (body === "") throw new Error(`${where}: has no body text.`);

      if (typeof data.source !== "string" || data.source.trim() === "") {
        throw new Error(
          `${where}: missing "source". Every item must record the passage it was ` +
            `drawn from, so a claim can be traced back and checked.`,
        );
      }

      return {
        id: data.id.trim(),
        title: data.title.trim(),
        category: data.category.trim(),
        themes: normaliseList(data.themes, where, "themes"),
        relatedConcepts: normaliseList(data.related, where, "related"),
        content: body,
        sourceRef: data.source.trim(),
        sourceVersion: KNOWLEDGE_BASE_VERSION,
        wordCount: body.split(/\s+/).length,
      };
    });
}

function normaliseList(value, where, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${where}: "${field}" must be a list.`);
  }
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

/* --------------------------------------------------------------------------
 * Validation
 * ----------------------------------------------------------------------- */

function validate(items) {
  const problems = [];
  const byId = new Map();

  for (const item of items) {
    if (byId.has(item.id)) problems.push(`Duplicate item id "${item.id}".`);
    byId.set(item.id, item);
  }

  // Cross-references must resolve, or retrieval will silently drop them.
  for (const item of items) {
    for (const related of item.relatedConcepts) {
      if (!byId.has(related)) {
        problems.push(`"${item.id}" references unknown item "${related}".`);
      }
    }
    if (item.themes.length === 0) {
      problems.push(`"${item.id}" has no themes; retrieval cannot select it.`);
    }
    if (item.wordCount < MIN_WORDS_PER_ITEM) {
      problems.push(
        `"${item.id}" is ${item.wordCount} words, below the ${MIN_WORDS_PER_ITEM}-word ` +
          `floor. §38A requires substance, not a summary.`,
      );
    }
  }

  const categories = new Set(items.map((item) => item.category));
  for (const required of REQUIRED_CATEGORIES) {
    if (!categories.has(required)) {
      problems.push(`No items in required category "${required}" (§38K).`);
    }
  }

  for (const category of categories) {
    if (!REQUIRED_CATEGORIES.includes(category)) {
      problems.push(
        `Unexpected category "${category}". Add it to REQUIRED_CATEGORIES if intended.`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Knowledge base did not validate:\n  - ${problems.join("\n  - ")}`,
    );
  }
}

/* --------------------------------------------------------------------------
 * Emit
 * ----------------------------------------------------------------------- */

function emit(items) {
  const themes = [...new Set(items.flatMap((item) => item.themes))].sort();
  const totalWords = items.reduce((sum, item) => sum + item.wordCount, 0);

  // Emitted explicitly: wordCount is a build-time validation aid, and this
  // keeps the generated shape matching KnowledgeItem exactly.
  //
  // sourceRef is deliberately NOT emitted. It names the passage each item came
  // from, which is exactly the provenance §38I forbids the participant-facing
  // side from carrying. Keeping it in the Markdown means an author can trace a
  // claim while the runtime never holds a string that could identify the
  // source, however the generated module is imported. retrieval.test.ts asserts
  // the built corpus stays clean.
  const runtime = items.map((item) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    content: item.content,
    themes: item.themes,
    relatedConcepts: item.relatedConcepts,
    sourceVersion: item.sourceVersion,
  }));

  const output = `// GENERATED FILE — DO NOT EDIT.
//
// Produced by scripts/build-kb.mjs from content/knowledge-base/.
// Edit the Markdown sources and re-run \`npm run generate\`.
//
// Knowledge base version: ${KNOWLEDGE_BASE_VERSION}
// Items: ${items.length}   Themes: ${themes.length}   Words: ${totalWords}

import type { KnowledgeItem } from "./knowledge-types";

export const knowledgeBaseVersion = ${JSON.stringify(KNOWLEDGE_BASE_VERSION)};

export const knowledgeThemes = ${JSON.stringify(themes, null, 2)} as const;

export const knowledgeBase: KnowledgeItem[] = ${JSON.stringify(runtime, null, 2)};
`;

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, output, "utf8");

  return { themes, totalWords };
}

/* --------------------------------------------------------------------------
 * Main
 * ----------------------------------------------------------------------- */

// README.md documents the format; it is not itself a knowledge file.
const DOC_FILES = new Set(["README.md"]);

const files = readdirSync(SOURCE_DIR)
  .filter((name) => name.endsWith(".md") && !DOC_FILES.has(name))
  .sort();

if (files.length === 0) {
  throw new Error(`No Markdown files found in ${SOURCE_DIR}.`);
}

const items = files.flatMap(parseFile);
validate(items);
const { themes, totalWords } = emit(items);

console.log(
  `knowledge base: ${items.length} items, ${themes.length} themes, ` +
    `${totalWords} words -> lib/ai/knowledge-base.generated.ts`,
);
