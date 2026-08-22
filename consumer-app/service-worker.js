const CACHE_PREFIX = "listening-room-";
const CACHE = `${CACHE_PREFIX}v19`;
const PROFILE_INDEX = "./protocols/index.json";
const SHELL = [
  "./index.html",
  "./app.css",
  "./app.js",
  "./core.js",
  "./isochronic.js",
  "./isochronic-worklet.js",
  "./goggles.js",
  PROFILE_INDEX,
  "./app.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

async function cacheFresh(cache, path) {
  const key = new URL(path, self.registration.scope);
  const url = new URL(key);
  url.searchParams.set("build", CACHE);
  const response = await fetch(url, { cache: "reload" });
  if (!response.ok) throw new Error(`Could not cache ${path}`);
  await cache.put(key, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const index = await cacheFresh(cache, PROFILE_INDEX);
    await Promise.all(SHELL.filter((path) => path !== PROFILE_INDEX).map((path) => cacheFresh(cache, path)));
    await Promise.all((await index.json()).map((path) => cacheFresh(cache, path)));
    await self.skipWaiting();
  })());
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
