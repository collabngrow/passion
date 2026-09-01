"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (master_prompt.md §46).
 *
 * Production only. In development the app is served by the dev server and a
 * worker holding a cached shell in front of it turns every hot reload into a
 * confusing stale page.
 *
 * Registration failure is swallowed on purpose: a service worker is an
 * enhancement, and a browser that refuses it (private mode, unsupported, an
 * insecure origin) must still get a working app rather than a console error.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // After load, so registration never competes with the first render for
    // bandwidth on the connection that is loading the app.
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
