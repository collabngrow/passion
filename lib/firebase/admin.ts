import "server-only";

/**
 * Firebase Admin -- the ONLY path to Firestore in this application.
 *
 * Participants and administrators never touch Firestore directly; they call
 * server routes that use this module after verifying identity. Firestore rules
 * therefore deny all client access (see firestore.rules), which makes the §88
 * security guarantees structural rather than rule-dependent.
 *
 * Initialisation is lazy: importing this module must never throw, so that a
 * missing service account surfaces as a handled error inside a request rather
 * than as a build failure.
 */

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { firebaseAdminCredentials } from "@/lib/env";

const APP_NAME = "passion-analyzer-admin";

let cachedApp: App | null = null;

function adminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) {
    cachedApp = existing;
    return existing;
  }

  // Throws MissingEnvError with setup guidance when credentials are absent.
  const credentials = firebaseAdminCredentials();

  cachedApp = initializeApp(
    {
      credential: cert({
        projectId: credentials.projectId,
        clientEmail: credentials.clientEmail,
        privateKey: credentials.privateKey,
      }),
      projectId: credentials.projectId,
    },
    APP_NAME,
  );

  return cachedApp;
}

let cachedDb: Firestore | null = null;

export function db(): Firestore {
  if (!cachedDb) {
    cachedDb = getFirestore(adminApp());
    // Strip undefined rather than writing nulls, so optional invitation and
    // participant fields stay genuinely absent until they are set.
    cachedDb.settings({ ignoreUndefinedProperties: true });
  }
  return cachedDb;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

/**
 * Whether server credentials are present, without throwing.
 *
 * Used by setup and health surfaces to explain what is missing (§98) instead of
 * failing with an opaque error.
 */
export function hasAdminCredentials(): boolean {
  try {
    firebaseAdminCredentials();
    return true;
  } catch {
    return false;
  }
}

/** Re-exported so callers do not each import from firebase-admin directly. */
export { FieldValue, Timestamp } from "firebase-admin/firestore";
