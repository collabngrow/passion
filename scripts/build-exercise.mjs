/**
 * Structures content/exercise.md into lib/exercise/exercise.generated.ts.
 *
 * master_prompt.md §68: the Markdown file stays the human-readable source of
 * truth; the generated module is what the application imports. §57: questions
 * are never hard-coded into components.
 *
 * The script asserts the shape of what it parsed and exits non-zero on any
 * surprise. A silently short exercise would mean participants are asked fewer
 * questions than the exercise defines, which §68 forbids ("Do not make the AI
 * invent missing questions") -- so failing the build is the correct response.
 *
 *   node scripts/build-exercise.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "content/exercise.md");
const OUTPUT = resolve(ROOT, "lib/exercise/exercise.generated.ts");

/** Bumped deliberately when question wording changes (§95). */
const EXERCISE_VERSION = "1.0";

const EXPECTED_QUESTIONS = 43;
const EXPECTED_SECTIONS = 14;

/* --------------------------------------------------------------------------
 * Inline parsing
 * ----------------------------------------------------------------------- */

/** Splits `**bold**` runs out of a line into inline segments. */
function parseInline(text) {
  const segments = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index) });
    }
    segments.push({ text: match[1], bold: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments.filter((segment) => segment.text.length > 0);
}

/** Groups body lines into paragraph and list blocks. */
function parseBlocks(lines) {
  const blocks = [];
  let paragraph = [];
  let listItems = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", segments: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ kind: "list", items: listItems.map(parseInline) });
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line === "") {
      flushParagraph();
      // A blank line inside a bullet run does not end the list; the source uses
      // blank-separated bullets throughout.
      continue;
    }

    const bullet = line.match(/^[*-]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

/* --------------------------------------------------------------------------
 * Document parsing
 * ----------------------------------------------------------------------- */

/** Matches "# PART 6 — HEALTH", tolerating an em dash or a hyphen. */
const SECTION_RE = /^#\s+PART\s+(\d+)\s*[—–-]\s*(.+?)\s*$/;
/** Matches "## Question 17 — What Does Your Body Need From You?". */
const QUESTION_RE = /^##\s+Question\s+(\d+)\s*[—–-]\s*(.+?)\s*$/;
/** Everything from here on is guidance for the interpretation engine, not questions. */
const STOP_RE = /^#\s+FINAL SYNTHESIS\s*$/;
/** The last section carries no "PART n" prefix in the source. */
const FINAL_SECTION_RE = /^#\s+FINAL REFLECTION\s*$/;

/** Words left lowercase in a title unless they open or close it. */
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor", "of",
  "on", "or", "the", "to", "up", "vs", "with", "yet",
]);

/** Section headings are ALL CAPS in the source; render them as titles. */
function titleCase(value) {
  const words = value.toLowerCase().split(/\s+/);

  return words
    .map((word, index) => {
      const bare = word.replace(/[^a-z-]/g, "");
      const isEdge = index === 0 || index === words.length - 1;

      if (!isEdge && SMALL_WORDS.has(bare)) return word;

      // Capitalise each part of a hyphenated compound ("self-overcoming").
      return word.replace(/(^|-)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
    })
    .join(" ");
}

function parseExercise(markdown) {
  const lines = markdown.split(/\r?\n/);

  const sections = [];
  const questions = [];

  let section = null;
  let question = null;
  let body = [];

  const closeQuestion = () => {
    if (!question) return;
    question.blocks = parseBlocks(body);
    if (question.blocks.length === 0) {
      throw new Error(`Question ${question.number} has no body text.`);
    }
    questions.push(question);
    question = null;
    body = [];
  };

  for (const line of lines) {
    if (STOP_RE.test(line)) {
      closeQuestion();
      break;
    }

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      closeQuestion();
      const order = sections.length + 1;
      section = {
        id: `part-${sectionMatch[1]}`,
        title: titleCase(sectionMatch[2]),
        order,
        questionIds: [],
      };
      sections.push(section);
      continue;
    }

    if (FINAL_SECTION_RE.test(line)) {
      closeQuestion();
      section = {
        id: "final-reflection",
        title: "Final Reflection",
        order: sections.length + 1,
        questionIds: [],
      };
      sections.push(section);
      continue;
    }

    const questionMatch = line.match(QUESTION_RE);
    if (questionMatch) {
      closeQuestion();
      if (!section) {
        throw new Error(
          `Question ${questionMatch[1]} appears before any PART heading.`,
        );
      }
      const number = Number(questionMatch[1]);
      question = {
        id: `q${number}`,
        number,
        sectionId: section.id,
        title: questionMatch[2].trim(),
        blocks: [],
        order: questions.length + 1,
        type: "long_text",
      };
      section.questionIds.push(question.id);
      continue;
    }

    // Horizontal rules separate questions in the source and carry no content.
    if (/^-{3,}\s*$/.test(line)) continue;

    if (question) body.push(line);
  }

  closeQuestion();

  return { version: EXERCISE_VERSION, sections, questions };
}

/* --------------------------------------------------------------------------
 * Validation
 * ----------------------------------------------------------------------- */

function validate(exercise) {
  const problems = [];

  if (exercise.questions.length !== EXPECTED_QUESTIONS) {
    problems.push(
      `Expected ${EXPECTED_QUESTIONS} questions, parsed ${exercise.questions.length}.`,
    );
  }
  if (exercise.sections.length !== EXPECTED_SECTIONS) {
    problems.push(
      `Expected ${EXPECTED_SECTIONS} sections, parsed ${exercise.sections.length}.`,
    );
  }

  exercise.questions.forEach((q, index) => {
    if (q.number !== index + 1) {
      problems.push(
        `Question numbering is not contiguous: position ${index + 1} is "Question ${q.number}".`,
      );
    }
  });

  const empty = exercise.sections.filter((s) => s.questionIds.length === 0);
  for (const section of empty) {
    problems.push(`Section "${section.title}" (${section.id}) has no questions.`);
  }

  const ids = new Set();
  for (const q of exercise.questions) {
    if (ids.has(q.id)) problems.push(`Duplicate question id "${q.id}".`);
    ids.add(q.id);
  }

  if (problems.length > 0) {
    throw new Error(
      `content/exercise.md did not parse as expected:\n  - ${problems.join("\n  - ")}\n\n` +
        `Either the source changed shape or the parser needs updating. ` +
        `Shipping a partial exercise is not acceptable (master_prompt.md §68).`,
    );
  }
}

/* --------------------------------------------------------------------------
 * Emit
 * ----------------------------------------------------------------------- */

function emit(exercise) {
  const header = `// GENERATED FILE — DO NOT EDIT.
//
// Produced by scripts/build-exercise.mjs from content/exercise.md.
// Edit the Markdown source and re-run \`npm run generate\`.
//
// Exercise version: ${exercise.version}
// Sections: ${exercise.sections.length}   Questions: ${exercise.questions.length}

import type { Exercise } from "./types";

export const exercise: Exercise = ${JSON.stringify(exercise, null, 2)} as const;

export const exerciseVersion = ${JSON.stringify(exercise.version)};
`;

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, header, "utf8");
}

/* --------------------------------------------------------------------------
 * Main
 * ----------------------------------------------------------------------- */

const markdown = readFileSync(SOURCE, "utf8");
const exercise = parseExercise(markdown);
validate(exercise);
emit(exercise);

console.log(
  `exercise: ${exercise.questions.length} questions across ` +
    `${exercise.sections.length} sections -> lib/exercise/exercise.generated.ts`,
);
