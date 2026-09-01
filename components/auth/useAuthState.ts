"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { watchAuth } from "@/lib/auth/client";

/**
 * Current Firebase user.
 *
 * `loading` is true until Firebase has restored persisted state, which matters
 * for the PWA (§47): on reopen there is a moment where the user is signed in
 * but not yet known, and rendering a signed-out view during it would look like
 * being logged out — exactly what §18 promises will not happen.
 */
export function useAuthState(): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    return watchAuth((user) => setState({ user, loading: false }));
  }, []);

  return state;
}
