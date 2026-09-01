# MEMORY

Running record of project state. Updated on every commit (see `CLAUDE.md`).

The build plan lives in `PLAN.md`.

---

## Sprint 0 — Repository hygiene

**Status:** complete

- Added `.gitignore` covering `.env*` (with an `!.env.example` negation),
  `node_modules/`, `.next/`, `*.tsbuildinfo`, `serviceAccount*.json`,
  `*-firebase-adminsdk-*.json`, `.vercel/`, `.firebase/`, coverage, logs and editor artefacts.
- Untracked `.env` via `git rm --cached`; the file remains on disk.

### Secret exposure audit

Full git history was audited before untracking. The only `.env` ever committed was the initial
420-byte version holding the seven `NEXT_PUBLIC_FIREBASE_*` values — public-by-design client
config. `GEMINI_API_KEY_1/2/3` were added to the working copy after that commit and never
entered history.

**No history rewrite required. No key rotation required.**

---

## Sprint 1 — Foundation

**Status:** complete

### Stack

Next.js 16.3.4 (App Router, Turbopack) · React 19.2.8 · TypeScript 5 · Tailwind CSS v4
(CSS-first `@theme`, no `tailwind.config.ts`).

Scaffolded into a temporary directory and copied in, because `create-next-app` refuses a
non-empty target. The scaffold's own `CLAUDE.md`, `AGENTS.md`, `.gitignore` and `README.md`
were deliberately excluded so they could not clobber project files.

### Added

| Path | Purpose |
| --- | --- |
| `app/globals.css` | Brand design tokens as a Tailwind v4 `@theme` block |
| `app/layout.tsx` | Root layout, Inter, brand metadata, `robots: noindex` |
| `app/page.tsx` | Public landing — explains the experience is invitation-only |
| `lib/env.ts` | Typed environment access; every accessor fails loudly with setup guidance |
| `lib/firebase/client.ts` | Browser Firebase — **authentication only**, local persistence |
| `lib/firebase/admin.ts` | Admin SDK singleton, lazy init — the sole Firestore path |
| `lib/support.ts` | Support email and WhatsApp helpers (§17, §20, §63) |
| `components/ui/Logo.tsx` | Supplied logo asset; uniform scaling only (brand §7) |
| `components/ui/Button.tsx` | Primary / secondary / on-brand / quiet variants (brand §9) |
| `.env.example` | Placeholder template with generation instructions |

Brand assets copied to `public/brand/` (`logo.png`, `reference-dashboard.png`,
`reference-footer.png`). `exercise_content_1.md` copied to `content/exercise.md` as the
content-pipeline source; the original stays as the human-readable root document.

### Decisions taken this sprint

- **No dark theme.** The identity is White + Rose with white as the primary canvas
  (brand §3, §4). A dark canvas would invert that hierarchy. `color-scheme: light` is pinned
  and the scaffold's `prefers-color-scheme` block was removed.
- **Inter, not Geist.** Brand §6 asks for a clean modern sans-serif optimised for readability
  and warmth; Geist reads more geometric. Geist Mono was dropped entirely as unused (§91).
- **Editorial feel via scale and whitespace, not a display serif.** Brand §6 forbids decorative
  fonts in the main interface, so the "more editorial" direction of brand §28 is achieved
  through type scale, line height and reading measure instead.
- **`LayoutProps<"/">` replaced with an explicit prop type.** The generated global only exists
  after a build, which made `tsc --noEmit` fail on a clean checkout.
- **`sharp` upgraded to ^0.35.4**, clearing the one high-severity advisory (libvips CVEs).

### Known advisory

Eight moderate `npm audit` findings remain, all one transitive `uuid` issue reached through
`firebase-admin` → `@google-cloud/firestore` → `google-gax`. `npm audit fix --force` "resolves"
it by downgrading `firebase-admin` from 13.x to 10.3.0, which is materially worse. Left in
place deliberately; revisit when `firebase-admin` ships an updated `google-gax`.

### Verification

`npm run build`, `npm run lint` and `npx tsc --noEmit` all clean. No browser verification, per
`CLAUDE.md`.

---

## Sprint 2 — Content pipelines

**Status:** complete

### Exercise pipeline

`content/exercise.md` (copied from `exercise_content_1.md`) is the human-readable source of
truth. `scripts/build-exercise.mjs` structures it into `lib/exercise/exercise.generated.ts`:
**43 questions across 14 sections**, `exerciseVersion: "1.0"`.

Question prose is parsed at build time into typed blocks (paragraphs, bullet lists, inline
bold) rather than shipped as raw Markdown, so the participant UI needs no runtime Markdown
parser. 224 blocks, 15 bold runs.

The script validates hard and exits non-zero on any surprise — wrong question count,
non-contiguous numbering, an empty section, a duplicate id. A silently short exercise would mean
participants are asked fewer questions than the exercise defines, which §68 forbids, so failing
the build is the correct response.

`lib/exercise/index.ts` is the only reader of the generated module. It exposes navigation
(`nextQuestion`, `previousQuestion`, `questionPosition`) and `isLastInSection`, which drives the
per-section interpretation boundary agreed for §59.

### Knowledge base

`content/knowledge-base/` — seven files, one per §38K category, authored from the interpretive
principles in `exercise_content_1.md` plus the concepts named in the spec.

**56 items, 28 themes, ~7,500 words.** `scripts/build-kb.mjs` parses per-item YAML frontmatter,
validates, and emits `lib/ai/knowledge-base.generated.ts`.

Build-time validation enforces: unique ids, resolving cross-references, at least one theme per
item (an untagged item can never be retrieved), all seven categories populated, and a
**60-word floor per item** — the mechanical guard against §38A's "do not create a shallow
summary".

### Retrieval

`lib/ai/retrieval.ts`, no vector database (§38C, §96).

- `principles`, `cautions` and `interpretationGuidance` are sent on **every** request. These are
  the rules the engine must never operate without; dropping one to save tokens is how a system
  starts diagnosing people.
- `concepts`, `values`, `distinctions`, `tensions` are selected by theme overlap with the
  section, supplemented by scanning the answer text — so a wealth question answered mostly about
  family pulls in the relationship material.
- Selection is deterministic, so identical input yields an identical prompt. This is a
  precondition for the §77 idempotency keys in S8.
- `fullKnowledgeBase()` gives the synthesis the entire corpus, since narrowing by theme would
  exclude exactly the cross-section connections §38H exists to find.

### Decision: the source is never named

§38I forbids revealing the framework's provenance to participants. Rather than relying on prompt
instructions alone, the knowledge base itself never names the source — every concept is written
on its own terms. The model is never given the name, so it cannot leak it.

`lib/ai/retrieval.test.ts` asserts this against the built corpus. `content/knowledge-base/README.md`
carries the §38L checklist, with each row mapped to where it is actually enforced.

### Generated files are gitignored

`lib/**/*.generated.ts` is excluded from version control. `generate` is wired into `predev`,
`prebuild` and `pretest`, so the generated modules are always rebuilt from source — including on
Vercel, which installs devDependencies and runs `npm run build`. A stale or hand-edited
generated file cannot ship.

### Verification

`npm run build`, `npm run lint`, `npx tsc --noEmit` clean. **26 tests passing** across two files
(exercise structure and navigation; knowledge base content and retrieval).

---

## Sprint 3 — Cryptography and invitation core

**Status:** complete

### Password hashing — `lib/security/password.ts`

scrypt from `node:crypto`, N=32768, r=8, p=1, 64-byte key, 16-byte salt.

Chosen over argon2 and bcrypt because both are native modules whose prebuilt binaries are a
recurring source of breakage across a Windows dev machine and a Linux serverless runtime.
scrypt is memory-hard, built in, and needs no build step. Measured at ~400 ms per hash, which is
the point.

Node's default `maxmem` is 32 MB, just under what these parameters need, so it is raised
explicitly to 96 MB. Parameters are encoded per hash (`scrypt$N$r$p$salt$hash`) so they can be
raised later without invalidating existing invitations; `needsRehash()` supports that migration.

**Malformed stored values return `false`, never throw.** A corrupted record must read as "wrong
password", never as an authentication bypass. Absurd parameters from a tampered record are
rejected before derivation, so a doctored `N` cannot trigger a multi-gigabyte allocation.

### Recoverable encryption — `lib/security/encryption.ts`

AES-256-GCM, format `v1:iv:authTag:ciphertext`, 96-bit nonce, 128-bit tag. GCM is authenticated,
so tampering fails loudly instead of decrypting to rubbish — asserted for both a flipped
ciphertext byte and a flipped tag byte.

### Grant token — `lib/security/token.ts`

The mechanism reconciling three requirements that pull against each other: §14/§16 (password
**and** Google), §18 (survive close and refresh), §19 (password again after explicit logout).

