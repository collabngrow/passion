"use client";

/**
 * Firebase in the browser -- authentication ONLY.
 *
 * Deliberately no Firestore client SDK. Every read and write goes through a
 * server route backed by the Admin SDK (see lib/firebase/admin.ts), which lets
 * Firestore rules deny all client access and satisfies the §88 security
 * acceptance test by construction. It also keeps the client bundle small (§91).
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";

import { publicFirebaseConfig } from "@/lib/env";

function firebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();

  const { apiKey, authDomain, projectId, appId } = publicFirebaseConfig;
  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error(
      "Firebase web configuration is incomplete. Set the " +
        "NEXT_PUBLIC_FIREBASE_* variables in .env.local and restart the dev " +
        "server. See .env.example.",
    );
  }

  return initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket: publicFirebaseConfig.storageBucket,
    messagingSenderId: publicFirebaseConfig.messagingSenderId,
    appId,
  });
}

let authPromise: Promise<Auth> | null = null;

/**
 * The shared Auth instance, pinned to local persistence.
 *
 * §18: closing the tab, closing the PWA or refreshing must not sign a
 * participant out. Only an explicit logout ends the session.
 */
export function firebaseAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = (async () => {
      const auth = getAuth(firebaseApp());
      await setPersistence(auth, browserLocalPersistence);
      return auth;
    })().catch((error) => {
      // Allow a later attempt to retry rather than caching the failure.
      authPromise = null;
      throw error;
    });
  }
  return authPromise;
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Always let the participant pick which Google account to present, so a
  // mismatch (§17) can be corrected without clearing browser state.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
