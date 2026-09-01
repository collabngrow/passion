# CollabNGrow Passion Analyzer — Build Plan

## Context

This repository began as specification and brand material only. The goal is the complete,
production-ready application described in `master_prompt.md`: a private, invitation-only guided
self-reflection experience where an administrator issues password-protected invitations, a
participant works through a 43-question journey, and a Gemini-backed interpretation engine —
grounded in a structured knowledge base rather than generic coaching — produces per-section
reflections and a final synthesis.

The specification is explicit that this must not be scaffolding, a mockup, or faked
functionality (§98, FINAL BUILD INSTRUCTION). Real authentication, real Firestore persistence,
real server-side cryptography, real AI routing.

### Environment

| Tool | State |
| --- | --- |
| Node / npm | v22.14.0 / 10.9.2 |
| `gh` | authenticated, active account `collabngrow` |
| Firebase CLI | 15.28.2, logged in as `collabwinwin@gmail.com` |
| Firebase project | `passion-f0aec`, Google auth enabled |
| Firestore | created, still on test-mode rules — replaced in S11 |
| Vercel CLI | 48.1.6 |

### Agreed decisions

- **Knowledge base** authored from the interpretive principles in `exercise_content_1.md` plus
  the Nietzschean concepts the specification names. Substantive and structured, not a summary.
  Swappable later if a source text is supplied.
- **AI timing:** one concise reflection after each of the 14 parts, plus the final synthesis —
  roughly 15 Gemini calls per participant rather than 44.
- **Ship target:** clean build and lint, commit, push to `collabngrow/passion`. Vercel
  deployment is performed by the project owner.

---

## Architecture decisions

These sharpen or deviate from the specification; rationale is given for each.

**All Firestore access is server-side through the Admin SDK.** The client Firebase SDK is used
for authentication only, and Firestore rules deny all client access. This is stricter than
§49's "participants access only their own data", satisfies every line of the §88 security
acceptance test by construction, keeps the client bundle small (§91), and removes an entire
class of rule-bypass bugs. Autosave posts to an API route; it never writes Firestore directly.

**Password hashing uses `node:crypto` scrypt**, with no external dependency. Argon2 and bcrypt
native builds are fragile across Windows development and Vercel deployment; scrypt is built in,
memory-hard and appropriate for server-side use (§10). Stored as `scrypt$N$r$p$salt$hash` and
verified with `timingSafeEqual`.

**Recoverable passwords use AES-256-GCM** via `node:crypto` (§10). The key is 32 raw bytes,
base64-encoded, in `INVITATION_PASSWORD_ENCRYPTION_KEY`. Ciphertext is stored as
`v1:iv:tag:ciphertext`.

**Two-factor gate for the journey.** §14 and §16 require password *and* Google; §18 requires
sessions to survive close and refresh; §19 requires password re-entry after explicit logout.
These are reconciled by requiring both of the following on every journey request:

1. a valid Firebase ID token whose UID equals `invitation.boundUid`, and
2. a signed HttpOnly `invite_grant` cookie — a JWT carrying `{inviteId, purpose}`, 30-day
   lifetime, `secure` and `sameSite=lax` — issued only by successful server-side password
   verification.

Logout clears the Firebase session and the cookie, forcing full re-entry. Refresh and close
clear neither, so the session survives. The password never touches the URL, browser history or
client storage (§8).

**Rate limiting lives in Firestore**, not Redis (§96). `/rateLimits/{scope}` documents are
incremented transactionally over a rolling window, keyed on `inviteId` plus a hashed IP.
Failures escalate delay rather than locking permanently (§53), and messages never disclose
whether an invitation exists (§54).

**Gemini model identifiers are discovered, not guessed.** The specification's "Gemini 3.6
Flash" is illustrative, and §34 forbids hard-coding obsolete names. The live model catalogue is
listed from the API at setup time and `/system/aiConfig` is seeded from what actually exists.
The admin UI edits it thereafter; code defaults are a fallback only.