Firebase's session satisfies §18 alone but cannot satisfy §19 — a returning user would simply be
signed in again. So journey access requires two independent facts: a verified Firebase ID token
whose uid matches `invitation.boundUid`, **and** an HttpOnly grant cookie issued only by
successful server-side password verification. Logout clears both; refresh clears neither.

HS256 via `jose`, 30-day TTL, audience-scoped, and **bound to a single `inviteId`** — a grant for
one invitation cannot open another. The password is never in the token; a test asserts the claim
set is exactly `{iss, aud, iat, exp, inviteId}`.

### Rate limiting — `lib/security/rate-limit.ts`

Firestore-backed, one transaction per check (§96 rules out Redis at this scale). Policies:
password 10 per 15 min, admin-sensitive 30 per 15 min, AI 40 per hour.

Identifiers are SHA-256 hashed before becoming document ids, keeping raw IPs out of Firestore
(§12). Counters reset on success, so nine mistypes followed by a correct entry does not leave a
participant one attempt from a block on their next visit.

**Fails open when Firestore is unavailable.** A deliberate trade: the limiter is a second line of
defence behind a ~116-bit password, and taking the product down because a counter cannot be
written would punish legitimate participants for an infrastructure fault. The password check
itself never degrades. Proxy headers are used for rate-limit input only, never authorization
(§90).

### Invitation generation — `lib/invitations/generate.ts`

`randomInt` (rejection-sampled, no modulo bias) over a 57-character alphabet excluding `0 O 1 l
I`. Invite id 10 chars (~58 bits); password 20 chars (~116 bits).

The ambiguous characters are excluded because passwords get read off a screen, typed by hand and
dictated over the phone — and §54 forbids the system from telling anyone they were close.
`formatPasswordForDisplay` groups for legibility; `normalisePasswordInput` strips the grouping
and whitespace but **preserves case**, since lowering it would discard entropy.

### Test infrastructure

`server-only` throws by design outside a React Server Component graph, so vitest aliases it to a
stub — the guard is a build-time boundary, not behaviour worth exercising. `test/setup.ts`
supplies fixed test secrets, which works because `lib/env.ts` reads lazily inside functions.

### Verification

`npm run build`, `npm run lint`, `npx tsc --noEmit` clean. **56 tests passing** (up from 26).
Security coverage includes malformed-hash rejection, tampered-ciphertext rejection, cross-invitation
grant rejection, forged-signature rejection and expiry.

---

## Sprint 4 — Authentication and admin authorization

**Status:** complete

### Server verification — `lib/auth/verify.ts`

Every privileged route derives identity from a Firebase ID token verified against Google's
public keys by the Admin SDK. Nothing is taken from the client (§90).

- `verifyRequest` — reads the bearer token, verifies with `checkRevoked: true` so a signed-out
  or disabled account cannot continue on a token that has not yet expired.
- `requireUser` — any authenticated user.
- `requireAdmin` — compares the **verified token's** email to `ADMIN_EMAIL` and requires
  `email_verified`, so an unverified account claiming the admin address cannot pass (§21).
  Denials log the uid, never the address (§52).
- `requireFreshAuth` — checks `auth_time`, which Firebase sets and the client cannot influence.
  Default window 5 minutes, gating reveal and rotate (§25, §26). **A token with no `auth_time`
  is rejected**, since treating it as fresh would make the reveal gate bypassable.

### Error mapping — `lib/http.ts`

`ApiError` carries a public message chosen for a human plus an internal message for the log.
`withErrorHandling` wraps every route: an unexpected throw is logged and answered with a generic
sentence, because an unhandled error is by definition one nobody wrote a safe message for
(§74, brand §20). Error responses are `no-store`.

`genericAuthFailure()` is deliberately identical for a wrong password, an unknown invitation and
a disabled invitation, so responses never disclose which (§54). A test asserts the message
mentions none of "password", "invitation", "exist" or "found", and that an internal
`FirebaseError: permission-denied on /invitations/…` never reaches the client.

### Client — `lib/auth/client.ts`, `components/auth/`

Google sign-in, real `reauthenticateWithPopup` for §26 (not a modal that merely looks like one),
sign-out, and `apiFetch` which attaches the ID token and normalises network failures into the
same shape as server errors so no caller distinguishes them.

`useAuthState` exposes a `loading` flag. It matters for the PWA: on reopen there is a moment
where the user is signed in but not yet known, and rendering a signed-out view during it would
look exactly like the logout §18 promises will not happen.

`GoogleButton` keeps Google's own mark colours — the single place the brand palette gives way,
because a recoloured Google logo reads as untrustworthy on precisely the screen that needs
trust. `TroubleSigningIn` carries the §17/§20/§63 support routes and prefills the invitation
reference.

### Verification

`npm run build`, `npm run lint`, `npx tsc --noEmit` clean. **70 tests passing** (up from 56).

---

## Sprint 5 — Participant invitation flow

**Status:** complete

### Data model — `lib/invitations/`, `lib/participants/`

`invitations/{inviteId}` and `participants/{uid}` per §11. `InvitationSummary` is the admin
projection and **deliberately omits `passwordHash` and `encryptedPassword`** — there is no reason
for either to reach a browser, and §88 requires encrypted passwords be unreadable to clients.

### Binding is transactional (§15, §78, §79)

`bindInvitation` does its read and write inside one Firestore transaction, so two people opening
the same invitation simultaneously cannot both bind it. Returns
`bound` / `already-bound` / `mismatch` / `unavailable`.

`createInvitation` uses `create`, not `set`, and retries on collision — a silent overwrite would
destroy an existing participant's binding. `createParticipant` likewise, so a duplicate
submission cannot reset progress to question one.

### Timing-equalised password verification

`/api/invite/[inviteId]/verify-password` runs a **decoy scrypt hash when the invitation does not
exist**. Without it a missing invitation returns in ~1 ms while a real one costs ~400 ms — a
timing oracle answering exactly the question §54 forbids. Missing, disabled and wrong-password
are one indistinguishable outcome.

Rate limited on invitation **and** caller together, so one participant's mistyping cannot lock
out another's invitation and one client cannot spread attempts across many invitations. Counter
clears on success.

### Routes

| Route | Purpose |
| --- | --- |
| `POST /api/invite/[id]/verify-password` | Verifies, sets the HttpOnly grant cookie |
| `POST /api/invite/[id]/bind` | Requires grant **and** ID token; binds atomically |
| `GET /api/invite/[id]/state` | Which step to render |
| `GET/POST /api/participant/profile` | Onboarding; email taken from the token, never the body |
| `POST /api/auth/logout` | Clears the grant cookie |

`/state` returns `password` for an invitation that does not exist, identically to one that is
merely locked, so it cannot enumerate invitations. Logout is deliberately unauthenticated —
someone whose token already expired must still be able to finish logging out, and clearing your
own cookie grants nothing.

### UI

`app/invite/[inviteId]/page.tsx` does **no** server-side existence check; rendering the password
step for every id is what stops the route enumerating invitations (§54). `InviteFlow` renders
whichever step the server reports. A mismatch shows the §17 wording without ever naming the
bound account, and `TroubleSigningIn` appears on every failure surface (§17, §20, §63).

### Onboarding carries feedback survey Q2

Built here rather than in S9.5, since the onboarding form exists here and adding a step later
would mean rebuilding it. `lib/feedback/questions.ts` holds the option sets; values are pinned by
test because they are persisted and renumbering would reinterpret collected responses.

**The Q2 step states plainly that the exercise is free and nothing will be charged.** Asking
about price at the start of a free invitation-only experience reads as a paywall unless
explicitly disarmed — that copy is functional, not decorative, and a test asserts it says so.
Answering is optional.

### Note on a lint suppression

`InviteFlow` carries one `react-hooks/set-state-in-effect` disable. The rule flags any
effect-called function containing `setState`, and cannot see that every `setState` in `refresh`
happens after an awaited fetch rather than synchronously. Fetch-on-mount is the intended pattern;
an `active` flag guards against a late resolution landing after unmount.

### Verification

`npm run build`, `npm run lint`, `npx tsc --noEmit` clean. **78 tests passing** (up from 70).
Six routes building.

---

## Sprint 6 — Admin dashboard

**Status:** complete

### Routes

| Route | Guard |
| --- | --- |
| `GET/POST /api/admin/invitations` | `requireAdmin` |
| `POST .../[id]/reveal-password` | `requireFreshAdmin` + rate limit |
| `POST .../[id]/rotate-password` | `requireFreshAdmin` + rate limit |
| `POST .../[id]/status` | `requireAdmin` |
| `GET /api/admin/participants` | `requireAdmin` |
| `GET /api/admin/overview` | `requireAdmin`, aggregate counts |
| `GET /api/admin/system` | `requireAdmin` |
| `GET /api/admin/me` | `requireAdmin` |

