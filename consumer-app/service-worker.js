const CACHE_PREFIX = "listening-room-";
const CACHE = `${CACHE_PREFIX}v7`;
const PROFILE_INDEX = "./protocols/index.json";
const SHELL = [
  "./index.html",
  "./app.css",
  "./app.js",
  "./core.js",
  "./isochronic.js",
  PROFILE_INDEX,
  "./app.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        const response = await cache.match(PROFILE_INDEX);
        await cache.addAll(await response.json());
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const shellUrls = new Set(SHELL.map((path) => new URL(path, self.registration.scope).href));
  if (!shellUrls.has(url.href) && request.mode !== "navigate") return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).catch(() => (
      request.mode === "navigate" ? caches.match(new URL("./index.html", self.registration.scope)) : Response.error()
    )))
  );
});
