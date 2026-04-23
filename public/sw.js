// Form Studio — minimal service worker.
// Caches the app shell for offline resilience. Everything dynamic goes to the
// network first and falls back to cache only if the network fails.

const CACHE = "form-studio-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Never cache auth, API, or Clerk traffic
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/sign-") || url.pathname.startsWith("/onboarding")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? new Response("offline", { status: 503 }))),
  );
});
