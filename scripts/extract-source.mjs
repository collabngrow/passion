/**
 * Segments the source PDF into per-chapter text files under content/source/.
 *
 * master_prompt.md §38A: the knowledge base must be constructed from the
 * complete source material, not from a summary of it. That requires the source
 * in a form a person can actually read chapter by chapter while authoring
 * content/knowledge-base/.
 *
 * This script SEGMENTS. It does not summarise, and it never calls a model --
 * a machine-written précis of each chapter would reproduce exactly the
 * second-hand paraphrase the knowledge base rebuild exists to replace.
 *
 * The PDF is deliberately kept outside the repository (it is build-time source
 * material, not a runtime dependency) and content/source/ is gitignored, so the
 * output is regenerated on demand rather than committed.
 *
 *   node scripts/extract-source.mjs
 *   SOURCE_PDF=/path/to/book.pdf node scripts/extract-source.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PDF = resolve(ROOT, "../reflection_book.pdf");
const OUTPUT_DIR = resolve(ROOT, "content/source");

/** The book has a prologue and eighty numbered chapters. */
const EXPECTED_CHAPTERS = 80;

/**
 * Which part each chapter belongs to, from the table of contents.
 *
 * Derived from the chapter number rather than parsed, because "Third Part" and
 * "Fourth Part" appear only in the table of contents -- the body does not
 * repeat them, so there is nothing to match on at the boundary.
 */
const PART_BOUNDARIES = [
  { part: "I", label: "First Part", lastChapter: 22 },
  { part: "II", label: "Second Part", lastChapter: 44 },
  { part: "III", label: "Third Part", lastChapter: 60 },
  { part: "IV", label: "Fourth Part", lastChapter: 80 },
];

/** `^N. Title` at column zero. Indented copies belong to the contents list. */
const CHAPTER_RE = /^(\d+)\. (.+?)\s*$/;
const PROLOGUE_RE = /^Zarathustra's Prologue\s*$/;
const APPENDIX_RE = /^Appendix\s*$/;
/** A form feed and the right-aligned page number that follows it. */
const PAGE_ARTIFACT_RE = /^\f?\s*\d+\s*$/;
/** Part labels sit on their own line between chapters and belong to no body. */
const PART_LABEL_RE = /^(First|Second|Third|Fourth) Part\s*$/;

function fail(message) {
  console.error(`extract-source: ${message}`);
  process.exit(1);
}

function partFor(chapterNumber) {
  const entry = PART_BOUNDARIES.find((candidate) => chapterNumber <= candidate.lastChapter);
  return entry ?? fail(`chapter ${chapterNumber} falls outside every part.`);
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* --------------------------------------------------------------------------
 * Extraction
 * ----------------------------------------------------------------------- */

function extractText(pdfPath) {
  try {
    return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      fail(
        "pdftotext is not on PATH. It ships with poppler-utils and with Git for " +
          "Windows; install it and re-run.",
      );
    }
    return fail(`pdftotext failed: ${error.message}`);
  }
}

/** Drops page furniture and normalises line endings. */
function cleanLines(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !PAGE_ARTIFACT_RE.test(line))
    .map((line) => line.replace(/\f/g, "").trimEnd());
}

/**
 * Splits the cleaned lines into the prologue and eighty chapters.
 *
 * Chapter headings are accepted only in strictly increasing order. Two lines in
 * the book match the heading shape without being headings -- "1881. I made a
 * note of the thought..." in the introduction, and the stanza numbered "2." part
 * way through chapter 76 -- and requiring the next expected number rejects both
 * without special-casing either.
 */
function segment(lines) {
  const sections = [];
  let current = null;
  let expected = 1;
  let seenPrologueHeading = false;

  const open = (heading) => {
    if (current) sections.push(current);
    current = { ...heading, lines: [] };
  };

  for (const line of lines) {
    if (APPENDIX_RE.test(line) && expected > EXPECTED_CHAPTERS) break;

    if (PROLOGUE_RE.test(line)) {
      // Twice: once in the contents, once at the head of the prologue itself.
      // The second is the real one, so restart rather than append.
      seenPrologueHeading = true;
      current = null;
      open({ number: 0, title: "Zarathustra's Prologue", part: "0", label: "Prologue" });
      continue;
    }

    const match = line.match(CHAPTER_RE);
    if (match && Number(match[1]) === expected) {
      const number = Number(match[1]);
      const { part, label } = partFor(number);
      open({ number, title: match[2], part, label });
      expected += 1;
      continue;
    }

    if (PART_LABEL_RE.test(line)) continue;

    if (current && seenPrologueHeading) current.lines.push(line);
  }

  if (current) sections.push(current);
  return sections;
}

/** Collapses the runs of blank lines left behind by removed page furniture. */
function bodyOf(section) {
  return section.lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* --------------------------------------------------------------------------
 * Main
 * ----------------------------------------------------------------------- */

const pdfPath = process.env.SOURCE_PDF
  ? resolve(process.env.SOURCE_PDF)
  : DEFAULT_PDF;

if (!existsSync(pdfPath)) {
  fail(
    `no PDF at ${pdfPath}.\n` +
      "  The source book is kept outside the repository on purpose. Put it there, or\n" +
      "  point SOURCE_PDF at it:  SOURCE_PDF=/path/to/book.pdf npm run extract:source",
  );
}

const sections = segment(cleanLines(extractText(pdfPath)));
const chapters = sections.filter((section) => section.number > 0);
const prologue = sections.find((section) => section.number === 0);

if (!prologue) fail("no prologue found; the PDF layout is not what this script expects.");
if (chapters.length !== EXPECTED_CHAPTERS) {
  fail(
    `found ${chapters.length} chapters, expected ${EXPECTED_CHAPTERS}. ` +
      "The PDF layout has changed, or a heading was mis-parsed.",
  );
}

const thin = sections.filter((section) => bodyOf(section).split(/\s+/).length < 100);
if (thin.length > 0) {
  fail(
    `these sections extracted almost no text, so segmentation is wrong: ` +
      thin.map((section) => `${section.number}. ${section.title}`).join("; "),
  );
}

// Rebuild the directory so a renamed chapter cannot leave a stale file behind.
if (existsSync(OUTPUT_DIR)) {
  for (const entry of readdirSync(OUTPUT_DIR)) {
    rmSync(resolve(OUTPUT_DIR, entry), { recursive: true, force: true });
  }
} else {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

let totalWords = 0;

for (const section of sections) {
  const body = bodyOf(section);
  totalWords += body.split(/\s+/).length;

  const name =
    section.number === 0
      ? "00-prologue.txt"
      : `${String(section.number).padStart(2, "0")}-${slugify(section.title)}.txt`;

  const header = [
    `part: ${section.label}`,
    `chapter: ${section.number === 0 ? "Prologue" : section.number}`,
    `title: ${section.title}`,
    "",
    "",
  ].join("\n");

  writeFileSync(resolve(OUTPUT_DIR, name), header + body + "\n", "utf8");
}

console.log(
  `extract-source: wrote ${sections.length} files ` +
    `(prologue + ${chapters.length} chapters, ${totalWords.toLocaleString()} words) ` +
    `to content/source/`,
);