**The service worker is hand-written**, not `next-pwa`. Roughly sixty lines gives exact control
over the §46 requirement that private participant content is never cached and that `/api/*` is
always network-only.

---

## Sprints

Every sprint ends with `npm run build`, `npm run lint` and `npx tsc --noEmit` clean, a commit,
and a `MEMORY.md` update. No browser verification — build checks only, per `CLAUDE.md`.

### S0 · Repository hygiene — complete

`.gitignore` added; `.env` untracked and retained on disk. Git history audited: the Gemini keys
never entered it, so no rewrite or rotation was needed.

### S1 · Foundation

Next.js with TypeScript, App Router and Tailwind, scaffolded in place. Design tokens from
`brand_guidelines.md` §25 wired into `app/globals.css` and the Tailwind theme — `#E0023F`,
`#C11C45`, `#FFF5F7`, radii, text colours. No raw hex in components. Base layout, fonts,
`lib/firebase/client.ts`, `lib/firebase/admin.ts` as a lazy singleton that throws a clear setup
error when credentials are absent (§98). Brand assets moved to `public/brand/`.

### S2 · Content pipelines

- `scripts/build-exercise.mjs` parses `content/exercise.md` into
  `lib/exercise/exercise.generated.ts` — 14 parts, 43 `ExerciseQuestion` records (§57),
  `exerciseVersion: "1.0"`. Questions are never hard-coded into components (§57, §68).
- `content/knowledge-base/` holds `principles.md`, `values.md`, `concepts.md`,
  `distinctions.md`, `tensions.md`, `interpretation-guidance.md` and `cautions.md` (§38K), each
  item carrying `id, category, title, themes[], relatedConcepts[], sourceVersion` frontmatter.
  The §38L checklist is the acceptance bar.
- `scripts/build-kb.mjs` generates `lib/ai/knowledge-base.generated.ts` with
  `knowledgeBaseVersion: "1.0"`.
- `lib/ai/retrieval.ts` selects relevant knowledge items per section by theme tag and keyword
  overlap (§38C — no vector database).

### S3 · Cryptography and invitation core

`lib/security/password.ts` (scrypt), `lib/security/encryption.ts` (AES-GCM),
`lib/security/token.ts` (grant cookie via `jose`), `lib/security/rate-limit.ts`, and
`lib/invitations/` generating a 24-character password and 10-character `inviteId` from a CSPRNG
(§7, §9). Unit-tested throughout.

### S4 · Authentication and admin authorization

Google sign-in with `browserLocalPersistence` (§18). `lib/auth/verify.ts` exposes
`requireUser()`, `requireAdmin()` — verified token email equals `ADMIN_EMAIL` with
`email_verified` true (§21) — and `requireFreshAuth(maxAgeSec)` using the token's `auth_time`
(§25, §26). Every admin route calls these server-side; the client-side email check is
presentation only (§89).

### S5 · Participant invitation flow

`app/invite/[inviteId]/page.tsx` presents the password screen, which posts to
`/api/invite/verify-password` (rate-limited, generic errors) to obtain the grant cookie, then
runs Google authentication and posts to `/api/invite/bind`. Binding is a Firestore transaction
that claims the UID and email when unbound, or compares when already bound (§15, §78, §79).
Mismatch shows the §17 message plus **Trouble Signing In** — `mailto:collabwinwin@gmail.com`
and `https://wa.me/919819927007`. Onboarding collects name, age and nationality; the email
comes from the verified token and is not editable (§56).

### S6 · Admin dashboard

`/admin` with Overview, Invitations, Participants, AI Configuration and Settings (§66). The
invitation table (§65) supports create, masked password with **Reveal** behind Google
re-authentication — `/api/admin/invitations/[id]/reveal-password` decrypts server-side only,
never logs and never persists client-side (§27, §28) — copy via the Clipboard API, share via
`navigator.share()` with a clipboard fallback (§29, §64), transactional rotation that leaves
binding and participant data intact (§30), and disable/enable (§31). Audit events are written
to `/adminActions` with no plaintext (§80, §81). The route group is lazy-loaded (§91).

