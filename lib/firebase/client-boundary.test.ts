import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The assumption `firestore.rules` rests on (master_prompt.md §49, §88).
 *
 * The rules deny every client read and write. That is only safe -- and only
 * possible -- because no browser code ever holds a Firestore handle: the client
 * loads Firebase for authentication alone, and all data access goes through
 * server routes on the Admin SDK, which bypasses rules as a service account.
 *
 * The day someone adds `import { getFirestore } from "firebase/firestore"` to a
 * component, that page breaks silently against deny-all rules, and the tempting
 * fix is to loosen the rules rather than move the read to the server. This test
 * exists to fail first, loudly, with the reason attached.
 */

const root = resolve(__dirname, "..", "..");

const CLIENT_TREES = ["app", "components", "lib"];

/** Server-only modules are exempt: the Admin SDK is the intended path. */
const ADMIN_SDK_MODULES = ["firebase-admin", "firebase-admin/firestore"];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) return [];
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) return [];
    if (entry.name.endsWith(".generated.ts")) return [];
    return [full];
  });
}

describe("the client never touches Firestore", () => {
  const files = CLIENT_TREES.flatMap((tree) => sourceFiles(join(root, tree)));

  it("has sources to check", () => {
    // A path change that silently emptied this list would make every
    // assertion below pass while checking nothing.
    expect(files.length).toBeGreaterThan(30);
  });

  it("imports the Firestore web SDK nowhere", () => {
    const offenders = files.filter((file) =>
      /from\s+["']firebase\/firestore["']|require\(["']firebase\/firestore["']\)/.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(
      offenders.map((file) => file.slice(root.length + 1)),
      "firestore.rules denies all client access; move this read to a server route",
    ).toEqual([]);
  });

  /**
   * The Admin SDK carries the service-account credentials that bypass the
   * rules. A "use client" file importing it would ship them to the browser --
   * a far worse failure than a broken read.
   */
  it("keeps the Admin SDK out of every client component", () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/m.test(source)) return false;
      return ADMIN_SDK_MODULES.some((module) =>
        new RegExp(`from\\s+["']${module}["']`).test(source),
      );
    });

    expect(offenders.map((file) => file.slice(root.length + 1))).toEqual([]);
  });
});
