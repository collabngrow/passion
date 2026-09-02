/**
 * Deletes a participant's answers and everything generated from them.
 *
 *   npm run reset:participant -- --email you@example.com
 *   npm run reset:participant -- --uid <firebase-uid>
 *   npm run reset:participant -- --email you@example.com --dry-run
 *
 * Why this exists: exercise v2.0 asks 43 questions and so did v1.0, and question
 * ids are generated as `q<number>`. The ids therefore collide exactly, and
 * nothing filters answers by `exerciseVersion` on read -- it is recorded but
 * never gated. An answer written against v1.0's "Your Dream Year" is served
 * back as the answer to v2.0's "What Have You Made Safe?", silently. Old
 * answers must be removed rather than left to be reinterpreted.
 *
 * Deletes, under participants/<uid>/:
 *   answers/          the participant's own writing
 *   interpretations/  section reflections generated from it
 *   synthesis/        the final reflection
 *
 * The participant document itself, the invitation and the Firebase Auth user are
 * left alone, so the same person signs in as before and starts the new exercise
 * from question one.
 *
 * This is irreversible. It prints what it will delete and requires --yes to act.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const file of [".env", ".env.local"]) {
  let raw;
  try {
    raw = readFileSync(resolve(ROOT, file), "utf8");
  } catch {
    continue;
  }
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trimStart().startsWith("#")) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[line.slice(0, i).trim()] = v;
  }
}

/* --------------------------------------------------------------------------
 * Arguments
 * ----------------------------------------------------------------------- */

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const has = (name) => args.includes(`--${name}`);

const email = flag("email");
const uidArg = flag("uid");
const dryRun = has("dry-run");
const confirmed = has("yes");

const listAll = has("list");

if (!email && !uidArg && !listAll && !has("all")) {
  console.error(
    "Usage: npm run reset:participant -- --email <address> | --uid <uid>\n" +
      "       --list      every participant and what is stored against them\n" +
      "       --dry-run   show what would go without deleting\n" +
      "       --yes       actually delete",
  );
  process.exit(1);
}

/* --------------------------------------------------------------------------
 * Admin SDK
 * ----------------------------------------------------------------------- */

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing Firebase Admin credentials in .env.");
  process.exit(1);
}

const { cert, initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const { getAuth } = await import("firebase-admin/auth");

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
const db = getFirestore(app);

const SUBCOLLECTIONS = ["answers", "interpretations", "synthesis"];

if (listAll) {
  const participants = await db.collection("participants").get();
  console.log(`project ${projectId} — ${participants.size} participant(s)\n`);

  for (const doc of participants.docs) {
    const data = doc.data();
    const counts = [];
    for (const sub of await doc.ref.listCollections()) {
      counts.push(`${sub.id}=${(await sub.get()).size}`);
    }
    console.log(
      `  ${doc.id}  ${data.email ?? data.name ?? "(no email)"}  ` +
        `[${counts.join(" ") || "empty"}]`,
    );
  }
  console.log();
  process.exit(0);
}

/**
 * Clears every participant's answers and generated output, and optionally the
 * invitations with them.
 *
 * The id collision is not specific to one person: any v1.0 answer under any
 * participant is served back under a v2.0 question, so a partial clear leaves
 * the same fault in place for whoever was missed.
 */
if (has("all")) {
  const withInvitations = has("invitations");
  const participants = await db.collection("participants").get();
  const targets = [];

  for (const doc of participants.docs) {
    for (const name of SUBCOLLECTIONS) {
      for (const child of (await doc.ref.collection(name).get()).docs) {
        targets.push(child.ref);
      }
    }
  }

  let invitations = [];
  if (withInvitations) {
    invitations = (await db.collection("invitations").get()).docs.map((d) => d.ref);
  }

  console.log(
    `${targets.length} participant document(s) across ${participants.size} participant(s)` +
      (withInvitations ? `, plus ${invitations.length} invitation(s)` : ""),
  );

  if (!confirmed) {
    console.log("\nThis cannot be undone. Re-run with --yes to proceed.\n");
    process.exit(0);
  }

  for (const refs of [targets, invitations]) {
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
      await batch.commit();
    }
  }

  console.log(
    `\nDeleted ${targets.length + invitations.length} document(s). ` +
      `Participant records and auth users are untouched.\n`,
  );
  process.exit(0);
}

let uid = uidArg;
if (!uid) {
  try {
    uid = (await getAuth(app).getUserByEmail(email)).uid;
  } catch {
    console.error(`No Firebase Auth user for ${email}.`);
    process.exit(1);
  }
}

console.log(`\nparticipant: ${uid}${email ? ` (${email})` : ""}  project: ${projectId}\n`);

/* --------------------------------------------------------------------------
 * Inspect, then delete
 * ----------------------------------------------------------------------- */


const participant = db.collection("participants").doc(uid);
const found = {};
let total = 0;

for (const name of SUBCOLLECTIONS) {
  const snapshot = await participant.collection(name).get();
  found[name] = snapshot.docs;
  total += snapshot.size;
  console.log(`  ${name.padEnd(16)} ${snapshot.size} document(s)`);

  if (name === "answers" && snapshot.size > 0) {
    const ids = snapshot.docs.map((d) => d.id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    console.log(`  ${" ".repeat(16)} ${ids.join(", ")}`);
  }
}

if (total === 0) {
  console.log("\nNothing to delete.\n");
  process.exit(0);
}

if (dryRun || !confirmed) {
  console.log(
    `\n${total} document(s) would be deleted. This cannot be undone.\n` +
      `Re-run with --yes to proceed.\n`,
  );
  process.exit(0);
}

let deleted = 0;
for (const name of SUBCOLLECTIONS) {
  const docs = found[name];
  // Batches cap at 500 writes; these collections are far smaller, but chunking
  // costs nothing and removes the cap as something to remember later.
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
    deleted += Math.min(400, docs.length - i);
  }
}

console.log(`\nDeleted ${deleted} document(s). The participant starts the new exercise fresh.\n`);
process.exit(0);
