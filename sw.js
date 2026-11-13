// Findorah service worker
// - network-first caching (updates always show; cache is only an offline fallback)
// - share target (receives shared text/images and hands them to the app)
// - periodic background sync (keeps "latest listings" fresh, updates the widget)
// - push notifications
// - Windows widget support (Edge)

const CACHE = "findorah-v4";
const SHARE_CACHE = "findorah-share";
const DATA_CACHE = "findorah-data";
const SHELL = ["/", "/index.html", "/script.js", "/manifest.json", "/icons/icon-192.png"];

const SB_URL = "https://gquqfswvzomhmszddsmd.supabase.co";
const SB_KEY = "sb_publishable_V7ttlSpmxcO6_WxJA-G_2g_kp8EfYvo";
const WIDGET_TAG = "latest-listings";

/* ---------- install / activate ---------- */
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  const keep = [CACHE, SHARE_CACHE, DATA_CACHE];
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------- fetch ---------- */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Web Share Target: POST /share-target
  if (req.method === "POST" && url.pathname === "/share-target") {
    e.respondWith(handleShare(req));
    return;
  }

  // Only same-origin GETs; Supabase and CDN requests go straight to the network.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
  );
});

async function handleShare(req) {
  try {
    const form = await req.formData();
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all((await cache.keys()).map((k) => cache.delete(k)));

    const files = form.getAll("photos").filter((f) => f && f.name).slice(0, 7);
    let i = 0;
    for (const f of files) {
      await cache.put(
        "/shared/file-" + i++,
        new Response(f, { headers: { "Content-Type": f.type || "image/jpeg", "X-Filename": encodeURIComponent(f.name) } })
      );
    }
    const meta = {
      title: form.get("title") || "",
      text: form.get("text") || "",
      url: form.get("url") || "",
      count: i
    };
    await cache.put("/shared/meta", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
  } catch (err) {
    // fall through to the app even if sharing failed
  }
  return Response.redirect("/?share-target=1", 303);
}

/* ---------- latest listings (periodic sync + widget) ---------- */
async function fetchLatest() {
  const res = await fetch(
    `${SB_URL}/rest/v1/listings?select=id,title,main_category,subcategory,location&status=eq.published&order=created_at.desc&limit=4`,
    { headers: { apikey: SB_KEY } }
  );
  if (!res.ok) throw new Error("latest listings " + res.status);
  const rows = await res.json();
  return rows.map((l) => ({
    id: l.id,
    title: l.title,
    meta: [l.subcategory || l.main_category, l.location].filter(Boolean).join(" · ")
  }));
}

async function refreshLatest() {
  const items = await fetchLatest();
  const cache = await caches.open(DATA_CACHE);
  await cache.put("/__latest.json", new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } }));
  return items;
}

async function updateWidgets() {
  if (!self.widgets) return;
  let items;
  try {
    items = await refreshLatest();
  } catch (e) {
    const hit = await (await caches.open(DATA_CACHE)).match("/__latest.json");
    items = hit ? await hit.json() : [];
  }
  if (!items.length) items = [{ title: "No listings yet", meta: "Open Findorah to browse" }];
  const template = await (await fetch("/widgets/latest-template.json")).text();
  await self.widgets.updateByTag(WIDGET_TAG, { template, data: JSON.stringify({ items }) });
}

self.addEventListener("periodicsync", (e) => {
  if (e.tag === "refresh-listings") e.waitUntil(updateWidgets().catch(() => refreshLatest().catch(() => {})));
});

self.addEventListener("widgetinstall", (e) => e.waitUntil(updateWidgets()));
self.addEventListener("widgetresume", (e) => e.waitUntil(updateWidgets()));
self.addEventListener("widgetclick", (e) => {
  if (e.action === "open") e.waitUntil(self.clients.openWindow("/"));
});

/* ---------- push notifications ---------- */
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (err) {
    data = { body: e.data ? e.data.text() : "" };
  }
  const title = data.title || "Findorah";
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || "findorah",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          return w.focus().then(() => ("navigate" in w ? w.navigate(target) : null));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
