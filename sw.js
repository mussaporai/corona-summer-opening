// Service worker mínimo — cache do app shell + fallback offline pro último
// estado sincronizado. Não faz fila de mutações: escritas continuam exigindo
// rede (não é uma reescrita do app pra offline-first, só evita tela em
// branco quando o sinal cai em campo).
const CACHE_NAME = "corona-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // nunca cachear/interceptar mutações (POST)

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = req.mode === "navigate";
  const isStaticAsset = isSameOrigin && (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".html") || url.pathname === "/manifest.json");
  const isStateApi = isSameOrigin && url.pathname === "/api/state";

  if (!isNavigation && !isStaticAsset && !isStateApi) return; // demais chamadas de API seguem direto, sem cache

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (isNavigation) return caches.match("/index.html");
          return new Response("", { status: 504, statusText: "offline" });
        })
      )
  );
});