### S7 · Exercise engine

`/journey` presents one question per screen with the answer field as the visual centre (§43,
brand §29). Autosave is debounced at roughly 1.5 seconds to `/api/journey/answer`, showing
`Saving… / Saved / Unable to save — retrying` (§44). Progress and `currentQuestion` persist so
participants resume where they left off (§45). Both the grant cookie and the UID binding are
re-verified server-side on every write.

### S8 · AI engine

`lib/ai/router.ts` iterates candidates formed from the key pools crossed with the model list in
`/system/aiConfig`. Errors are classified (§36): quota, rate-limit, unavailable and
model-not-found advance to the next candidate; malformed requests and authentication failures
abort immediately. Total attempts are bounded — no infinite loops.

`lib/ai/prompts.ts` keeps `SYSTEM | FRAMEWORK | EXERCISE | PARTICIPANT DATA` strictly
separated, fencing participant text and labelling it untrusted (§38M). It enforces the §38F
hierarchy, the §39–§42 rules against diagnosis, false certainty and generic coaching, and above
all §38I: the framework's provenance never surfaces to the participant, in output, UI or
metadata. `INTERPRETATION_PROMPT_VERSION` and `SYNTHESIS_PROMPT_VERSION` are stored with every
result (§94).

Structured JSON output is validated with zod before storage (§38N). Idempotency keys each
interpretation document as `sectionId + hash(section answers)`, so identical input never
regenerates (§77, §92). The synthesis reasons across all answers rather than concatenating them
(§38H) and covers all sixteen §60 categories; regeneration creates a new version and keeps the
latest active (§93). An AI failure never loses an answer — the answer is saved first, then the
§75 message is shown.

### S9 · Final result

Reflective and editorial, with no scores (§61, brand §30): themes, the person you are becoming,
what may be holding you back, three priorities, and the next thirty days — culminating in
**"Who are you choosing to become?"** (§62).

### S9.5 · Feedback survey

Added after the plan was agreed, from `feedback_plan.md`. Three questions, stored in Firestore
and surfaced in the admin dashboard.

**Q2 is asked at onboarding, not with the survey.** The source document labels Q2 as measuring
willingness to pay *before* the revelations, but places the whole survey behind them — as
written, Q2 and Q3 would both be post-exposure and the "value perception shift" chart would
compare two answers to the same condition. So Q2 is asked once at onboarding, before question 1
of the exercise, and replayed into the survey **greyed out and read-only**, pre-filled from
their earlier answer, so the participant can see their own shift.

**Q2 must state plainly that the exercise is free.** Asking what someone would pay, at the very
start of an invitation-only experience, reads as a paywall unless it is explicitly disarmed. The
step carries a clear, prominent line that this exercise is free, that they will not be charged
anything, and that the question is asked only to understand what a price point might be. Without
it the question deters participants and sours the opening of a reflective experience.

- The Q2 onboarding step is built in **S5** alongside the rest of onboarding, since the
  onboarding form exists there and adding a step afterwards would mean rebuilding it. S9.5 adds
  the post-revelation survey and the admin tab.
- `participants/{uid}.willingnessToPay` captures Q2 at onboarding.
- `feedbackResponses/{uid}` holds the submitted survey; one per participant, not resubmittable.
- The survey stays locked until the synthesis has been generated and viewed.
- Admin gains a Feedback tab: responses table plus the four analyses in the source document
  (Q1 distribution, Q2 vs Q3 shift, average perceived worth with "Priceless" counted
  separately, summary stat cards).

Follows the same brand and accessibility rules as the rest of the product — radio groups with
real labels, no colour-only state, and the survey must not read as a paywall.

