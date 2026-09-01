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
| Firestore | created, **still on open test-mode rules — replaced in S11** |
| `gh` | authenticated as `collabngrow` |
| Vercel | CLI installed; project not yet linked, deployment is owner-driven |

## Next

Sprint 5 — participant invitation flow: password screen, grant cookie, transactional UID binding, onboarding.
