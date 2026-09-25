/* Bangalore, in detail — the app's service worker (the page registers it only over https).
   Cache-first: the icons, the manifest, and the two Google Fonts (the CSS and the woff2 files it names), fetched once at install.
   Network-first, cache when offline: the page itself ("./" and "index.html"). Everything else passes straight through. */
const VER = "2026-09-25f", CACHE = "teddy-" + VER;
const STATIC = ["icon-192.png", "icon-512.png", "manifest.webmanifest"];
/* Also prefetch the card's poster (the still in Pranav's popup), so the gift still shows if she
   opens the app with no signal. It lives in a subfolder, and the fetcher below matches assets by
   BASENAME on purpose (GitHub Pages serves us from /detailed-layout/, so a path would not match),
   hence the two lists: the path form is for the install fetch, the basename for the runtime hit. */
const STATIC_PATHS = ["card/sky-card.png"];
const STATIC_NAMES = STATIC.concat(STATIC_PATHS.map(p => p.split("/").pop()));
const PAGE = ["", "index.html"];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Mali:wght@400;500;600;700&display=swap";
const FONT_HOST = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const name = url => new URL(url).pathname.split("/").pop();
const put = (req, r) => { if (r && (r.ok || r.type === "opaque")) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {}); return r; };
async function warmFonts(c) {  // the fonts CSS, then every woff2 it points at — so the home-screen app looks the same offline
  const r = await fetch(FONT_CSS, { mode: "cors" }); if (!r.ok) return;
  await c.put(FONT_CSS, r.clone());
  const urls = [...new Set([...(await r.text()).matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
  await Promise.all(urls.map(u => fetch(u, { mode: "cors" }).then(f => f.ok && c.put(u, f)).catch(() => {})));
}
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    ...STATIC.concat(STATIC_PATHS).map(f => c.add(new Request(f, { cache: "reload" })).catch(() => {})),
    c.add(new Request("./", { cache: "reload" })).catch(() => {}),
    warmFonts(c).catch(() => {}),
  ])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const same = new URL(req.url).origin === self.location.origin, f = same ? name(req.url) : "";
  if (FONT_HOST.test(req.url) || (same && STATIC_NAMES.includes(f))) {  // cache-first
    e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(r => put(req, r))));
  } else if (same && PAGE.includes(f)) {  // network-first, cache when offline
    e.respondWith(fetch(req).then(r => put(req, r)).catch(() => caches.match(req, { ignoreVary: true }).then(hit => hit || caches.match("./", { ignoreVary: true })).then(hit => hit || Response.error())));
  }
});

/* Teddy's knocks: push notifications from Pranav's Knock-Knock engine (scripts/notify.py). */
self.addEventListener("push", e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || "Knock knock 🧸",
    { body: d.body || "", icon: d.icon || "icon-192.png", badge: "icon-192.png", tag: d.tag || "teddy", data: { url: d.url } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.includes(self.location.origin) && "focus" in w) { w.focus(); return; }
    return clients.openWindow(url);
  }));
});