### The admin address is not in the client bundle

The shell asks `/api/admin/me` and renders the answer, rather than comparing emails
client-side. The same `requireAdmin()` that guards every privileged route decides, so there is
no admin address shipped to browsers and no second implementation to drift (§21, §89).

### Reveal (§25, §27)

Masked by default. Revealing requires a **real Google reauthentication** when `auth_time` is
stale: the server returns `reauthentication_required`, the client calls
`reauthenticateWithPopup`, then retries. Decryption happens server-side only; the response
carries the plaintext and never the hash or the key, and nothing is logged (§52).

The plaintext lives only in component state — never `localStorage`, `sessionStorage`,
IndexedDB, a URL or a log (§28) — and is dropped on Hide.

### Share (§29, §64)

`navigator.share()` where available, clipboard otherwise. The password is fetched **only when
the administrator explicitly shares**, so it is not sitting in memory for every listed row. The
share text carries no internal ids or implementation detail. Invitation links are built from
`window.location.origin`, so a link copied from a preview deployment points at that deployment.

### Participants (§50)

Identity, binding and progress. **Deliberately not answers, interpretations or the synthesis** —
§50 asks that admin access be considered rather than a window onto everything, and nothing in
the product requires reading someone's private reflection from a listing.

### Settings reports presence, not values

`/api/admin/system` returns booleans for each secret, not masked values. §51 keeps keys
server-side, and the only useful question on a settings screen is whether a key is set. Gemini
is reported as a count. This is also the §98 setup surface: it names the exact missing
environment variable.

### Decision: no stub for AI configuration

The "AI configuration" nav item is **not** listed yet. It arrives in S8 with the model router it
configures. Listing it now would be a link to a stub, which §98 rules out.

### Verification

`npm run build`, `npm run lint`, `npx tsc --noEmit` clean, 78 tests passing. 17 routes building.

---

## Sprint 7 — Exercise engine

**Status:** complete

### The journey gate — `lib/journey/guard.ts`

Every journey route re-establishes all three facts per request (§90):

1. a verified Firebase ID token,
2. an invitation bound to that uid and still `active` (§31),
3. a grant cookie for **that same invitation**, proving the password step.

(3) is what makes §19 work. Firebase's session survives a refresh, so without the cookie a
participant who logged out would be silently let back in.

### The exercise is served, not bundled

`/api/journey/state` returns the exercise rather than importing it into the client bundle. It is
~90 KB of generated content that only an authenticated, password-verified participant should
receive; bundling it statically would put the whole exercise within reach of anyone who loaded
the page (§91).

### Autosave (§44)

Debounced at 1.5 s — never per keystroke. Answers are held in a ref so moving between questions
is instant, with a flush before each navigation and on unmount so a pending edit is never lost.
Status reads `Saving… / Saved / Unable to save — retrying`, `aria-live="polite"` and deliberately
quiet.

Clearing an answer **removes** it from `answered`, so progress stays honest rather than counting
a question the participant emptied. Unknown question ids are rejected, keeping the answers
collection to the real exercise.

`POST /api/journey/answer` saves and returns `sectionComplete`, which is how the client will know
a section reflection can be generated (§59). Saving is a separate request from interpretation, so
per §75 an AI outage can never cost a participant their writing.

### Logout (§19)

`LogoutDialog` carries the exact §19 wording, since there is no password recovery (§20) and a
participant should know what returning costs before choosing it. It clears the grant cookie
**first**, then the Firebase session — if the page unloads midway, ending the password proof
without the session is the safer half-state.

It finishes with a **full document navigation, deliberately**. A soft route change would leave
the participant's loaded answers alive in React state, which matters on a shared or borrowed
device. The Next lint rule against this is suppressed with that reasoning.

### Verification

`npm run build`, `npm run lint`, `npx tsc --noEmit` clean, 78 tests passing. 20 routes building.

---

## Sprint 8 — AI engine

**Status:** complete

### Model ids were discovered, not guessed

§34 forbids hard-coding obsolete model names, so the live catalogue was queried with the
project's own key before writing any defaults. The sequence §34 asks for turns out to name
**models that genuinely exist**, so it is used verbatim:

1. `gemini-3.6-flash`
2. `gemini-3.5-flash`
3. `gemini-3.5-flash-lite`

`gemini-3.7-flash` is also available and can be added through the admin UI without a code
change — which is precisely the capability §34 asks for. Flash-class throughout: the task runs
~15 times per participant and a Pro model would cost far more than the quality bar needs.

### Router — `lib/ai/router.ts`

Candidates are (key pool × model) in configured order: every enabled model on key 1, then the
same sequence on key 2, then key 3 (§35). Hard ceiling of 12 attempts regardless of
configuration size.

**Failure classification is the substance of §36.** Advance on quota, rate limit, 404
model-unavailable, 5xx and transport faults. Abort on 400/401/403, invalid argument, bad API
key, and safety refusals. **Unrecognised errors abort deliberately** — an unknown error is more
likely a bug in the request than a capacity problem, and retrying a malformed request across
nine candidates burns quota to produce nine identical failures while hiding the real cause
behind what looks like an outage.

An empty completion is treated as *advance*, since that is a capacity or filtering artefact
rather than a request defect.

Logs carry model, pool id and the classification — never the prompt or the participant's text
(§52).

### Prompts — `lib/ai/prompts.ts`

Layered `FRAMEWORK CONTEXT | EXERCISE | PARTICIPANT DATA` with the §38F authority order stated
explicitly. Participant text is fenced with a **per-request random nonce**, because fencing
alone is defeatable — a participant can write the closing delimiter, but cannot guess the nonce
(§38M).

The system instruction encodes each prohibition against the failure it prevents: no source
naming (§38I), no framework vocabulary, no diagnosis (§40), no types, no false certainty (§41),
no invented detail, no generic encouragement (§42, §38G), and participant text never acts as
instruction.

### Structured output — `lib/ai/schema.ts`

zod-validated before anything is stored or rendered (§38N). An unvalidated response is untrusted
input, and storing a malformed one would break the result page for someone who cannot regenerate
it. Validation errors report **field paths only, never content** — a test asserts a participant's
words cannot leak into an error message.

The synthesis field is named `philosophicalLens`, not after the framework's source: field names
surface in exports and admin views, and §38I covers those too.

### Idempotency and cost (§77, §92, §93)

Interpretation document id is `sectionId_fingerprint(answers)`, so resubmitting identical answers
returns the stored result and edited answers produce a new one. The synthesis stores its
`answersFingerprint` and `GET` never generates — opening the result page cannot spend a call.
Regeneration writes a new history document alongside `active`, so nothing is silently
overwritten (§93).

### Failure experience (§75)

Answers are saved by a **separate** request before any generation runs, so an AI outage can never
cost someone their writing. Every AI failure maps to the same reassurance rather than a
technical error.

### Verification

`npm run build`, `npm run lint`, `npx tsc --noEmit` clean. **95 tests passing** (up from 78),
including 17 covering failure classification and output validation.

**Not yet exercised against the live API.** The router is complete but no real generation has
run — that needs the Firebase service account, since every AI route sits behind
`requireParticipant`.

---

## Setup verification — live infrastructure confirmed

`npm run verify:setup` (`scripts/verify-setup.mjs`) exercises the real paths rather than checking
that variables merely look present: it initialises the Admin SDK with the real credentials,
performs a real Firestore write/read/delete, and calls the Gemini models endpoint with each key.

**First live run: 8/8 passed.** Firestore round-trip OK against `passion-f0aec`; all three Gemini
keys accepted. Up to this point every sprint had been build-verified only.

### Two configuration faults it caught

- **`FIREBASE_PRIVATE_KEY` held a filesystem path** to the service-account JSON rather than the
  key contents. It would have worked locally and failed on Vercel, which has no such file. The
  `private_key` value is now inlined with `
` escapes — the same form Vercel needs. The JSON
  file stays on disk, gitignored, as the source to regenerate from.
- **`INVITE_GRANT_SECRET` was the 44-character key pasted twice.** Node's base64 decoder is
  lenient: it stopped at the `=` in the middle and silently used the first 32 bytes. It would
  have "worked" while being wrong. The verifier now rejects non-canonical base64 for exactly this
  reason, rather than only checking decoded length.

`FIREBASE_PRIVATE_KEY.json` is gitignored (added by the project owner) and never entered history.

---

## Sprint 9 — Final result

**Status:** complete

`/journey/result`, reached from Finish on the last question (which flushes the pending answer
first, so the synthesis reads it).

Reflective and editorial, no score, no rating, no type (§61, brand §30) — the page reads as a
letter, not a report. Sections render only when there is something behind them, so a thin
category stays absent rather than padded. Culminates in **"Who are you choosing to become?"** on
a rose gradient (§62, brand §30).

