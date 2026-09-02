# CollabNGrow Passion Analyzer

A private, invitation-only guided self-reflection experience. A participant works
through 43 questions across 14 sections, and the application reads back across
everything they wrote to compose a single reflection in their own terms.

There is no sign-up, no public entry point and no discovery. Every participant
arrives through an invitation created by the administrator, and the whole product
is built around that being true.

---

## Contents

- [Architecture](#architecture)
- [Setup](#setup) — the eleven steps, in order
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Deployment](#deployment)
- [Admin account](#admin-account)
- [Firestore rules and indexes](#firestore-rules-and-indexes)
- [Security](#security)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Architecture

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Firebase Auth
· Firestore · Gemini · deployed on Vercel.

The single structural decision everything else follows from:

> **The browser loads Firebase for authentication only.** It never holds a
> Firestore handle. Every read and write goes through a server route using the
> Admin SDK, after that route has verified who is calling.

That is what makes the deny-all Firestore rules possible, and it is enforced by a
test (`lib/firebase/client-boundary.test.ts`) that fails if any file under `app/`,
`components/` or `lib/` imports `firebase/firestore`.

```
Browser                        Server routes (app/api/)          Firestore
───────                        ────────────────────────          ─────────
Firebase Auth  ──ID token──▶   requireUser / requireAdmin
                               verifyGrant (HttpOnly cookie)
                               ──────────────────────────▶   Admin SDK
                                                             (bypasses rules)
```

| Path | Role |
| --- | --- |
| `content/exercise.md` → `scripts/build-exercise.mjs` | Question source of truth → generated TypeScript |
| `content/knowledge-base/` → `scripts/build-kb.mjs` | The interpretive framework, 56 items across 7 categories |
| `lib/security/` | Password hashing, AES-GCM encryption, grant tokens, rate limiting |
| `lib/auth/verify.ts` | `requireUser` / `requireAdmin` / `requireFreshAuth` |
| `lib/ai/` | Model fallback, key rotation, prompt layering, output validation |
| `lib/firebase/admin.ts` | The only path to Firestore |
| `app/api/` | Every server boundary |
| `firestore.rules` | Deny-all, as a second layer |

Two content pipelines run before every dev server, build and test run
(`npm run generate`). Their outputs (`lib/**/*.generated.ts`, `public/icons/`) are
gitignored and never edited by hand — change the Markdown source instead. Both
scripts fail the build on a surprise: a wrong question count, a broken
cross-reference, an empty section. A silently short exercise would ask
participants fewer questions than the exercise defines.

---

## Setup

You need a Firebase project, a Gemini API key, and Node 20 or newer.

### 1. Create a Firebase project

<https://console.firebase.google.com> → **Add project**. Analytics is optional and
unused.

### 2. Enable Google authentication

**Build → Authentication → Get started → Sign-in method → Google → Enable.**
Set a support email. Google is the only provider the application uses.

Under **Authentication → Settings → Authorized domains**, add your production
domain once you have one. `localhost` is authorised by default.

### 3. Create the Firestore database

**Build → Firestore Database → Create database.** Pick a region close to your
participants; it cannot be changed later.

Start in **production mode** if offered. If you start in test mode, step 4 is
urgent rather than routine — test mode leaves the database open to the world.

### 4. Configure Firestore rules

The rules in this repository deny every client read and write, to everyone,
including the administrator. Deploy them:

```bash
npx firebase login
npx firebase deploy --only firestore --project <your-project-id>
```

`npm run deploy:rules` does the same for the project this repository is
configured against. See [Firestore rules and indexes](#firestore-rules-and-indexes)
for why deny-all is the finished state and not a placeholder.

### 5. Configure the web app

**Project Settings → General → Your apps → Web → Register app.** Copy the seven
values from the `firebaseConfig` snippet into the `NEXT_PUBLIC_FIREBASE_*`
variables. These ship in the client bundle and are not secrets.

### 6. Create server credentials

**Project Settings → Service accounts → Generate new private key.** From the
downloaded JSON take `client_email` and `private_key`.

`FIREBASE_PRIVATE_KEY` must keep its literal `\n` escapes and stay quoted:

```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

Delete the downloaded JSON once the values are in place. It is a full
administrative credential for the project.

### 7. Add environment variables

```bash
cp .env.example .env.local
```

Fill it in as you work through these steps. `.gitignore` excludes every `.env*`
file except the template.

### 8. Generate the encryption keys

Two independent 32-byte keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it twice. The first value is `INVITATION_PASSWORD_ENCRYPTION_KEY`, the second
`INVITE_GRANT_SECRET`. Do not reuse one for both.

- **`INVITATION_PASSWORD_ENCRYPTION_KEY`** encrypts invitation passwords so the
  administrator can read them back later. **Losing it makes every existing
  invitation password unrecoverable** — participants who have not yet saved their
  password would need a rotated one. Changing it has the same effect.
- **`INVITE_GRANT_SECRET`** signs the cookie proving a visitor passed the password
  step. Rotating it sends everyone back to the password screen; bindings, answers
  and reflections are untouched.

### 9. Configure Gemini keys

Create keys at <https://aistudio.google.com/apikey>.

`GEMINI_API_KEY_1` is required. Keys 2 and 3 are optional and extend the fallback:
when a model exhausts its quota on one key, the router retries the same model on
the next key before dropping to a weaker model, so quality degrades only after
capacity is genuinely exhausted.

### 10. Run locally

```bash
npm install
npm run verify:setup   # proves the configuration actually works
npm run dev
```

`verify:setup` initialises the Admin SDK with the real credentials, writes and
reads a real Firestore document, and lists real Gemini models. A pass means the
configuration works, not that the variables merely look present. It prints no
secret values.

### 11. Deploy to Vercel

See [Deployment](#deployment).

---

## Environment variables

Everything marked required must be set in Vercel as well as locally. `lib/env.ts`
reads them lazily and fails with setup guidance naming the missing variable,
rather than with an opaque runtime error.

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | no | Web SDK configuration. Public by design |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | no | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | no | Also the project id the Admin SDK initialises with |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | yes | no | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | yes | no | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | yes | no | |
| `FIREBASE_CLIENT_EMAIL` | yes | **yes** | Service account identity |
| `FIREBASE_PRIVATE_KEY` | yes | **yes** | Service account key, quoted, `\n` escapes intact |
| `INVITATION_PASSWORD_ENCRYPTION_KEY` | yes | **yes** | AES-256-GCM key for recoverable passwords |
| `INVITE_GRANT_SECRET` | yes | **yes** | Signs the invitation grant cookie |
| `GEMINI_API_KEY_1` | yes | **yes** | At least one key is required |
| `GEMINI_API_KEY_2` | no | **yes** | Extends the quota fallback |
| `GEMINI_API_KEY_3` | no | **yes** | Extends the quota fallback |
| `ADMIN_EMAIL` | no | no | Defaults to `collabwinwin@gmail.com`. Set it explicitly so the administrator is stated, not inherited |
| `NEXT_PUBLIC_APP_URL` | no | no | Read by `appUrl()` in `lib/env.ts`, which nothing currently calls. Safe to omit |

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` appears in `.env.example` because the
Firebase console emits it. Nothing reads it — there is no Analytics in this
application — so it does not need to be set in Vercel.

The `NEXT_PUBLIC_FIREBASE_*` values being public is not an oversight — a Firebase
web API key identifies a project, it does not authorise anything. Anyone holding
it can sign in and talk to Firestore directly, which is exactly why the rules deny
that session everything.

---

## Local development

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run start          # serve the production build
npm run lint
npm run typecheck
npm test
```

`generate` runs automatically before `dev`, `build` and `test`. Run it directly
after editing `content/exercise.md` or anything under `content/knowledge-base/`:

```bash
npm run generate
```

Two scripts talk to live services and are not part of any automated run:

```bash
npm run verify:setup   # proves credentials work. No cost
npm run smoke:ai       # one real generation, end to end. Costs one model call
```

**There is no browser-based verification in this project**, by instruction. Build,
lint, typecheck and the unit suite are the verification.

---

## Deployment

Vercel, from the repository.

1. Import the project. The framework preset is detected; no build overrides.
2. Add every variable from the table above under **Settings → Environment
   Variables**, for Production and Preview.
3. Add the deployed domain to **Firebase → Authentication → Settings → Authorized
   domains**, or Google sign-in fails there with an unhelpful error.
4. Nothing needs to be told the deployed URL. Invitation links are built in the
   browser from `window.location.origin` (`components/admin/InvitationsPanel.tsx`),
   deliberately, so a link copied from a preview deployment points at that
   deployment rather than at production.
5. Deploy the Firestore rules separately — Vercel does not deploy them:
   ```bash
   npm run deploy:rules
   ```

### Generation time and the function cap

Vercel's Hobby plan kills a function at 60 seconds. Both AI routes therefore
declare `maxDuration = 58`, and the model call is given a shorter budget still —
`GENERATION_BUDGET_MS` (52s) in `lib/ai/generate.ts` — so the deadline is reached
inside the application, which answers 503 with copy saying the participant's
writing is saved, rather than by the platform killing the function mid-write.

An interpretation additionally caps any single provider call at 25s, so one hung
request still leaves room to fall back to the next model. The synthesis has no
per-call cap on purpose: it is the long call, and cutting a slow-but-working
response short to preserve room for a retry trades the participant's actual
result for another chance to fail.

`lib/ai/budget.test.ts` fails if the budget and the routes' `maxDuration` ever
drift apart, since that relationship is invisible in a diff touching one file.

On a plan with a higher function limit, raise both together in that order.

---

## Admin account

There is no admin sign-up, no role field and no admin flag in any document.
Authorization is one comparison, made on the server, against a verified Firebase
ID token:

```
user.email === ADMIN_EMAIL && user.emailVerified
```

To change administrator, change `ADMIN_EMAIL` and redeploy. The address must be a
Google account that can sign in, and it must be verified by the provider — an
unverified account claiming the address is refused.

Invitation passwords are shown on the dashboard as soon as the administrator is
signed in — there is no separate reveal step, and sharing one does not ask again.
Being the administrator is the whole of the authorization for reading a password
they issued themselves.

**Rotating** a password still requires a Google reauthentication in the last five
minutes, because it is destructive: the old password stops working instantly.

Reach the dashboard at `/admin`. Nothing links to it.

---

## Firestore rules and indexes

`firestore.rules` denies every read and write on every path, to every client,
administrator included.

That is the finished state, not a placeholder. The browser never holds a Firestore
handle, so there is no legitimate client read to permit. What it closes: anyone
holding the public web API key can sign in and query Firestore directly, and under
these rules that session reads nothing — not another participant's answers, and
above all not `invitations`, which holds password hashes and the AES ciphertext of
every invitation password.

If a Firestore read ever appears to be needed in a component, the fix is to move
it to a server route, never to loosen these rules. The client-boundary test exists
to make that failure loud rather than silent.

`firestore.indexes.json` declares no composite indexes, deliberately. Every query
sorts or filters on a single field, which Firestore indexes automatically; the
file documents each query so its emptiness reads as a finding rather than an
omission.

---

## Security

| Concern | Approach |
| --- | --- |
| Invitation passwords | scrypt, salted, parameters encoded in the stored hash |
| Password recovery for admin | AES-256-GCM, versioned format, decrypted server-side only |
| Password in URL | Never. The link carries an invitation id; the password is entered |
| Session | Firebase ID token, verified per request with `checkRevoked` |
| Invitation grant | HttpOnly, signed, invitation-scoped, expiring cookie |
| Binding | One Firestore transaction, so two people cannot claim one invitation |
| Account mismatch | Refused without ever disclosing which account holds it |
| Rate limiting | Per identifier and scope, rolling window, fails open |
| Enumeration | Missing, disabled and wrong-password all return one message |
| Client trust | No uid, email, role or admin flag from a client is ever believed |
| Error copy | No Firebase, Firestore or Gemini text ever reaches a participant |
| Logs | No passwords, hashes, keys, tokens, answers or email addresses |

Two properties worth stating plainly, because they constrain what support can do:

- **There is no self-service password recovery.** By design. A participant who
  loses their invitation password needs the administrator to read it out again
  or rotate it.
- **An invitation binds to the first Google account that opens it**, permanently.
  Rotating the password does not rebind it.

---

## Testing

```bash
npm test           # 197 tests across 13 files
npm run test:watch
```

Pure unit tests: no Firestore emulator, no browser, no network. Firestore is
replaced by an in-memory fake (`test/stubs/firestore.ts`) for the two modules
where the logic is real rather than a passthrough — invitation binding and rate
limiting.

What the suite covers, against the §86 matrix:

| Area | File |
| --- | --- |
| Password hashing, AES round-trip, grant tokens, invitation generation | `lib/security/security.test.ts` |
| Rate-limit windows, self-healing, fail-open | `lib/security/rate-limit.test.ts` |
| Binding, rebinding, mismatch, disable, rotation | `lib/invitations/binding.test.ts` |
| Bearer parsing, token verification, admin authorization, freshness | `lib/auth/guards.test.ts` |
| Admin identity, freshness window, error mapping | `lib/auth/auth.test.ts` |
| Exercise parsing and navigation | `lib/exercise/exercise.test.ts` |
| Knowledge retrieval and determinism | `lib/ai/retrieval.test.ts` |
| Model fallback classification, output validation | `lib/ai/router.test.ts` |
| Generation idempotency key | `lib/answers/fingerprint.test.ts` |
| Feedback survey options and aggregation | `lib/feedback/*.test.ts` |
| Client never imports Firestore | `lib/firebase/client-boundary.test.ts` |
| Contrast and focus-ring accessibility | `lib/brand/contrast.test.ts` |

Two of these are source scans rather than behaviour tests, guarding invariants
that are invisible in a diff: the client/Firestore boundary the deny-all rules
depend on, and text contrast on brand surfaces. Both compute their answer from the
real sources, so neither is a list of forbidden strings.

Not covered without a browser or emulator: service worker behaviour, PWA install
and restore, and the real Firestore transaction isolation that binding relies on.

---

## Troubleshooting

**`npm run dev` fails naming a missing environment variable.**
Working as intended — `lib/env.ts` fails loudly with the variable name and where
to get it. Fill it in `.env.local`.

**`verify:setup` reports the private key is unusable.**
Almost always the `\n` escapes. `FIREBASE_PRIVATE_KEY` must be quoted and keep
literal `\n` sequences, not real line breaks.

**Google sign-in fails on the deployed site but works locally.**
The domain is not in Firebase → Authentication → Settings → Authorized domains.

**Everything works locally, but the deployed app cannot read or write anything.**
Check that the service account variables are set in Vercel. A missing service
account leaves the Admin SDK uninitialised, and every route fails at once.
Firestore rules are not the cause — the Admin SDK bypasses them.

**A participant says their password does not work.**
Check the invitation is still `active` in the dashboard. Disabled and unknown
invitations deliberately give the same message as a wrong password, so the
dashboard is the only place to tell them apart. Rate limiting is another
possibility: ten attempts in fifteen minutes, self-healing, no lockout.

**A participant is told the invitation belongs to another account.**
It is bound to a different Google account. Ask which account they first used —
the application will not disclose it. If they genuinely cannot reach it, issue a
new invitation; rotation does not rebind.

**The reflection gives up after about a minute.**
The generation exceeded `GENERATION_BUDGET_MS` and was stopped deliberately, so
the answers are saved and nothing is half-written. Persistent timeouts mean the
model is slower than the 60-second function cap allows: lower `thinkingBudget`
in `lib/ai/generate.ts`, or move to a plan with a higher limit and raise both
numbers together. See [Deployment](#deployment).

**AI generation fails with all models unavailable.**
All configured models were exhausted or erroring across all keys. Check quota in
AI Studio and the model list under `/admin/ai`. `npm run smoke:ai` tests one real
generation end to end and prints what came back.

**The exercise changed but the app still shows the old questions.**
`npm run generate`. The generated modules are gitignored and rebuilt from
`content/`.
