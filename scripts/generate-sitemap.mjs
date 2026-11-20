// Generates, from your published listings:
//   1. l/<id>.html  - a small static page per listing (title, description, image, share preview)
//   2. sitemap.xml  - home page, legal pages and every listing page
// Run: node scripts/generate-sitemap.mjs   (Node 18+). The GitHub Action runs it daily.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const SITE = "https://findorah.com";
const SB_URL = "https://gquqfswvzomhmszddsmd.supabase.co";
const SB_KEY = "sb_publishable_V7ttlSpmxcO6_WxJA-G_2g_kp8EfYvo"; // public key, same one the app uses
const CATS = { stores: "Store", vehicles: "Vehicle", accommodation: "Place to stay", housing: "Property", restaurants: "Restaurant" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${SB_URL}/rest/v1/listings?select=id,title,main_category,subcategory,location,description,images,logo,store_tagline,created_at,updated_at&status=eq.published&order=created_at.desc`, {
    headers: { apikey: SB_KEY, "Range-Unit": "items", Range: `${from}-${from + 999}` }
  });
  if (!res.ok) throw new Error("Supabase " + res.status);
  const page = await res.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

rmSync("l", { recursive: true, force: true });
mkdirSync("l", { recursive: true });

const made = [];
for (const l of rows) {
  if (!/^[0-9a-f-]{36}$/i.test(String(l.id)) || !l.title) continue;
  const url = `${SITE}/l/${l.id}.html`;
  const kind = CATS[l.main_category] || "Listing";
  const where = l.location ? ` in ${l.location}` : "";
  const desc = clip(l.description || l.store_tagline || `${l.title}${where}. Find it on Findorah.`, 155);
  const image = (Array.isArray(l.images) && l.images[0]) || l.logo || `${SITE}/og/og-image.png`;
  const title = `${l.title}${l.subcategory ? " · " + l.subcategory : ""} | Findorah`;
  const open = `${SITE}/?listing=${l.id}`;
  writeFileSync(`l/${l.id}.html`, `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0d0d0d">
<link rel="canonical" href="${url}">
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
<link rel="stylesheet" href="/legal.css">
<style>.hero{width:100%;max-height:360px;object-fit:cover;display:block;margin:0 0 16px}.btn{display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;margin:14px 0}</style>
</head>
<body>
<header class="lg"><a class="back" href="/" aria-label="Back to Findorah">←</a><b>Findorah</b></header>
<main>
<img class="hero" src="${esc(image)}" alt="${esc(l.title)}">
<h1>${esc(l.title)}</h1>
<p class="meta">${esc([kind, l.subcategory, l.location].filter(Boolean).join(" · "))}</p>
<p>${esc(clip(l.description || l.store_tagline || "", 600))}</p>
<a class="btn" href="${open}">Open in Findorah</a>
<nav class="lg"><a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a><a href="/contact.html">Contact</a></nav>
</main>
</body>
</html>
`);
  made.push(l);
}

const stat = [["/", "daily", "1.0"], ["/terms.html", "yearly", "0.2"], ["/privacy.html", "yearly", "0.2"], ["/contact.html", "yearly", "0.3"]];
const urls = stat.map(([p, f, pr]) => `  <url><loc>${SITE}${p}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>`)
  .concat(made.map((l) => `  <url><loc>${SITE}/l/${l.id}.html</loc><lastmod>${String(l.updated_at || l.created_at).slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`));
writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
console.log(`${made.length} listing pages and sitemap.xml written (${urls.length} URLs)`);
