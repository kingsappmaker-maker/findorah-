// Generates, from your published listings:
//   l/<id>.html          - a static page per listing
//   l/<id>/<key>.html    - a static page per product of a store (own photo, name, price); none for restaurants
//   sitemap.xml          - home page, legal pages and every LISTING page (product pages are noindex, so not listed)
// Listing pages give Google something to index; both kinds give WhatsApp a per-listing / per-product preview.
// Run: node scripts/generate-sitemap.mjs   (Node 18+)
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const SITE = "https://findorah.com";
const SB_URL = "https://gquqfswvzomhmszddsmd.supabase.co";
const SB_KEY = "sb_publishable_V7ttlSpmxcO6_WxJA-G_2g_kp8EfYvo"; // public key, same one the app uses
const CATS = { stores: "Store", vehicles: "Vehicle", accommodation: "Place to stay", housing: "Property", restaurants: "Restaurant" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
// Must match prodKey() in script.js exactly (FNV-1a over the product's first photo URL)
const prodKey = (s) => { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
const priceNum = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return isNaN(n) || n === 0 ? 0 : n; };
const money = (n) => "K" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function page({ title, desc, url, image, h1, meta, body, openUrl, redirectTo, noindex }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0d0d0d">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Findorah">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<script>if (location.search.indexOf("s=1") > -1) location.replace(${JSON.stringify(redirectTo)});</script>
<link rel="stylesheet" href="/legal.css">
<style>.hero{width:100%;max-height:360px;object-fit:cover;display:block;margin:0 0 16px}.btn{display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;margin:14px 0}.price{font-size:22px;font-weight:800;margin:0 0 4px}</style>
</head>
<body>
<header class="lg"><a class="back" href="/" aria-label="Back to Findorah">←</a><b>Findorah</b></header>
<main>
<img class="hero" src="${esc(image)}" alt="${esc(h1)}">
<h1>${esc(h1)}</h1>
${meta}
${body}
<a class="btn" href="${openUrl}">Open in Findorah</a>
<nav class="lg"><a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a><a href="/contact.html">Contact</a></nav>
</main>
</body>
</html>
`;
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${SB_URL}/rest/v1/listings?select=id,title,main_category,subcategory,location,description,images,logo,store_tagline,products,created_at,updated_at&status=eq.published&order=created_at.desc`, {
    headers: { apikey: SB_KEY, "Range-Unit": "items", Range: `${from}-${from + 999}` }
  });
  if (!res.ok) throw new Error("Supabase " + res.status);
  const chunk = await res.json();
  rows.push(...chunk);
  if (chunk.length < 1000) break;
}

rmSync("l", { recursive: true, force: true });
mkdirSync("l", { recursive: true });

const sitemapUrls = [];
let listingCount = 0, productCount = 0;
for (const l of rows) {
  if (!/^[0-9a-f-]{36}$/i.test(String(l.id)) || !l.title) continue;
  const url = `${SITE}/l/${l.id}.html`;
  const kind = CATS[l.main_category] || "Listing";
  const where = l.location ? ` in ${l.location}` : "";
  const desc = clip(l.description || l.store_tagline || `${l.title}${where}. Find it on Findorah.`, 155);
  const image = (Array.isArray(l.images) && l.images[0]) || l.logo || `${SITE}/og/og-image.png`;
  const lastmod = String(l.updated_at || l.created_at).slice(0, 10);

  writeFileSync(`l/${l.id}.html`, page({
    title: `${l.title}${l.subcategory ? " · " + l.subcategory : ""} | Findorah`,
    desc, url, image, h1: l.title,
    meta: `<p class="meta">${esc([kind, l.subcategory, l.location].filter(Boolean).join(" · "))}</p>`,
    body: `<p>${esc(clip(l.description || l.store_tagline || "", 600))}</p>`,
    openUrl: `${SITE}/?listing=${l.id}`,
    redirectTo: `/?listing=${l.id}`
  }));
  listingCount++;
  sitemapUrls.push(`  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`);

  // one page per available product (same rules the app uses to decide what counts as a product)
  // restaurants get a listing page only (their menu items share the restaurant link)
  const seen = new Set();
  for (const p of l.main_category === "restaurants" ? [] : Array.isArray(l.products) ? l.products : []) {
    const img = (p && Array.isArray(p.photos) && p.photos[0]) || (p && p.image);
    if (!img || img === l.logo || !p.name || p.sold) continue;
    const key = prodKey(img);
    if (seen.has(key)) continue;
    seen.add(key);
    const n = priceNum(p.price);
    const price = n ? money(n) : "";
    const pdesc = clip([price, p.details, `at ${l.title}${where}`].filter(Boolean).join(" · "), 155);
    const purl = `${SITE}/l/${l.id}/${key}.html`;
    mkdirSync(`l/${l.id}`, { recursive: true });
    writeFileSync(`l/${l.id}/${key}.html`, page({
      title: `${p.name} – ${l.title} | Findorah`,
      desc: pdesc, url: purl, image: img, h1: p.name,
      meta: `${price ? `<p class="price">${esc(price)}</p>` : ""}<p class="meta">${p.details ? esc(p.details) + " · " : ""}at <a href="/l/${l.id}.html">${esc(l.title)}</a>${l.location ? " · " + esc(l.location) : ""}</p>`,
      body: "",
      openUrl: `${SITE}/?listing=${l.id}&product=${key}`,
      redirectTo: `/?listing=${l.id}&product=${key}`,
      noindex: true // product pages exist for WhatsApp previews only; listing pages are the ones Google indexes
    }));
    productCount++; // deliberately not added to the sitemap
  }
}

const stat = [["/", "daily", "1.0"], ["/terms.html", "yearly", "0.2"], ["/privacy.html", "yearly", "0.2"], ["/contact.html", "yearly", "0.3"]];
const urls = stat.map(([p, f, pr]) => `  <url><loc>${SITE}${p}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).concat(sitemapUrls);
writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
console.log(`${listingCount} listing pages, ${productCount} product pages, sitemap.xml (${urls.length} URLs)`);