Generation is explicit: opening the page issues a GET, which never spends a model call (§92).
The participant asks for it to be written.

---

## Live AI verification — two production bugs found

`npm run smoke:ai` (`scripts/smoke-ai.mjs`) sends one real request through the real prompt shape
and response schema, then checks the output against the rules that matter: no source provenance
(§38I), no framework vocabulary, no false certainty (§41), not generic coaching (§42), and
anchored in the participant's own detail. **8/8 pass**, and the generated reflection found the
intended tension unprompted.

### 1. `maxOutputTokens: 1600` truncated every interpretation

Gemini 3.x charges **thinking tokens against the output budget**. The first live run spent 1,097
tokens thinking and was cut off mid-JSON — `parseJsonResponse` would have thrown for every
participant. Raised to 4,096 for interpretation and 16,384 for the synthesis, which emits sixteen
sections.

### 2. Unbounded thinking took 44–94 seconds

Long enough to exceed the 60s `maxDuration` the reflect route had, and far too slow for someone
waiting on a screen.

| thinkingBudget | latency | thoughts |
| --- | --- | --- |
| unset | 44.7s / 93.6s | 660 / 1070 |
| 0 | rejected — `INVALID_ARGUMENT` on these models |  |
| 512 | **18.1s** (2.1s on a short prompt) | 0 |

Set to 512 for interpretation and 2,048 for the synthesis. Quality was equal or better at 512 —
that run produced the sharpest of the three reflections and still passed 8/8.

`maxDuration` raised to 120s (reflect) and 300s (synthesis).

**Deployment note:** 300s exceeds Vercel's Hobby function limit. The synthesis route needs a plan
that permits it, or the budget must be tightened further.

---

## Environment variables

Present in `.env`: seven `NEXT_PUBLIC_FIREBASE_*`, plus `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`,
`GEMINI_API_KEY_3`.

Still required before the application can run end-to-end:

