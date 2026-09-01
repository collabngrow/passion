/**
 * Environment access.
 *
 * master_prompt.md §98: when a service is not configured, the application must
 * raise a clear setup requirement rather than silently substituting fake
 * behaviour. Every accessor here therefore fails loudly and explains how to fix
 * itself, and no accessor ever falls back to a default secret.
 *
 * Server-only values must never be imported into a Client Component. They are
 * read lazily (inside functions) so that merely importing this module from a
 * shared file cannot crash a build.
 */

export class MissingEnvError extends Error {
  constructor(name: string, guidance: string) {
    super(
      `Missing required environment variable ${name}.\n\n${guidance}\n\n` +
        `Add it to .env.local for local development, or to the project's ` +
        `environment variables in Vercel for deployed environments. ` +
        `See .env.example and README.md.`,
    );
    this.name = "MissingEnvError";
  }
}

function required(name: string, guidance: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new MissingEnvError(name, guidance);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

/* -------------------------------------------------------------------------
 * Firebase Admin (server only)
 * ---------------------------------------------------------------------- */

export function firebaseAdminCredentials() {
  const projectId = required(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "This is the Firebase project id, e.g. passion-f0aec.",
  );
  const clientEmail = required(
    "FIREBASE_CLIENT_EMAIL",
    "Firebase Console -> Project Settings -> Service Accounts -> " +
      "Generate new private key. Use the client_email field from the " +
      "downloaded JSON.",
  );
  const privateKey = required(
    "FIREBASE_PRIVATE_KEY",
    "Use the private_key field from the service-account JSON. Keep the " +
      "surrounding quotes and the literal \\n escape sequences intact.",
  );

  return {
    projectId,
    clientEmail,
    // Vercel and .env files carry the key as a single line with escaped
    // newlines; the Admin SDK needs the real newlines back.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

/* -------------------------------------------------------------------------
 * Cryptography (server only)
 * ---------------------------------------------------------------------- */

export function invitationEncryptionKey(): string {
  return required(
    "INVITATION_PASSWORD_ENCRYPTION_KEY",
    'Generate one with: node -e "console.log(require(\'crypto\')' +
      '.randomBytes(32).toString(\'base64\'))". ' +
      "This key decrypts recoverable invitation passwords (§10); it must " +
      "never be committed, never reach the browser, and never be stored in " +
      "Firestore.",
  );
}

export function inviteGrantSecret(): string {
  return required(
    "INVITE_GRANT_SECRET",
    'Generate one with: node -e "console.log(require(\'crypto\')' +
      '.randomBytes(32).toString(\'base64\'))". ' +
      "This signs the HttpOnly cookie proving a visitor passed invitation " +
      "password verification.",
  );
}

/* -------------------------------------------------------------------------
 * Administration (server only)
 * ---------------------------------------------------------------------- */

/**
 * The single authorised administrator (master_prompt.md §21). Enforced
 * server-side against the verified Firebase token, never against client input.
 */
export function adminEmail(): string {
  return (optional("ADMIN_EMAIL") ?? "collabwinwin@gmail.com").toLowerCase();
}

/* -------------------------------------------------------------------------
 * Gemini (server only)
 * ---------------------------------------------------------------------- */

export type GeminiKeyPool = { id: string; apiKey: string };

/**
 * Returns the configured Gemini key pools in priority order (§33). Absent keys
 * are skipped rather than erroring, so the router can run on one key while the
 * remaining pools are still being provisioned.
 */
export function geminiKeyPools(): GeminiKeyPool[] {
  const pools: GeminiKeyPool[] = [];
  for (const index of [1, 2, 3] as const) {
    const apiKey = optional(`GEMINI_API_KEY_${index}`);
    if (apiKey) pools.push({ id: `key${index}`, apiKey });
  }
  if (pools.length === 0) {
    throw new MissingEnvError(
      "GEMINI_API_KEY_1",
      "At least one Gemini API key is required for the interpretation " +
        "engine. Create keys at https://aistudio.google.com/apikey and set " +
        "GEMINI_API_KEY_1 (optionally _2 and _3 for quota fallback).",
    );
  }
  return pools;
}

/* -------------------------------------------------------------------------
 * Public configuration (safe for the browser)
 * ---------------------------------------------------------------------- */

/**
 * Firebase web config. These values are public by design -- they ship in every
 * client bundle and are not secrets. Referenced as static literals so Next.js
 * can inline them at build time.
 */
export const publicFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const;

export function appUrl(): string {
  return (
    optional("NEXT_PUBLIC_APP_URL") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