### S10 · Progressive web app

`app/manifest.ts`, icons generated from `logo.png` with `sharp` (192, 512, maskable,
apple-touch, favicon), and a hand-written `public/sw.js` caching the app shell and static assets
only, treating `/api/*` as network-only and never caching participant content (§46). Auth state
restores on reopen (§47).

### S11 · Firestore rules and indexes

`firestore.rules` denies all client reads and writes, since every access path is the Admin SDK.
Deployed with `firebase deploy --only firestore:rules`, replacing the current open test-mode
rules — a live security fix. `firestore.indexes.json` covers the admin listings.

### S12 · Accessibility and polish

Semantic HTML, keyboard navigation, visible focus rings, labelled inputs, accessible modals,
`prefers-reduced-motion`, contrast checks, and never colour alone for state (§73, brand §24).
Error copy stays human; raw Firebase, Firestore and Gemini errors never reach a user (§74,
brand §20).

### S13 · Tests and documentation

Vitest across the §86 matrix that is testable without a browser: password hash and verify, AES
round-trip, grant-token signing and expiry, rate-limiter windows, the exercise parser (43
questions across 14 parts), knowledge retrieval, router fallback classification, idempotency
keys and admin authorization guards. `README.md` per §84 and §99, including encryption-key
generation.

### S14 · Ship

Full build, lint and typecheck; the §88 security checklist walked line by line; the §38L
knowledge-base checklist confirmed; `MEMORY.md` updated; commit and push to
`collabngrow/passion`. The Vercel environment variable list is handed over.

---

## Critical files

| Path | Role |
| --- | --- |
| `content/exercise.md`, `scripts/build-exercise.mjs` | Question source of truth to generated TypeScript (§68) |
| `content/knowledge-base/`, `scripts/build-kb.mjs` | Interpretive framework (§38A–§38O) |
| `lib/security/` | All cryptography and abuse protection |
| `lib/auth/verify.ts` | `requireUser` / `requireAdmin` / `requireFreshAuth` |
| `lib/ai/` | Model fallback, prompt layering, knowledge retrieval |
| `lib/firebase/admin.ts` | Sole Firestore access path |
| `app/api/` | Every server boundary |
| `firestore.rules` | Deny-all defence layer |

## Environment variables

Present in `.env`: the seven `NEXT_PUBLIC_FIREBASE_*` values and `GEMINI_API_KEY_1` through
`_3`.

Still required for a full end-to-end run:

```
FIREBASE_CLIENT_EMAIL=        # Firebase Console -> Project Settings -> Service Accounts
FIREBASE_PRIVATE_KEY=
INVITATION_PASSWORD_ENCRYPTION_KEY=   # 32 random bytes, base64
INVITE_GRANT_SECRET=                  # 32 random bytes, base64
ADMIN_EMAIL=collabwinwin@gmail.com
NEXT_PUBLIC_APP_URL=
```

## Verification

1. `npm run build`, `npm run lint` and `npx tsc --noEmit` all clean.
2. `npx vitest run` green, including router fallback and cryptographic round-trips.
3. `firebase deploy --only firestore:rules` succeeds and rules deny anonymous client reads.
4. The §88 security checklist walked line by line, including grepping the client bundle to
   confirm no Gemini key, no encryption key and no `encryptedPassword` reaches it.
5. The §38L knowledge-base checklist confirmed, plus a grep across prompts and UI for
   source-provenance leakage (§38I).
6. The §87 end-to-end flow, once the Admin SDK service account and the two generated secrets
   are present.

**Known limitation:** until `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
`INVITATION_PASSWORD_ENCRYPTION_KEY` and `INVITE_GRANT_SECRET` are supplied, live admin reveal,
live binding and live Firestore persistence cannot be exercised. Nothing is faked to paper over
this (§98); those paths are complete and fail loudly with setup errors until the values land.
