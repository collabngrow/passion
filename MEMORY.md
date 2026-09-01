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

Sprint 2 — content pipelines: the exercise parser and the knowledge base.
