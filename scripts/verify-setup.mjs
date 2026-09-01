/**
 * Verifies that the server configuration actually works.
 *
 * master_prompt.md §98: a service that is not configured must produce a clear
 * setup requirement rather than a mysterious failure at runtime. This checks
 * the real paths -- it initialises the Admin SDK with the real credentials,
 * writes and reads a real Firestore document, and lists real Gemini models --
 * so a pass means the thing works, not that the variables merely look present.
 *
 *   npm run verify:setup
 *
 * Prints no secret values, only whether each one is usable.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const NEWLINE = String.fromCharCode(10);
const ESCAPED_NEWLINE = String.fromCharCode(92) + "n";

/* Load .env / .env.local the way Next.js does: .env.local wins. */
function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    let raw;
    try {
      raw = readFileSync(resolve(ROOT, file), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index <= 0 || line.trimStart().startsWith("#")) continue;
      let value = line.slice(index + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[line.slice(0, index).trim()] = value;
    }
  }
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  OK  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

loadEnv();

console.log("\nCollabNGrow Passion Analyzer — setup verification\n");

/* -------------------------------------------------------------------------
 * Generated secrets
 * ---------------------------------------------------------------------- */

for (const name of ["INVITATION_PASSWORD_ENCRYPTION_KEY", "INVITE_GRANT_SECRET"]) {
  const value = process.env[name];
  if (!value) {
    record(name, false, "not set");
    continue;
  }
  const bytes = Buffer.from(value, "base64");
  // Node's base64 decoder is lenient and will silently ignore trailing junk,
  // so a value that decodes is not necessarily a value that was pasted once.
  const canonical = bytes.toString("base64") === value;
  if (bytes.length < 32) record(name, false, `decodes to ${bytes.length} bytes, need 32`);
  else if (!canonical) {
    record(name, false, "not canonical base64 — likely pasted twice or truncated");
  } else record(name, true, `${bytes.length} bytes`);
}

/* -------------------------------------------------------------------------
 * Firebase Admin
 * ---------------------------------------------------------------------- */

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_PRIVATE_KEY ?? "";

if (rawKey.trim().toLowerCase().endsWith(".json")) {
  record(
    "FIREBASE_PRIVATE_KEY",
    false,
    "looks like a file path. It must hold the private_key VALUE from the " +
      "service-account JSON, with newlines escaped as \\n, because Vercel has " +
      "no such file",
  );
} else if (!rawKey.includes("BEGIN")) {
  record("FIREBASE_PRIVATE_KEY", false, "does not look like a PEM private key");
} else {
  const privateKey = rawKey.split(ESCAPED_NEWLINE).join(NEWLINE);
  const looksComplete =
    privateKey.includes(NEWLINE) &&
    privateKey.trimEnd().endsWith("-----END PRIVATE KEY-----");
  record(
    "FIREBASE_PRIVATE_KEY",
    looksComplete,
    looksComplete ? "well-formed PEM" : "PEM looks truncated or unescaped",
  );

  if (looksComplete && clientEmail && projectId) {
    try {
      const { cert, initializeApp } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");

      const app = initializeApp(
        {
          credential: cert({ projectId, clientEmail, privateKey }),
          projectId,
        },
        `verify-${Date.now()}`,
      );
      record("Firebase Admin credentials", true, projectId);

      const ref = getFirestore(app).collection("_setupCheck").doc("probe");
      await ref.set({ at: new Date().toISOString() });
      const snapshot = await ref.get();
      await ref.delete();
      record("Firestore write / read / delete", snapshot.exists, "live connection");
    } catch (error) {
      record("Firebase Admin credentials", false, String(error.message).slice(0, 140));
    }
  }
}

/* -------------------------------------------------------------------------
 * Gemini
 * ---------------------------------------------------------------------- */

const keys = [1, 2, 3]
  .map((n) => ({ id: `key${n}`, apiKey: process.env[`GEMINI_API_KEY_${n}`] }))
  .filter((entry) => entry.apiKey);

if (keys.length === 0) {
  record("Gemini API keys", false, "none set");
} else {
  for (const { id, apiKey } of keys) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`,
      );
      const body = await response.json();
      if (body.error) record(`Gemini ${id}`, false, body.error.status ?? "rejected");
      else record(`Gemini ${id}`, true, "accepted");
    } catch (error) {
      record(`Gemini ${id}`, false, String(error.message).slice(0, 80));
    }
  }
}

/* -------------------------------------------------------------------------
 * Summary
 * ---------------------------------------------------------------------- */

const failed = results.filter((entry) => !entry.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed.` +
    (failed.length ? ` Fix: ${failed.map((f) => f.name).join(", ")}` : " Ready."),
);
console.log();

process.exit(failed.length > 0 ? 1 : 0);