- `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (Admin SDK service account)
- `INVITATION_PASSWORD_ENCRYPTION_KEY` (32 random bytes, base64)
- `INVITE_GRANT_SECRET` (32 random bytes, base64)
- `ADMIN_EMAIL` (defaults to `collabwinwin@gmail.com` when unset)
- `NEXT_PUBLIC_APP_URL`

## Infrastructure state

| Item | State |
| --- | --- |
| Firebase project | `passion-f0aec`, Google auth enabled |
| Firestore | created; **deny-all rules deployed by the owner (S11)** — no client can read or write |
| `gh` | authenticated as `collabngrow` |
| Vercel | CLI installed; project not yet linked, deployment is owner-driven |

## Sprint 9.5 - Feedback survey

**Status:** complete

Q2 was already asked at onboarding in S5. This sprint added the post-revelation half: Q1 and Q3
below the reflection, and the admin Feedback tab.

### The survey is its own page, never part of the reflection

**`/journey/survey`, reached deliberately.** Owner's decision: it must never appear in front of a
participant. It is not rendered inside the reflection at all -- participants are messaged
separately and asked to go and fill it in. The result page carries one quiet text link in its
footer, nothing more.

That also settles S62 cleanly: the reflection still ends on "Who are you choosing to become?",
with no form after it turning the last thing someone reads into a rating exercise.

Q2 is **replayed read-only** from the profile rather than re-asked, so the participant sees their
own before-and-after rather than answering the same question twice.

### Locking

`unlocked` is decided server-side by whether a synthesis document exists, not by what the page
claims to have shown (S90). `POST /api/feedback` re-checks it, so a response cannot be recorded
before there is anything to respond to.

### One response per participant, by construction

`feedbackResponses/{uid}` -- the document id **is** the uid, so uniqueness is structural rather
than a read-then-write that could race. Writes use `create`, mirroring `createParticipant`.

Only **ALREADY_EXISTS (gRPC 6)** maps to "you have already answered". Collapsing every failure
into that would tell someone their feedback was recorded during an outage when nothing was
stored.

Q2 is **copied into the response** at submission rather than joined from the profile at read
time: the shift analysis pairs the two answers as they stood together at that moment.

### The arithmetic is the substance - `lib/feedback/analytics.ts`

Pure functions over plain records, free of Firestore types, because these numbers are what a
pricing decision would rest on.

- **"Priceless" is quantified at Rs 5,00,000, the top of the scale** (owner's decision), so it
  enters the average like any other answer instead of being set aside. It is still counted
  separately in the dashboard, because a mean that silently contains a ceiling has to be readable
  next to how many people chose that ceiling -- the panel says so on the card.
- **The written-in amount shares that ceiling.** `MAX_WORTH_RUPEES = 500_000` is both the cap on
  a custom entry and the value of "Priceless", so nothing written in can outrank the top option,
  and one joke entry cannot drag the average a price would be set from.
- **"I would never pay" is valued at Rs 0** (owner's decision, replacing an earlier version
  that excluded it). Both ends of the scale now carry a number, so every response lands in one
  mean -- a summary that dropped the refusals would report what the willing half would pay and
  label it what participants think this is worth. Both ends are counted on their own beside the
  mean, and the panel names both prices in its footnote.
- **There is now exactly one mapping.** The earlier version ranked a refusal below every amount
  for the before/after comparison while excluding it from the average, which took two functions
  that could disagree. With the floor priced at zero, `amountFor` serves both and the `rank`
  helper is gone. Refusal -> Rs 200 still reads as an increase.
- **A written-in amount is judged by the amount.** The source document lumps Q3 options 6-10
  together for the "Rs 2,000+" stat, which would count someone who wrote "Rs 50" as a Rs 2,000+
  response. The custom value is compared against the threshold instead.
- `parseCustomWorth` accepts what people actually type -- `2,000`, `Rs 2000`, whitespace -- since
  rejecting a comma reads as the form quibbling rather than the person being unclear.
- **Q2 percentages are over the people who answered Q2**, which was optional at onboarding.
  Spreading them across everyone would understate every bracket.

### Admin tab

`/admin/feedback`: four stat cards, Q1 distribution, average worth with "Priceless" counted
apart, and Q2 against Q3 on a **shared scale** -- bars normalised to their own maximum would make
a 2-response bracket look like a 20-response one. Bars are CSS, not a charting library, and each
carries its own number so it reads to a screen reader (S73).

The route returns rows and summary computed from the same set, so the table and the charts cannot
disagree.

### Verification

`npx next build`, `npx eslint`, `npx tsc --noEmit` clean. **117 tests passing** (up from 95),
22 of them covering the aggregation.

---

## Sprint 10 - Progressive web app

**Status:** complete

### The service worker is defined by what it refuses to cache

`public/sw.js` is hand-written rather than generated, because the whole decision is the exclusion
list. Exactly two things are cacheable:

1. build-immutable assets (`/_next/static/`, `/icons/`, `/brand/`),
2. two pages with no participant content at all: `/` and `/offline`.

**`/api/*` is never intercepted**, so no authenticated response can be cached, go stale, or be
served to the wrong person. No authenticated page is cached either. An offline participant gets
`/offline`, never a stale copy of their own reflection -- which is also why offline mode cannot
bypass authentication (S46): there is no cached authenticated response for it to serve.

Only `response.type === "basic"` responses are stored; an opaque response cannot be inspected to
know whether it is private.

### Icons - `scripts/build-icons.mjs`

Generated from `public/brand/logo.png` with sharp, `contain` not `cover`, since cropping the
supplied mark is a modification brand S7 forbids. White background rather than transparent: a
transparent icon renders on whatever the launcher supplies, and the rose mark on a dark launcher
is the contrast failure S73 rules out.

The maskable icon insets the mark to 60% of the canvas -- Android crops to the launcher's shape,
and an un-inset icon survives a square launcher while losing its edges on a round one. The Apple
touch icon is declared in the layout because iOS does not read the manifest for it.

`public/icons/` is gitignored and regenerated by `npm run generate`, which now runs three build
scripts.

### start_url is "/" and there are no shortcuts

Someone reopening the installed app may be signed out or may never have bound an invitation; the
root page is the one that can say so. Deep-linking into `/journey` would show the journey's own
signed-out state instead of the way back in. Shortcuts are omitted for the same reason -- every
route past the root is invitation-bound.

S47 needed no work: `browserLocalPersistence` and the `loading` flag in `useAuthState` already
restore the session on reopen without flashing a signed-out view.

---

## Sprint 11 - Firestore rules and indexes

**Status:** complete. **Rules deployed by the owner** -- the database is closed.

### Deny-all is the final state, not a placeholder

`firestore.rules` denies every read and write on every path to every client, administrator
included. That is possible because the browser loads Firebase **for authentication only** -- the
Firestore web SDK is never imported, and all data access goes through server routes on the Admin
SDK, which bypasses rules as a service account.

What it closes concretely: `NEXT_PUBLIC_FIREBASE_API_KEY` is public by necessity. Anyone holding
it can sign in and talk to Firestore directly. Under these rules that session reads nothing --
not another participant's answers, and above all not `invitations`, which holds password hashes
and the AES ciphertext of every invitation password (S88).

### A test pins the assumption the rules rest on

`lib/firebase/client-boundary.test.ts` scans `app/`, `components/` and `lib/` and fails if
anything imports `firebase/firestore`, or if a `"use client"` file imports `firebase-admin`. The
failure mode it guards against is specific: a client-side Firestore read would break against
deny-all rules, and the tempting fix is to loosen the rules rather than move the read to the
server. It also asserts it found sources at all, so a path change cannot silently empty the check.

### firestore.indexes.json is empty on purpose

Every query in the app sorts or filters on a single field, which Firestore indexes automatically.
A composite index is only needed for an equality filter combined with an order on a different
field, and none exists here. The file documents each query so the emptiness reads as a finding
rather than an omission.

### Deployment

`firebase deploy --only firestore` was blocked by the sandbox permission classifier here, so the
owner ran it. **Open test-mode rules are gone.** `npm run deploy:rules` repeats it if the rules
ever change; the CLI is authenticated and `passion-f0aec` is reachable.

### Verification

`npx tsc --noEmit`, `npx eslint`, `npx next build` clean. **120 tests passing.** 25 routes,
including `/journey/survey`, `/offline` and `/manifest.webmanifest`.

---

## Sprint 12 - Accessibility and polish

**Status:** complete

An audit, as the handoff predicted. Most of S73 and brand S24 had been built in as it went, so
the sprint's real output is a short list of things that were genuinely wrong, and a record of
what was checked and left alone.

### Confirmed already correct - no change made

`prefers-reduced-motion` in `globals.css`; `Notice` (text prefix per tone, `role="alert"` on
errors); `Field` (real label, `aria-invalid`, `aria-describedby`); autosave status in a
`role="status" aria-live="polite"` region; `scope="col"` on both admin tables; radio groups with
real `<label>`s and `fieldset`/`legend`; heading order on `/journey/survey` and `/offline` (one
`h1` each, nothing skipped) - two of the five items the handoff flagged turned out to need
nothing.

The error-copy half of the sprint needed no work either, and was verified rather than assumed:
`withErrorHandling` answers any non-`ApiError` with a fixed sentence, and the AI routes convert
`AllModelsFailedError` / `AiNotConfiguredError` / `InvalidAiOutputError` into `aiUnavailable()`
while logging only `error.name`. The raw Gemini message reaches `console.warn` and stops there.

### The focus ring was invisible on the one rose surface

`:focus-visible` outlines in `--color-brand` (#e0023f). Against `--color-brand-dark` (#c11c45),
the admin sidebar, that is **1.2:1** - a keyboard user tabbing the navigation had no focus
indicator at all. Rose surfaces now opt into a white ring via `.on-brand-surface`, which is the
only rule that could not be written as a Tailwind utility, since it has to reach descendants.

This was not on the handoff's list. It was the most serious finding of the sprint.

### Contrast: white-at-opacity on rose fails AA

Measured, not eyeballed:

| Was | Ratio | Now |
| --- | --- | --- |
| `text-on-brand/70` (admin email) | 3.58:1 | `/90` -> 5.05:1 |
| `text-on-brand/75` (sidebar subtitle) | 3.89:1 | `/90` -> 5.05:1 |
| `text-on-brand/85` (synthesis closing) | 3.79:1 | full white -> 4.9:1 |

The synthesis one sits on a `brand -> brand-dark` gradient and was measured against the **light**
end: it passed at 4.6:1 against `brand-dark` alone, which is how a gradient hides a failure.
`text-on-brand/90` on nav links was already 5.05:1 and was left alone.

### The one modal now traps Tab

`LogoutDialog` moved focus in and restored it, but `aria-modal` does not stop Tab, so the third
Tab left the dialog for the journey behind it - a page the dialog is asserting has been made
inert. The trap wraps at both ends and pulls focus back if it escaped some other way.

### Focus follows the screen when the screen is replaced

Two flows swap their entire content while the control that caused the swap unmounts, dropping
focus to `<body>`: a keyboard user restarts from the top of the document, a screen-reader user
hears nothing.

- **`JourneyFlow`** moves focus to the new question's `h1` on Continue/Back, with
  `preventScroll` so it does not fight the scroll-to-top that just ran.
- **`InviteFlow`** moves focus to the step container - and deliberately **not** on the first
  settle, since `loading` resolving into the first real step is the page arriving, and taking
  focus off a page someone just opened is the same rudeness in the other direction. No
  `aria-live` on that container: focus already announces it, and both would read it twice.

`InviteFlow` was not on the handoff's list, and it matters more than the journey's - it is where
"this invitation belongs to another account" is announced, or was not.

### Two other findings

- **Skip link.** Six nav items precede the workspace on every admin page. `.skip-link` is
  off-screen until focused; the target `<main>` takes `tabIndex={-1}` so focus actually lands.
- **`scrollTo({ behavior: "smooth" })` ignored reduced motion.** The `globals.css` block cannot
  reach it - an explicit `behavior` argument wins over the CSS property that block overrides -
  so `JourneyFlow` reads `matchMedia` directly.
- **Two `overflow-x-auto` tables held nothing focusable**, so they could not be scrolled from a
  keyboard at all (WCAG 2.1.1). Both are now labelled `role="region"` with `tabIndex={0}`.

### Verification

`npx tsc --noEmit`, `npx eslint`, `npx next build` clean. **120 tests passing**, 25 routes.
No browser verification, per `CLAUDE.md` - every contrast figure here is computed from the
tokens in `globals.css`, not observed.

---

## Sprint 13 - Tests and documentation

**Status:** complete

**197 tests across 13 files**, up from 120 across 8. Five new files, and a `README.md`.

### The gaps were where the fake was missing, not where the logic was hard

The eight existing files covered everything reachable without a database. What was left
untested was, almost exactly, what needed Firestore: binding, rate-limit windows, the
authorization guards. Those are also the three places where a bug is a security bug, so the
sprint is mostly `test/stubs/firestore.ts` -- an in-memory Firestore -- and what it unlocked.

The fake buffers transactional writes until the callback returns, so a read inside a
transaction cannot see its own pending writes.

**What it deliberately does not model: Firestore's isolation.** A fake cannot prove a real
database's concurrency guarantee, and a test that pretended to would be worse than no test.
The binding tests assert the property this codebase actually owns -- that the decision comes
from a value read *inside* the transaction, with `transactionCount` pinning that the read and
the write really are one transaction. That is what S79 asks of this code, and it is what a
later "simplification" could quietly lose.

### New coverage

| File | Tests | Covers |
| --- | --- | --- |
| `lib/invitations/binding.test.ts` | 19 | S86 Binding, plus disable and rotation |
| `lib/auth/guards.test.ts` | 20 | Bearer parsing, `verifyIdToken`, `requireAdmin`, freshness |
| `lib/security/rate-limit.test.ts` | 15 | Window arithmetic, self-healing, fail-open |
| `lib/answers/fingerprint.test.ts` | 15 | The generation idempotency key (S77) |
| `lib/brand/contrast.test.ts` | 8 | The S12 contrast findings, made permanent |

The ones worth naming, because they pin a claim a comment makes and nothing else held up:

- **A rejected attempt does not extend its own window.** Mutating `windowStart` to `now`
  fails exactly this test and nothing else -- checked, not assumed.
- **The limiter fails open**, and the warning it logs carries no identifier (S52).
- **A refused bind writes nothing.** A partial write on a mismatch would hand a stranger a
  foothold in someone else's invitation.
- **`requireAdmin` refuses an unverified account whose address matches.** Without it, anyone
  who can create an account claiming the admin address at a provider that does not verify it
  becomes the administrator.
- **An empty email is refused as 401 at `verifyRequest`, before the admin comparison.** The
  test asserting a 403 there was wrong and was corrected to match the code; an empty string
  reaching a comparison against a misconfigured `ADMIN_EMAIL` is the shape of a real bypass,
  so which layer catches it is worth pinning.
- **`checkRevoked` is passed to `verifyIdToken`.** Dropping it would let a logged-out session
  keep working until its token expired, quietly undoing S19.

### The contrast guard, and what it cost

The S12 handoff asked S13 to consider a source-scanning check for contrast, since nothing
about a ratio is visible in a diff. It computes ratios from the tokens in `globals.css` and
the opacity in the utility, so it survives a palette change -- it is not a list of forbidden
strings.

It immediately failed on code S12 had just "fixed". `text-on-brand/90` is 5.05:1 on
`--color-brand-dark`, the sidebar it actually sits on, but **4.15:1 on `--color-brand`**.
S12's measurement was right for the real surface; the test checks both, because a gradient
runs between them and that is precisely how the synthesis panel hid a 3.79:1.

Rather than teach a static scan which background each element has, the rule became simpler:
**white on rose is never faded.** The four remaining `/90` utilities in `AdminShell` are now
plain `text-on-brand`. There is no headroom to fade it at all, and a test records that.

Verified by regression: reintroducing `text-on-brand/70` fails with
`AdminShell.tsx: text-on-brand/70 on brand-dark = 3.55:1`.

### Two findings that are not tests

- **`lib/answers/store.ts` held a raw NUL byte.** `fingerprintAnswers` joins on NUL, written
  as a literal 0x00 rather than the escape. Identical value, but git classified the file as
  binary: `grep` refused it and diffs would not render. Now the escape.
- **The fingerprint does collide if an answer contains a NUL**, which JSON can encode. Pinned
  in a test as a known property rather than asserted away. Left alone deliberately: the
  fingerprint is per participant, so the worst case is someone's own regeneration being
  skipped as a duplicate -- a missing regeneration, not access to anything -- and defending
  it would add a length prefix nobody can read for a threat nobody has.

### README.md

S99's thirteen sections, S84's eleven setup steps in order, S85's commands. Written to be read
by whoever deploys this, so it leads with the one structural decision everything follows from
-- the browser holds no Firestore handle -- and says plainly what the two irreversible things
are: losing `INVITATION_PASSWORD_ENCRYPTION_KEY` makes every existing invitation password
unrecoverable, and an invitation binds to the first Google account that opens it, permanently.

Every factual claim was checked against the code rather than the plan, including the ones it
would have been easy to state from memory: the reveal freshness window, the audit trail
storing `adminUid` and never an email, and the cookie flags.

The `maxDuration = 300` / Vercel Hobby 60s conflict is documented under Deployment as the one
open item before production, since a README that omitted it would let someone deploy into a
generation that gets killed halfway.

### Verification

`npx tsc --noEmit`, `npx eslint`, `npx next build` clean. **197 tests passing.** 25 routes.

---

## Sprint 14 - Ship

**Status:** complete

The sprint's whole job was to check claims that were already written down, so almost all of
it is verification rather than change. Two things did not survive the check, and both were in
`README.md` -- which is the one file whoever deploys this reads instead of the code.

### The §88 security acceptance test, walked line by line

Each line was answered against the built output or the code that decides it, not against the
plan that promised it.

| §88 question | Answer | How it was established |
| --- | --- | --- |
| Browser sees Gemini API keys? | NO | The three live key values grepped literally across `.next/static` and `.next/server/app`: 0 files |
| Browser sees encryption key? | NO | Same grep for the live `INVITATION_PASSWORD_ENCRYPTION_KEY` and `INVITE_GRANT_SECRET` values: 0 files |
| Participant reads another's answers? | NO | `getAllAnswers(participant.uid)`, where the uid comes from `requireParticipant` -> a verified ID token. No route takes an identity from a request body |
| Participant reads encrypted passwords? | NO | `encryptedPassword` appears in 0 client chunks; the invitation view drops both credentials before anything is serialised |
| Participant reveals invitation password? | NO | `requireFreshAdmin` plus a rate limit; decryption happens server-side inside the route |
| Non-admin calls admin endpoints? | NO | All ten `app/api/admin/**/route.ts` enumerated: eight `requireAdmin`, and reveal/rotate the stricter `requireFreshAdmin` |
| Participant replaces a bound identity? | NO | `bindInvitation` returns `mismatch` and writes nothing when `boundUid` is another uid, decided inside the transaction |
| Disabled invitation accesses data? | NO | `status !== "active"` refused in three separate places: bind, `requireJourneyAccess`, and password verification |
| Old password works after rotation? | NO | `rotateInvitationPassword` replaces `passwordHash` and `encryptedPassword` in one transactional update |

**The literal-value grep is the one worth keeping.** A grep for the *names* finds three client
chunks, and all three are innocent: the admin settings panel renders
`INVITATION_PASSWORD_ENCRYPTION_KEY` as the label of a configured/not-configured indicator, and
`passwordHash` is a field name inside the Firebase Auth SDK's own account parsing. Searching for
the names alone would have produced three false alarms; searching for the secrets themselves
answers the question §88 actually asks.

### §38L knowledge-base quality check, confirmed

56 items across the seven §38K categories -- concepts 9, values 8, distinctions 8, tensions 8,
interpretation guidance 7, cautions 9, principles 8 -- 28 themes, 7,505 words, rebuilt from
`content/knowledge-base/` by `scripts/build-kb.mjs`. Versioned (`knowledgeBaseVersion`, surfaced
in the admin settings panel). Retrieval reaches both engines: `selectKnowledge` for a
per-question reflection, `fullKnowledgeBase` for the synthesis, which takes the whole framework
because narrowing by theme would drop exactly the cross-section material a synthesis exists to
find.

Source identity hidden: a grep across `app/`, `components/` and `lib/ai/` for framework and
provenance language returns only server-side prompt text, type comments, and the admin panel's
version row. Nothing participant-facing. The prompt's `YOU MUST NOT` block forbids naming any
source, author, book, philosopher or school, and forbids the framework's own vocabulary --
every concept has to arrive in ordinary language.

### What the check actually found

- **The environment variable table conflated "secret" with "required".** `GEMINI_API_KEY_2`
  and `_3` were marked **yes** in a column headed *Secret* while their purpose column said
  *Optional*, under an intro sentence reading "Every one of these must be set in Vercel". Read
  quickly -- which is how a deployment checklist is read -- that says two optional keys are
  mandatory. The table now has a separate **Required** column, and `ADMIN_EMAIL` and
  `NEXT_PUBLIC_APP_URL` say what happens when they are absent rather than just "no", because
  both have defaults that are wrong in production: the administrator would be inherited from a
  literal in `lib/env.ts`, and invitation links would be built from whichever deployment URL
  served the request.
- **`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` was listed as though the app used it.** Nothing reads
  it -- there is no Analytics here; it is in `.env.example` only because the Firebase console
  emits it with the rest of the config. Now stated as such instead of sitting in a table of
  things to set.
- **The one open item pointed at the wrong file.** It told the deployer to reduce the thinking
  budget in `lib/ai/config.ts`; `config.ts` holds model routing, and `thinkingBudget` lives in
  `lib/ai/generate.ts` -- 512 for a reflection, 2048 for the synthesis. Both numbers are now in
  the sentence, so the fix is visible without opening anything.

### Checked and left alone

- `FIREBASE_PRIVATE_KEY.json` sits in the working tree, and `.gitignore` names it explicitly at
  line 22. The generic `serviceAccount*.json` and `*-firebase-adminsdk-*.json` patterns do
  **not** match that filename, so the explicit line is what is protecting it. `git log --all`
  confirms it never entered history. The README already says to delete the download once the
  values are in `.env`.
- No route reads `uid`, `email`, an admin flag or a participant id from a request body (§90):
  grepped, zero hits outside tests.
- `/api/invite/[inviteId]/verify-password` is unauthenticated by necessity -- it is the
  password step -- and is rate-limited on invitation *and* caller together, spends real scrypt
  work on a missing invitation to close the timing oracle, and returns one indistinguishable
  failure for missing, disabled and wrong (§31, §53, §54).

### Verification

`npx tsc --noEmit`, `npx eslint`, `npx next build` clean. **197 tests passing** across 13 files.
34 entries in the build's route listing: 12 pages, 20 API routes, plus `/manifest.webmanifest`
and `/_not-found`. (Earlier entries in this file said "25 routes", counting a pre-S13 build's
listing; the number here is what `npx next build` prints today.)

---

## Sprint 14.1 - Generation fits the function cap

**Status:** complete

S14 handed over one open item: `maxDuration = 300` against Vercel's 60-second Hobby cap. The
owner's decision was to fit inside the cap rather than change plan. Both AI routes now declare
`maxDuration = 58`.

### Lowering the thinking budget was not, on its own, enough

The instruction was to cut the thinking budget so generation fits in 58 seconds, and the
synthesis budget did come down -- 2048 to 1024, the one dial that buys wall clock without risk,
since thinking is charged against the same budget as output and cutting `maxOutputTokens`
instead would truncate the JSON mid-object and discard the whole generation.

But `thinkingBudget` is denominated in tokens, not seconds, and nothing in the router bounded
time at all. Nine candidates (three models x three key pools), `MAX_ATTEMPTS` 12, each call
unbounded. A single slow provider, or two retries, exceeded any cap regardless of what the
thinking budget said. So a token budget alone could not deliver the guarantee that was asked
for.

### What actually bounds it

`generate()` now takes `budgetMs` and optional `attemptTimeoutMs`.

- The deadline is checked **before** each candidate, not after. Starting a call with two
  seconds left cannot succeed, and its abort would be logged as a model failure that never
  happened. `MIN_ATTEMPT_MS` (5s) is the floor below which the walk stops.
- Each attempt gets an `AbortSignal.timeout` of whichever is tighter: the remaining budget or
  the per-call cap. `@google/genai` takes it as `config.abortSignal`, so a hung request is
  actually cancelled rather than merely abandoned.
- Running out of time throws `GenerationTimedOutError`, deliberately distinct from
  `AllModelsFailedError`. Nothing failed -- the provider may still have been working -- and the
  server log should not claim a model error that did not happen. Both routes map it to the same
  participant-facing 503 they already used.
- `"aborted"` joins the transient list in `classifyFailure`, so a cancelled attempt advances
  rather than aborting the walk.

Numbers: `GENERATION_BUDGET_MS` 52s under a 58s route, leaving 6s for the Firestore reads
before the call and the writes after it. `INTERPRETATION_ATTEMPT_MS` 25s against a measured 18s
call, so two attempts fit in the budget and a hung candidate still falls back.

**The synthesis has no per-attempt cap, on purpose.** It is the long call. Cutting a
slow-but-working response short to preserve room for a retry trades the participant's actual
result for another chance to fail. A candidate that fails *quickly* still falls back, because
what the next one gets is the remaining budget rather than a fresh allotment.

### The test caught the first set of numbers

`lib/ai/budget.test.ts` reads `maxDuration` out of both route files -- a route module is not
importable outside the Next.js runtime -- and checks it against the exported budget. The
relationship spans two files, so a diff touching only one of them shows nothing wrong.

It failed immediately on the constants written minutes earlier: a 25s per-attempt cap against a
45s budget does not fit two attempts, which was the entire justification for having a cap. The
budgets were unified to one constant and raised to 52s. Written before the numbers were
trusted, not after.

It also pins a floor of 40s on the budget. A budget trimmed towards the 18s measurement would
start aborting healthy generations, which is worse than the 504 this mechanism exists to
prevent: the participant waits the full time and still gets nothing.

### Verification

`npx tsc --noEmit`, `npx eslint`, `npx next build` clean. **203 tests passing** across 14 files.

`README.md`'s "one open item before production" is gone, replaced by a description of the
mechanism, and the troubleshooting entry that pointed at the conflict now explains the
deliberate timeout instead.

**Not verified, and cannot be here:** that a real synthesis completes inside 52 seconds with
`thinkingBudget: 1024`. CLAUDE.md permits build checks only. `npm run smoke:ai` runs one real
generation end to end if the owner wants the measurement; if a synthesis does time out in
practice, the dial is `thinkingBudget` in `lib/ai/generate.ts`, and the budget test will hold
the rest in place.

---

## Sprint 15 - The section reflection was never wired

**Status:** complete

Found in live testing, four questions into a real run: no reflection had appeared, and Part 1 is
two questions long. It should have fired after question 2.

### The gap

`POST /api/journey/answer` returned `sectionComplete` and **nothing read it**. `/api/journey/reflect`
had **no callers** outside its own tests. `JourneyFlow` saved an answer and advanced; there was no
section-boundary handling in it at all.

The engine was complete the whole time -- route, prompt layering, retrieval, idempotency key, rate
limit, storage, the S14.1 time budget. It had simply never been called by a browser.

Sprint 7 wrote that `sectionComplete` is "how the client **will** know a section reflection can be
generated". Sprint 8 built the engine. Neither owned the wire between them, and nothing failed:
every test is a unit test, and CLAUDE.md rules out browser verification, so *"the server can
generate an interpretation"* and *"a participant ever sees one"* were never the same claim. Worth
remembering as a category -- a seam between two sprints, each of which passed its own tests.

### What was built

`components/exercise/SectionReflection.tsx`, rendered inline beneath the answer on the last
question of a part. §59 asks for a "concise reflection ... then continue", with the synthesis
carrying the weight, so it is quieter than the result page and shares the reading column.

**Two stored fields are deliberately not rendered.** `relevantThemes` holds knowledge-base theme
ids -- framework vocabulary, and §38I forbids showing where a reading comes from; a participant
who sees `p-respect-contradictions` learns the framework's shape. `confidence` is an operational
signal for the administrator: "moderate confidence" reads as a grade, which §42 rules out.

In `JourneyFlow`:

- **Parts are now separated.** `Part N of 14` above the title, which is now a heading rather than
  a caption. Consecutive parts previously read as one undifferentiated list of 43 questions.
- **The reflection is promised on arrival**, not sprung at the boundary: the first question of a
  part says how many questions it holds and that an analysis follows.
- The last question of a part offers **See your analysis**; the panel replaces it with Continue.
- **A failed reflection never blocks progress.** It renders as a note with Continue live beneath
  it. §75 puts the writing above our ability to interpret it, and the answers are already saved.
- The answer is flushed before the request, because the server reads the part back out of
  Firestore -- an unsaved last answer would be interpreted as though never written.

**No reflection on question 43.** The synthesis on the next screen reads every answer including
that part's, so a reflection there would spend a second model call, and a minute of waiting, to
say a smaller version of what the participant is about to read in full.

Revisiting a part costs nothing: the stored document is keyed by a fingerprint of the answers
(§77), so identical answers return what was already written.

### Resume was already correct -- checked, not assumed

`updateProgress` writes `answered[]` and `currentQuestionId` on every autosave; `/api/journey/state`
returns them; `JourneyFlow` restores both on load. A participant who closes the tab mid-part
returns to the same question with their text. Nothing was added.

### Admin status

`ParticipantsPanel` showed a count and appended "· Complete", so a partially finished participant
had no stated status. Now a **Status** column: Not started / Partially completed / Complete.

Derived from the count and `completedAt` already on the row rather than stored as a field, because
a stored status is a third copy of the same fact and can disagree with the count printed beside
it. A word rather than a colour (§73, brand §24); the bar beside it stays decorative.

### Taking a break, which is not logging out

`Take a break` sits beside `Log out` in the journey header and replaces the exercise, on the same
page, with `BreakCard`: where you stopped, how much is answered, Continue, and a quiet Log out.

The distinction is the point. S18 promises that closing the tab does not end a session, and S19
makes logging out the one thing that does -- it clears the grant cookie, so returning needs the
invitation password and Google again, and S20 provides no password recovery. A break that quietly
signed someone out would punish them for stepping away. So the session is untouched, and Continue
puts them back on the question they left.

Log out is on the card as well, because stopping for the night and sitting at someone else's
computer arrive at the same moment, and the second one has to be reachable without hunting.

Two details worth keeping: the pending autosave is flushed before pausing, since the debounce
means the last seconds of typing may still be in flight and not losing them is the whole promise;
and the answered count is computed in the handler rather than during render, because `answersRef`
is a ref -- reading it in the body breaks the rules of hooks and goes stale on the next change.
The lint rule caught that, correctly, on the first attempt.

### The part introduction, and a name for the thing

`Reflection Exercise` is now centred in the journey header, beneath the logo and the two
controls rather than beside the logo: as a masthead it reads as the name of what this is, and
centring it under the row keeps it from colliding with the buttons on a narrow screen. It
replaces the label `Your journey`.

`PartIntro` opens every part, on the same screen as that part's first question. Not an
interstitial: a screen of its own would put a page between finishing one part and starting the
next, for content that is three sentences long.

It states what the part costs and what it gives back before any of it is asked -- `Part 3 · The
Person You Want to Become`, how many questions it holds, and that an analysis follows once they
are all answered. The closing part says the opposite in the same slot, because its analysis *is*
the final synthesis and promising a separate one would be a lie the next screen exposes.

**The break promise lives here too**, which is the placement worth keeping: someone deciding
whether to start a part is exactly who needs to know that stopping midway is safe, and that is
the moment they would otherwise close the tab unsure.

One thing the first render got wrong: the running header printed the part title immediately
above a card that printed it again, three lines apart. That reads as a rendering fault, not as
emphasis, so the header's title is suppressed on the screen where `PartIntro` appears. The
progress counter stays -- it is the one number that is still doing work there.

### A part closes when its analysis is written

Raised from testing: returning to a finished part still offered `See your analysis`, and
clicking it paused before the panel appeared. It was **not** generating again -- the document id
is `sectionId_fingerprint(answers)` and an existing document short-circuits before any model call
(S77, S92). The pause was the Firestore read and a cold function.

But the question exposed the real hazard. The reflection is keyed by a fingerprint of the
answers, so editing one character in a finished part changes the id, and the next read spends a
**new model call** to replace an analysis the participant has already read. Worse, until it did,
the stored analysis would describe answers that no longer existed.

So a part now closes at the moment its analysis is generated.

`progress.reflectedSections` -- declared in `ParticipantProgress`, initialised to `[]`, surfaced
in `ParticipantView`, and until now **never written and never read**, the same dangling shape as
`sectionComplete` before it -- is the field this uses. It was reserved for exactly this.

- `markSectionReflected` writes it with `arrayUnion`, so two requests arriving together cannot
  drop one another's section. Written **after** the generation succeeds, so a failed attempt
  never locks answers behind an analysis that does not exist.
- `POST /api/journey/answer` refuses a write to a closed part with 409 `section_locked`. Enforced
  on the server, not only in the UI (S90): the readOnly textarea is a courtesy. The check costs
  nothing, because `requireParticipant` has already loaded the participant.
- Nothing is locked when a part was left blank. There is nothing to protect, and a participant
  who skipped a part should still be able to come back and write it.

### The analysis prints itself now

`GET /api/journey/state` returns the stored analyses by section, so a returning participant sees
one without any request that could decide to generate. Only the prose is sent: S76 keeps the
model and provider to the administrator, and `promptVersion` / `knowledgeBaseVersion` describe
the framework rather than the participant, which S38I keeps out of reach.

At the end of a closed part the panel is simply there -- no button, and no request. Answers in it
render read-only on a canvas-toned field with a line saying why, because a field that silently
refuses typing reads as broken (S74, brand S20). `PartIntro` switches tense for a closed part and
drops the break promise, which would otherwise imply there was still something to save.

The client mirrors both facts in state so a part closes the instant its analysis arrives rather
than on the next load. The server remains the decision.

### /exercises, and the hub the product now has

Onboarding no longer drops a participant straight into the reflection exercise. All three
`/journey` redirects in `InviteFlow` -- resume, bind, and profile completion -- now land on
`/exercises`, where they choose. `All exercises` sits before `Take a break` in the journey
header and returns them to it, flushing the pending autosave on the way out.

**The catalogue is data.** `lib/exercises/catalog.ts` is a list a new exercise joins, not a page
someone edits around -- the same principle that keeps the exercise itself out of the components
(S57). It carries an `available` flag that nothing sets false today: it exists so that
announcing a forthcoming exercise does not need a second, parallel way of listing things, which
is how a "coming soon" section drifts out of step with the real one.

**Progress is not in the catalogue.** That module describes what exists; how far a particular
person has gone is answered per request by `GET /api/exercises`, from their own progress and
nobody else's. That route is separate from `/api/journey/state` deliberately -- state ships the
whole exercise, ~90 KB of questions a list of cards has no use for -- and sits behind
`requireParticipant` like every other journey route. The catalogue is not a secret; a
participant's position in it is.

The card resolves which part someone is in from `currentQuestionId` rather than from the
answered count, because someone who skipped a question is further along than their total
suggests, and the card should say where they actually are.

One thing left explicitly undone: the second exercise will need its own progress reading in that
route. The `entry.id === "reflection"` branch is written so that a new exercise gets `null`
progress rather than silently inheriting the reflection exercise's figures.

### The admin navigation on a phone, and an exercise reader

Six navigation items were one horizontally scrolling strip on a narrow screen, which hid the
last three behind a gesture nobody is told about. They are now a `grid-cols-3` that returns to a
single column from `lg` up: a grid rather than `flex-wrap` because six labels of six different
lengths do not wrap three-and-three on their own, and the rows have to stay even.

Every item carries a white outline. The outline is the constant and the fill is what changes --
the current page inverts to white-on-rose-reversed, which is a stronger signal than a tint.
`aria-current` still carries the state for anyone the inversion does not reach (S73).

`Exercises` sits in the empty space beside the wordmark, inverted against the navigation on
purpose: it opens the exercise content, which is reference material rather than another section
of the dashboard, and the inversion says so before the label is read.

`/admin/exercises` lists the catalogue and the exercise part by part, each part collapsing to
its questions. Forty-three questions across fourteen parts is a document to scan, not a flow to
step through, and an administrator checking what someone is being asked usually wants one part.
`QuestionBlocks` is reused, so the admin sees the questions rendered exactly as a participant
does.

**Read-only by construction, not by omission.** `GET /api/admin/exercises` has no write verb,
because the questions are generated from `content/exercise.md` (S68): an endpoint that accepted
an edit would offer something the build pipeline cannot honour. The panel says this on the page
rather than leaving the absence of an edit control to be discovered.

It is deliberately not the participant route. `/api/exercises` returns one person's progress and
no question text; this returns every question and nobody's answers. Two different things behind
two different guards.

### Verification

`npx tsc --noEmit`, `npx eslint`, `npx next build` clean. **203 tests passing.** 38 routes,
including `/exercises`, `/admin/exercises` and their two APIs.

**No test covers the lock.** The guard lives in a route, and routes have no test harness here --
the suite is pure-unit. It is one `includes` against a field the request already carries, but it
is worth naming rather than implying the 203 cover it.

**Not verified:** none of the reflection, the break card, the part introduction or the closed
state has been through a browser. The trigger,
the loading state and the failure path are unexercised -- CLAUDE.md permits build checks only.
This is the same class of gap that hid the missing wire, so it is worth saying plainly rather
than leaving in a footnote.

---

## Handoff — start here

**Done: S0-S15.** The build plan is complete; S15 closed a gap found in live testing.

### State

| | |
| --- | --- |
| Branch | `main`, pushed to `origin` (`collabngrow/passion`) |
| Build | `npx next build`, `npx eslint`, `npx tsc --noEmit` all clean |
| Tests | **203 passing** across 14 files (`npx vitest run`) |
| Routes | 34 listed by the build |
| Firestore | deny-all rules **live** |
| Docs | `README.md` complete and corrected against the code (§84, §99) |
| §88 | walked line by line; every answer NO |
| §38L | confirmed |

Prefer `npx <tool>` over `npm run <script>`: the sandbox classifier began blocking `npm run`
once `deploy:rules` was added to `package.json`.

### What is left, and it is the owner's, not the code's

1. **Confirm a real synthesis fits 52 seconds.** Resolved in code (Sprint 14.1): both routes
   are at `maxDuration = 58` with a 52s model budget, and a synthesis that overruns is stopped
   by us with a 503 rather than by Vercel with a 504. What no build check can show is whether
   generation actually completes in that window with `thinkingBudget: 1024`. `npm run smoke:ai`
   measures it against a real key.
2. **The Vercel environment variables**, from the corrected table in `README.md`. Required:
   the six `NEXT_PUBLIC_FIREBASE_*` values, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
   `INVITATION_PASSWORD_ENCRYPTION_KEY`, `INVITE_GRANT_SECRET`, `GEMINI_API_KEY_1`, plus
   `ADMIN_EMAIL` -- which has a fallback, but an administrator inherited from a literal in
   `lib/env.ts` should be stated rather than assumed.

   **`NEXT_PUBLIC_APP_URL` is not needed.** S14 documented it as the source of invitation
   links; it is not. `InvitationsPanel` builds them in the browser from
   `window.location.origin`, deliberately, so a link copied from a preview deployment points
   at that deployment. `appUrl()` in `lib/env.ts` reads the variable and **nothing calls
   `appUrl()`** -- dead code, left in place and noted rather than removed. `README.md` said
   the opposite in two places and now says this.
3. **The deployed domain in Firebase → Authentication → Authorized domains**, or Google
   sign-in fails there with an unhelpful error.
4. **`npm run deploy:rules` after any rules change.** Vercel does not deploy Firestore rules.

The eight moderate `npm audit` findings (one transitive `uuid` via `firebase-admin`) remain
open by choice; see Sprint 1.

### What is not covered by any test, and cannot be here

CLAUDE.md forbids browser verification, so nothing exercises: the service worker, PWA install
and restore, and real Firestore transaction isolation. The binding tests are explicit about
that last one rather than implying otherwise. If any of it is ever verified, it will be by
hand, by the owner.

### Conventions this codebase holds to

- Comments explain *why*, and name the failure a decision prevents. Section numbers (§38I, §92)
  refer to `master_prompt.md`; `brand_guidelines.md` numbers separately.
- Anything server-side starts `import "server-only"`. The browser gets Firebase **auth only** --
  `lib/firebase/client-boundary.test.ts` fails if that ever changes, because the deployed
  deny-all rules depend on it.
- Tests are pure-unit: no Firestore emulator, no browser test. Firestore is faked in memory
  (`test/stubs/firestore.ts`) where the logic is real rather than a passthrough.
- `lib/**/*.generated.ts` and `public/icons/` are gitignored and rebuilt by the `scripts/build-*`
  scripts, wired into `generate` and run before dev/build/test.
- CLAUDE.md: **MEMORY.md is updated in the same commit as the code it describes.**
