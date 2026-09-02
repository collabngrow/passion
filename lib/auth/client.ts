"use client";

import {
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

import { firebaseAuth, googleProvider } from "@/lib/firebase/client";

/**
 * Browser-side authentication.
 *
 * Everything here is convenience and presentation. Authorization decisions
 * happen on the server in lib/auth/verify.ts (§89, §90) -- nothing in this file
 * grants access to anything.
 */

export type AuthState = {
  user: User | null;
  loading: boolean;
};

/** Subscribes to auth state. Returns an unsubscribe function. */
export function watchAuth(callback: (user: User | null) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  firebaseAuth()
    .then((auth) => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, callback);
    })
    .catch(() => callback(null));

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export class SignInCancelled extends Error {
  constructor() {
    super("Sign-in was cancelled.");
    this.name = "SignInCancelled";
  }
}

/** Firebase codes meaning the person closed the popup rather than failed. */
const CANCELLED_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

function isCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    CANCELLED_CODES.has(String((error as { code: unknown }).code))
  );
}

/** Signs in with Google. Throws SignInCancelled if the user closed the popup. */
export async function signInWithGoogle(): Promise<User> {
  const auth = await firebaseAuth();
  try {
    const credential = await signInWithPopup(auth, googleProvider());
    return credential.user;
  } catch (error) {
    if (isCancellation(error)) throw new SignInCancelled();
    throw error;
  }
}

/**
 * Signs out first, then reopens Google so the person genuinely re-chooses.
 *
 * §17: someone on a shared or family device can be signed into the wrong Google
 * account without realising it, and being told "this belongs to another
 * account" with no control to change it is a dead end. Ending the Firebase
 * session first means the screen they return to reflects the account they
 * actually picked, including when they cancel the popup.
 */
export async function switchGoogleAccount(): Promise<User> {
  const auth = await firebaseAuth();
  await signOut(auth);
  return signInWithGoogle();
}

/**
 * Reauthenticates the current user against Google (§26).
 *
 * Refreshes `auth_time` in the ID token, which the server checks before
 * revealing or rotating a password. This is a real Google reauthentication, not
 * a modal that merely looks like one (§26).
 */
export async function reauthenticateWithGoogle(): Promise<void> {
  const auth = await firebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("No signed-in user to reauthenticate.");

  try {
    await reauthenticateWithPopup(user, googleProvider());
    // Force a token refresh so the new auth_time is available immediately.
    await user.getIdToken(true);
  } catch (error) {
    if (isCancellation(error)) throw new SignInCancelled();
    throw error;
  }
}

/**
 * Signs out.
 *
 * §19: this is the only thing that ends a session. The caller is also
 * responsible for clearing the invitation grant cookie, which is what forces
 * the password to be entered again on return.
 */
export async function signOutUser(): Promise<void> {
  const auth = await firebaseAuth();
  await signOut(auth);
}

/** Current ID token, or null when signed out. */
export async function currentIdToken(forceRefresh = false): Promise<string | null> {
  const auth = await firebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code: string };

/**
 * Calls an API route with the current ID token attached.
 *
 * Server errors arrive already reduced to a human sentence (§74), so callers
 * can render `error` directly. Network failures are mapped to the same shape so
 * no caller has to distinguish them.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const token = await currentIdToken();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "We couldn't reach the server. Please check your connection.",
      code: "network",
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const payload = (body ?? {}) as { error?: string; code?: string };
    return {
      ok: false,
      status: response.status,
      error: payload.error ?? "Something went wrong. Please try again.",
      code: payload.code ?? "error",
    };
  }

  return { ok: true, data: body as T };
}
