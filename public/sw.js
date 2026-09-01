/**
 * Service worker (master_prompt.md §46).
 *
 * Hand-written rather than generated, because the interesting decision here is
 * what NOT to cache, and a generated worker would cache far more.
 *
 * The rule this file exists to enforce: **nothing a participant wrote, and
 * nothing an authenticated route returned, is ever stored.** Only two kinds of
 * response are cacheable --
 *
 *   1. build-immutable static assets (/_next/static, icons, brand images),
 *   2. two public pages that contain no participant data: / and /offline.
 *
 * Everything else, including every /api/* response and every authenticated
 * page, goes to the network and is never written to the cache. An offline
 * participant sees the offline page, never a stale copy of their reflection.
 *
 * This also means offline mode cannot bypass authentication (§46): there is no
 * cached authenticated response for it to serve, and the API is never faked.
 */

// Bumping this discards every previous cache on activate. It must change
// whenever the shell below changes.
const CACHE = "passion-analyzer-v1";

/** Public pages with no participant content. Safe to precache. */
const SHELL = ["/", "/offline"];

/** Prefixes whose responses are content-addressed or purely presentational. */
const CACHEABLE_PREFIXES = ["/_next/static/", "/icons/", "/brand/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` so an install never adopts an already-stale HTTP-cached copy.
      await cache.addAll(SHELL.map((path) => new Request(path, { cache: "reload" })));
      // Take over immediately: a stale shell serving a new build is worse than
      // a reload, and there is no long-lived client state to protect.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheableAsset(url) {
  return CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

/**
 * Cache-first, for assets that cannot change without changing their URL.
 *
 * A miss is fetched and stored; a failure is returned as-is so the browser
 * reports the real network error rather than a fabricated one.
 */
async function assetFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Opaque and error responses are not worth storing, and an opaque response
  // cannot be inspected to know whether it is private.
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-only, with the offline page as the fallback for navigations.
 *
 * Deliberately never falls back to a cached copy of the requested page: the
 * requested page may be someone's reflection, and it is not in the cache
 * precisely so that it cannot be served from one.
 */
async function navigateOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match("/offline");
    if (offline) return offline;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is ever considered. A cached POST is meaningless here, and
  // replaying one would be worse than meaningless.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Every API response is private, authenticated, or both. Never intercepted,
  // so it can never be cached, stale, or served to the wrong person.
  if (url.pathname.startsWith("/api/")) return;

  if (isCacheableAsset(url)) {
    event.respondWith(assetFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigateOrOffline(request));
  }
});
