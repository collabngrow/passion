# MEMORY

Running record of project state. Updated on every commit (see `CLAUDE.md`).

---

## Sprint 0 — Repository hygiene

**Status:** complete

### Done

- Added `.gitignore`. Covers `.env*` (with `!.env.example` escape hatch), `node_modules/`,
  `.next/`, `serviceAccount*.json`, `*-firebase-adminsdk-*.json`, `.vercel/`, `.firebase/`,
  coverage, logs, editor/OS artefacts.
- Untracked `.env` via `git rm --cached` (file retained on disk).

### Secret exposure check

Audited full git history before untracking. The only `.env` ever committed was the initial
420-byte version containing the seven `NEXT_PUBLIC_FIREBASE_*` values — public-by-design
client config. `GEMINI_API_KEY_1/2/3` were added to the working copy after that commit and
were never committed.

**No history rewrite required. No key rotation required.**

### Environment verified

| Tool | State |
| --- | --- |
| Node / npm | v22.14.0 / 10.9.2 |
| `gh` | authenticated, active account `collabngrow` |
| Firebase CLI | 15.28.2, logged in as `collabwinwin@gmail.com` |
| Firebase project | `passion-f0aec` (Google auth enabled) |
| Firestore | created, **still on test-mode rules — open read/write, must be replaced** |
| Vercel CLI | 48.1.6 |

### Environment variables

Present in `.env`: seven `NEXT_PUBLIC_FIREBASE_*`, plus `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`,
`GEMINI_API_KEY_3`.

Still required before the app can run end-to-end:

- `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (Admin SDK service account)
- `INVITATION_PASSWORD_ENCRYPTION_KEY` (32 random bytes, base64)
- `INVITE_GRANT_SECRET` (32 random bytes, base64)
- `ADMIN_EMAIL` (`collabwinwin@gmail.com`)
- `NEXT_PUBLIC_APP_URL`

### Not yet started

No application code exists. The repository holds specification and brand source documents only:
`master_prompt.md`, `exercise_content_1.md`, `brand_guidelines.md`, `logo.png`, `ref1.png`,
`ref2.png`.

Build plan agreed but **not executed**. Agreed decisions:

- Knowledge base authored from the interpretive principles in `exercise_content_1.md` plus the
  Nietzschean concepts named in the spec; structured and substantive, not a summary.
- AI interpretation timing: one concise reflection per each of the 14 parts, plus the final
  synthesis (~15 Gemini calls per participant, not 44).
- Ship target: clean build and lint, commit, push to `collabngrow/passion`. Vercel deployment
  is performed by the project owner, not the agent.
