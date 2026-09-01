// Deterministic secrets for tests that exercise cryptography.
//
// These are fixed test values with no relationship to any real key, and they
// are set before any module reads them -- lib/env.ts reads lazily, inside
// functions, precisely so this works.

// 32 bytes, base64.
process.env.INVITATION_PASSWORD_ENCRYPTION_KEY ??=
  Buffer.alloc(32, 7).toString("base64");
process.env.INVITE_GRANT_SECRET ??= Buffer.alloc(32, 11).toString("base64");
process.env.ADMIN_EMAIL ??= "admin@example.test";
