/* ============================================================
   FINDORAH — app.js
   Client logic: nav, view routing, category panels, card
   rendering, filters/search, listing detail, seller dashboard,
   admin panel, auth, seller form, reports.
   Backed by Supabase (table: listings, reports, profiles).
   ============================================================ */

(function () {
  "use strict";

  /* ----------------------------------------------------------
     SUPABASE SETUP
     ---------------------------------------------------------- */
  const SUPABASE_URL = "https://gquqfswvzomhmszddsmd.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_V7ttlSpmxcO6_WxJA-G_2g_kp8EfYvo";

  let supabase = null;
  try {
    if (window.supabase && SUPABASE_URL.indexOf("YOUR_PROJECT_ID") === -1) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.warn("Supabase init skipped:", e.message);
  }

  /* ----------------------------------------------------------
     STATE
     ---------------------------------------------------------- */
  const state = {
    user: null,
    profile: null,
    mainCategory: "stores",
    listings: [],          // full cache of fetched listings
    storeCategories: [
      { key: "Electronics", icon: "fa-mobile-alt" },
      { key: "Fashion & Apparel", icon: "fa-tshirt" },
      { key: "Home & Furniture", icon: "fa-couch" },
      { key: "Groceries", icon: "fa-shopping-basket" },
      { key: "Beauty & Cosmetics", icon: "fa-spa" },
      { key: "Hardware & Tools", icon: "fa-tools" },
      { key: "Baby & Kids", icon: "fa-baby" },
      { key: "Other", icon: "fa-store" }
    ],
    isAdmin: false,
    saved: new Set(),
    rooms: [{ name: "", price: "", includes: "" }],
    filters: {},
    sort: "new",
    accommodationTypes: [
      { key: "Hotel", label: "Hotels" },
      { key: "Lodge", label: "Lodges" },
      { key: "Resort", label: "Resorts" },
      { key: "Guest House", label: "Guest Houses" },
      { key: "Motel", label: "Motels" },
      { key: "Hostel", label: "Hostels" },
      { key: "Bed & Breakfast", label: "Bed & Breakfasts" },
      { key: "Self-Catering Apartment", label: "Self-Catering Apartments" },
      { key: "Campsite", label: "Campsites" }
    ],
    homeSearchTerm: "",
    search: { q: "", tab: "all", sort: "relevance", prevView: "view-home" },
    browse: { category: null, subcat: null, items: [], sort: "newest", search: "" },
    detail: { item: null },
    sellerEditId: null,
    photoItems: [],
    products: [],
    submitting: false,
    dashboardListings: [],
    admin: { tab: "pending", listings: [], reports: [] }
  };

  /* ----------------------------------------------------------
     SMALL UTILITIES
     ---------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- views / saves / contacts row (numbers only appear once there are enough to mean something) ----
  const VIEWS_MIN = 50, SAVES_MIN = 5, CONTACTS_MIN = 3;
  const fmtCount = (n) => (n < 1000 ? String(n) : n < 10000 ? (Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, "") + "k" : Math.round(n / 1000) + "k");
  const EYE = '<svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const HEART = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  function statsRowHtml(item) {
    const id = String(item.id).replace(/[^\w-]/g, "");
    const views = +item.view_count || 0, saves = +item.save_count || 0, contacts = +item.contact_count || 0;
    const fresh = Date.now() - new Date(item.created_at || 0).getTime() < 7 * 86400000;
    const saved = state.saved.has(String(item.id));
    return `<div class="rc-stats" data-id="${id}">` +
      (views >= VIEWS_MIN ? `<span title="Views">${EYE}${fmtCount(views)}</span>` : "") +
      `<button type="button" class="hrt${saved ? " on" : ""}" aria-pressed="${saved}" aria-label="${saved ? "Remove from favourites" : "Save to favourites"}" onclick="event.stopPropagation(); window.toggleSave('${id}')">${HEART}${saves >= SAVES_MIN ? `<span>${fmtCount(saves)}</span>` : ""}</button>` +
      (contacts >= CONTACTS_MIN ? `<span>${fmtCount(contacts)} contacts</span>` : "") + `</div>`;
  }
  // Heart that sits on the photo, top-right, in the same spot on every card
  function cardHeartHtml(item) {
    const id = String(item.id).replace(/[^\w-]/g, "");
    const saved = state.saved.has(String(item.id));
    return `<button type="button" class="card-hrt${saved ? " on" : ""}" data-id="${id}" aria-pressed="${saved}" aria-label="${saved ? "Remove from favourites" : "Save to favourites"}" onclick="event.stopPropagation(); window.toggleSave('${id}')">${HEART}</button>`;
  }
  function repaintStats(id) {
    const item = state.listings.find((l) => String(l.id) === String(id)) || (state.detail.item && String(state.detail.item.id) === String(id) ? state.detail.item : null);
    if (!item) return;
    const safe = String(id).replace(/[^\w-]/g, "");
    document.querySelectorAll(`.rc-stats[data-id="${safe}"]`).forEach((el) => { el.outerHTML = statsRowHtml(item); });
    document.querySelectorAll(`.card-hrt[data-id="${safe}"]`).forEach((el) => { el.outerHTML = cardHeartHtml(item); });
  }
  async function loadSaved() {
    if (!supabase || !state.user) { state.saved = new Set(); return; }
    const { data } = await supabase.from("listing_saves").select("listing_id");
    state.saved = new Set((data || []).map((r) => String(r.listing_id)));
    document.querySelectorAll(".rc-stats, .card-hrt").forEach((el) => repaintStats(el.dataset.id));
  }
  async function toggleSave(id) {
    if (!state.user) { toast("Sign in to save listings"); openAuthModal(); return; }
    const item = state.listings.find((l) => String(l.id) === String(id)) || (state.detail.item && String(state.detail.item.id) === String(id) ? state.detail.item : null);
    const on = !state.saved.has(String(id));
    // update the heart straight away, then confirm with the server
    if (on) state.saved.add(String(id)); else state.saved.delete(String(id));
    if (item) item.save_count = Math.max(0, (+item.save_count || 0) + (on ? 1 : -1));
    repaintStats(id);
    toast(on ? "Saved to your favourites" : "Removed from favourites");
    const { data, error } = await rpc("toggle_save", { p_id: id });
    if (error || typeof data !== "boolean" || data !== on) {
      if (error) { console.error(error); toast("Couldn't save that. Try again.", true); }
      if (on) state.saved.delete(String(id)); else state.saved.add(String(id));
      if (item) item.save_count = Math.max(0, (+item.save_count || 0) + (on ? -1 : 1));
      repaintStats(id);
    }
  }

  // Whole amounts read "K200"; decimals only when they matter ("K199.50")
  function kMoney(n) {
    return "K" + (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  function formatPrice(price) {
    if (price === null || price === undefined || price === "") return "Contact for price";
    const n = Number(String(price).replace(/[^\d.]/g, ""));
    if (isNaN(n) || n === 0) return String(price);
    return kMoney(n);
  }

  // Names and titles: ALL CAPS and all-lowercase words become Capitalised; mixed-case words (iPhone, McDonald's) are left alone
  const KEEP_CAPS = new Set(["BMW", "SUV", "KFC", "UK", "USA", "TV", "LED", "ZESCO", "AWD", "4WD", "DVD", "GPS", "ABS", "USB", "VIP", "II", "III", "IV", "B&B", "ZRA", "UNZA", "CBD"]);
  function tidyTitle(t) {
    t = String(t || "").trim().replace(/\s+/g, " ");
    if (!t) return t;
    const small = new Set(["a", "an", "the", "of", "and", "or", "in", "on", "at", "to", "for", "by", "with", "but", "nor", "as"]);
    const parts = t.split(/(\s+)/);
    const idx = parts.map((w, i) => (w.trim() ? i : -1)).filter((i) => i >= 0);
    const last = idx[idx.length - 1];
    return parts.map((w, i) => {
      if (!w.trim()) return w;
      const bare = w.replace(/[^A-Za-z0-9&]/g, "");
      if (KEEP_CAPS.has(bare.toUpperCase()) && bare === bare.toUpperCase()) return w;
      if (/\d/.test(w) || bare === "I") return w;
      const hasUp = /[A-Z]/.test(w), hasLow = /[a-z]/.test(w);
      if (hasUp && hasLow) return w;                                   // already mixed: McDonald's, iPhone
      if (hasUp && !hasLow && bare.length <= 3 && !/[AEIOUY]/i.test(bare)) return w; // vowel-less short caps: GMC
      const low = w.toLowerCase();
      const afterBreak = i >= 2 && /[:–—]$/.test(parts[i - 2]);
      if (i !== idx[0] && i !== last && !afterBreak && small.has(bare.toLowerCase())) return low;
      return low.replace(/(^|[^A-Za-z0-9'’])([a-z])/g, (m, p, c) => p + c.toUpperCase());
    }).join("");
  }

  function tidyListing(l) {
    return { ...l, title: tidyTitle(l.title), seller_name: tidyTitle(l.seller_name), location: tidyTitle(l.location), make: tidyTitle(l.make), model: tidyTitle(l.model), colour: tidyTitle(l.colour), mileage: l.mileage ? fmtMileage(l.mileage) : l.mileage };
  }

  // "50000" -> "50,000 km"
  function fmtMileage(v) {
    const raw = String(v === null || v === undefined ? "" : v).trim();
    if (!raw) return "";
    const unit = /\b(mi|miles)\b/i.test(raw) ? "mi" : "km";
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) return raw;
    return Number(digits).toLocaleString("en-US") + " " + unit;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return new Date(dateStr).toLocaleDateString();
  }

  function toast(msg, isError) {
    let el = $("rfToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "rfToast";
      el.style.position = "fixed";
      el.style.bottom = "calc(84px + env(safe-area-inset-bottom, 0px))";
      el.style.left = "50%";
      el.style.transform = "translateX(-50%) translateY(20px)";
      el.style.padding = "12px 20px";
      el.style.borderRadius = "12px";
      el.style.fontSize = "13.5px";
      el.style.fontWeight = "600";
      el.style.color = "#fff";
      el.style.zIndex = "999";
      el.style.opacity = "0";
      el.style.transition = "opacity 0.25s ease, transform 0.25s ease";
      el.style.maxWidth = "86%";
      el.style.textAlign = "center";
      el.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
      document.body.appendChild(el);
    }
    el.style.background = isError ? "#ef4444" : "#1e1b4b";
    el.textContent = msg;
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(20px)";
    }, 2800);
  }

  function setOverlay(visible) {
    const ov = $("overlay");
    if (!ov) return;
    if (visible) ov.classList.add("visible");
    else ov.classList.remove("visible");
  }

  function showView(viewId) {
    const target = $(viewId);
    // only swap views when the view really changes; re-adding "active" on the
    // current view restarts its fade-in and made every category tap jerk
    if (!(target && target.classList.contains("active"))) {
      document.querySelectorAll(".app-view").forEach((v) => v.classList.remove("active"));
      if (target) target.classList.add("active");
    }
    document.body.classList.toggle("on-detail", viewId === "view-detail");
    document.body.classList.toggle("on-dash", viewId === "view-dashboard");
    document.body.classList.toggle("has-tabbar", viewId === "view-home" || viewId === "view-search");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* ----------------------------------------------------------
     NAV DRAWER
     ---------------------------------------------------------- */
  function openNav() {
    $("navDrawer").classList.add("open");
    setOverlay(true);
  }
  function closeNav() {
    $("navDrawer").classList.remove("open");
    setOverlay(false);
  }

  /* ----------------------------------------------------------
     HOME / CATEGORY PANELS
     ---------------------------------------------------------- */
  function showHome() {
    showView("view-home");
    setMainCategory(state.mainCategory);
  }

  function setMainCategory(cat, btnEl) {
    const prev = state.mainCategory;
    // leaving a search: clear it so the tab shows the plain category
    if (state.search && state.search.q) {
      state.search.q = "";
      const hs = $("homeSearch"); if (hs) hs.value = "";
      const hc = $("homeSearchClear"); if (hc) hc.hidden = true;
    }
    state.mainCategory = cat;

    document.querySelectorAll(".tab-btn").forEach((p) => {
      const on = p.dataset.main === cat;
      p.classList.toggle("active", on);
      p.setAttribute("aria-selected", on ? "true" : "false");
    });

    // slide in from the side the new tab sits on
    const dir = ALL_CATS.indexOf(cat) >= ALL_CATS.indexOf(prev) ? 1 : -1;
    ALL_CATS.forEach((c) => {
      const panel = $("panel-" + c);
      if (!panel) return;
      const active = c === cat;
      panel.style.display = active ? "" : "none";
      panel.style.setProperty("--dx", dir * 16 + "px");
      panel.classList.toggle("active-panel", active);
    });

    showView("view-home");
    renderCategory(cat);
  }

  const STORE_IMAGES = {
    "Electronics":       "https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=900&q=80",
    "Fashion & Apparel": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=900&q=80",
    "Home & Furniture":  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80",
    "Groceries":         "https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&q=80",
    "Beauty & Cosmetics":"https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=900&q=80",
    "Hardware & Tools":  "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=900&q=80",
    "Baby & Kids":       "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=900&q=80",
    "Other":             "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=900&q=80"
  };

  function countListings(mainCat, subcat) {
    return state.listings.filter(
      (l) => l.main_category === mainCat && l.subcategory === subcat && l.status === "published"
    ).length;
  }

  // Builds the pills, menu entries, panels and posting-form buttons for the business categories
  // Bottom tab bar: every category has an icon and a word
  function buildPills() {
    const bar = $("tabBar");
    if (!bar) return;
    bar.innerHTML = '<div class="tb-in">' + ALL_CATS.map((c) => {
      const m = CAT_META[c];
      return `<button type="button" class="tab-btn" data-main="${c}" role="tab" aria-selected="false" onclick="window.setMainCategory('${c}', this)"><i class="fas ${m.icon}" aria-hidden="true"></i><span>${m.name}</span></button>`;
    }).join("") + "</div>";
  }

  // Drawer entries and panels for the business categories
  function buildBizUI() {
    buildPills();
    const drawerAnchor = document.querySelector('.drawer-btn[onclick*="setMainCategory(\'housing\')"]');
    let drawerPrev = drawerAnchor, panelPrev = $("panel-housing");
    Object.keys(BIZ).forEach((cat) => {
      const c = BIZ[cat];
      if (drawerPrev) {
        const b = document.createElement("button");
        b.className = "drawer-btn";
        b.setAttribute("onclick", `window.setMainCategory('${cat}'); window.closeNav();`);
        b.innerHTML = `<i class="fas ${c.icon}"></i> ${CAT_META[cat] ? CAT_META[cat].name : c.label}`;
        drawerPrev.insertAdjacentElement("afterend", b); drawerPrev = b;
      }
      if (panelPrev) {
        const p = document.createElement("div");
        p.id = "panel-" + cat; p.className = "category-panel"; p.style.display = "none";
        p.innerHTML = `<div class="card-grid" id="biz-grid-${cat}"></div>`;
        panelPrev.insertAdjacentElement("afterend", p); panelPrev = p;
      }
    });
  }

  const SIMILAR_CATS = ["accommodation", "restaurants", "stores"]; // categories that get a "Similar …" strip
  const RICH_CATS = ["vehicles", "accommodation", "housing"];

  // Counts views and contacts for the seller's dashboard (once per listing per visit for views)
  function trackListing(id, kind) {
    try {
      if (!supabase || !id) return;
      if (kind === "view") {
        const key = "rf_seen_" + id;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      }
      supabase.rpc("track_listing", { p_id: id, p_kind: kind }).then(() => {}, () => {});
    } catch (e) {}
  }
  function trackContact(id) { trackListing(id, "contact"); }

  function contactLinks(item) {
    const phone = (item.phone || "").replace(/[^\d+]/g, "");
    if (!phone) return { call: "#", wa: "#", ok: false };
    const msg = `Hi, I'm interested in your listing "${item.title}" on Findorah.`;
    return { call: `tel:${phone}`, wa: `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, ok: true };
  }

  function richMeta(item) {
    const c = item.main_category;
    let parts = [];
    if (c === "accommodation") parts = Array.isArray(item.amenities) ? item.amenities.slice() : [];
    else if (c === "housing") {
      if (hasVal(item.bedrooms)) parts.push(item.bedrooms + " bed");
      if (hasVal(item.bathrooms)) parts.push(item.bathrooms + " bath");
      String(item.store_tagline || "").split(/[·,;|\n]+/).map((x) => x.trim()).filter(Boolean).forEach((x) => parts.push(x));
    } else if (c === "vehicles") {
      [item.year, item.mileage ? fmtMileage(item.mileage) : "", item.transmission, item.fuel_type].filter(hasVal).forEach((x) => parts.push(String(x)));
    }
    return parts.length > 3 ? parts.slice(0, 3).join(" · ") + ` · +${parts.length - 3} more` : parts.join(" · ");
  }

  function bizCardHtml(item) {
    const id = String(item.id).replace(/[^\w-]/g, "");
    const st = openStatus(item);
    const badge = st
      ? `<span class="lc-badge lc-open${st.open ? "" : " closed"}">${st.open ? "Open" : "Closed"}</span>`
      : "";
    const initials = String(item.title || "?").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase();
    const logo = item.logo
      ? `<div class="bc-logo"><img alt="" loading="lazy" src="${escapeHtml(item.logo)}"></div>`
      : `<div class="bc-logo">${escapeHtml(initials)}</div>`;
    // storefront area: up to 8 of the store's product photos you can swipe through (cover photo if there are none)
    let photos = catalogItems(item).map((p) => p.image).filter(Boolean).slice(0, 8);
    if (!photos.length && item.images && item.images.length) photos = [item.images[0]];
    const gallery = photos.length
      ? `<div class="bc-gallery">${photos.map((u) => `<img alt="${escapeHtml(item.title)}" loading="lazy" draggable="false" src="${escapeHtml(u)}">`).join("")}</div>`
      : "";
    const count = photos.length > 1 ? `<div class="bc-dots">${photos.map((_, i) => `<i${i ? "" : ' class="on"'}></i>`).join("")}</div>` : "";
    const place = item.location ? `<i class="fas fa-map-marker-alt bc-pin"></i>${escapeHtml(item.location)}` : "";
    const meta = [item.subcategory ? escapeHtml(item.subcategory) : "", place].filter(Boolean).join(" · ");
    return `
      <div class="listing-card store-card biz-card has-logo" onclick="window.openDetail('${id}')">
        <div class="lc-img-wrap">${gallery}${badge}${cardHeartHtml(item)}${count}${logo}</div>
        <div class="lc-body">
          <div class="lc-title">${escapeHtml(item.title)}</div>
          ${meta ? `<div class="lc-meta">${meta}</div>` : ""}
        </div>
      </div>`;
  }

  // store card photo gallery: animated dots follow the swipe, and the photos auto-advance
  (function () {
    const idx = (g) => Math.min(g.children.length - 1, Math.max(0, Math.round(g.scrollLeft / (g.clientWidth || 1))));
    document.addEventListener("scroll", (e) => {
      const g = e.target;
      if (!g || !g.classList || !g.classList.contains("bc-gallery")) return;
      const dots = g.parentNode.querySelectorAll(".bc-dots i");
      const n = idx(g);
      dots.forEach((d, i) => d.classList.toggle("on", i === n));
    }, true);
    const touched = new WeakMap();
    const mark = (e) => {
      const g = e.target.closest && e.target.closest(".bc-gallery");
      if (g) touched.set(g, Date.now());
    };
    ["pointerdown", "touchstart", "wheel"].forEach((ev) => document.addEventListener(ev, mark, { passive: true }));
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let cur = null, left = 0;
    const next = (g) => g.scrollTo({ left: ((idx(g) + 1) % g.children.length) * g.clientWidth, behavior: "smooth" });
    setInterval(() => {
      if (document.hidden) return;
      // only cards you can see, not touched in the last 6 seconds
      const ready = [...document.querySelectorAll(".bc-gallery")].filter((g) => {
        if (g.children.length < 2) return false;
        const r = g.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight || !r.width) return false;
        return Date.now() - (touched.get(g) || 0) >= 6000;
      });
      if (!ready.length) { cur = null; return; }
      // one card plays through all its photos, then the next card takes over, so two cards never move together
      if (!cur || left <= 0 || !ready.includes(cur)) {
        cur = ready[(ready.indexOf(cur) + 1) % ready.length];
        left = cur.children.length;
      }
      next(cur);
      left--;
    }, 3500);
  })();

  function richCardHtml(item) {
    const c = item.main_category;
    const imgs = item.images || [];
    const rent = c === "housing" && /rent/i.test(item.subcategory || "");
    let price = hasVal(item.price) ? (c === "accommodation" && Array.isArray(item.rooms) && item.rooms.length > 1 ? "From " : "") + formatPrice(item.price) : "Contact for price";
    const unit = hasVal(item.price) ? (c === "accommodation" ? "/night" : rent ? "/month" : "") : "";
    const rate = c === "accommodation" && hasVal(item.rating) && +item.rating_count >= RATING_MIN
      ? `<span class="rc-rate">★ ${Number(item.rating).toFixed(1)} <span>(${item.rating_count})</span></span>`
      : "";
    const place = item.location ? `<i class="fas fa-map-marker-alt"></i>${escapeHtml(item.location)}` : "";
    const meta = richMeta(item);
    const tag = item.subcategory ? `<span class="lc-badge">${escapeHtml(item.subcategory)}</span>` : "";
    return `
      <div class="listing-card rich-card" onclick="window.openDetail('${String(item.id).replace(/[^\w-]/g, "")}')">
        <div class="lc-img-wrap">${imgs.length ? `<img src="${escapeHtml(imgs[0])}" alt="${escapeHtml(item.title)}" loading="lazy">` : ""}${tag}${cardHeartHtml(item)}${imgs.length > 1 ? `<span class="lc-photocount">1/${imgs.length}</span>` : ""}</div>
        <div class="lc-body">
          <div class="rc-price">${escapeHtml(price)}${unit ? ` <small>${unit}</small>` : ""}${rate}</div>
          <div class="rc-title">${escapeHtml(item.title)}</div>
          ${place ? `<div class="rc-loc">${place}</div>` : ""}
          ${meta ? `<div class="rc-meta">${escapeHtml(meta)}</div>` : ""}
        </div>
      </div>`;
  }

  function listingCardHtml(item) {
    if (item.main_category === "stores" || isBiz(item.main_category)) return bizCardHtml(item);
    if (RICH_CATS.includes(item.main_category)) return richCardHtml(item);
    const isStore = item.main_category === "stores";
    const isBizItem = isBiz(item.main_category);
    const isStay = item.main_category === "accommodation";
    const isHousing = item.main_category === "housing";
    const isRent = isHousing && /rent/i.test(item.subcategory || "");
    const img =
      item.images && item.images.length
        ? `<img src="${escapeHtml(item.images[0])}" alt="${escapeHtml(item.title)}" loading="lazy">`
        : "";
    const badge = (isStore || isBizItem || isStay || isHousing) && item.subcategory
      ? `<span class="lc-badge">${escapeHtml(item.subcategory)}</span>`
      : "";
    const priceText = isStay && item.price
      ? formatPrice(item.price) + " / night"
      : isRent && item.price
      ? formatPrice(item.price) + " / month"
      : formatPrice(item.price);
    const metaParts = [];
    if (item.main_category === "vehicles") {
      if (item.year) metaParts.push(item.year);
      if (item.mileage) metaParts.push(item.mileage);
      if (item.transmission) metaParts.push(item.transmission);
      if (item.location) metaParts.push(item.location);
    } else if (isStore || isBizItem) {
      if (item.store_tagline) metaParts.push(item.store_tagline);
      const n = Array.isArray(item.products) ? item.products.length : 0;
      const noun = isBizItem ? "menu item" : "product";
      if (n && (isStore || BIZ[item.main_category].menu)) metaParts.push(`${n} ${noun}${n === 1 ? "" : "s"}`);
    } else if (isStay) {
      if (item.location) metaParts.push(item.location);
      (item.amenities || []).slice(0, 2).forEach((a) => metaParts.push(a));
    } else if (isHousing) {
      if (item.bedrooms !== null && item.bedrooms !== undefined && item.bedrooms !== "") metaParts.push(item.bedrooms + " bed");
      if (item.bathrooms !== null && item.bathrooms !== undefined && item.bathrooms !== "") metaParts.push(item.bathrooms + " bath");
      if (item.location) metaParts.push(item.location);
    }
    const locHtml = item.location ? `<div class="lc-location"><i class="fas fa-map-marker-alt"></i>${escapeHtml(item.location)}</div>` : "";
    const bizPrice = isBizItem && item.price ? `<div class="lc-price" style="margin-top:4px;">${escapeHtml(BIZ[item.main_category].priceLead + " " + formatPrice(item.price))}</div>` : "";
    const footer = isStore
      ? locHtml
      : isBizItem
      ? locHtml + bizPrice
      : `<div class="lc-price">${escapeHtml(priceText)}</div>`;

    return `
      <div class="listing-card${isStore || isBizItem ? " store-card" : ""}" onclick="window.openDetail('${String(item.id).replace(/[^\w-]/g, "")}')">
        <div class="lc-img-wrap">${img}${badge}</div>
        <div class="lc-body">
          <div class="lc-title">${escapeHtml(item.title)}</div>
          <div class="lc-meta">${escapeHtml(metaParts.filter(Boolean).join(" · "))}</div>
          ${footer}
        </div>
      </div>`;
  }

  /* ============================================================
     FILTER, SORT, RESULT COUNT
     ============================================================ */
  const GRID_ID = (c) => (isBiz(c) ? "biz-grid-" + c : c + "Grid");
  const catItems = (cat) => state.listings.filter((l) => l.main_category === cat && l.status === "published");
  function priceNum(i) {
    const raw = String(i.price === null || i.price === undefined ? "" : i.price).trim();
    if (!raw) return null;
    const n = Number(raw.replace(/[^\d.]/g, ""));
    return isNaN(n) ? null : n;
  }
  const niceRound = (n) => {
    if (n < 10) return Math.round(n);
    const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  };
  const kfmt = (n) => "K" + Number(n).toLocaleString("en-US");

  // What can this category be filtered by? (options come from the listings themselves)
  function facetDefs(cat, items) {
    const defs = [];
    const tally = (fn) => {
      const m = new Map();
      items.forEach((i) => { const v = String(fn(i) || "").trim(); if (v) m.set(v, (m.get(v) || 0) + 1); });
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    const valOpts = (fn, cap) =>
      tally(fn).slice(0, cap || 12).map(([v]) => ({ key: v, label: v, test: (i) => String(fn(i) || "").trim() === v }));

    if (cat !== "vehicles") {
      const label = { stores: "Category", accommodation: "Type", housing: "Listing type" }[cat] || "Type";
      const o = valOpts((i) => i.subcategory);
      if (o.length) defs.push({ key: "sub", label, mode: "multi", options: o });
    }
    const prices = items.map(priceNum).filter((p) => p !== null).sort((a, b) => a - b);
    if (cat !== "stores" && prices.length >= 4) {
      const t1 = niceRound(prices[Math.floor(prices.length / 3)]);
      const t2 = niceRound(prices[Math.floor((prices.length * 2) / 3)]);
      if (t1 < t2) {
        defs.push({
          key: "price", label: "Price" + (cat === "accommodation" ? " per night" : ""), mode: "single",
          options: [
            { key: "low", label: "Under " + kfmt(t1), test: (i) => { const p = priceNum(i); return p !== null && p < t1; } },
            { key: "mid", label: kfmt(t1) + " – " + kfmt(t2), test: (i) => { const p = priceNum(i); return p !== null && p >= t1 && p < t2; } },
            { key: "high", label: kfmt(t2) + "+", test: (i) => { const p = priceNum(i); return p !== null && p >= t2; } }
          ]
        });
      }
    }
    {
      const o = valOpts((i) => i.location, 10);
      if (o.length) defs.push({ key: "area", label: "Area", mode: "multi", options: o });
    }
    if (cat === "housing" && items.some((i) => hasVal(i.bedrooms))) {
      const bed = (n) => (i) => hasVal(i.bedrooms) && (n === 4 ? Number(i.bedrooms) >= 4 : Number(i.bedrooms) === n);
      defs.push({ key: "beds", label: "Bedrooms", mode: "single", options: [1, 2, 3, 4].map((n) => ({ key: String(n), label: n === 4 ? "4+" : String(n), test: bed(n) })) });
    }
    if (cat === "vehicles") {
      const t = valOpts((i) => i.transmission);
      if (t.length) defs.push({ key: "trans", label: "Gearbox", mode: "multi", options: t });
      const f = valOpts((i) => i.fuel_type);
      if (f.length) defs.push({ key: "fuel", label: "Fuel", mode: "multi", options: f });
    }
    if (cat === "accommodation") {
      const m = new Map();
      items.forEach((i) => (Array.isArray(i.amenities) ? i.amenities : []).forEach((a) => m.set(a, (m.get(a) || 0) + 1)));
      const top = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
      if (top.length) defs.push({ key: "amen", label: "Amenities", mode: "multi", all: true, options: top.map(([a]) => ({ key: a, label: a, test: (i) => (i.amenities || []).includes(a) })) });
      if (items.some((i) => Number(i.rating) >= 4)) defs.push({ key: "rate", label: "Rating", mode: "single", options: [{ key: "4", label: "4.0 and up", test: (i) => Number(i.rating) >= 4 }] });
    }
    return defs;
  }

  function matchesFacets(item, defs, sel, skipKey) {
    return defs.every((f) => {
      if (f.key === skipKey) return true;
      const picked = (sel[f.key] || []).map((k) => f.options.find((o) => o.key === k)).filter(Boolean);
      if (!picked.length) return true;
      return f.all ? picked.every((o) => o.test(item)) : picked.some((o) => o.test(item));
    });
  }

  function sortItems(items) {
    const arr = items.slice();
    const byPrice = (dir) => arr.sort((a, b) => {
      const pa = priceNum(a), pb = priceNum(b);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return dir * (pa - pb);
    });
    if (state.sort === "low") return byPrice(1);
    if (state.sort === "high") return byPrice(-1);
    if (state.sort === "rating") return arr.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    return arr;
  }

  function filteredItems(cat) {
    const items = catItems(cat);
    const defs = facetDefs(cat, items);
    const sel = state.filters[cat] || {};
    return { items, defs, sel, shown: sortItems(items.filter((i) => matchesFacets(i, defs, sel))) };
  }

  function renderCategory(cat) {
    const grid = $(GRID_ID(cat));
    if (!grid) return;
    const { items, defs, sel, shown } = filteredItems(cat);
    const what = CAT_NOUNS[cat] || (isBiz(cat) ? BIZ[cat].label.toLowerCase() : "listings");
    // more than ~10 listings: switch the tall cards to compact rows (stores keep the full card)
    grid.classList.toggle("compact", COMPACT_CATS.includes(cat) && items.length > COMPACT_AFTER);
    grid.innerHTML = shown.length
      ? shown.map(listingCardHtml).join("")
      : items.length
      ? emptyStateHtml("No matches", "Nothing fits those filters. Try removing one.", `<button type="button" class="es-btn" onclick="window.clearCategoryFilters()">Clear filters</button>`)
      : emptyCategoryHtml(cat, what);
    const hasFilters = Object.values(sel).some((a) => a && a.length);
    $("listToolbar").style.display = items.length > 12 || hasFilters ? "" : "none";
    $("ltCount").textContent = `${shown.length} listing${shown.length === 1 ? "" : "s"}`;
    // removable tags for the applied filters (and nothing else)
    const tags = [];
    defs.forEach((f) => (sel[f.key] || []).forEach((k) => {
      const o = f.options.find((x) => x.key === k);
      if (o) tags.push(`<button type="button" class="lt-tag" data-f="${f.key}" data-o="${escapeHtml(k)}" aria-label="Remove filter ${escapeHtml(o.label)}">${escapeHtml(o.label)} <span>✕</span></button>`);
    }));
    $("ltTags").innerHTML = tags.join("");
  }

  /* ---- bottom sheets ---- */
  const Sheet = { cat: null, draft: {} };
  function openSheet(id) {
    $("sheetBack").classList.add("open");
    $(id).classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeSheets() {
    $("sheetBack").classList.remove("open");
    $("filterSheet").classList.remove("open");
    $("sortSheet").classList.remove("open");
    document.body.style.overflow = "";
  }
  const sheetOpen = () => $("filterSheet").classList.contains("open") || $("sortSheet").classList.contains("open");

  function paintFilterSheet(keepScroll) {
    const cat = Sheet.cat;
    const items = catItems(cat);
    const defs = facetDefs(cat, items);
    const body = $("fsBody");
    const top = keepScroll ? body.scrollTop : 0;
    body.innerHTML = defs.length
      ? defs.map((f) => `<section class="fs-sec"><h4>${escapeHtml(f.label)}</h4><div class="fs-opts">${f.options.map((o) => {
          const on = (Sheet.draft[f.key] || []).includes(o.key);
          const n = items.filter((i) => matchesFacets(i, defs, Sheet.draft, f.key) && o.test(i)).length;
          return `<button type="button" class="opt${on ? " on" : ""}${n === 0 && !on ? " zero" : ""}" data-f="${f.key}" data-o="${escapeHtml(o.key)}">${escapeHtml(o.label)} <span class="n">${n}</span></button>`;
        }).join("")}</div></section>`).join("")
      : `<p style="color:var(--text-muted);padding:18px 0;">Nothing to filter yet — check back when more listings are added.</p>`;
    body.scrollTop = top;
    const n = items.filter((i) => matchesFacets(i, defs, Sheet.draft)).length;
    $("fsShow").textContent = `Show ${n} result${n === 1 ? "" : "s"}`;
  }
  function openFilterSheet() {
    Sheet.cat = state.mainCategory;
    Sheet.draft = JSON.parse(JSON.stringify(state.filters[Sheet.cat] || {}));
    paintFilterSheet(false);
    openSheet("filterSheet");
  }
  function openSortSheet() {
    const opts = [["new", "Newest first"], ["low", "Price: low to high"], ["high", "Price: high to low"]];
    if (state.mainCategory === "accommodation") opts.push(["rating", "Top rated"]);
    $("ssBody").innerHTML = opts.map(([k, l]) => `<button type="button" class="sort-row${state.sort === k ? " on" : ""}" data-s="${k}">${l}${state.sort === k ? " ✓" : ""}</button>`).join("");
    openSheet("sortSheet");
  }
  function setupFilterUI() {
    $("ltFilter").onclick = openFilterSheet;
    $("ltSort").onclick = openSortSheet;
    $("sheetBack").onclick = closeSheets;
    $("fsClose").onclick = closeSheets;
    $("ssClose").onclick = closeSheets;
    $("fsBody").addEventListener("click", (e) => {
      const b = e.target.closest(".opt");
      if (!b) return;
      const f = facetDefs(Sheet.cat, catItems(Sheet.cat)).find((x) => x.key === b.dataset.f);
      const cur = Sheet.draft[b.dataset.f] || [];
      const k = b.dataset.o;
      if (cur.includes(k)) Sheet.draft[b.dataset.f] = cur.filter((x) => x !== k);
      else Sheet.draft[b.dataset.f] = f && f.mode === "single" ? [k] : cur.concat(k);
      paintFilterSheet(true);
    });
    $("fsClear").onclick = () => { Sheet.draft = {}; paintFilterSheet(true); };
    $("fsShow").onclick = () => {
      const clean = {};
      Object.keys(Sheet.draft).forEach((k) => { if (Sheet.draft[k].length) clean[k] = Sheet.draft[k]; });
      state.filters[Sheet.cat] = clean;
      closeSheets();
      renderCategory(Sheet.cat);
    };
    $("ssBody").addEventListener("click", (e) => {
      const b = e.target.closest(".sort-row");
      if (!b) return;
      state.sort = b.dataset.s;
      closeSheets();
      renderCategory(state.mainCategory);
    });
    $("ltTags").addEventListener("click", (e) => {
      const b = e.target.closest(".lt-tag");
      if (!b) return;
      const sel = state.filters[state.mainCategory] || {};
      sel[b.dataset.f] = (sel[b.dataset.f] || []).filter((x) => x !== b.dataset.o);
      state.filters[state.mainCategory] = sel;
      renderCategory(state.mainCategory);
    });
  }

  function emptyStateHtml(title, sub, extraHtml) {
    return `
      <div class="empty-state">
        <i class="fas fa-box-open" aria-hidden="true"></i>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(sub)}</p>
        ${extraHtml || ""}
      </div>`;
  }

  // Empty category: turn the gap into a way to bring listings in
  function waLink(text) {
    const n = String(FINDORAH_WA || "").replace(/[^\d]/g, "");
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
  }
  function emptyCategoryHtml(cat, what) {
    const single = CAT_SINGULAR[cat] || "business";
    const cap = what.charAt(0).toUpperCase() + what.slice(1);
    const link = waLink(`Hi Findorah, I know a ${single} you could list: `);
    if (USER_CATS.includes(cat)) {
      return emptyStateHtml(`No ${what} yet`, `Have ${cat === "vehicles" ? "a vehicle" : "a home"} to ${cat === "vehicles" ? "sell" : "rent out or sell"}? Listing is free.`,
        `<button type="button" class="es-btn" onclick="window.openSellerPanel()"><i class="fas fa-plus"></i> List yours free</button>`);
    }
    return emptyStateHtml(`${cap}: none yet`, `Know a ${single}? Tell us and we'll list it for free.`,
      link
        ? `<a class="es-btn es-wa" href="${link}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Tell us on WhatsApp</a>`
        : `<button type="button" class="es-btn" onclick="window.openSellerPanel()"><i class="fas fa-plus"></i> Add a listing</button>`);
  }
  function clearCategoryFilters() {
    state.filters[state.mainCategory] = {};
    renderCategory(state.mainCategory);
  }

  /* ----------------------------------------------------------
     SEARCH
     Suggestions while typing (2+ letters), a results page only on
     Enter or when a suggestion is chosen. Searches ALL categories;
     the results page narrows by category with tabs.
     ---------------------------------------------------------- */
  const SEARCH_MIN = 2;
  const SEARCH_DELAY = 250;
  const RECENT_KEY = "rf_recent_searches";
  const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = (t) => norm(t).split(/[^a-z0-9]+/).filter(Boolean);
  const catLabel = (c) => (CAT_META[c] || {}).name || c;

  // words per field, cached per listing
  const SIDX = new WeakMap();
  function searchIndex(l) {
    let x = SIDX.get(l);
    if (x) return x;
    const prods = Array.isArray(l.products) ? l.products.map((p) => p && p.name) : [];
    x = {
      title: words(l.title),
      full: norm(l.title).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(),
      cat: words([l.subcategory, catLabel(l.main_category)].join(" ")),
      area: words(l.location),
      seller: words(l.seller_name),
      other: words([l.store_tagline, l.make, l.model].concat(prods).join(" "))
    };
    SIDX.set(l, x);
    return x;
  }
  // 2 = whole word, 1 = word starts with the token, 0 = no match
  function tokScore(tok, ws) {
    let best = 0;
    for (let i = 0; i < ws.length; i++) {
      if (ws[i] === tok) return 2;
      if (ws[i].indexOf(tok) === 0) best = 1;
    }
    return best;
  }
  function scoreListing(l, toks) {
    const x = searchIndex(l);
    let total = 0;
    for (const t of toks) {
      let best = 0;
      [[x.title, 10], [x.cat, 6], [x.area, 5], [x.seller, 4], [x.other, 3]].forEach(([ws, w]) => {
        const k = tokScore(t, ws);
        if (k) best = Math.max(best, w * (k === 2 ? 1.3 : 1));
      });
      if (!best) return 0;
      total += best;
    }
    if (x.full.indexOf(toks.join(" ")) === 0) total += 8;
    return total;
  }
  function searchListings(q) {
    const toks = words(q);
    if (!toks.length) return [];
    return state.listings
      .filter((l) => l.status === "published")
      .map((l) => ({ l, score: scoreListing(l, toks) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.l.created_at) - new Date(a.l.created_at));
  }

  // ---- "Did you mean…?" (small typos) ----
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  let vocabCache = { key: null, map: null };
  function vocab() {
    const key = state.listings;
    if (vocabCache.key === key && vocabCache.len === key.length) return vocabCache.map;
    const m = new Map();
    const add = (text) => String(text || "").split(/[^A-Za-z0-9\u00C0-\u024F]+/).forEach((w) => { const n = norm(w); if (n.length >= 3 && !m.has(n)) m.set(n, w); });
    state.listings.forEach((l) => { add(l.title); add(l.location); add(l.subcategory); add(l.seller_name); add(catLabel(l.main_category)); });
    vocabCache = { key, len: key.length, map: m };
    return m;
  }
  function didYouMean(q) {
    const toks = words(q);
    if (!toks.length) return null;
    const v = vocab();
    let changed = false;
    const out = toks.map((t) => {
      if (t.length < 3) return t;
      let startsSomething = false;
      for (const k of v.keys()) { if (k.indexOf(t) === 0) { startsSomething = true; break; } }
      if (startsSomething) return v.get(t) || t;
      const max = t.length <= 4 ? 1 : 2;
      let best = null, bestD = max + 1;
      v.forEach((orig, k) => { const d = lev(t, k, max); if (d < bestD) { bestD = d; best = orig; } });
      if (best) { changed = true; return best; }
      return t;
    });
    if (!changed) return null;
    const phrase = out.join(" ");
    return searchListings(phrase).length ? phrase : null;
  }

  // ---- recent searches ----
  function getRecents() {
    try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(r) ? r.slice(0, 6) : []; } catch (e) { return []; }
  }
  function saveRecent(q) {
    try {
      const t = q.trim();
      if (!t) return;
      const list = getRecents().filter((x) => norm(x) !== norm(t));
      list.unshift(t);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
    } catch (e) {}
  }
  function clearRecents() {
    try { localStorage.removeItem(RECENT_KEY); } catch (e) {}
  }

  // ---- record searches that found nothing (demand data) ----
  const missLogged = new Set();
  function logMiss(q) {
    const n = norm(q).replace(/\s+/g, " ").trim();
    if (n.length < 3 || n.length > 60 || missLogged.has(n)) return;
    missLogged.add(n);
    try {
      // server function lower-cases the word and counts repeats (table: search_misses)
      if (supabase) supabase.rpc("log_search_miss", { p_term: q.trim() }).then(() => {}, () => {});
    } catch (e) {}
  }

  // ---- suggestions ----
  function highlight(text, toks) {
    const t = String(text || "");
    if (!toks.length) return escapeHtml(t);
    const re = new RegExp("(^|[^A-Za-z0-9])(" + toks.map(esc).join("|") + ")", "gi");
    let out = "", last = 0, m;
    while ((m = re.exec(t))) {
      const start = m.index + m[1].length;
      out += escapeHtml(t.slice(last, start)) + "<b>" + escapeHtml(m[2]) + "</b>";
      last = start + m[2].length;
    }
    return out + escapeHtml(t.slice(last));
  }
  function buildSuggestions(q) {
    const toks = words(q);
    const groups = [];
    if (!toks.length) return groups;
    const hits = searchListings(q);
    if (hits.length) {
      groups.push({ label: "Listings", rows: hits.slice(0, 5).map((r) => ({
        icon: "fa-search", title: r.l.title, sub: [catLabel(r.l.main_category), r.l.location].filter(Boolean).join(" · "), action: { type: "listing", id: r.l.id }
      })) });
    }
    // categories: main categories + sub-categories that start with what was typed
    const cats = [];
    if (toks.length === 1) {
      ALL_CATS.forEach((c) => { if (words(catLabel(c)).some((w) => w.indexOf(toks[0]) === 0)) cats.push({ label: catLabel(c), sub: "Category", q: catLabel(c) }); });
    }
    const seenSub = new Set();
    state.listings.forEach((l) => {
      const s = String(l.subcategory || "").trim();
      if (s && !seenSub.has(s) && words(s).some((w) => w.indexOf(toks[toks.length - 1]) === 0) && toks.length === 1) { seenSub.add(s); cats.push({ label: s, sub: "in " + catLabel(l.main_category), q: s }); }
    });
    if (cats.length) groups.push({ label: "Categories", rows: cats.slice(0, 3).map((c) => ({ icon: "fa-th-large", title: c.label, sub: c.sub, action: { type: "query", q: c.q } })) });
    // areas
    const areaCount = new Map();
    state.listings.forEach((l) => {
      const a = String(l.location || "").trim();
      if (a && l.status === "published" && words(a).some((w) => toks.length === 1 && w.indexOf(toks[0]) === 0)) areaCount.set(a, (areaCount.get(a) || 0) + 1);
    });
    const areas = Array.from(areaCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (areas.length) groups.push({ label: "Areas", rows: areas.map(([a, n]) => ({ icon: "fa-map-marker-alt", title: a, sub: `${n} listing${n === 1 ? "" : "s"}`, action: { type: "query", q: a } })) });
    return groups;
  }

  // One search box: input + clear button + suggestion dropdown
  function attachSearchBox(cfg) {
    const input = $(cfg.input), drop = $(cfg.drop), clear = $(cfg.clear), form = $(cfg.form);
    if (!input || !drop || !form) return;
    let rows = [], active = -1, timer = null;

    const close = () => { drop.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
    const syncClear = () => { if (clear) clear.hidden = !input.value; };
    function paint() {
      const q = input.value.trim();
      let html = "";
      rows = [];
      if (!q) {
        const rec = getRecents();
        if (!rec.length) return close();
        html += `<div class="sd-head"><span>Recent searches</span><button type="button" class="sd-clear" data-clear="1">Clear</button></div>`;
        rec.forEach((r) => { rows.push({ action: { type: "query", q: r } }); html += rowHtml(rows.length - 1, "fa-history", escapeHtml(r), ""); });
      } else if (words(q).join("").length >= SEARCH_MIN) {
        const groups = buildSuggestions(q);
        const toks = words(q);
        if (!groups.length) {
          html += `<div class="sd-none">No matches yet. Press Search to look anyway.</div>`;
        }
        groups.forEach((g) => {
          html += `<div class="sd-head"><span>${g.label}</span></div>`;
          g.rows.forEach((r) => { rows.push(r); html += rowHtml(rows.length - 1, r.icon, highlight(r.title, toks), r.sub ? escapeHtml(r.sub) : ""); });
        });
      } else {
        return close();
      }
      drop.innerHTML = html;
      drop.hidden = false;
      active = -1;
      input.setAttribute("aria-expanded", "true");
    }
    function rowHtml(i, icon, title, sub) {
      return `<button type="button" class="sd-row" role="option" id="${cfg.drop}-${i}" data-i="${i}"><i class="fas ${icon}" aria-hidden="true"></i><span class="sd-txt"><span class="sd-title">${title}</span>${sub ? `<span class="sd-sub">${sub}</span>` : ""}</span></button>`;
    }
    function choose(i) {
      const r = rows[i];
      if (!r) return;
      close();
      if (r.action.type === "listing") { input.blur(); openDetail(r.action.id); }
      else openSearchResults(r.action.q);
    }
    function setActive(n) {
      const els = drop.querySelectorAll(".sd-row");
      if (!els.length) return;
      active = (n + els.length) % els.length;
      els.forEach((e, i) => e.classList.toggle("on", i === active));
      input.setAttribute("aria-activedescendant", els[active].id);
      els[active].scrollIntoView({ block: "nearest" });
    }

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.addEventListener("input", () => {
      syncClear();
      clearTimeout(timer);
      timer = setTimeout(paint, 120);
      if (cfg.onType) cfg.onType(input.value);
    });
    input.addEventListener("focus", () => { syncClear(); paint(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (drop.hidden) paint(); setActive(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
      else if (e.key === "Escape") { close(); }
    });
    // Enter on a keyboard, or the "Search" key on a phone keyboard
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (active >= 0 && rows[active]) return choose(active);
      close();
      input.blur();
      const q = input.value.trim();
      if (q) openSearchResults(q);
    });
    // pointerdown keeps the keyboard/focus from jumping before the tap lands
    drop.addEventListener("pointerdown", (e) => { if (e.target.closest(".sd-row, .sd-clear")) e.preventDefault(); });
    drop.addEventListener("click", (e) => {
      if (e.target.closest(".sd-clear")) { clearRecents(); close(); return; }
      const b = e.target.closest(".sd-row");
      if (b) choose(+b.dataset.i);
    });
    if (clear) clear.addEventListener("click", () => {
      input.value = "";
      syncClear();
      input.focus();
      paint();
      if (cfg.onType) cfg.onType("");
    });
    document.addEventListener("pointerdown", (e) => { if (!form.contains(e.target)) close(); });
    cfg.api = { close, sync: syncClear };
    return cfg;
  }
  let homeBox = null, resultsBox = null;
  // hide the tab bar while the keyboard is up so it never squeezes the screen
  function setupKeyboardWatch() {
    const isField = (el) => el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !["checkbox", "radio", "button", "submit", "file", "range"].includes(el.type);
    document.addEventListener("focusin", (e) => { if (isField(e.target)) document.body.classList.add("kb"); });
    document.addEventListener("focusout", () => setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove("kb"); }, 80));
  }
  function setupSearch() {
    setupKeyboardWatch();
    homeBox = attachSearchBox({ form: "homeSearchForm", input: "homeSearch", drop: "homeSuggest", clear: "homeSearchClear" });
    resultsBox = attachSearchBox({ form: "resultsSearchForm", input: "resultsSearch", drop: "resultsSuggest", clear: "resultsSearchClear", onType: onResultsType });
    $("srSort").addEventListener("change", (e) => { state.search.sort = e.target.value; renderResults(); });
    $("srTabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      state.search.tab = b.dataset.tab;
      renderResults();
      window.scrollTo({ top: 0 });
    });
    $("srGrid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-browse]");
      if (b) { closeSearch(); setMainCategory(b.dataset.browse); return; }
      const d = e.target.closest("[data-q]");
      if (d) openSearchResults(d.dataset.q);
    });
  }

  // ---- results page ----
  let resultsTimer = null, missTimer = null;
  function openSearchResults(q) {
    q = String(q || "").trim();
    if (!q) return;
    if (currentViewId() !== "view-search") state.search.prevView = currentViewId();
    state.search.q = q;
    state.search.tab = "all";
    state.search.sort = "relevance";
    $("srSort").value = "relevance";
    $("resultsSearch").value = q;
    resultsBox.api.sync();
    resultsBox.api.close();
    homeBox.api.close();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    showView("view-search");
    renderResults();
    if (searchListings(q).length) saveRecent(q);
  }
  function closeSearch() {
    state.search.q = "";
    clearTimeout(resultsTimer);
    clearTimeout(missTimer);
    $("homeSearch").value = "";
    homeBox.api.sync();
    showHome();
  }
  // typing on the results page updates in place after a short pause
  function onResultsType(value) {
    state.search.q = value.trim();
    state.search.tab = "all";
    clearTimeout(resultsTimer);
    $("srCount").textContent = state.search.q ? "Searching…" : "";
    resultsTimer = setTimeout(renderResults, SEARCH_DELAY);
  }
  function renderResults() {
    const S = state.search;
    const q = S.q;
    const grid = $("srGrid"), count = $("srCount"), tabs = $("srTabs"), sortWrap = $("srSortWrap");
    clearTimeout(missTimer);
    if (!state.listingsLoaded) {
      count.textContent = "Searching…";
      tabs.innerHTML = "";
      grid.innerHTML = '<div class="skeleton skel-card"></div><div class="skeleton skel-card"></div><div class="skeleton skel-card"></div>';
      return;
    }
    if (!q) {
      count.textContent = "";
      tabs.innerHTML = "";
      sortWrap.hidden = true;
      grid.innerHTML = emptyStateHtml("Search Findorah", "Type a store, hotel, car or area.", categoryChipsHtml());
      return;
    }
    const all = searchListings(q);
    const perCat = new Map();
    all.forEach((r) => perCat.set(r.l.main_category, (perCat.get(r.l.main_category) || 0) + 1));
    if (S.tab !== "all" && !perCat.has(S.tab)) S.tab = "all";
    sortWrap.hidden = !all.length;

    if (!all.length) {
      count.textContent = "";
      tabs.innerHTML = "";
      const dym = didYouMean(q);
      grid.innerHTML = `
        <div class="empty-state search-empty">
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>No results for “${escapeHtml(q)}”.</h3>
          ${dym ? `<p class="dym">Did you mean <button type="button" class="chip chip-dym" data-q="${escapeHtml(dym)}">${escapeHtml(dym)}</button>?</p>` : ""}
          <ul class="es-tips"><li>Check the spelling</li><li>Try a shorter word</li><li>Or browse a category</li></ul>
          ${categoryChipsHtml()}
        </div>`;
      missTimer = setTimeout(() => logMiss(q), 900);
      return;
    }

    count.textContent = `${all.length} result${all.length === 1 ? "" : "s"} for “${q}”`;
    const catsWith = ALL_CATS.filter((c) => perCat.has(c));
    tabs.innerHTML = catsWith.length > 1
      ? [["all", "All", all.length]].concat(catsWith.map((c) => [c, catLabel(c), perCat.get(c)]))
          .map(([k, label, n]) => `<button type="button" role="tab" class="sr-tab${S.tab === k ? " on" : ""}" data-tab="${k}" aria-selected="${S.tab === k}">${escapeHtml(label)} <em>${n}</em></button>`).join("")
      : "";
    let rows = S.tab === "all" ? all : all.filter((r) => r.l.main_category === S.tab);
    if (S.sort === "newest") rows = rows.slice().sort((a, b) => new Date(b.l.created_at) - new Date(a.l.created_at));
    grid.innerHTML = rows.map((r) => listingCardHtml(r.l)).join("");
  }
  function categoryChipsHtml() {
    return `<div class="chips">${ALL_CATS.map((c) => `<button type="button" class="chip" data-browse="${c}"><i class="fas ${CAT_META[c].icon}" aria-hidden="true"></i> ${escapeHtml(catLabel(c))}</button>`).join("")}</div>`;
  }

  /* ----------------------------------------------------------
     LISTING DETAIL VIEW
     ---------------------------------------------------------- */
  function openDetail(id) {
    const item =
      state.listings.find((l) => String(l.id) === String(id)) ||
      state.dashboardListings.find((l) => String(l.id) === String(id));
    if (!item) {
      toast("This listing could not be found.", true);
      return;
    }
    state.detail.item = item;
    if (currentViewId() !== "view-detail") {
      state.scrollBeforeDetail = window.scrollY;
      state.detailFrom = currentViewId();
    }
    trackListing(item.id, "view");
    renderDetail(item);
    showView("view-detail");
  }

  const CTA_LABEL = {
    vehicles: "WhatsApp seller", housing: "WhatsApp seller",
    accommodation: "Book on WhatsApp", restaurants: "Order on WhatsApp", stores: "Message store"
  };
  const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== "";
  const initialsOf = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
  function listedOn(item) {
    const d = item.created_at ? new Date(item.created_at) : null;
    return d && !isNaN(d) ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";
  }
  function rowsHtml(arr) {
    return `<ul class="dt-rows">${arr.map((r) => `<li><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span></li>`).join("")}</ul>`;
  }

  // Works out what to show for each kind of listing
  function detailModel(item) {
    const c = item.main_category;
    const loc = item.location || "";
    const sub = item.subcategory || "";
    const m = { subline: "", price: "", unit: "", lead: "", seller: [], facts: [], rows: [], groups: null, rooms: [], menuTitle: "" };
    const nameOrTitle = item.seller_name || item.title;
    const verified = item.verified ? "Verified" : "";
    const amen = Array.isArray(item.amenities) ? item.amenities : [];

    if (c === "vehicles") {
      m.subline = loc;
      m.price = hasVal(item.price) ? formatPrice(item.price) : "";
      m.unit = hasVal(item.price) ? "Negotiable" : "";
      m.seller = [initialsOf(nameOrTitle), nameOrTitle, "Private seller" + (listedOn(item) ? " · Listed " + listedOn(item) : ""), verified];
      // headline specs go in the facts row; the rest go in Details (nothing is shown twice)
      if (hasVal(item.year)) m.facts.push([String(item.year), "Year"]);
      if (hasVal(item.mileage)) m.facts.push([fmtMileage(item.mileage), "Mileage"]);
      if (hasVal(item.transmission)) m.facts.push([item.transmission, "Gearbox"]);
      m.rows = [["Make", item.make], ["Model", item.model], ["Fuel", item.fuel_type], ["Condition", item.condition], ["Colour", item.colour]];
    } else if (c === "housing") {
      const rent = /rent/i.test(sub);
      m.subline = [sub, loc].filter(Boolean).join(" · ");
      m.price = hasVal(item.price) ? formatPrice(item.price) : "";
      m.unit = hasVal(item.price) && rent ? "per month" : "";
      m.seller = [initialsOf(nameOrTitle), nameOrTitle, (rent ? "Landlord / agent" : "Seller / agent") + (listedOn(item) ? " · Listed " + listedOn(item) : ""), verified];
      if (hasVal(item.bedrooms)) m.facts.push([String(item.bedrooms), Number(item.bedrooms) === 1 ? "Bedroom" : "Bedrooms"]);
      if (hasVal(item.bathrooms)) m.facts.push([String(item.bathrooms), Number(item.bathrooms) === 1 ? "Bathroom" : "Bathrooms"]);
      if (sub) m.facts.push([rent ? "Rent" : "Sale", "Listing"]);
      const feats = String(item.store_tagline || "").split(/[·,;|\n]+/).map((x) => x.trim()).filter(Boolean);
      if (feats.length) m.groups = { Features: feats };
    } else if (c === "accommodation") {
      m.subline = [sub, loc].filter(Boolean).join(" · ");
      m.seller = [initialsOf(item.title), item.title, "Listed by Findorah", verified];
      const rooms = Array.isArray(item.rooms) ? item.rooms.filter((r) => r && r.name && r.price) : [];
      m.rooms = rooms;
      const lows = rooms.map((r) => Number(r.price)).filter((n) => !isNaN(n));
      const low = lows.length ? Math.min(...lows) : priceNum(item);
      if (low !== null && low !== undefined) { m.price = kMoney(low); m.unit = "per night"; m.lead = rooms.length > 1 ? "From" : ""; }
      if (hasVal(item.check_in)) m.facts.push([item.check_in, "Check-in"]);
      if (hasVal(item.check_out)) m.facts.push([item.check_out, "Check-out"]);
      const want = [["Breakfast included", "Included", "Breakfast"], ["Free Wi-Fi", "Free", "Wi-Fi"], ["Parking", "Yes", "Parking"], ["Swimming pool", "Yes", "Pool"]];
      want.forEach((w) => { if (amen.includes(w[0]) && m.facts.length < 3) m.facts.push([w[1], w[2]]); });
      m.rows = [["Highlights", item.store_tagline]];
      const G = { Facilities: ["Swimming pool", "Restaurant", "Bar", "Gym", "Conference facilities"], Services: ["Airport shuttle", "Laundry", "24h security", "Power backup", "Free Wi-Fi", "Breakfast included", "Parking"], Rooms: ["Air conditioning", "Kitchen", "Pet friendly", "Wheelchair accessible"] };
      const groups = {};
      Object.keys(G).forEach((k) => { const got = G[k].filter((a) => amen.includes(a)); if (got.length) groups[k] = got; });
      const leftover = amen.filter((a) => !Object.values(G).some((arr) => arr.includes(a)));
      if (leftover.length) groups.Other = leftover;
      if (Object.keys(groups).length) m.groups = groups;
    } else {
      // restaurants and other business listings
      m.subline = [sub, loc].filter(Boolean).join(" · ");
      if (isBiz(c) && hasVal(item.price)) { m.price = formatPrice(item.price); m.lead = BIZ[c].priceLead; }
      m.seller = [initialsOf(item.title), item.title, hasVal(item.opening_hours) ? item.opening_hours : "Listed by Findorah", verified];
      if (sub) m.facts.push([sub, "Type"]);
      m.rows = [["About", item.store_tagline], ["Hours", item.opening_hours]];
    }
    m.rows = m.rows.filter((r) => hasVal(r[1])).map((r) => [r[0], String(r[1])]);
    m.facts = m.facts.slice(0, 3);
    // a single fact doesn't deserve a box: show it in the list instead
    if (m.facts.length === 1) { m.rows.unshift([m.facts[0][1], m.facts[0][0]]); m.facts = []; }
    return m;
  }

  const mapUrl = (item) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([item.main_category === "accommodation" || isBiz(item.main_category) || item.main_category === "stores" ? item.title : "", item.location].filter(Boolean).join(" "));

  // small tiles for "Similar …" strips
  function miniTile(l) {
    const c = l.main_category;
    const price = c === "accommodation" ? (hasVal(l.price) ? "From " + formatPrice(l.price) : "") : hasVal(l.price) ? formatPrice(l.price) : "";
    return `<button type="button" class="dt-mini" onclick="window.openDetail('${String(l.id).replace(/[^\w-]/g, "")}')"><div class="im">${l.images && l.images[0] ? `<img loading="lazy" alt="" src="${escapeHtml(l.images[0])}">` : ""}</div><b>${escapeHtml(price)}</b><span>${escapeHtml(l.title)}</span>${l.location ? `<small>${escapeHtml(l.location)}</small>` : ""}</button>`;
  }
  const PLURAL = { vehicles: "vehicles", housing: "houses", accommodation: "places to stay" };
  function relatedHtml(item) {
    let out = "";
    const c = item.main_category;
    const pool = state.listings.filter((l) => l.status === "published" && String(l.id) !== String(item.id));
    let sellerList = [];
    if (c === "vehicles") {
      sellerList = pool.filter((l) => l.main_category === "vehicles" && ((item.owner_id && l.owner_id === item.owner_id) || (!item.owner_id && l.phone && l.phone === item.phone))).slice(0, 8);
      if (sellerList.length) out += `<h2 class="dt-strip-h">More from this seller</h2><div class="dt-strip">${sellerList.map(miniTile).join("")}</div>`;
    }
    if (c === "accommodation") out += similarHtml(item);
    else if (PLURAL[c]) {
      const skip = new Set(sellerList.map((l) => String(l.id)));
      const p0 = priceNum(item);
      const scored = pool.filter((l) => l.main_category === c && !skip.has(String(l.id))).map((l) => {
        let sc = 0;
        if (item.make && l.make === item.make) sc += 3;
        if (item.subcategory && l.subcategory === item.subcategory) sc += 2;
        if (item.location && l.location === item.location) sc += 2;
        const p1 = priceNum(l);
        if (p0 && p1 && Math.abs(p1 - p0) / p0 < 0.4) sc += 1;
        return { l, sc };
      }).sort((a, b) => b.sc - a.sc).slice(0, 8);
      if (scored.length) out += `<h2 class="dt-strip-h">Similar ${PLURAL[c]}</h2><div class="dt-strip">${scored.map((x) => miniTile(x.l)).join("")}</div>`;
    }
    return out;
  }

  /* ----------------------------------------------------------
     RATINGS AND REVIEWS
     Only people who contacted the business (WhatsApp or Call) at least
     a day earlier can review, once per listing. The server enforces it.
     ---------------------------------------------------------- */
  const RATING_MIN = 3; // average is shown from 3 reviews; before that "New · 1 review"
  const REVIEW_CLAMP = 180;
  function ratingSummaryHtml(item) {
    const n = +item.rating_count || 0;
    if (n >= RATING_MIN && hasVal(item.rating)) return `★ ${Number(item.rating).toFixed(1)} <span>· ${n} reviews</span>`;
    if (n > 0) return `<span class="rv-new">New</span> <span>· ${n} review${n === 1 ? "" : "s"}</span>`;
    return "";
  }
  function relTime(iso) {
    const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    if (d === 0) return "Today";
    if (d === 1) return "Yesterday";
    if (d < 7) return d + " days ago";
    if (d < 30) { const w = Math.floor(d / 7); return w + (w === 1 ? " week ago" : " weeks ago"); }
    if (d < 365) { const m = Math.floor(d / 30); return m + (m === 1 ? " month ago" : " months ago"); }
    const y = Math.floor(d / 365); return y + (y === 1 ? " year ago" : " years ago");
  }
  const starsRo = (n) => `<span class="rv-st" role="img" aria-label="${n} out of 5 stars">${"★".repeat(n)}<i>${"★".repeat(5 - n)}</i></span>`;

  function reviewHtml(r, canReply, admin) {
    const txt = r.comment ? String(r.comment) : "";
    const long = txt.length > REVIEW_CLAMP;
    return `<div class="rv-item" data-id="${escapeHtml(r.id)}">
      <div class="rv-top"><b>${escapeHtml(r.reviewer || "Guest")}</b><span class="rv-date">${relTime(r.created_at)}</span></div>
      ${starsRo(+r.rating)}
      ${txt ? `<p class="rv-text${long ? " clamp" : ""}">${escapeHtml(txt)}</p>${long ? '<button type="button" class="rv-more" data-act="more">Read more</button>' : ""}` : ""}
      ${r.contact_verified ? '<div class="rv-label"><i class="fas fa-check-circle" aria-hidden="true"></i> Contacted this business before reviewing</div>' : ""}
      ${r.owner_reply ? `<div class="rv-reply"><b>Reply from the business</b><p>${escapeHtml(r.owner_reply)}</p></div>` : ""}
      <div class="rv-acts">
        ${canReply ? `<button type="button" data-act="reply">${r.owner_reply ? "Edit reply" : "Reply"}</button>` : ""}
        <button type="button" data-act="report">Report</button>
        ${admin ? '<button type="button" data-act="remove" class="rv-rm">Remove</button>' : ""}
      </div>
      <div class="rv-replybox" hidden><textarea maxlength="300" placeholder="Write a short reply (max 300 characters)">${escapeHtml(r.owner_reply || "")}</textarea><div class="rv-rbtns"><button type="button" data-act="cancelreply">Cancel</button><button type="button" class="go" data-act="sendreply">Post reply</button></div></div>
    </div>`;
  }

  async function paintReviews(item) {
    const box = $("dtReviews");
    if (!box) return;
    const [rev, st] = await Promise.all([
      rpc("listing_reviews_for", { p_id: item.id }),
      state.user ? rpc("my_review_state", { p_id: item.id }) : Promise.resolve({ data: { state: "signin" } })
    ]);
    if (!$("dtReviews") || !state.detail.item || state.detail.item.id !== item.id) return;
    const list = rev.data || [];
    const me = (st && st.data) || { state: "signin" };
    const n = +item.rating_count || list.length;
    const isMine = state.user && item.owner_id && item.owner_id === state.user.id;
    const admin = !!state.isAdmin;
    const canReply = isMine || admin;

    let head;
    if (n >= RATING_MIN && hasVal(item.rating)) head = `<div class="rv-sum"><span class="rv-big">★ ${Number(item.rating).toFixed(1)}</span> <span>· ${n} reviews</span></div>`;
    else if (n > 0) head = `<div class="rv-sum"><span class="rv-new">New</span> <span>· ${n} review${n === 1 ? "" : "s"}</span></div>`;
    else head = '<div class="rv-sum"><b>No reviews yet</b></div>';

    const writeBtn = isMine ? "" : `<button type="button" class="go" id="rvOpen">${me.state === "edit" ? "Edit your review" : "Write a review"}</button>`;
    box.innerHTML = head + list.map((r) => reviewHtml(r, canReply, admin)).join("") +
      `<div id="rvMsg" class="rv-note" hidden></div><div id="rvFormWrap" hidden>
        <div class="rv-note">${me.state === "edit" ? "Your review (tap a star to change it)" : "How was it?"}</div>
        <div class="rv-stars" id="rvStars">${[1, 2, 3, 4, 5].map((k) => `<button type="button" data-n="${k}" aria-label="${k} star${k > 1 ? "s" : ""}" class="${me.rating >= k ? "on" : ""}">★</button>`).join("")}</div>
        <textarea id="rvText" maxlength="600" placeholder="Share a few words about your experience (optional)"></textarea>
        <button type="button" class="go" id="rvSend" disabled>${me.state === "edit" ? "Save review" : "Post review"}</button>
      </div>${writeBtn}`;
    if ($("rvText") && me.comment) $("rvText").value = me.comment;

    let pick = me.state === "edit" ? +me.rating : 0;
    const say = (t) => { $("rvMsg").textContent = t; $("rvMsg").hidden = !t; };
    if ($("rvOpen")) $("rvOpen").onclick = () => {
      if (me.state === "signin") return openAuthModal();
      if (me.state === "contact_first") return say("To keep reviews honest, you can review after you contact this business on WhatsApp or by phone. Reviews open a day after you contact them.");
      if (me.state === "wait") return say("Thanks for getting in touch. You can review from " + new Date(me.eligible_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }) + ".");
      if (me.state === "owner") return say("You can’t review your own listing.");
      say("");
      $("rvFormWrap").hidden = false;
      $("rvOpen").hidden = true;
      $("rvFormWrap").scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    if ($("rvStars")) $("rvStars").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      pick = +b.dataset.n;
      Array.from($("rvStars").children).forEach((x) => x.classList.toggle("on", +x.dataset.n <= pick));
      $("rvSend").disabled = false;
    };
    if (me.state === "edit") $("rvSend").disabled = false;
    $("rvSend").onclick = async () => {
      $("rvSend").disabled = true;
      const { data, error } = await rpc("rate_listing", { p_id: item.id, p_rating: pick, p_comment: $("rvText").value });
      if (error) { $("rvSend").disabled = false; toast(error.message || "Couldn't save your review.", true); return; }
      item.rating = data.rating; item.rating_count = data.count;
      toast("Thanks for your review");
      renderDetail(item);
    };

    // actions on a single review
    box.onclick = async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const card = b.closest(".rv-item");
      if (!card) return;
      const id = card.dataset.id;
      const r = list.find((x) => String(x.id) === id);
      const act = b.dataset.act;
      if (act === "more") { const t = card.querySelector(".rv-text"); const open = t.classList.toggle("clamp"); b.textContent = open ? "Read more" : "Show less"; }
      else if (act === "reply") { const rb = card.querySelector(".rv-replybox"); rb.hidden = !rb.hidden; }
      else if (act === "cancelreply") card.querySelector(".rv-replybox").hidden = true;
      else if (act === "sendreply") {
        const txt = card.querySelector(".rv-replybox textarea").value;
        b.disabled = true;
        const { error } = await rpc("reply_to_review", { p_review_id: id, p_reply: txt });
        if (error) { b.disabled = false; toast(error.message || "Couldn't post the reply.", true); return; }
        toast(txt.trim() ? "Reply posted" : "Reply removed");
        paintReviews(item);
      }
      else if (act === "report") {
        if (!r) return;
        openReportModal({ reviewId: id, who: r.reviewer, snippet: r.comment || (r.rating + " stars") });
      }
      else if (act === "remove") {
        if (!window.confirm("Remove this review? This can’t be undone.")) return;
        const { data, error } = await rpc("admin_delete_review", { p_review_id: id });
        if (error) { toast(error.message || "Couldn't remove the review.", true); return; }
        item.rating = data.rating; item.rating_count = data.count;
        toast("Review removed");
        renderDetail(item);
      }
    };
  }

  /* ----------------------------------------------------------
     SIMILAR LISTINGS (restaurants, stores, accommodation)
     ---------------------------------------------------------- */
  // stores: "Similar stores" only lists stores selling the same kind of thing (e.g. Electronics)
  const normType = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sameType = (a, b) => !!normType(a.subcategory) && normType(a.subcategory) === normType(b.subcategory);
  function similarHtml(item) {
    const c = item.main_category;
    if (!SIMILAR_CATS.includes(c)) return "";
    const type = c === "accommodation" ? (state.accommodationTypes.find((t) => t.key === item.subcategory) || null) : null;
    const p0 = priceNum(item);
    const pool = state.listings.filter((l) =>
      l.status === "published" && String(l.id) !== String(item.id) && l.main_category === c &&
      (c !== "accommodation" || !type || l.subcategory === item.subcategory) &&
      (c !== "stores" || sameType(l, item)));
    if (!pool.length) return "";
    const scored = pool.map((l) => {
      let sc = 0;
      if (item.subcategory && l.subcategory === item.subcategory) sc += 3;
      if (item.location && l.location === item.location) sc += 2;
      const p1 = priceNum(l);
      if (p0 && p1 && Math.abs(p1 - p0) / p0 < 0.4) sc += 1;
      return { l, sc, r: Math.random() };
    }).sort((a, b) => b.sc - a.sc || a.r - b.r).slice(0, 8);
    const noun = c === "restaurants" ? "restaurants" : c === "stores" ? "stores" : type ? type.label.toLowerCase() : "places to stay";
    return `<h2 class="dt-strip-h">Similar ${noun}</h2><div class="dt-strip">${scored.map((x) => miniTile(x.l)).join("")}</div>`;
  }

  function aboutNoun(item) {
    const c = item.main_category;
    const sub = String(item.subcategory || "").toLowerCase();
    if (c === "vehicles") return "vehicle";
    if (c === "housing") return /apartment/.test(sub) ? "apartment" : "house";
    if (c === "accommodation") return sub || "place";
    if (c === "stores") return "store";
    if (c === "restaurants") return "restaurant";
    return "listing";
  }

  function renderDetail(item) {
    if (usesProducts(item.main_category)) { renderCatalog(item); return; }
    const m = detailModel(item);
    const images = item.images && item.images.length ? item.images : [];
    const labels = item.main_category === "accommodation" && Array.isArray(item.photo_labels) ? item.photo_labels : [];
    const isStay = item.main_category === "accommodation";
    let out = "";

    // photos (swipe strip with dots; accommodation photos are labelled by area)
    out += `<div class="dt-gal">`;
    out += images.length
      ? `<div class="dt-track" id="dtTrack">${images.map((src, i) => `<button type="button" data-i="${i}" aria-label="Open photo ${i + 1}"><img alt="${escapeHtml(labels[i] || "Photo " + (i + 1))}" src="${escapeHtml(src)}"></button>`).join("")}</div>
         ${labels[0] ? `<div class="dt-aoi" id="dtAoi">${escapeHtml(labels[0])}</div>` : ""}
         <div class="dt-count" id="dtCount">1 / ${images.length}</div>${images.length > 1 ? '<button type="button" class="dt-all" id="dtAll">View all photos</button>' : ""}
         ${images.length > 1 ? `<div class="dt-dots" id="dtDots">${images.slice(0, 10).map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>` : ""}`
      : `<div class="dt-nophoto">No photos available</div>`;
    out += `</div>`;

    out += `<h1>${escapeHtml(item.title)}</h1>`;
    if (m.subline) out += `<p class="dt-sub">${escapeHtml(m.subline)}</p>`;
    out += statsRowHtml(item);
    if (item.location) out += `<a class="dt-map" href="${mapUrl(item)}" target="_blank" rel="noopener">${isStay ? "Open in Maps" : "Get directions"}</a>`;
    if (isStay) {
      const sm = ratingSummaryHtml(item);
      if (sm) out += `<p class="dt-rate">${sm}</p>`;
    }
    if (m.price) out += `<p class="dt-price">${m.lead ? `<small>${escapeHtml(m.lead)}</small> ` : ""}${escapeHtml(m.price)} ${m.unit ? `<small>${escapeHtml(m.unit)}</small>` : ""}</p>`;

    const sl = m.seller;
    out += `<div class="dt-seller"><div class="dt-av">${escapeHtml(sl[0])}</div><div><b>${escapeHtml(sl[1])}</b><span>${escapeHtml(sl[2])}</span>${sl[3] ? ` <span class="dt-ok">· ${escapeHtml(sl[3])}</span>` : ""}</div></div>`;

    if (m.facts.length) {
      out += `<div class="dt-facts" style="grid-template-columns:repeat(${m.facts.length},1fr)">${m.facts.map((f) => `<div><b>${escapeHtml(f[0])}</b><span>${escapeHtml(f[1])}</span></div>`).join("")}</div>`;
    }

    // accommodation: room types and rates
    if (m.rooms.length) {
      out += `<h2>Rooms and rates</h2>` + m.rooms.map((r) => `<div class="dt-room"><div class="r1"><span>${escapeHtml(r.name)}</span><span>${escapeHtml(kMoney(Number(r.price)))} <small style="font-weight:500;color:var(--text-muted)">/night</small></span></div>${hasVal(r.includes) ? `<div class="r2">${escapeHtml(r.includes)}</div>` : ""}</div>`).join("");
    }
    const featTitle = isStay ? "Facilities and services" : item.main_category === "vehicles" ? "Extras" : "Features";
    if (isStay && m.groups) out += `<h2>${featTitle}</h2><div id="dtFeat"></div><button type="button" class="dt-more" id="dtFeatBtn"></button>`;

    if (m.rows.length) out += `<h2>Details</h2>${rowsHtml(m.rows)}`;

    const desc = item.description || "";
    out += `<h2>About this ${escapeHtml(aboutNoun(item))}</h2><p class="dt-about dt-clamp" id="dtDesc">${escapeHtml(desc || "No description provided.")}</p>`;
    out += `<button type="button" class="dt-link" id="dtDescBtn" style="display:none;">Show more</button>`;

    if (isStay) out += `<h2>Ratings and reviews</h2><div id="dtReviews" class="rv-form"></div>`;
    if (!isStay && m.groups) out += `<h2>${featTitle}</h2><div id="dtFeat"></div><button type="button" class="dt-more" id="dtFeatBtn"></button>`;

    out += relatedHtml(item);
    if (item.main_category === "vehicles") out += `<p class="dt-note"><b>Safety tips:</b> Meet in a public place, check the car before paying, and never send money in advance.</p>`;

    $("detailMain").innerHTML = out;

    // photo strip: dots, area label, counter, open the photo gallery
    const tr = $("dtTrack");
    if (tr) {
      tr.onclick = (e) => { const b = e.target.closest("button"); if (b) openLightbox(images, +b.dataset.i, labels); };
      tr.onscroll = () => {
        const n = Math.min(images.length - 1, Math.max(0, Math.round(tr.scrollLeft / (tr.clientWidth || 1))));
        $("dtCount").textContent = n + 1 + " / " + images.length;
        if ($("dtAoi")) $("dtAoi").textContent = labels[n] || "";
        if ($("dtDots")) Array.from($("dtDots").children).forEach((d, i) => d.classList.toggle("on", i === n));
      };
    }
    if ($("dtAll")) $("dtAll").onclick = () => openLightbox(images, 0, labels);
    const descEl = $("dtDesc"), descBtn = $("dtDescBtn");
    if (descEl && descBtn) {
      requestAnimationFrame(() => {
        if (descEl.scrollHeight > descEl.clientHeight + 2) descBtn.style.display = "";
      });
      descBtn.onclick = function () {
        const clamped = descEl.classList.toggle("dt-clamp");
        this.textContent = clamped ? "Show more" : "Show less";
      };
    }
    if (isStay) paintReviews(item);
    // facilities: only what the place has, as check-mark rows, grouped; "See all" when long
    if (m.groups) {
      const keys = Object.keys(m.groups);
      const total = keys.reduce((n, k) => n + m.groups[k].length, 0);
      const LIMIT = 6;
      let full = total <= LIMIT;
      const paint = () => {
        let left = full ? Infinity : LIMIT;
        $("dtFeat").innerHTML = keys.map((g) => {
          const take = m.groups[g].slice(0, left === Infinity ? undefined : left);
          if (!take.length) return "";
          if (left !== Infinity) left -= take.length;
          return `<div class="dt-group">${keys.length > 1 || g !== "Features" ? `<h3>${escapeHtml(g)}</h3>` : ""}<ul class="dt-ticks">${take.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`;
        }).join("");
        $("dtFeatBtn").textContent = full ? "Show fewer" : `See all ${total}`;
        $("dtFeatBtn").style.display = total > LIMIT ? "block" : "none";
      };
      $("dtFeatBtn").onclick = () => { full = !full; paint(); };
      paint();
    }

    // contact bar
    setupContactLinks(item, "detailWhatsappBtn", "detailCallBtn");
    $("detailWhatsappBtn").textContent = CTA_LABEL[item.main_category] || "WhatsApp";
    const hasPhone = hasVal(item.phone);
    $("detailWhatsappBtn").onclick = () => trackContact(item.id);
    $("detailCallBtn").onclick = () => trackContact(item.id);
    $("detailWhatsappBtn").classList.toggle("off", !hasPhone);
    $("detailCallBtn").classList.toggle("off", !hasPhone);
  }

  /* ---- Photo gallery page: all photos in one scrolling list (1 wide, 2 side by side, repeat) ---- */
  function openLightbox(arr, startIndex, labels) {
    const grid = $("pgGrid");
    const hasLabels = Array.isArray(labels) && labels.some(Boolean);
    const tile = (src, i, local, count) => {
      const full = local % 3 === 0 || (local === count - 1 && local % 3 === 1); // never leave a lonely half-width photo
      return `<img class="pg-item${full ? " full" : ""}" data-i="${i}" alt="Photo ${i + 1} of ${arr.length}" src="${escapeHtml(src)}">`;
    };
    if (hasLabels) {
      const order = [];
      arr.forEach((src, i) => { const g = (labels[i] || "Other photos"); let o = order.find((x) => x.g === g); if (!o) order.push((o = { g, idx: [] })); o.idx.push(i); });
      grid.innerHTML = order.map((o) => `<div class="dt-gh">${escapeHtml(o.g)} · ${o.idx.length}</div>` + o.idx.map((i, local) => tile(arr[i], i, local, o.idx.length)).join("")).join("");
    } else {
      grid.innerHTML = arr.map((src, i) => tile(src, i, i, arr.length)).join("");
    }
    $("photoGallery").classList.add("open");
    document.body.style.overflow = "hidden";
    const scroller = $("pgScroll");
    scroller.scrollTop = 0;
    const target = grid.querySelector(`[data-i="${startIndex}"]`);
    if (target) scroller.scrollTop = Math.max(0, target.offsetTop - 12);
    GAL.arr = arr;
  }

  /* ---- single photo viewer (tap a photo in the Photo gallery) ---- */
  const GAL = { arr: [] };
  function pvUpdate() {
    const t = $("pvTrack");
    const n = GAL.arr.length;
    const i = Math.min(n - 1, Math.max(0, Math.round(t.scrollLeft / (t.clientWidth || 1))));
    $("pvCount").textContent = `${i + 1} of ${n}`;
  }
  function openPhotoViewer(i) {
    const arr = GAL.arr;
    if (!arr.length) return;
    const t = $("pvTrack");
    t.innerHTML = arr
      .map((src, n) => `<div class="pv-slide"><img alt="Photo ${n + 1} of ${arr.length}" src="${escapeHtml(src)}"></div>`)
      .join("");
    $("photoViewer").classList.add("open");
    t.scrollLeft = i * t.clientWidth;
    pvUpdate();
  }
  function closePhotoViewer() {
    $("photoViewer").classList.remove("open");
  }
  function closeLightbox() {
    $("photoViewer").classList.remove("open");
    $("photoGallery").classList.remove("open");
    document.body.style.overflow = "";
  }
  function setupLightbox() {
    $("pgClose").onclick = closeLightbox;
    $("pgGrid").addEventListener("click", (e) => {
      const img = e.target.closest(".pg-item");
      if (img) openPhotoViewer(+img.dataset.i);
    });
    $("pvBack").onclick = closePhotoViewer;
    $("pvTrack").addEventListener("scroll", pvUpdate, { passive: true });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("photoViewer").classList.contains("open")) closePhotoViewer();
        else if ($("photoGallery").classList.contains("open")) closeLightbox();
      }
    });
  }

  function getProducts(item) {
    if (Array.isArray(item.products) && item.products.length) return item.products;
    return (item.images || []).slice(1).map((u) => ({ image: u, name: "", price: "" }));
  }

  // ---- opening hours -> "Open now · closes 17:00" (Zambia time) ----
  function parseHours(str) {
    const t = String(str || "");
    const tok = "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?";
    const m = t.match(new RegExp(tok + "\\s*(?:–|-|—|to)\\s*" + tok, "i"));
    if (!m) return null;
    const toMin = (h, mi, ap) => {
      let hh = +h;
      if (ap) { ap = ap.toLowerCase(); if (ap === "pm" && hh < 12) hh += 12; if (ap === "am" && hh === 12) hh = 0; }
      return hh * 60 + (mi ? +mi : 0);
    };
    const open = toMin(m[1], m[2], m[3]);
    const close = toMin(m[4], m[5], m[6]);
    const D = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
    let from = 1, to = 7;
    const dm = t.match(/(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*(?:–|-|—|to)\s*(mon|tue|wed|thu|fri|sat|sun)/i);
    if (dm && !/daily|every day|7 days/i.test(t)) { from = D[dm[1].toLowerCase()]; to = D[dm[2].toLowerCase()]; }
    return { open, close, from, to };
  }
  const hhmm = (mins) => String(Math.floor(mins / 60) % 24).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
  function openStatus(item) {
    const p = parseHours(item.opening_hours);
    if (!p) return null;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lusaka", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => (parts.find((x) => x.type === t) || {}).value;
    const day = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[g("weekday")] || 1;
    const now = (+g("hour") % 24) * 60 + +g("minute");
    const inDays = p.from <= p.to ? day >= p.from && day <= p.to : day >= p.from || day <= p.to;
    const within = p.close > p.open ? now >= p.open && now < p.close : now >= p.open || now < p.close;
    const open = inDays && within;
    return { open, opens: hhmm(p.open), closes: hhmm(p.close) };
  }
  const priceOrNone = (v) => (hasVal(v) && Number(String(v).replace(/[^\d.]/g, "")) !== 0 ? formatPrice(v) : "");

  // ---- store / restaurant catalog page ----
  const CT = { shown: 6, items: [], item: null };
  function catalogItems(item) {
    const imgs = item.images || [];
    let prods = Array.isArray(item.products) && item.products.length ? item.products : imgs.slice(1).map((u) => ({ image: u, name: "", price: "" }));
    // the first photo is the cover and the logo is the round avatar: neither is an item
    // (older listings only; products saved with their own photos are always items)
    return prods
      .filter((p) => p.image && p.image !== item.logo && (Array.isArray(p.photos) || !(p.image === imgs[0] && !hasVal(p.name) && !hasVal(p.price))))
      .map((p) => {
        const photos = (Array.isArray(p.photos) && p.photos.length ? p.photos : [p.image]).filter(Boolean);
        return Object.assign({}, p, { photos, image: photos[0] });
      });
  }
  function renderCatalog(item) {
    const isRest = item.main_category === "restaurants";
    const st = openStatus(item);
    const items = catalogItems(item);
    CT.item = item; CT.items = items; CT.shown = 6;
    const area = item.location || "";
    const subline = st
      ? `<span class="${st.open ? "ct-ok" : ""}">${st.open ? "Open now" : "Closed"}</span> · ${st.open ? "closes " + st.closes : "opens " + st.opens}${area ? " · " + escapeHtml(area) : ""}`
      : [item.opening_hours, area].filter(Boolean).map(escapeHtml).join(" · ");
    const del = String(item.delivery || "").trim();
    const delVal = !del ? "" : /^no\b/i.test(del) ? "No" : /^(yes|y)\b/i.test(del) ? "Yes" : del.length <= 10 ? del : "Yes";
    const facts = [];
    if (item.subcategory) facts.push([item.subcategory, "Type"]);
    if (delVal) facts.push([delVal, "Delivery"]);
    if (isRest && st) facts.push([st.opens, "Opens"]);
    else if (items.length) facts.push([String(items.length), isRest ? "Menu items" : "Products"]);
    const rows = [[isRest ? "Cuisine" : "About", item.store_tagline], ["Hours", item.opening_hours], ["Delivery", del && delVal !== del ? del : ""]]
      .filter((r) => hasVal(r[1])).map((r) => [r[0], String(r[1])]);
    // a single fact doesn't deserve a box
    if (facts.length === 1) { rows.unshift([facts[0][1], facts[0][0]]); facts.length = 0; }
    const heading = isRest ? "Menu" : "Products";
    const avatar = item.logo ? `<img alt="${escapeHtml(item.title)} logo" src="${escapeHtml(item.logo)}">` : escapeHtml(initialsOf(item.title));
    let out = `<div class="ct-store"><div class="ct-av">${avatar}</div><div><h1>${escapeHtml(item.title)}</h1><div class="ct-sub">${subline}</div>${area ? `<a class="dt-map" href="${mapUrl(item)}" target="_blank" rel="noopener">Get directions</a>` : ""}</div></div>`;
    out += statsRowHtml(item);
    if (facts.length) out += `<div class="dt-facts" style="grid-template-columns:repeat(${facts.length},1fr)">${facts.slice(0, 3).map((f) => `<div><b>${escapeHtml(f[0])}</b><span>${escapeHtml(f[1])}</span></div>`).join("")}</div>`;
    if (items.length) out += `<div class="ct-hd"><h2>${heading}</h2><span class="ct-sub">${items.length} item${items.length === 1 ? "" : "s"}</span></div><div class="ct-grid${isRest ? "" : " ct-shop"}" id="ctGrid"></div><button type="button" class="ct-more" id="ctMore"></button>`;
    if (rows.length) out += `<h2>Details</h2>${rowsHtml(rows)}`;
    const desc = item.description || "";
    if (desc) {
      out += `<h2>About this ${escapeHtml(aboutNoun(item))}</h2><p class="dt-about dt-clamp" id="dtDesc">${escapeHtml(desc)}</p><button type="button" class="dt-link" id="dtDescBtn" style="display:none;">Show more</button>`;
    }
    out += similarHtml(item);
    $("detailMain").innerHTML = out;
    paintCatalog();
    if ($("ctMore")) $("ctMore").onclick = () => { CT.shown += 12; paintCatalog(); };
    const descEl = $("dtDesc"), descBtn = $("dtDescBtn");
    if (descEl && descBtn) {
      requestAnimationFrame(() => { if (descEl.scrollHeight > descEl.clientHeight + 2) descBtn.style.display = ""; });
      descBtn.onclick = function () {
        const clamped = descEl.classList.toggle("dt-clamp");
        this.textContent = clamped ? "Show more" : "Show less";
      };
    }
    // contact bar
    const links = contactLinks(item);
    const msg = `Hi, I found ${item.title} on Findorah.`;
    const phone = (item.phone || "").replace(/[^\d+]/g, "");
    $("detailCallBtn").href = phone ? `tel:${phone}` : "#";
    $("detailWhatsappBtn").href = phone ? `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}` : "#";
    $("detailWhatsappBtn").textContent = isRest ? "Order on WhatsApp" : "Message store";
    $("detailWhatsappBtn").onclick = () => trackContact(item.id);
    $("detailCallBtn").onclick = () => trackContact(item.id);
    $("detailWhatsappBtn").classList.toggle("off", !links.ok);
    $("detailCallBtn").classList.toggle("off", !links.ok);
  }
  function paintCatalog() {
    const grid = $("ctGrid");
    if (!grid) return;
    const list = CT.items.slice(0, CT.shown);
    const shop = CT.item && CT.item.main_category !== "restaurants";
    grid.innerHTML = list
      .map((it, i) => {
        const pr = priceOrNone(it.price);
        const n = it.photos.length;
        const badge = n > 1 ? `<span class="ct-badge"><i class="fas fa-images" aria-hidden="true"></i>${n} photos</span>` : "";
        return `<button type="button" class="ct-card" onclick="window.openProduct(${i})"><div class="im"><img alt="${escapeHtml(it.name || CT.item.title)}" loading="lazy" src="${escapeHtml(it.image)}">${badge}</div>${shop ? `<div class="ct-row"><div class="n">${escapeHtml(it.name || "")}</div>${pr ? `<div class="ct-p">${escapeHtml(pr)}</div>` : `<div class="ct-p none">On request</div>`}</div>` : `<div class="n">${escapeHtml(it.name || "")}</div>${pr ? `<div class="ct-p">${escapeHtml(pr)}</div>` : `<div class="ct-p none">Price on request</div>`}`}</button>`;
      })
      .join("");
    const more = $("ctMore");
    if (more) {
      const left = CT.items.length - CT.shown;
      more.style.display = left > 0 ? "block" : "none";
      more.textContent = `Show more (${left})`;
    }
  }

  // ---- product detail page (full screen): swipe the photos, jump to other products from the strip ----
  const PM = { idx: 0 };
  function paintProduct() {
    const item = CT.item;
    const it = CT.items[PM.idx];
    if (!it) return;
    const isRest = item.main_category === "restaurants";
    const pr = priceOrNone(it.price);
    const name = it.name || (isRest ? "Menu item " : "Item ") + (PM.idx + 1);
    // photos
    $("pdSl").innerHTML = it.photos.map((u) => `<div><img alt="${escapeHtml(name)}" src="${escapeHtml(u)}"></div>`).join("");
    $("pdSl").scrollLeft = 0;
    $("pdDots").innerHTML = it.photos.length > 1 ? it.photos.map((_, n) => `<span${n === 0 ? ' class="on"' : ""}></span>`).join("") : "";
    // title, price, store line
    $("pdName").textContent = name;
    $("pdPrice").className = "pd-price" + (pr ? "" : " none");
    $("pdPrice").textContent = pr || "Price on request";
    $("pdBarPrice").className = "bp" + (pr ? "" : " none");
    $("pdBarPrice").textContent = pr || "On request";
    const st = openStatus(item);
    $("pdStore").innerHTML = [
      `<button type="button" onclick="window.closeProduct()">${escapeHtml(item.title)}</button>`,
      item.location ? escapeHtml(item.location) : "",
      st ? (st.open ? '<span class="ok">Open now</span>' : "Closed") : ""
    ].filter(Boolean).join(" · ");
    // chips: "New, Size M, Ages 3–5"
    $("pdChips").innerHTML = String(it.details || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6).map((t) => `<span class="pd-chip">${escapeHtml(t)}</span>`).join("");
    // more from this store
    const others = CT.items.map((x, n) => ({ x, n })).filter((o) => o.n !== PM.idx).slice(0, 12);
    $("pdMoreWrap").style.display = others.length ? "" : "none";
    $("pdStrip").innerHTML = others.map(({ x, n }) => {
      const p2 = priceOrNone(x.price);
      return `<button type="button" class="pd-card" onclick="window.openProduct(${n})"><div class="img"><img alt="" loading="lazy" src="${escapeHtml(x.image)}"></div><div class="t">${escapeHtml(x.name || "")}</div>${p2 ? `<div class="p">${escapeHtml(p2)}</div>` : '<div class="p none">Price on request</div>'}</button>`;
    }).join("");
    // contact
    const phone = (item.phone || "").replace(/[^\d+]/g, "");
    const url = location.origin + "/?protocol=" + encodeURIComponent("web+findorah:listing/" + item.id);
    const msg = `Hi, I'm interested in ${it.name || "an item"}${pr ? " (" + pr + ")" : ""} on Findorah: ${url}`;
    $("pdWa").href = phone ? `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}` : "#";
    $("pdWa").textContent = isRest ? "Order on WhatsApp" : "Ask on WhatsApp";
    $("pdCall").href = phone ? `tel:${phone}` : "#";
    $("pdWa").classList.toggle("off", !phone);
    $("pdCall").classList.toggle("off", !phone);
    $("pdWa").onclick = () => trackContact(item.id);
    $("pdCall").onclick = () => trackContact(item.id);
    $("pdScroll").scrollTop = 0;
  }
  function openProduct(i) {
    const item = state.detail.item;
    if (!item || !CT.items[i]) return;
    PM.idx = i;
    paintProduct();
    $("productModal").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeProduct() {
    const m = $("productModal");
    if (m) m.classList.remove("open");
    document.body.style.overflow = "";
  }
  function setupProductSheet() {
    $("pdSl").addEventListener("scroll", function () {
      const n = Math.round(this.scrollLeft / (this.clientWidth || 1));
      Array.from($("pdDots").children).forEach((d, k) => d.classList.toggle("on", k === n));
    }, { passive: true });
    $("pdSeeAll").onclick = () => {
      closeProduct();
      requestAnimationFrame(() => { const g = $("ctGrid"); if (g) g.scrollIntoView({ block: "start" }); });
    };
    $("pdShare").onclick = () => {
      const item = CT.item, it = CT.items[PM.idx];
      if (!item || !it) return;
      const data = {
        title: `${it.name || "Item"} – ${item.title}`,
        text: `Check out ${it.name || "this item"} at ${item.title} on Findorah`,
        url: location.origin + "/?protocol=" + encodeURIComponent("web+findorah:listing/" + item.id)
      };
      if (navigator.share) navigator.share(data).catch(() => {});
      else if (navigator.clipboard) { navigator.clipboard.writeText(data.url); toast("Link copied to clipboard"); }
    };
  }

  // WhatsApp needs the international format. Local Zambian numbers (0977…) become 260977…
  function waNumber(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "260" + d.slice(1);
    return d;
  }

  function setupContactLinks(item, waId, callId) {
    const phone = (item.phone || "").replace(/[^\d+]/g, "");
    const waBtn = $(waId);
    const callBtn = $(callId);
    if (waBtn) {
      const msg = encodeURIComponent(`Hi, I'm interested in your listing "${item.title}" on Findorah.`);
      waBtn.href = phone ? `https://wa.me/${waNumber(phone)}?text=${msg}` : "#";
    }
    if (callBtn) {
      callBtn.href = phone ? `tel:${phone}` : "#";
    }
  }

  function goBackFromDetail() {
    if (state.detailFrom === "view-dashboard") {
      state.detailFrom = null;
      showView("view-dashboard");
      return;
    }
    if (state.detailFrom === "view-search" && state.search.q) {
      state.detailFrom = null;
      showView("view-search");
    } else {
      showHome();
    }
    const y = state.scrollBeforeDetail || 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  function shareListing() {
    const item = state.detail.item;
    if (!item) return;
    const shareData = {
      title: item.title,
      text: `Check out "${item.title}" on Findorah`,
      url: location.origin + "/?protocol=" + encodeURIComponent("web+findorah:listing/" + item.id)
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareData.url);
      toast("Link copied to clipboard");
    }
  }

  /* ----------------------------------------------------------
     REPORT MODAL
     ---------------------------------------------------------- */
  const LISTING_REASONS = ["Fake listing / Scam", "Wrong price listed", "Item no longer available", "Inappropriate photos", "Misleading description", "Duplicate listing", "Other"];
  const REVIEW_REASONS = ["Fake or not a real customer", "Abusive or offensive", "Spam or advertising", "Not about this place", "Other"];
  function openReportModal(ctx) {
    state.reportCtx = ctx && ctx.reviewId ? ctx : null;
    const rev = !!state.reportCtx;
    $("reportTitle").textContent = rev ? "🚩 Report this review" : "🚩 Report this Listing";
    $("reportReason").innerHTML = '<option value="">Select a reason…</option>' + (rev ? REVIEW_REASONS : LISTING_REASONS).map((r) => `<option>${r}</option>`).join("");
    $("reportReason").value = "";
    $("reportDetails").value = "";
    $("reportModal").style.display = "flex";
    setOverlay(true);
  }
  function closeReportModal() {
    $("reportModal").style.display = "none";
    setOverlay(false);
  }

  async function submitReport() {
    const reason = $("reportReason").value;
    if (!reason) {
      toast("Please select a reason.", true);
      return;
    }
    const item = state.detail.item;
    const rc = state.reportCtx;
    let details = $("reportDetails").value.trim();
    if (rc) details = (`Review by ${rc.who || "a guest"}: "${String(rc.snippet || "").slice(0, 200)}"` + (details ? " | " + details : "")).slice(0, 1900);
    const payload = {
      listing_id: item ? item.id : null,
      listing_title: item ? item.title : null,
      reason: rc ? "Review: " + reason : reason,
      details,
      created_at: new Date().toISOString()
    };
    if (rc) payload.review_id = rc.reviewId;
    try {
      if (supabase) {
        const { error } = await supabase.from("reports").insert(payload);
        if (error) throw error;
      }
      toast(state.reportCtx ? "Review reported. Thank you." : "Report submitted. Thank you for keeping Findorah safe.");
      closeReportModal();
    } catch (e) {
      console.error(e);
      toast("Could not submit report. Try again.", true);
    }
  }

  /* ----------------------------------------------------------
     AUTH MODAL
     ---------------------------------------------------------- */
  function openAuthModal() {
    $("authModal").style.display = "flex";
    setOverlay(true);
    switchAuthTab("login");
  }
  function closeAuthModal() {
    $("authModal").style.display = "none";
    setOverlay(false);
  }

  function switchAuthTab(tab) {
    const isLogin = tab === "login";
    $("tabLogin").classList.toggle("active", isLogin);
    $("tabSignup").classList.toggle("active", !isLogin);
    $("authTabs").style.display = "";
    $("authPanelReset").style.display = "none";
    $("authPanelLogin").style.display = isLogin ? "" : "none";
    $("authPanelSignup").style.display = isLogin ? "none" : "";
    $("authLoginError").style.display = "none";
    $("authSignupError").style.display = "none";
  }

  function togglePwd(inputId, btnEl) {
    const input = $(inputId);
    const icon = btnEl.querySelector("i");
    if (input.type === "password") {
      input.type = "text";
      icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
      input.type = "password";
      icon.classList.replace("fa-eye-slash", "fa-eye");
    }
  }

  function setBtnLoading(btnTextId, spinnerId, loading) {
    $(spinnerId).style.display = loading ? "inline-block" : "none";
  }

  async function handleLogin() {
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const errEl = $("authLoginError");
    errEl.style.display = "none";

    if (!email || !password) {
      errEl.textContent = "Please enter your email and password.";
      errEl.style.display = "";
      return;
    }

    setBtnLoading("loginBtnText", "loginSpinner", true);
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        state.user = data.user;
      } else {
        state.user = { email };
      }
      onAuthSuccess();
      closeAuthModal();
      toast("Welcome back!");
    } catch (e) {
      errEl.textContent = e.message || "Login failed. Check your credentials.";
      errEl.style.display = "";
    } finally {
      setBtnLoading("loginBtnText", "loginSpinner", false);
    }
  }

  async function handleSignup() {
    const name = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    const errEl = $("authSignupError");
    errEl.style.display = "none";

    if (!name || !email || !password) {
      errEl.textContent = "Please fill in all fields.";
      errEl.style.display = "";
      return;
    }
    if (password.length < 6) {
      errEl.textContent = "Password must be at least 6 characters.";
      errEl.style.display = "";
      return;
    }

    setBtnLoading("signupBtnText", "signupSpinner", true);
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });
        if (error) throw error;
        state.user = data.user;
      } else {
        state.user = { email, name };
      }
      onAuthSuccess();
      closeAuthModal();
      toast("Account created. Welcome to Findorah!");
    } catch (e) {
      errEl.textContent = e.message || "Could not create account.";
      errEl.style.display = "";
    } finally {
      setBtnLoading("signupBtnText", "signupSpinner", false);
    }
  }

  async function handleForgotPassword() {
    const email = $("loginEmail").value.trim();
    if (!email) {
      toast("Enter your email above first.", true);
      return;
    }
    try {
      if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" });
        if (error) throw error;
      }
      toast("Reset link sent to " + email + ". Check your inbox and spam folder.");
    } catch (e) {
      toast(e.message || "Could not send reset link.", true);
    }
  }

  // Opened when the person arrives from the password-reset email
  function openResetPanel() {
    $("authModal").style.display = "flex";
    setOverlay(true);
    $("authTabs").style.display = "none";
    $("authPanelLogin").style.display = "none";
    $("authPanelSignup").style.display = "none";
    $("authPanelReset").style.display = "";
    $("authResetError").style.display = "none";
  }

  async function handleResetPassword() {
    const pw = $("resetPassword").value;
    const errEl = $("authResetError");
    errEl.style.display = "none";
    if (pw.length < 6) {
      errEl.textContent = "Password must be at least 6 characters.";
      errEl.style.display = "";
      return;
    }
    setBtnLoading("resetBtnText", "resetSpinner", true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      if (data && data.user) state.user = data.user;
      $("resetPassword").value = "";
      history.replaceState(null, "", location.pathname);
      closeAuthModal();
      toast("Password updated. You're logged in.");
      await onAuthSuccess();
    } catch (e) {
      errEl.textContent = e.message || "Could not update password. Request a new reset link.";
      errEl.style.display = "";
    } finally {
      setBtnLoading("resetBtnText", "resetSpinner", false);
    }
  }

  async function checkAdmin() {
    state.isAdmin = false;
    try {
      if (supabase && state.user && state.user.id) {
        const { data, error } = await supabase
          .from("admins")
          .select("user_id")
          .eq("user_id", state.user.id)
          .maybeSingle();
        state.isAdmin = !error && !!data;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  async function onAuthSuccess() {
    await checkAdmin();
    renderAuthNav();
    loadSummary();
    loadSaved();
    if (state.pendingDraft) {
      const d = state.pendingDraft;
      state.pendingDraft = null;
      closeAuthModal();
      startListingDraft(d);
    }
  }

  function renderAuthNav() {
    const navContainer = $("authNavContainer");
    const headerBtn = $("headerAuthBtn");
    if (state.user) {
      navContainer.innerHTML = `
        <button class="drawer-btn" onclick="window.showDashboard(); window.closeNav();">
          <i class="fas fa-th-large"></i> ${state.isAdmin ? "Dashboard" : "My Dashboard"} <span class="db-badge" id="navModBadge" style="display:none;"></span>
        </button>

        <button class="drawer-btn" onclick="window.handleLogout()">
          <i class="fas fa-sign-out-alt"></i> Log Out
        </button>`;
      headerBtn.innerHTML = `<i class="fas fa-user-check"></i>`;
      headerBtn.onclick = () => showDashboard();
    } else {
      navContainer.innerHTML = `
        <button class="drawer-btn" onclick="window.openAuthModal()">
          <i class="fas fa-user"></i> Login / Sign Up
        </button>`;
      headerBtn.innerHTML = `<i class="fas fa-user"></i>`;
      headerBtn.onclick = () => openAuthModal();
    }
  }

  async function handleLogout() {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (e) {
      console.warn(e);
    }
    state.user = null;
    state.saved = new Set();
    state.isAdmin = false;
    state.profile = null;
    renderAuthNav();
    closeNav();
    showHome();
    toast("Logged out.");
  }

  /* ----------------------------------------------------------
     SELLER PANEL (post / edit listing)
     ---------------------------------------------------------- */
  // Business categories advertised by Findorah (same layout as stores)
  const BIZ = {
    restaurants: {
      label: "Restaurants", icon: "fa-utensils", title: "Restaurants & Food",
      sub: "Find where to eat — browse menus and order on WhatsApp",
      subLabel: "Restaurant Type",
      types: ["Restaurant", "Fast Food", "Café & Bakery", "Bar & Grill", "Takeaway & Delivery"],
      limit: 30, menu: true, itemLabel: "Dish", delivery: true, priceLead: "Meals from",
      taglinePh: "Cuisine / tagline (e.g. Zambian & continental dishes)",
      hoursPh: "Opening hours (e.g. Daily 07:00–22:00)",
      pricePh: "Typical meal price in ZMW (optional)"
    }
  };
  const isBiz = (c) => Object.prototype.hasOwnProperty.call(BIZ, c);
  const usesProducts = (c) => c === "stores" || (isBiz(c) && BIZ[c].menu);
  const ALL_CATS = ["stores", "vehicles", "accommodation", "housing"].concat(Object.keys(BIZ));

  const ADMIN_CATS = ["stores", "accommodation"].concat(Object.keys(BIZ)); // listed by Findorah
  const USER_CATS = ["vehicles", "housing"]; // anyone logged in can list
  const COMPACT_CATS = ["accommodation", "housing", "vehicles"];
  const COMPACT_AFTER = 10;
  // Findorah's own WhatsApp number (digits with country code, e.g. "260971234567")
  const FINDORAH_WA = "";
  const CAT_NOUNS = { stores: "stores", vehicles: "vehicles", accommodation: "places to stay", housing: "houses", restaurants: "restaurants" };
  const CAT_SINGULAR = { stores: "store", vehicles: "vehicle", accommodation: "place to stay", housing: "home", restaurants: "restaurant" };
  const AMENITIES = [
    "Free Wi-Fi", "Parking", "Breakfast included", "Swimming pool", "Restaurant", "Bar",
    "Air conditioning", "Airport shuttle", "Power backup", "Pet friendly", "Kitchen",
    "Laundry", "Gym", "Conference facilities", "Wheelchair accessible", "24h security"
  ];

  const SUBCATS = {
    stores: state.storeCategories.map((c) => c.key),
    vehicles: [],
    accommodation: state.accommodationTypes.map((t) => t.key),
    housing: ["House for Rent", "House for Sale", "Apartment for Rent"],
    restaurants: BIZ.restaurants.types
  };
  const SUBCAT_LABELS = {
    stores: "Mall Section",
    vehicles: "Vehicle Type",
    accommodation: "Property Type",
    housing: "Listing Type",
    restaurants: BIZ.restaurants.subLabel
  };

  const CAT_META = {
    stores: { icon: "fa-store", name: "Stores", hint: "A shop and its products" },
    vehicles: { icon: "fa-car", name: "Cars", hint: "Cars, trucks, bikes and more" },
    accommodation: { icon: "fa-bed", name: "Stays", hint: "Hotels, lodges, guest houses, campsites" },
    housing: { icon: "fa-home", name: "Property", hint: "Houses and apartments to rent or buy" },
    restaurants: { icon: "fa-utensils", name: "Food", hint: "A restaurant and its menu" }
  };

  function showPostStep(n) {
    $("postStep1").style.display = n === 1 ? "" : "none";
    $("postStep2").style.display = n === 2 ? "" : "none";
    $("postSubmitBar").style.display = n === 2 ? "" : "none";
    $("postChangeWrap").style.display = state.sellerEditId ? "none" : "";
    $("postBody").scrollTop = 0;
  }
  function pickListingCat(cat) {
    selectListingMainCat(cat);
    showPostStep(2);
  }
  function postChangeCat() {
    showPostStep(1);
  }
  function postBack() {
    if ($("postStep2").style.display !== "none" && !state.sellerEditId) showPostStep(1);
    else closeSellerPanel();
  }

  function openSellerPanel() {
    if (!state.user) {
      toast("Please log in to list an item.", true);
      openAuthModal();
      return;
    }
    state.sellerEditId = null;
    state.photoItems = [];
    $("sellerModalTitle").textContent = "List an item";
    clearSellerForm();
    const allowed = ALL_CATS.filter((c) => (state.isAdmin ? true : USER_CATS.includes(c)));
    $("postCatList").innerHTML = allowed
      .map((c) => {
        const m = CAT_META[c];
        return `<li><button type="button" onclick="window.pickListingCat('${c}')">
          <span class="pc-ico"><i class="fas ${m.icon}"></i></span>
          <span class="pc-txt"><b>${m.name}</b><span>${m.hint}</span></span>
          <i class="fas fa-chevron-right pc-chev"></i></button></li>`;
      })
      .join("");
    showPostStep(1);
    $("sellerModal").style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeSellerPanel() {
    $("sellerModal").style.display = "none";
    document.body.style.overflow = "";
  }

  function clearSellerForm() {
    [
      "p_title",
      "p_seller_name",
      "p_store_tagline",
      "p_opening_hours",
      "p_delivery",
      "p_make_other",
      "p_model",
      "p_colour",
      "p_check_in",
      "p_check_out",
      "p_year",
      "p_mileage",
      "p_acc_tagline",
      "p_house_tagline",
      "p_desc",
      "p_price",
      "p_location",
      "p_phone",
      "p_website"
    ].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    ["p_make", "p_condition", "p_transmission", "p_fuel_type", "p_bedrooms", "p_bathrooms"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    renderAmenityOptions([]);
    state.rooms = [{ name: "", price: "", includes: "" }];
    renderRoomRows();
    $("makeOtherRow").style.display = "none";
    updateDescCount();
    state.photoItems = [];
    state.products = [];
    renderPhotoPreviews();
    renderProductCards();
    $("uploadProgressWrap").style.display = "none";
  }

  function renderAmenityOptions(selected) {
    const box = $("accAmenities");
    if (!box) return;
    box.innerHTML = AMENITIES.map(
      (a) =>
        `<label class="amenity-opt"><input type="checkbox" value="${escapeHtml(a)}"${selected.includes(a) ? " checked" : ""}> ${escapeHtml(a)}</label>`
    ).join("");
  }

  function selectListingMainCat(cat, btnEl) {
    if (!state.sellerEditId && !state.isAdmin && !USER_CATS.includes(cat)) {
      toast("Only Findorah lists this category.", true);
      return;
    }
    const meta = CAT_META[cat];
    if (meta) {
      $("postCatIcon").className = "fas " + meta.icon;
      $("postCatName").textContent = meta.name;
    }

    ["storeFields", "vehicleFields", "accommodationFields", "housingFields"].forEach((id) => {
      $(id).style.display = "none";
    });
    const fieldMap = { stores: "storeFields", vehicles: "vehicleFields", accommodation: "accommodationFields", housing: "housingFields" };
    Object.keys(BIZ).forEach((k) => (fieldMap[k] = "storeFields"));
    $(fieldMap[cat]).style.display = "";
    // store/business field wording
    const tagEl = $("p_store_tagline"), hoursEl = $("p_opening_hours"), delEl = $("p_delivery");
    if (tagEl && hoursEl && delEl) {
      if (isBiz(cat)) {
        tagEl.placeholder = BIZ[cat].taglinePh;
        hoursEl.placeholder = BIZ[cat].hoursPh;
        $("deliveryRow").style.display = BIZ[cat].delivery ? "" : "none";
        if (!BIZ[cat].delivery) delEl.value = "";
      } else {
        tagEl.placeholder = "e.g. Best prices on Samsung phones";
        hoursEl.placeholder = "e.g. Mon–Sat 08:00–18:00";
        $("deliveryRow").style.display = "";
      }
    }

    const subRow = $("subCatRow");
    const subSelect = $("p_subcategory");
    $("subCatLabel").textContent = SUBCAT_LABELS[cat];

    if (cat === "vehicles") {
      subRow.style.display = "none";
    } else {
      subRow.style.display = "";
      subSelect.innerHTML =
        `<option value="">Select ${SUBCAT_LABELS[cat]}…</option>` +
        SUBCATS[cat].map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    }

    const priceLabel = $("priceLabel");
    if (priceLabel) {
      priceLabel.textContent =
        cat === "accommodation" ? "Price per night (ZMW)"
        : cat === "housing" ? "Price (ZMW) — monthly rent or sale price"
        : isBiz(cat) ? BIZ[cat].pricePh
        : "Price (ZMW)";
    }

    state.mainCategory = cat;

    $("priceRow").style.display = cat === "stores" || cat === "accommodation" ? "none" : "";
    $("sellerRow").style.display = isBiz(cat) || cat === "stores" || cat === "accommodation" ? "none" : "";
    $("locRow").style.display = "";
    const limit = photoLimit();
    if (state.photoItems.length > limit) {
      state.photoItems.length = limit;
      toast(`Only ${limit} photos are allowed for this category. Extra photos were removed.`, true);
    }
    renderPhotoPreviews();
    renderProductCards();
  }

  function handleSubCatChange() {
    // Placeholder for any cascading logic (e.g. store sub-sub-categories).
  }

  function handlePhotoSelect(files) {
    addPhotoFiles(files);
  }

  function handlePhotoDrop(e) {
    e.preventDefault();
    const dz = $("photoDropZone");
    dz.style.borderColor = "var(--border)";
    dz.style.background = "transparent";
    if (e.dataTransfer && e.dataTransfer.files) addPhotoFiles(e.dataTransfer.files);
  }

  // Stores and menus: the top photo block only holds the cover + the round logo (2 photos).
  // Products live in their own cards below, each with up to PHOTOS_PER_PRODUCT photos.
  // Every other category allows 10 photos.
  const PHOTOS_PER_PRODUCT = 3;   // change this one number to allow more photos per product
  const MAX_PRODUCTS = 30;
  const productLimit = () => (isBiz(state.mainCategory) ? BIZ[state.mainCategory].limit : MAX_PRODUCTS);
  function photoLimit() {
    return usesProducts(state.mainCategory) ? 2 : 10;
  }

  function paintProgress(label, done, total) {
    const wrap = $("uploadProgressWrap");
    if (!wrap) return;
    wrap.style.display = total ? "" : "none";
    $("uploadProgressLabel").textContent = label;
    $("uploadProgressCount").textContent = `${done} / ${total}`;
    $("uploadProgressBar").style.width = `${total ? Math.round((done / total) * 100) : 100}%`;
  }

  // Shrinks a photo AND proves it can be read. Throws if the phone can't read the file.
  async function preparePhoto(file) {
    const opts = usesProducts(state.mainCategory)
      ? { maxSizeMB: 0.6, maxWidthOrHeight: 1280, useWebWorker: true }
      : { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true };
    let blob;
    if (window.imageCompression) {
      blob = await window.imageCompression(file, opts);
    } else {
      blob = new Blob([await file.arrayBuffer()], { type: file.type || "image/jpeg" });
    }
    const type = blob.type || "image/jpeg";
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const base = String(file.name || "photo").replace(/\.[^.]+$/, "");
    // Copy into memory so later steps never depend on the phone's original file
    return new File([blob], `${base}.${ext}`, { type });
  }

  async function addPhotoFiles(fileList) {
    const limit = photoLimit();
    const files = Array.from(fileList || []);
    const remaining = limit - state.photoItems.length;
    const toAdd = files.slice(0, Math.max(0, remaining));
    if (files.length > toAdd.length) {
      toast(`Maximum ${limit} photos for this listing.`, true);
    }
    const total = toAdd.length;
    let done = 0;
    const skipped = [];
    for (const file of toAdd) {
      paintProgress("Preparing photos…", done, total);
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error("too large");
        const ready = await preparePhoto(file);
        const asLogo = usesProducts(state.mainCategory) && state.photoItems.some((x) => !x.isLogo) && !state.photoItems.some((x) => x.isLogo);
        state.photoItems.push({ file: ready, url: null, preview: URL.createObjectURL(ready), name: "", price: "", isLogo: asLogo });
        renderPhotoPreviews();
      } catch (e) {
        console.warn("Photo skipped:", file.name, e && e.message);
        skipped.push(file.name || "a photo");
      }
      done++;
    }
    paintProgress("", 0, 0);
    if (skipped.length) {
      toast(`Couldn't read ${skipped.length} photo${skipped.length === 1 ? "" : "s"} (${skipped.slice(0, 2).join(", ")}${skipped.length > 2 ? "…" : ""}). Save ${skipped.length === 1 ? "it" : "them"} to your phone and pick again.`, true);
    }
  }

  function renderPhotoPreviews() {
    const row = $("photoPreviewRow");
    if (!row) return;
    const cat = state.mainCategory;
    const isCatalog = usesProducts(cat);
    const isStay = cat === "accommodation";
    const itemLabel = isBiz(cat) ? BIZ[cat].itemLabel : "Product";
    const coverIdx = state.photoItems.findIndex((it) => !it.isLogo);
    const help = $("photoHelp");
    if (help) {
      help.style.display = isCatalog || isStay ? "" : "none";
      help.textContent = isCatalog
        ? "The first photo is your store cover. An optional second photo is your round logo. Add your products in the Products section below."
        : isStay ? "Label each photo (Rooms, Pool, Restaurant…) so guests can see what each shows." : "";
    }
    row.innerHTML = state.photoItems
      .map((it, idx) => {
        const src = escapeHtml(it.preview || it.url || "");
        if (isCatalog) {
          const isCover = idx === coverIdx;
          const noFields = true;
          return `
        <div class="prod-row">
          <div class="prod-thumb"><img src="${src}" alt="">${it.isLogo ? '<div class="prod-cover">LOGO</div>' : isCover ? '<div class="prod-cover">COVER</div>' : ""}</div>
          <div class="prod-fields">${noFields
            ? `<span class="pf-soft" style="font-size:13.5px;">${it.isLogo ? "Shown as your round logo" : "Shown at the top of your page and on cards"}</span>`
            : `<input type="text" maxlength="80" placeholder="${itemLabel} name (optional)" value="${escapeHtml(it.name || "")}" oninput="window.setPhotoField(${idx}, 'name', this.value)">
            <input type="text" inputmode="decimal" maxlength="20" placeholder="Price in ZMW (optional)" value="${escapeHtml(it.price || "")}" oninput="window.setPhotoField(${idx}, 'price', this.value)">`}
          </div>
          <div class="prod-actions">
            ${!it.isLogo && !isCover ? `<button type="button" title="Make this the cover photo" onclick="window.makeCover(${idx})"><i class="fas fa-star"></i></button>` : ""}
            <button type="button" title="${it.isLogo ? "Not my logo" : "Use as my logo"}" onclick="window.setLogo(${idx})"><i class="fas fa-certificate"></i></button>
            <button type="button" class="del" title="Remove" onclick="window.removePhoto(${idx})">✕</button>
          </div>
        </div>`;
        }
        if (isStay) {
          return `
        <div class="prod-row">
          <div class="prod-thumb"><img src="${src}" alt=""></div>
          <div class="prod-fields"><select class="aoi-sel" aria-label="What does photo ${idx + 1} show?" onchange="window.setPhotoField(${idx}, 'label', this.value)">${AREAS.map((a) => `<option value="${escapeHtml(a)}"${(it.label || "") === a ? " selected" : ""}>${a || "What does this show?"}</option>`).join("")}</select></div>
          <div class="prod-actions"><button type="button" class="del" title="Remove" onclick="window.removePhoto(${idx})">✕</button></div>
        </div>`;
        }
        return `
        <div style="position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;">
          <img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;">
          <button type="button" onclick="window.removePhoto(${idx})"
            style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;
                   background:rgba(10,10,15,0.75);color:#fff;font-size:11px;display:flex;
                   align-items:center;justify-content:center;">✕</button>
        </div>`;
      })
      .join("");
    const limit = photoLimit();
    const label = $("photoLimitLabel");
    if (label) label.textContent = `(${state.photoItems.length}/${limit})`;
    const hint = $("photoHint");
    if (hint) hint.textContent = `Up to ${limit} photos`;
  }

  /* ---- products: one card per product, up to PHOTOS_PER_PRODUCT photos each ---- */
  let prodUid = 0;
  const newProduct = () => ({ uid: ++prodUid, name: "", price: "", details: "", photos: [], sel: -1, busy: 0 });
  const prodNoun = () => (isBiz(state.mainCategory) ? BIZ[state.mainCategory].itemLabel : "Product");

  // Square crop from the centre, shrink to 800x800 and save as JPEG (~60-140 KB), so galleries stay
  // uniform and 60 images still load fast on mobile data.
  async function squarePhoto(file, size = 800) {
    let src, w, h;
    try {
      src = await createImageBitmap(file, { imageOrientation: "from-image" });
      w = src.width; h = src.height;
    } catch (e) {
      src = await new Promise((res, rej) => {
        const img = new Image();
        const u = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(u); res(img); };
        img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("unreadable")); };
        img.src = u;
      });
      w = src.naturalWidth; h = src.naturalHeight;
    }
    if (!w || !h) throw new Error("unreadable");
    const side = Math.min(w, h);
    const out = Math.min(size, side); // never blow a small photo up
    const c = document.createElement("canvas");
    c.width = c.height = out;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; // transparent PNGs get a white background instead of black
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
    if (src.close) src.close();
    let blob = null;
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      blob = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
      if (blob && blob.size <= 140 * 1024) break;
    }
    c.width = c.height = 0;
    if (!blob) throw new Error("could not compress");
    const base = String(file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  }

  function renderProductCards() {
    const block = $("productsBlock");
    if (!block) return;
    const on = usesProducts(state.mainCategory);
    block.style.display = on ? "" : "none";
    if (!on) return;
    const noun = prodNoun().toLowerCase();
    const lim = productLimit();
    const n = state.products.length;
    $("prodBlockTitle").textContent = isBiz(state.mainCategory) ? "Menu items" : "Products";
    $("prodCountLabel").textContent = `(${n}/${lim})`;
    $("prodHelp").textContent = `One card per ${noun}, with up to ${PHOTOS_PER_PRODUCT} photos each. The first photo is the cover shown in the grid. Tap a photo to make it the cover or delete it.`;
    const addBtn = $("prodAddBtn");
    addBtn.disabled = n >= lim;
    addBtn.textContent = n >= lim ? `Limit reached (${lim} ${noun}s)` : `+ Add ${noun}`;
    $("productCards").innerHTML = state.products.map((p, i) => {
      const slots = p.photos.map((ph, k) => `
        <div class="pslot${p.sel === k ? " sel" : ""}">
          <img src="${escapeHtml(ph.preview || ph.url || "")}" alt="">
          ${k === 0 ? '<span class="pslot-tag">COVER</span>' : ""}
          <button type="button" class="pslot-tap" aria-label="Photo ${k + 1}: tap for options" onclick="window.selProdPhoto(${i}, ${k})"></button>
        </div>`).join("");
      const busy = p.busy ? `<div class="pslot-add" style="opacity:.6;cursor:default;"><i class="fas fa-spinner fa-spin"></i>Preparing</div>`.repeat(p.busy) : "";
      const add = p.photos.length + p.busy < PHOTOS_PER_PRODUCT
        ? `<label class="pslot-add"><i class="fas fa-plus"></i>Add photo<input type="file" accept="image/png,image/jpeg,image/webp,image/*" multiple onchange="window.addProdPhotos(${i}, Array.from(this.files)); this.value='';"></label>`
        : "";
      const act = p.sel >= 0 && p.photos[p.sel]
        ? `<div class="pcard-act"><button type="button"${p.sel === 0 ? " disabled" : ""} onclick="window.makeProdCover(${i}, ${p.sel})">${p.sel === 0 ? "★ This is the cover" : "★ Make cover"}</button><button type="button" class="del" onclick="window.delProdPhoto(${i}, ${p.sel})">Delete photo</button></div>`
        : "";
      const full = p.photos.length >= PHOTOS_PER_PRODUCT;
      return `
      <div class="pcard">
        <div class="pcard-top">
          <div class="pcard-fields">
            <input type="text" maxlength="80" placeholder="${escapeHtml(prodNoun())} name" value="${escapeHtml(p.name)}" oninput="window.setProdField(${i}, 'name', this.value)">
            <input type="text" inputmode="decimal" maxlength="20" placeholder="Price in ZMW (optional)" value="${escapeHtml(p.price)}" oninput="window.setProdField(${i}, 'price', this.value)">
            <input type="text" maxlength="60" placeholder="Details, e.g. New, Size M (optional)" value="${escapeHtml(p.details)}" oninput="window.setProdField(${i}, 'details', this.value)">
          </div>
          <button type="button" class="pcard-x" aria-label="Remove this ${noun}" onclick="window.removeProductCard(${i})">✕</button>
        </div>
        <div class="pcard-photos">${slots}${busy}${add}</div>
        ${act}
        <div class="pcard-count${full ? " full" : ""}">${p.photos.length}/${PHOTOS_PER_PRODUCT} photos${full ? " · full" : ""}</div>
      </div>`;
    }).join("");
  }
  function addProductCard() {
    if (state.products.length >= productLimit()) { toast(`Maximum ${productLimit()} ${prodNoun().toLowerCase()}s for this listing.`, true); return; }
    state.products.push(newProduct());
    renderProductCards();
    const cards = document.querySelectorAll("#productCards .pcard");
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function removeProductCard(i) {
    const p = state.products[i];
    if (!p) return;
    if ((p.photos.length || p.name.trim()) && !confirm(`Remove this ${prodNoun().toLowerCase()} and its photos?`)) return;
    p.photos.forEach((ph) => ph.preview && URL.revokeObjectURL(ph.preview));
    state.products.splice(i, 1);
    renderProductCards();
  }
  function setProdField(i, f, v) { if (state.products[i]) state.products[i][f] = v; }
  function selProdPhoto(i, k) {
    const p = state.products[i];
    if (!p) return;
    p.sel = p.sel === k ? -1 : k;
    renderProductCards();
  }
  function makeProdCover(i, k) {
    const p = state.products[i];
    if (!p || !p.photos[k]) return;
    const [ph] = p.photos.splice(k, 1);
    p.photos.unshift(ph);
    p.sel = -1;
    renderProductCards();
  }
  function delProdPhoto(i, k) {
    const p = state.products[i];
    if (!p || !p.photos[k]) return;
    const [ph] = p.photos.splice(k, 1);
    if (ph.preview) URL.revokeObjectURL(ph.preview);
    p.sel = -1;
    renderProductCards();
  }
  async function addProdPhotos(i, files) {
    const p = state.products[i];
    if (!p) return;
    const list = Array.from(files || []);
    const room = Math.max(0, PHOTOS_PER_PRODUCT - p.photos.length - p.busy);
    const take = list.slice(0, room);
    if (list.length > take.length) toast(`Each ${prodNoun().toLowerCase()} can have up to ${PHOTOS_PER_PRODUCT} photos.`, true);
    if (!take.length) return;
    p.sel = -1;
    p.busy += take.length;
    renderProductCards();
    const skipped = [];
    for (const file of take) {
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error("too large");
        const ready = await squarePhoto(file);
        if (state.products.includes(p)) p.photos.push({ file: ready, url: null, preview: URL.createObjectURL(ready) });
      } catch (e) {
        console.warn("Photo skipped:", file.name, e && e.message);
        skipped.push(file.name || "a photo");
      }
      p.busy--;
      renderProductCards();
    }
    if (skipped.length) toast(`Couldn't read ${skipped.length} photo${skipped.length === 1 ? "" : "s"}. Save ${skipped.length === 1 ? "it" : "them"} to your phone and pick again.`, true);
  }

  /* ---- rooms and rates (accommodation) ---- */
  const AREAS = ["", "Exterior", "Reception & lobby", "Rooms", "Bathroom", "Pool", "Restaurant", "Bar", "Lounge", "Gardens", "Conference room", "Other"];
  function renderRoomRows() {
    const box = $("roomRows");
    if (!box) return;
    if (!state.rooms || !state.rooms.length) state.rooms = [{ name: "", price: "", includes: "" }];
    box.innerHTML = state.rooms.map((r, i) => `
      <div class="room-row">
        <div class="rr">
          <input type="text" placeholder="Room type, e.g. Standard" value="${escapeHtml(r.name || "")}" oninput="window.setRoom(${i}, 'name', this.value)" aria-label="Room type ${i + 1}">
          <input type="text" inputmode="decimal" placeholder="K per night" value="${escapeHtml(r.price || "")}" oninput="window.setRoom(${i}, 'price', this.value)" aria-label="Price per night ${i + 1}">
        </div>
        <input type="text" placeholder="What's included, e.g. Breakfast, Wi-Fi, parking" value="${escapeHtml(r.includes || "")}" oninput="window.setRoom(${i}, 'includes', this.value)" aria-label="What's included ${i + 1}">
        ${state.rooms.length > 1 ? `<button type="button" onclick="window.removeRoom(${i})">Remove this room type</button>` : ""}
      </div>`).join("");
    $("addRoomBtn").style.display = state.rooms.length >= 3 ? "none" : "";
  }
  function setRoom(i, f, v) { if (state.rooms[i]) state.rooms[i][f] = v; }
  function addRoom() { if (state.rooms.length < 3) { state.rooms.push({ name: "", price: "", includes: "" }); renderRoomRows(); } }
  function removeRoom(i) { state.rooms.splice(i, 1); renderRoomRows(); }

  function updateDescCount() {
    const n = ($("p_desc").value || "").trim().length;
    const el = $("descCount");
    if (el) el.textContent = n >= 40 ? `${n} characters` : `${n} / 40 characters minimum`;
  }

  function setLogo(idx) {
    state.photoItems.forEach((it, i) => { it.isLogo = i === idx ? !it.isLogo : false; });
    renderPhotoPreviews();
  }

  function setPhotoField(idx, field, value) {
    if (state.photoItems[idx]) state.photoItems[idx][field] = value;
  }

  function makeCover(idx) {
    const [it] = state.photoItems.splice(idx, 1);
    if (!it) return;
    const firstNonLogo = state.photoItems.findIndex((x) => !x.isLogo);
    state.photoItems.splice(firstNonLogo < 0 ? 0 : firstNonLogo, 0, it);
    renderPhotoPreviews();
  }

  function removePhoto(idx) {
    state.photoItems.splice(idx, 1);
    renderPhotoPreviews();
  }

  // Uploads photos that haven't been uploaded yet (3 at a time, order preserved, 3 tries each).
  // Photos that succeed keep their URL, so pressing Submit again only retries the ones that failed.
  async function uploadPhotos() {
    const items = state.photoItems;
    const prodPhotos = usesProducts(state.mainCategory) ? state.products.flatMap((p) => p.photos) : [];
    if (!items.length && !prodPhotos.length) return { photos: [], failed: 0, firstError: "" };
    if (!supabase) {
      prodPhotos.forEach((ph) => { ph.url = ph.url || ph.preview; });
      return { photos: items.map((it) => ({ url: it.url || it.preview, name: it.name, price: it.price, label: it.label, isLogo: it.isLogo })), failed: 0, firstError: "" };
    }
    const pending = items.concat(prodPhotos).map((it, i) => ({ it, i })).filter((x) => !x.it.url && x.it.file);
    const total = pending.length;
    let done = 0;
    let failed = 0;
    let firstError = "";
    paintProgress("Uploading photos…", 0, total);

    let next = 0;
    const worker = async () => {
      while (next < total) {
        const { it, i } = pending[next++];
        const ext = it.file.type === "image/png" ? "png" : it.file.type === "image/webp" ? "webp" : "jpg";
        const path = `listings/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        let ok = false;
        for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
          try {
            const { error } = await supabase.storage
              .from("listing-photos")
              .upload(path, it.file, { contentType: it.file.type || "image/jpeg" });
            if (error) throw error;
            const { data } = supabase.storage.from("listing-photos").getPublicUrl(path);
            it.url = data.publicUrl;
            ok = true;
          } catch (e) {
            if (!firstError) firstError = (e && e.message) || "network error";
            console.error("Upload attempt", attempt, "failed:", e);
            if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
          }
        }
        if (!ok) failed++;
        done++;
        paintProgress("Uploading photos…", done, total);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    paintProgress("", 0, 0);
    return {
      photos: items.filter((it) => it.url).map((it) => ({ url: it.url, name: it.name, price: it.price, label: it.label, isLogo: it.isLogo })),
      failed,
      firstError
    };
  }

  function collectListingPayload() {
    const cat = state.mainCategory;
    const payload = {
      main_category: cat,
      title: tidyTitle($("p_title").value.trim()),
      seller_name: isBiz(cat) || cat === "stores" || cat === "accommodation" ? tidyTitle($("p_title").value.trim()) : tidyTitle($("p_seller_name").value.trim()),
      description: $("p_desc").value.trim(),
      price: cat === "stores" || cat === "accommodation" ? null : $("p_price").value.trim(),
      location: tidyTitle($("p_location").value.trim()),
      phone: $("p_phone").value.trim(),
      website: $("p_website").value.trim(),
      status: state.isAdmin ? "published" : "pending"
    };

    if (cat === "stores" || cat === "accommodation" || cat === "housing" || isBiz(cat)) {
      payload.subcategory = $("p_subcategory").value;
    }

    if (cat === "stores" || isBiz(cat)) {
      payload.store_tagline = $("p_store_tagline").value.trim();
      payload.opening_hours = $("p_opening_hours").value.trim();
      payload.delivery = $("p_delivery").value.trim();
    } else if (cat === "vehicles") {
      const mk = $("p_make").value === "Other" ? $("p_make_other").value : $("p_make").value;
      payload.make = tidyTitle(mk.trim());
      payload.model = tidyTitle($("p_model").value.trim());
      payload.year = $("p_year").value ? parseInt($("p_year").value, 10) : null;
      payload.mileage = fmtMileage($("p_mileage").value);
      payload.transmission = $("p_transmission").value;
      payload.fuel_type = $("p_fuel_type").value;
      payload.condition = $("p_condition").value;
      payload.colour = tidyTitle($("p_colour").value.trim());
    } else if (cat === "accommodation") {
      payload.store_tagline = $("p_acc_tagline").value.trim();
      const rooms = (state.rooms || []).map((r) => ({ name: tidyTitle(r.name || ""), price: String(r.price || "").replace(/[^\d.]/g, ""), includes: String(r.includes || "").trim() })).filter((r) => r.name && r.price);
      payload.rooms = rooms;
      const prices = rooms.map((r) => Number(r.price)).filter((n) => !isNaN(n));
      payload.price = prices.length ? String(Math.min(...prices)) : null;
      payload.check_in = $("p_check_in").value || null;
      payload.check_out = $("p_check_out").value || null;
      payload.amenities = Array.from(document.querySelectorAll("#accAmenities input:checked")).map((c) => c.value);
    } else if (cat === "housing") {
      payload.store_tagline = $("p_house_tagline").value.trim();
      payload.bedrooms = $("p_bedrooms").value === "" ? null : parseInt($("p_bedrooms").value, 10);
      payload.bathrooms = $("p_bathrooms").value === "" ? null : parseInt($("p_bathrooms").value, 10);
    }

    return payload;
  }

  function validateListing(payload) {
    if (!payload.title) return "Please enter a listing title.";
    if (!["stores", "accommodation"].includes(state.mainCategory) && !isBiz(state.mainCategory) && !payload.seller_name) return "Please enter a business or seller name.";
    if (!payload.phone) return "Please enter a WhatsApp or phone number.";
    if (usesProducts(state.mainCategory)) {
      if (state.products.some((p) => p.busy)) return "Photos are still being prepared. Wait a moment and tap Submit again.";
      const bad = state.products.findIndex((p) => !p.photos.length && (p.name.trim() || p.price.trim() || p.details.trim()));
      if (bad > -1) return `${prodNoun()} ${bad + 1} needs at least one photo. Add one or remove the card.`;
    }
    if (state.mainCategory === "accommodation" && !(payload.rooms && payload.rooms.length)) return "Add at least one room type with a price per night.";
    if ((payload.description || "").length < 40) return `Please write at least 40 characters in the description (${40 - (payload.description || "").length} more).`;
    if ((state.mainCategory === "stores" || state.mainCategory === "accommodation" || state.mainCategory === "housing" || isBiz(state.mainCategory)) && !payload.subcategory) {
      return `Please select a ${SUBCAT_LABELS[state.mainCategory].toLowerCase()}.`;
    }
    return null;
  }

  async function submitListing() {
    if (state.submitting) return;
    const payload = collectListingPayload();
    const validationError = validateListing(payload);
    if (validationError) {
      toast(validationError, true);
      return;
    }

    state.submitting = true;
    try {
      const { photos: uploaded, failed, firstError } = await uploadPhotos();
      if (failed) {
        toast(`${failed} photo${failed === 1 ? "" : "s"} didn't upload (${firstError}). Check your connection and tap Submit again — nothing was posted.`, true);
        return;
      }
      const logoPhoto = uploaded.find((p) => p.isLogo);
      const rest = uploaded.filter((p) => !p.isLogo);
      payload.images = rest.map((p) => p.url);
      if (usesProducts(payload.main_category)) {
        payload.logo = logoPhoto ? logoPhoto.url : null;
        // every product card keeps its own photos; the first one is its cover
        payload.products = state.products
          .filter((p) => p.photos.some((ph) => ph.url))
          .map((p) => {
            const urls = p.photos.filter((ph) => ph.url).map((ph) => ph.url);
            return {
              image: urls[0],
              photos: urls,
              name: tidyTitle(String(p.name || "").trim()),
              price: String(p.price || "").trim(),
              details: String(p.details || "").trim()
            };
          });
        // images = store cover (if any) followed by each product's cover
        payload.images = rest.map((p) => p.url).concat(payload.products.map((p) => p.image));
      }
      if (payload.main_category === "accommodation") payload.photo_labels = rest.map((p) => p.label || "");
      payload.created_at = new Date().toISOString();
      if (state.user) payload.owner_id = state.user.id || state.user.email;

      if (supabase) {
        if (state.sellerEditId) {
          const { error } = await supabase.from("listings").update(payload).eq("id", state.sellerEditId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("listings").insert(payload);
          if (error) throw error;
        }
      } else {
        payload.id = state.sellerEditId || "local_" + Date.now();
        payload.status = "pending";
        const idx = state.listings.findIndex((l) => l.id === payload.id);
        if (idx > -1) state.listings[idx] = payload;
        else state.listings.push(payload);
      }

      toast(state.isAdmin ? (state.sellerEditId ? "Listing updated." : "Listing published.") : (state.sellerEditId ? "Listing updated. Pending review." : "Listing submitted for review."));
      closeSellerPanel();
      await fetchListings();
      if ($("view-dashboard").classList.contains("active")) showDashboard();
    } catch (e) {
      console.error(e);
      toast("Could not submit listing. Try again.", true);
    } finally {
      state.submitting = false;
    }
  }

  function editListing(id) {
    const item =
      state.dashboardListings.find((l) => String(l.id) === String(id)) ||
      state.listings.find((l) => String(l.id) === String(id));
    if (!item) return;

    state.sellerEditId = item.id;
    $("sellerModalTitle").textContent = "Edit listing";
    selectListingMainCat(item.main_category);

    $("p_title").value = item.title || "";
    $("p_seller_name").value = item.seller_name || "";
    $("p_desc").value = item.description || "";
    $("p_price").value = item.price || "";
    $("p_location").value = item.location || "";
    $("p_phone").value = item.phone || "";
    $("p_website").value = item.website || "";

    if (item.main_category === "stores" || item.main_category === "accommodation" || item.main_category === "housing" || isBiz(item.main_category)) {
      $("p_subcategory").value = item.subcategory || "";
    }
    if (item.main_category === "stores" || isBiz(item.main_category)) {
      $("p_store_tagline").value = item.store_tagline || "";
      $("p_opening_hours").value = item.opening_hours || "";
      $("p_delivery").value = item.delivery || "";
    } else if (item.main_category === "vehicles") {
      const known = Array.from($("p_make").options).map((o) => o.value);
      if (item.make && known.includes(item.make)) $("p_make").value = item.make;
      else if (item.make) { $("p_make").value = "Other"; $("p_make_other").value = item.make; $("makeOtherRow").style.display = ""; }
      $("p_model").value = item.model || "";
      $("p_year").value = item.year || "";
      $("p_mileage").value = String(item.mileage || "").replace(/[^\d]/g, "");
      $("p_transmission").value = item.transmission || "";
      $("p_fuel_type").value = item.fuel_type || "";
      $("p_condition").value = item.condition || "";
      $("p_colour").value = item.colour || "";
    } else if (item.main_category === "accommodation") {
      $("p_acc_tagline").value = item.store_tagline || "";
      state.rooms = Array.isArray(item.rooms) && item.rooms.length ? item.rooms.map((r) => ({ name: r.name || "", price: r.price || "", includes: r.includes || "" })) : [{ name: "", price: item.price || "", includes: "" }];
      renderRoomRows();
      $("p_check_in").value = item.check_in || "";
      $("p_check_out").value = item.check_out || "";
      renderAmenityOptions(item.amenities || []);
    } else if (item.main_category === "housing") {
      $("p_house_tagline").value = item.store_tagline || "";
      $("p_bedrooms").value = item.bedrooms ?? "";
      $("p_bathrooms").value = item.bathrooms ?? "";
    }

    const imgs = item.images || [];
    const byUrl = new Map((item.products || []).map((p) => [p.image, p]));
    const labels = item.photo_labels || [];
    state.products = [];
    if (usesProducts(item.main_category)) {
      const prods = getProducts(item);
      const photosOf = (p) => (Array.isArray(p.photos) && p.photos.length ? p.photos : [p.image]).filter(Boolean);
      const inProducts = new Set(prods.flatMap(photosOf));
      state.products = prods.map((p) => Object.assign(newProduct(), {
        name: p.name || "", price: p.price || "", details: p.details || "",
        photos: photosOf(p).slice(0, PHOTOS_PER_PRODUCT).map((u) => ({ file: null, url: u, preview: null }))
      }));
      // the store cover is images[0] unless that photo is simply the first product's cover
      state.photoItems = imgs[0] && !inProducts.has(imgs[0]) ? [{ file: null, url: imgs[0], preview: null, name: "", price: "", label: "" }] : [];
      if (item.logo) state.photoItems.unshift({ file: null, url: item.logo, preview: null, name: "", price: "", isLogo: true });
    } else {
      state.photoItems = imgs.map((u, i) => {
        const p = byUrl.get(u) || {};
        return { file: null, url: u, preview: null, name: p.name || "", price: p.price || "", label: labels[i] || "" };
      });
    }
    renderPhotoPreviews();
    renderProductCards();
    updateDescCount();

    showPostStep(2);
    $("sellerModal").style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  async function deleteListing(id) {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    try {
      if (supabase) {
        const { error } = await supabase.from("listings").delete().eq("id", id);
        if (error) throw error;
      } else {
        state.listings = state.listings.filter((l) => String(l.id) !== String(id));
      }
      toast("Listing deleted.");
      await fetchListings();
      showDashboard();
    } catch (e) {
      console.error(e);
      toast("Could not delete listing.", true);
    }
  }

  /* ============================================================
     DASHBOARD: sellers see My listings; admins also get Moderation.
     Hiding the Moderation tab is only cosmetic: every admin call is
     an RPC that checks the caller's role on the server.
     ============================================================ */
  const DB = {
    view: "mine", tab: "all", cat: "all", sort: "new", q: "", page: 1, per: 20,
    stats: {}, mod: { rows: [], total: 0, counts: { pending: 0, reports: 0, published: 0, rejected: 0 } },
    summary: { pending: 0, reported: 0 }, notes: [], menuId: null, cur: null, loading: false,
    limits: { stores: 200000, vehicles: 2000000, accommodation: 50000, housing: 100000, restaurants: 5000 }
  };
  const isMod = () => state.isAdmin && DB.view === "mod";
  const catName = (c) => (CAT_META[c] || {}).name || c;
  const dbStat = (x) => DB.stats[x.id] || { views: 0, contacts: 0, v30: 0, c30: 0 };
  const dbDaysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso || Date.now()).getTime()) / 86400000));
  const dbDays = (x) => dbDaysSince(x.created_at);
  function dbAgo(d) { return d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? d + " days ago" : d < 365 ? Math.floor(d / 30) + " mo ago" : "1 yr ago"; }
  function dbMoney(x) {
    const n = priceNum(x);
    if (n !== null) return n ? kMoney(n) : "Free";
    return hasVal(x.price) ? String(x.price) : x.main_category === "stores" ? "Store" : "No price set";
  }
  const rpc = async (fn, args) => {
    if (!supabase) return { data: null, error: new Error("offline") };
    return supabase.rpc(fn, args || {});
  };

  // ---- automatic quality checks (the same list tells admins what to review and sellers what to fix) ----
  function checksFor(x) {
    const out = [];
    const lim = DB.limits[x.main_category];
    const n = priceNum(x);
    if (lim && n !== null && n > lim) out.push({ t: "Price may be too high", d: `${kMoney(n)} is well above the usual range for ${catName(x.main_category).toLowerCase()} (over ${kMoney(lim)}). Check for an extra zero.` });
    const title = String(x.title || "").trim();
    if (title.length > 6 && title === title.toUpperCase() && /[A-Z]/.test(title)) out.push({ t: "Title is in capital letters", d: "Use normal capitals, e.g. “Toyota Hilux 2018”." });
    const desc = String(x.description || "").trim();
    if (desc.length < 40) out.push({ t: desc ? "Description is too short" : "No description", d: `Write at least 40 characters (now ${desc.length}). Say what makes it worth buying.` });
    const photos = (x.images || []).length;
    if (photos === 0) out.push({ t: "No photos", d: "Add clear photos so buyers can see what they’re getting." });
    else if (photos < 3) out.push({ t: `Only ${photos} photo${photos === 1 ? "" : "s"}`, d: "Add at least 3 photos: front, side and inside." });
    if (x.main_category === "vehicles" && x.make && title && !title.toLowerCase().includes(String(x.make).toLowerCase())) out.push({ t: "Title and details don’t match", d: `The make is ${x.make} but the title doesn’t mention it.` });
    if (x.main_category === "housing" && hasVal(x.bedrooms)) {
      const m = title.match(/(\d+)\s*(?:-|\s)?\s*(?:bed|br)/i);
      if (m && +m[1] !== +x.bedrooms) out.push({ t: "Title and details don’t match", d: `The title says ${m[1]} bedroom(s) but the details say ${x.bedrooms}.` });
    }
    return out;
  }

  // ---- loading ----
  async function loadLimits() {
    const { data } = await rpc("price_limits");
    if (data && typeof data === "object") Object.keys(data).forEach((k) => { if (+data[k] > 0) DB.limits[k] = +data[k]; });
  }
  async function loadNotes() {
    const { data } = await rpc("my_notifications");
    DB.notes = Array.isArray(data) ? data : [];
  }
  async function loadSummary() {
    if (!state.isAdmin) return;
    const { data } = await rpc("admin_summary");
    if (data) DB.summary = { pending: +data.pending || 0, reported: +data.reported || 0 };
    paintBadges();
  }
  function modTotal() { return DB.summary.pending + DB.summary.reported; }
  function paintBadges() {
    const n = modTotal();
    const b = $("dbBadge");
    if (b) { b.textContent = n; b.style.display = n ? "" : "none"; }
    const nb = $("navModBadge");
    if (nb) { nb.textContent = n; nb.style.display = state.isAdmin && n ? "" : "none"; }
  }
  async function loadMine() {
    try {
      if (supabase) {
        const ownerId = state.user.id || state.user.email;
        const { data, error } = await supabase.from("listings").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).range(0, 999);
        if (error) throw error;
        state.dashboardListings = (data || []).map(tidyListing);
        DB.stats = {};
        const res = await rpc("my_listing_stats");
        (res.data || []).forEach((r) => { DB.stats[r.listing_id] = { views: +r.views, contacts: +r.contacts, v30: +r.views_30, c30: +r.contacts_30 }; });
      } else state.dashboardListings = state.listings;
    } catch (e) {
      console.error(e);
      state.dashboardListings = [];
    }
  }
  async function loadMod() {
    const args = { p_tab: DB.tab, p_cat: DB.cat, p_q: DB.q, p_sort: DB.sort, p_page: DB.page, p_per: DB.per };
    const [list, counts] = await Promise.all([rpc("admin_listings", args), rpc("admin_counts", { p_cat: DB.cat, p_q: DB.q })]);
    if (list.error) { console.error(list.error); toast("Couldn't load the queue.", true); return; }
    DB.mod.rows = (list.data.rows || []).map(tidyListing);
    DB.mod.total = list.data.total || 0;
    if (counts.data) DB.mod.counts = counts.data;
  }
  async function reloadView() {
    if (isMod()) await loadMod(); else await loadMine();
    renderDashboard();
  }

  async function showDashboard(view) {
    if (!state.user) { openAuthModal(); return; }
    showView("view-dashboard");
    DB.view = state.isAdmin ? view || (DB.view === "mine" && DB.touched ? "mine" : "mod") : "mine";
    DB.touched = true;
    DB.tab = DB.view === "mod" ? "pending" : "all";
    DB.sort = DB.view === "mod" ? "old" : "new";
    DB.cat = "all"; DB.q = ""; DB.page = 1;
    $("dbQ").value = "";
    renderDashboard();
    await Promise.all([loadMine(), loadNotes(), loadLimits(), state.isAdmin ? loadSummary() : null]);
    if (isMod()) await loadMod();
    renderDashboard();
  }
  const showAdmin = () => showDashboard("mod");

  // ---- one list for both roles ----
  function mineFiltered(ignoreTab) {
    const q = DB.q;
    return state.dashboardListings.filter((x) =>
      (DB.cat === "all" || x.main_category === DB.cat) &&
      (!q || String(x.title || "").toLowerCase().includes(q) || catName(x.main_category).toLowerCase().includes(q)) &&
      (ignoreTab || DB.tab === "all" || x.status === DB.tab));
  }
  const MINE_SORT = {
    new: (a, b) => dbDays(a) - dbDays(b),
    old: (a, b) => dbDays(b) - dbDays(a),
    views: (a, b) => dbStat(b).views - dbStat(a).views,
    taps: (a, b) => dbStat(b).contacts - dbStat(a).contacts,
    hi: (a, b) => (priceNum(b) || 0) - (priceNum(a) || 0),
    lo: (a, b) => (priceNum(a) || 0) - (priceNum(b) || 0),
    stale: (a, b) => dbDaysSince(b.updated_at) - dbDaysSince(a.updated_at)
  };

  function rowHtml(x) {
    const sid = String(x.id).replace(/[^\w-]/g, "");
    const mod = isMod();
    const img = x.images && x.images[0] ? `<img src="${escapeHtml(x.images[0])}" alt="" loading="lazy">` : escapeHtml(String(x.title || "?")[0].toUpperCase());
    const n = priceNum(x);
    const lim = DB.limits[x.main_category];
    const bad = n !== null && ((lim && n > lim) || n > 10000000);
    const label = x.status === "rejected" && x.review_kind === "changes" ? "changes" : x.status === "rejected" && x.review_kind === "takedown" ? "taken down" : x.status;
    const badge = x.status !== "published" ? `<span class="db-b ${x.status === "rejected" ? "rejected" : x.status}">${label}</span>` : "";
    let meta, flag = "";
    const issues = checksFor(x).length;
    if (mod) {
      meta = `${escapeHtml(x.seller_name || "Seller")} · ${escapeHtml(catName(x.main_category))} · ${dbAgo(dbDays(x))}`;
      if (DB.tab === "reports" && x.rep && x.rep.length) flag = `<div class="db-flag">${x.rep.reduce((a, r) => a + r.n, 0)} report${x.rep.reduce((a, r) => a + r.n, 0) === 1 ? "" : "s"}: ${escapeHtml(x.rep[0].why || "")}</div>`;
      else if (x.status === "pending") flag = issues ? `<div class="db-flag">${issues} to check</div>` : `<div class="db-flag ok">No issues found</div>`;
    } else {
      const st = dbStat(x);
      meta = `${escapeHtml(catName(x.main_category))} · ${dbAgo(dbDays(x))} · ${st.views} view${st.views === 1 ? "" : "s"} · ${st.contacts} contact${st.contacts === 1 ? "" : "s"}`;
      if (x.status === "rejected") flag = `<div class="db-flag">${x.review_kind === "changes" ? "Changes needed" : "Tap to see why"}</div>`;
      else if (x.status === "pending" && issues) flag = `<div class="db-flag">${issues} to fix</div>`;
    }
    return `<div class="db-row" data-id="${sid}" tabindex="0"><div class="db-th">${img}</div>
      <div style="min-width:0"><div class="db-t">${escapeHtml(x.title)}${badge}</div>
      <div class="db-p">${escapeHtml(dbMoney(x))}${bad ? ' <span class="db-chk">· Check price</span>' : ""}</div>
      <div class="db-m">${meta}</div>${flag}</div>
      ${mod ? '<span class="db-chev" aria-hidden="true">›</span>' : `<button type="button" class="db-dots" data-m="${sid}" aria-label="Actions for ${escapeHtml(x.title)}">⋯</button>`}</div>`;
  }

  function renderDashboard() {
    const mod = isMod();
    $("dbSeg").style.display = state.isAdmin ? "" : "none";
    $("dbSeg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === DB.view)));
    $("dbH1").textContent = mod ? "Moderation" : "My listings";
    $("dbAdd").style.display = mod ? "none" : "";
    $("dbQ").placeholder = mod ? "Search by title or seller" : "Search your listings";
    paintBadges();

    // messages to the seller (approved / rejected / changes requested)
    $("dbNotes").innerHTML = !mod && DB.notes.length
      ? DB.notes.slice(0, 3).map((n) => `<div class="db-note ${n.kind === "approved" ? "good" : "bad"}"><div><b>${escapeHtml(n.title)}</b>${escapeHtml(n.body || "")}</div></div>`).join("") +
        `<div class="db-note"><span>${DB.notes.length} new message${DB.notes.length === 1 ? "" : "s"}</span><button type="button" id="dbNotesRead">Mark as read</button></div>`
      : "";

    let tabs, counts, rows, total;
    if (mod) {
      tabs = [["pending", "Pending"], ["reports", "Reports"], ["published", "Published"], ["rejected", "Rejected"]];
      counts = DB.mod.counts; rows = DB.mod.rows; total = DB.mod.total;
    } else {
      const base = mineFiltered(true);
      counts = { all: base.length, published: 0, pending: 0, rejected: 0, sold: 0 };
      base.forEach((x) => { if (counts[x.status] !== undefined) counts[x.status]++; });
      tabs = [["all", "All"], ["published", "Published"], ["pending", "Pending"], ["rejected", "Rejected"], ["sold", "Sold"]];
      const all = mineFiltered(false).sort(MINE_SORT[DB.sort] || MINE_SORT.new);
      total = all.length;
      const pages0 = Math.max(1, Math.ceil(total / DB.per));
      DB.page = Math.min(DB.page, pages0);
      rows = all.slice((DB.page - 1) * DB.per, DB.page * DB.per);
    }
    $("dbTabs").innerHTML = tabs.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${DB.tab === k}">${l}<em>${(+counts[k] || 0).toLocaleString()}</em></button>`).join("");

    const cats = mod ? ALL_CATS : Array.from(new Set(state.dashboardListings.map((x) => x.main_category)));
    $("dbCat").innerHTML = '<option value="all">All categories</option>' + cats.map((c) => `<option value="${c}"${DB.cat === c ? " selected" : ""}>${escapeHtml(catName(c))}</option>`).join("");
    const sorts = mod
      ? [["old", "Oldest first"], ["new", "Newest first"], ["stale", "Least recently updated"]]
      : [["new", "Newest first"], ["views", "Most viewed"], ["taps", "Most contacted"], ["old", "Oldest first"], ["hi", "Price: high to low"], ["lo", "Price: low to high"], ["stale", "Least recently updated"]];
    $("dbSort").innerHTML = sorts.map(([k, l]) => `<option value="${k}"${DB.sort === k ? " selected" : ""}>${l}</option>`).join("");

    // summary line
    if (mod) $("dbSum").textContent = `${DB.summary.pending} waiting for review · ${DB.summary.reported} published listing${DB.summary.reported === 1 ? "" : "s"} reported`;
    else {
      let tv = 0, tc = 0, live = 0;
      state.dashboardListings.forEach((x) => { if (x.status === "published") { live++; tv += dbStat(x).v30; tc += dbStat(x).c30; } });
      $("dbSum").textContent = `${live.toLocaleString()} live · ${tv.toLocaleString()} views and ${tc.toLocaleString()} contacts in the last 30 days`;
    }
    const pages = Math.max(1, Math.ceil(total / DB.per));
    const st = (DB.page - 1) * DB.per;
    $("dbCount").textContent = total ? `Showing ${(st + 1).toLocaleString()}–${(st + rows.length).toLocaleString()} of ${total.toLocaleString()}` : "";
    $("dbList").innerHTML = rows.length
      ? rows.map(rowHtml).join("")
      : `<div class="db-empty">${mod ? (DB.tab === "pending" ? "Nothing waiting for review. 🎉" : "Nothing here.") : state.dashboardListings.length ? "No listings match. Try a different search or filter." : "You haven’t listed anything yet. Tap “+ New listing” to start."}</div>`;
    $("dbPg").textContent = `Page ${DB.page} of ${pages.toLocaleString()}`;
    $("dbPrev").disabled = DB.page <= 1;
    $("dbNext").disabled = DB.page >= pages;
  }

  const dbGet = (id) => state.dashboardListings.find((l) => String(l.id) === String(id));

  // ---- seller menu (⋯) ----
  function dbOpenMenu(id) {
    DB.menuId = id;
    const x = dbGet(id);
    if (!x) return;
    $("dbSheet").innerHTML =
      `<h3>${escapeHtml(x.title)}</h3><button data-a="edit">Edit listing</button><button data-a="view">View public page</button>` +
      (x.status === "sold" ? '<button data-a="relist">Relist</button>' : x.status === "published" ? '<button data-a="sold">Mark as sold</button>' : "") +
      (x.status === "published" ? '<button data-a="renew">Renew (move to top)</button>' : "") +
      '<button class="del" data-a="del">Delete…</button>';
    // re-attach every time: openReasonSheet() replaces this handler on the same element
    $("dbSheet").onclick = function (e) {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      $("dbSheetS").classList.remove("on");
      dbAction(b.dataset.a, DB.menuId);
    };
    $("dbSheetS").classList.add("on");
  }
  async function dbRpc(fn, args) {
    const { data, error } = await rpc(fn, args);
    if (error) { console.error(error); return false; }
    return !!data;
  }
  async function dbAction(a, id) {
    const x = dbGet(id);
    if (!x) return;
    if (a === "edit") return editListing(id);
    if (a === "view") return openDetail(id);
    if (a === "del") return dbConfirmDelete([id]);
    if (a === "sold") { if (await dbRpc("set_listing_sold", { p_id: id, p_sold: true })) { x.status = "sold"; toast("Marked as sold"); } else toast("Couldn't update that listing.", true); }
    else if (a === "relist") { if (await dbRpc("set_listing_sold", { p_id: id, p_sold: false })) { x.status = "published"; toast("Listing relisted"); } else toast("Couldn't update that listing.", true); }
    else if (a === "renew") { if (await dbRpc("renew_listing", { p_id: id })) { x.created_at = new Date().toISOString(); toast("Renewed — moved to the top"); } else toast("Couldn't renew that listing.", true); }
    renderDashboard();
    fetchListings();
  }
  function dbConfirmDelete(ids) {
    $("dbDlg").innerHTML = `<h3 style="margin:0">Delete ${ids.length > 1 ? ids.length + " listings" : "this listing"}?</h3><p>This can’t be undone.</p><div class="a"><button id="dbNo">Cancel</button><button class="go" id="dbYes">Delete</button></div>`;
    $("dbDlgS").classList.add("on");
    $("dbNo").onclick = () => $("dbDlgS").classList.remove("on");
    $("dbYes").onclick = async () => {
      $("dbDlgS").classList.remove("on");
      try {
        if (supabase) { const { error } = await supabase.from("listings").delete().in("id", ids); if (error) throw error; }
        state.dashboardListings = state.dashboardListings.filter((l) => !ids.includes(String(l.id)));
        closeReview();
        if (isMod()) await Promise.all([loadMod(), loadSummary()]);
        toast(ids.length > 1 ? "Listings deleted" : "Listing deleted");
        renderDashboard();
        fetchListings();
      } catch (e) { console.error(e); toast("Could not delete.", true); }
    };
  }

  // ---- the review screen (shared) ----
  async function openReview(id) {
    const mod = isMod();
    let x = mod ? DB.mod.rows.find((r) => String(r.id) === String(id)) : dbGet(id);
    if (!x) return;
    DB.cur = x;
    $("rvTitle").textContent = mod ? "Review listing" : "Your listing";
    $("rvBody").innerHTML = '<p class="db-m" style="padding:24px 0">Loading…</p>';
    $("rvBar").innerHTML = "";
    $("rv").classList.add("open");
    document.body.style.overflow = "hidden";
    // admins read the full row + open reports; both roles read the activity trail
    let full = x, reports = [], activity = [];
    if (supabase) {
      const jobs = [rpc("listing_activity", { p_id: id })];
      if (mod) {
        jobs.push(supabase.from("listings").select("*").eq("id", id).maybeSingle());
        jobs.push(supabase.from("reports").select("reason,details,created_at").eq("listing_id", id).is("resolved_at", null));
      }
      const res = await Promise.all(jobs);
      activity = (res[0].data || []);
      if (mod) { if (res[1].data) full = tidyListing(res[1].data); reports = res[2].data || []; }
    }
    DB.cur = full;
    renderReview(full, reports, activity);
  }
  function closeReview() {
    $("rv").classList.remove("open");
    document.body.style.overflow = "";
  }
  function renderReview(x, reports, activity) {
    const mod = isMod();
    const checks = checksFor(x);
    const imgs = x.images || [];
    const st = dbStat(x);
    const label = x.status === "rejected" ? (x.review_kind === "changes" ? "Changes requested" : x.review_kind === "takedown" ? "Taken down" : "Rejected") : x.status[0].toUpperCase() + x.status.slice(1);
    let o = imgs.length ? `<div class="rv-track">${imgs.map((u) => `<img alt="" src="${escapeHtml(u)}">`).join("")}</div>` : "";
    o += `<h1>${escapeHtml(x.title)}</h1><div class="rv-price">${escapeHtml(dbMoney(x))}</div>`;
    o += `<div class="db-m" style="white-space:normal">${escapeHtml(catName(x.main_category))}${mod ? " · " + escapeHtml(x.seller_name || "Seller") : ""} · ${label}</div>`;
    if (x.status === "rejected" && x.reject_reason) {
      o += `<div class="rv-box bad"><b>${label}</b>${escapeHtml(x.reject_reason)}${!mod ? "<br>Fix the points below, then edit and resubmit your listing." : ""}</div>`;
    }
    if (mod && reports.length) {
      o += `<h3>Reports (${reports.length})</h3><ul class="rv-list">${reports.map((r) => `<li>${escapeHtml(r.reason || "Report")}<span>${escapeHtml(r.details || "No details")} · ${dbAgo(dbDaysSince(r.created_at))}</span></li>`).join("")}</ul>`;
    }
    o += `<h3>${mod ? "Automatic checks" : "What to fix"}</h3>`;
    o += checks.length
      ? `<ul class="rv-list">${checks.map((c) => `<li>${escapeHtml(c.t)}<span>${escapeHtml(c.d)}</span></li>`).join("")}</ul>`
      : `<div class="rv-box good"><b>${mod ? "No issues found" : "Looks good"}</b>${mod ? "Price, title, description and photos all look normal." : "Nothing to fix. Keep your price and details up to date."}</div>`;
    const rows = [["Category", catName(x.main_category)], mod ? ["Seller", x.seller_name || "—"] : null, ["Posted", dbAgo(dbDays(x))], ["Last updated", dbAgo(dbDaysSince(x.updated_at))], ["Status", label]];
    if (!mod) rows.push(["Views", String(st.views)], ["Contacts", String(st.contacts)]);
    o += `<h3>Details</h3><ul class="dt-rows">${rows.filter(Boolean).map((r) => `<li><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span></li>`).join("")}</ul>`;
    if (x.description) o += `<h3>Description</h3><p style="white-space:pre-line;line-height:1.6;margin:0">${escapeHtml(x.description)}</p>`;
    if (activity.length) o += `<h3>Activity</h3><ul class="rv-list">${activity.map((a) => `<li>${escapeHtml(a.action)}${a.actor_role ? " · " + escapeHtml(a.actor_role) : ""}<span>${escapeHtml(a.note || "")}${a.note ? " · " : ""}${dbAgo(dbDaysSince(a.created_at))}</span></li>`).join("")}</ul>`;
    if (mod) o += '<p style="margin:28px 0 8px"><button type="button" class="rv-del" data-a="delete">Delete this listing permanently…</button></p>';
    $("rvBody").innerHTML = o;

    let bar = "";
    if (mod) {
      if (x.status === "pending") bar = '<button class="no" data-a="reject">Reject</button><button class="go" data-a="approve">Approve</button>';
      else if (x.status === "rejected") bar = '<button class="go" data-a="approve">Approve</button>';
      else bar = '<button class="no" data-a="takedown">Take down</button>' + (reports.length ? '<button class="go" data-a="dismiss">Dismiss reports</button>' : '<button data-a="close">Close</button>');
    } else {
      bar = x.status === "published" ? '<button data-a="edit">Edit listing</button><button data-a="sold">Mark sold</button>' : x.status === "sold" ? '<button data-a="edit">Edit listing</button><button data-a="relist">Relist</button>' : `<button class="go" data-a="edit">${x.status === "rejected" ? "Edit and resubmit" : "Edit listing"}</button>`;
    }
    $("rvBar").innerHTML = bar;
  }

  // reject / take down / request changes: reason required
  const REJECT_WHY = ["Wrong price", "Misleading or fake", "Prohibited item", "Duplicate listing", "Poor photos", "Other"];
  const TAKEDOWN_WHY = ["Scam or fraud", "Wrong information", "Prohibited item", "Duplicate listing", "Other"];
  const FIX_ITEMS = ["Fix the price", "Fix the capital letters in the title", "Write a longer description", "Add clear photos", "Choose the right category", "Make the title match the details"];
  function openReasonSheet(kind) {
    const x = DB.cur;
    let mode = kind === "takedown" ? "takedown" : "reject";
    let picked = [];
    const paint = () => {
      const list = mode === "takedown" ? TAKEDOWN_WHY : mode === "reject" ? REJECT_WHY : FIX_ITEMS;
      $("dbSheet").innerHTML =
        `<h3>${mode === "takedown" ? "Take down this listing" : mode === "changes" ? "Ask for changes" : "Reject this listing"}</h3>` +
        (kind !== "takedown" ? `<div class="seg2"><button data-mode="reject" class="${mode === "reject" ? "on" : ""}">Reject</button><button data-mode="changes" class="${mode === "changes" ? "on" : ""}">Request changes</button></div>` : "") +
        `<p class="db-m" style="white-space:normal;margin:8px 0 0">${mode === "changes" ? "Pick what the seller should fix. They get a checklist." : "A reason is required. The seller is told why."}</p>` +
        `<div class="opts">${list.map((r) => `<button data-why="${escapeHtml(r)}" class="${picked.includes(r) ? "on" : ""}">${escapeHtml(r)}</button>`).join("")}</div>` +
        `<textarea id="rvNote" placeholder="Add a note (optional)"></textarea>` +
        `<button class="confirm" id="rvGo" ${picked.length ? "" : "disabled"}>${mode === "takedown" ? "Take down" : mode === "changes" ? "Send checklist" : "Reject listing"}</button>`;
    };
    paint();
    $("dbSheetS").classList.add("on");
    $("dbSheet").onclick = async (e) => {
      const m = e.target.closest("[data-mode]");
      if (m) { mode = m.dataset.mode; picked = []; paint(); return; }
      const w = e.target.closest("[data-why]");
      if (w) {
        const v = w.dataset.why;
        if (mode === "changes") picked = picked.includes(v) ? picked.filter((p) => p !== v) : picked.concat(v);
        else picked = [v];
        const note = $("rvNote") ? $("rvNote").value : "";
        paint();
        $("rvNote").value = note;
        return;
      }
      if (e.target.id === "rvGo" && picked.length) {
        const note = $("rvNote").value.trim();
        $("dbSheetS").classList.remove("on");
        await runReview(x.id, mode === "changes" ? "changes" : mode, picked.join("; "), note);
      }
    };
  }
  async function runReview(id, action, reason, note) {
    const { error } = await rpc("admin_review", { p_id: id, p_action: action, p_reason: reason || null, p_note: note || null });
    if (error) { console.error(error); toast(error.message || "That didn't work.", true); return; }
    toast({ approve: "Approved — the seller was told", reject: "Rejected — the seller was told why", takedown: "Taken down — the seller was told", changes: "Checklist sent to the seller", dismiss: "Reports dismissed" }[action] || "Done");
    closeReview();
    await Promise.all([loadMod(), loadSummary()]);
    renderDashboard();
    fetchListings();
  }

  function autoVehicleTitle() {
    if (state.mainCategory !== "vehicles") return;
    const t = $("p_title");
    const mk = $("p_make").value === "Other" ? $("p_make_other").value : $("p_make").value;
    const auto = [$("p_year").value, mk, $("p_model").value].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
    if (!t.value || t.dataset.auto === t.value) { t.value = tidyTitle(auto); t.dataset.auto = t.value; }
  }
  function setupVehicleForm() {
    $("p_make").addEventListener("change", () => { $("makeOtherRow").style.display = $("p_make").value === "Other" ? "" : "none"; autoVehicleTitle(); });
    ["p_make_other", "p_model", "p_year"].forEach((id) => $(id).addEventListener("input", autoVehicleTitle));
  }

  function setupDashboard() {
    let tm;
    $("dbQ").oninput = function () {
      clearTimeout(tm);
      const v = this.value.trim().toLowerCase();
      tm = setTimeout(() => { DB.q = v; DB.page = 1; reloadView(); }, 250);
    };
    $("dbCat").onchange = function () { DB.cat = this.value; DB.page = 1; reloadView(); };
    $("dbSort").onchange = function () { DB.sort = this.value; DB.page = 1; reloadView(); };
    $("dbTabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { DB.tab = b.dataset.t; DB.page = 1; reloadView(); } };
    $("dbSeg").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || !state.isAdmin || b.dataset.v === DB.view) return;
      DB.view = b.dataset.v; DB.tab = DB.view === "mod" ? "pending" : "all"; DB.sort = DB.view === "mod" ? "old" : "new"; DB.cat = "all"; DB.q = ""; DB.page = 1; $("dbQ").value = "";
      reloadView();
    };
    $("dbPrev").onclick = () => { DB.page--; reloadView(); window.scrollTo(0, 0); };
    $("dbNext").onclick = () => { DB.page++; reloadView(); window.scrollTo(0, 0); };
    $("dbList").onclick = (e) => {
      const m = e.target.closest("[data-m]");
      if (m) { e.stopPropagation(); dbOpenMenu(m.dataset.m); return; }
      const r = e.target.closest(".db-row");
      if (r) openReview(r.dataset.id);
    };
    $("dbNotes").onclick = async (e) => {
      if (e.target.id === "dbNotesRead") { await rpc("mark_notifications_read"); DB.notes = []; renderDashboard(); }
    };
    $("dbSheetS").onclick = function (e) {
      if (e.target === this) this.classList.remove("on");
    };
    $("dbSheet").onclick = function (e) {
      const a = e.target.dataset.a;
      if (!a) return;
      $("dbSheetS").classList.remove("on");
      dbAction(a, DB.menuId);
    };
    $("rvBody").onclick = (e) => {
      const b = e.target.closest('[data-a="delete"]');
      if (b && DB.cur) dbConfirmDelete([String(DB.cur.id)]);
    };
    $("rvBack").onclick = closeReview;
    $("rvBar").onclick = (e) => {
      const a = e.target.dataset.a;
      const x = DB.cur;
      if (!a || !x) return;
      if (a === "close") return closeReview();
      if (isMod()) {
        if (a === "approve") return runReview(x.id, "approve");
        if (a === "dismiss") return runReview(x.id, "dismiss");
        if (a === "reject") return openReasonSheet("reject");
        if (a === "takedown") return openReasonSheet("takedown");
      } else {
        closeReview();
        return dbAction(a, x.id);
      }
    };
  }

  /* ----------------------------------------------------------
     DATA FETCH
     ---------------------------------------------------------- */
  async function fetchListings() {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("listings")
          .select("*")
          .eq("status", "published")
          .order("created_at", { ascending: false });
        if (error) throw error;
        state.listings = (data || []).map(tidyListing).filter((l) => ALL_CATS.includes(l.main_category));
      }
    } catch (e) {
      console.error("Failed to fetch listings:", e.message);
    }
    state.listingsLoaded = true;
    if (currentViewId() === "view-search") renderResults();
    if (state.mainCategory) {
      // refresh the lists without yanking the person to the home page
      if (currentViewId() === "view-home") setMainCategory(state.mainCategory);
      else renderCategory(state.mainCategory);
    }
  }

  async function restoreSession() {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data && data.session) {
          state.user = data.session.user;
          await checkAdmin();
          loadSummary();
          loadSaved();
        }
      }
    } catch (e) {
      console.warn(e);
    }
    renderAuthNav();
  }

  /* ----------------------------------------------------------
     EVENT WIRING
     ---------------------------------------------------------- */
  function wireGlobalEvents() {
    $("menuBtn").addEventListener("click", openNav);
    $("closeDrawer").addEventListener("click", closeNav);
    $("overlay").addEventListener("click", () => {
      closeNav();
      closeAuthModal();
      closeReportModal();
      closeSellerPanel();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeNav();
        closeAuthModal();
        closeReportModal();
        closeSellerPanel();
      }
    });
  }

  /* ----------------------------------------------------------
     PUBLIC API (window.*)
     ---------------------------------------------------------- */
  window.openNav = openNav;
  window.closeNav = closeNav;
  window.showHome = showHome;
  window.setMainCategory = setMainCategory;
  window.closeSearch = closeSearch;
  window.clearCategoryFilters = clearCategoryFilters;
  window.pickListingCat = pickListingCat;
  window.postChangeCat = postChangeCat;
  window.postBack = postBack;
  window.setPhotoField = setPhotoField;
  window.makeCover = makeCover;
  window.addProductCard = addProductCard;
  window.removeProductCard = removeProductCard;
  window.setProdField = setProdField;
  window.selProdPhoto = selProdPhoto;
  window.makeProdCover = makeProdCover;
  window.delProdPhoto = delProdPhoto;
  window.addProdPhotos = addProdPhotos;
  window.setLogo = setLogo;
  window.setRoom = setRoom;
  window.addRoom = addRoom;
  window.removeRoom = removeRoom;
  window.updateDescCount = updateDescCount;
  window.openProduct = openProduct;
  window.closeProduct = closeProduct;
  window.openDetail = openDetail;
  window.goBackFromDetail = goBackFromDetail;
  window.shareListing = shareListing;
  window.openReportModal = openReportModal;
  window.closeReportModal = closeReportModal;
  window.submitReport = submitReport;
  /* ============================================================
     PWA INTEGRATIONS
     (file handler, share target, protocol links, periodic sync, push)
     ============================================================ */
  const VAPID_PUBLIC_KEY = "BHu48QVuqwlCyjzwvtZbG7y8BMsYcXbm62peJfD_GJASINhGClssKPKdgx6H_iwWqbEXdxDHs7wEKxacWvZZ8O4";
  let resolveAppReady;
  const appReady = new Promise((r) => (resolveAppReady = r));

  // Open the "post a listing" form pre-filled with a title, text and photos.
  function startListingDraft(draft) {
    draft = draft || {};
    if (!state.user) {
      state.pendingDraft = draft;
      toast("Sign in to continue with your listing.", true);
      openAuthModal();
      return;
    }
    openSellerPanel();
    if (draft.title && $("p_title")) $("p_title").value = String(draft.title).slice(0, 120);
    if (draft.text && $("p_desc")) $("p_desc").value = String(draft.text).slice(0, 2000);
    if (draft.files && draft.files.length) addPhotoFiles(draft.files);
  }

  // Files opened with the installed app (manifest file_handlers)
  function setupLaunchQueue() {
    if (!("launchQueue" in window) || !window.launchQueue.setConsumer) return;
    window.launchQueue.setConsumer(async (params) => {
      if (!params || !params.files || !params.files.length) return;
      const files = await Promise.all(params.files.map((h) => h.getFile()));
      await appReady;
      const images = files.filter((f) => f.type && f.type.startsWith("image/"));
      if (images.length) startListingDraft({ files: images });
    });
  }

  // Content shared into the app (manifest share_target, handled by sw.js)
  async function consumeShare() {
    const params = new URLSearchParams(location.search);
    if (!params.has("share-target")) return;
    history.replaceState(null, "", location.pathname);
    try {
      const cache = await caches.open("findorah-share");
      const metaRes = await cache.match("/shared/meta");
      if (!metaRes) return;
      const meta = await metaRes.json();
      const files = [];
      for (let i = 0; i < (meta.count || 0); i++) {
        const r = await cache.match("/shared/file-" + i);
        if (!r) continue;
        const blob = await r.blob();
        const name = decodeURIComponent(r.headers.get("X-Filename") || "photo-" + i + ".jpg");
        files.push(new File([blob], name, { type: blob.type }));
      }
      await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
      const text = [meta.text, meta.url].filter(Boolean).join("\n");
      startListingDraft({ title: meta.title, text, files });
    } catch (e) {
      console.warn("share failed", e);
    }
  }

  // web+findorah: links  (e.g. web+findorah:listing/<id>, web+findorah:housing, web+findorah:new)
  function handleProtocolLink() {
    const raw = new URLSearchParams(location.search).get("protocol");
    if (!raw) return;
    history.replaceState(null, "", location.pathname);
    const path = decodeURIComponent(raw).replace(/^web\+findorah:/i, "").replace(/^\/+/, "").toLowerCase();
    const [first, rest] = path.split("/");
    const cats = ALL_CATS;
    if (first === "listing" && rest) {
      const item = state.listings.find((l) => String(l.id).toLowerCase() === rest);
      item ? openDetail(item.id) : toast("That listing is no longer available.", true);
    } else if (cats.includes(first)) {
      setMainCategory(first);
    } else if (first === "new") {
      startListingDraft({});
    }
  }

  function b64urlToUint8(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function registerPeriodicSync() {
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (!("periodicSync" in reg)) return;
      const perm = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (perm.state === "granted") {
        await reg.periodicSync.register("refresh-listings", { minInterval: 12 * 60 * 60 * 1000 });
      }
    } catch (e) {
      console.warn("periodic sync unavailable", e);
    }
  }

  /* ============================================================
     PHONE BACK BUTTON
     Closes pop-ups first, then steps back through the pages. On the
     home page, press back twice to leave the app.
     ============================================================ */
  const Back = { ready: false, armed: false, timer: null };

  function currentViewId() {
    const v = document.querySelector(".app-view.active");
    return v ? v.id : "view-home";
  }

  function isShown(id) {
    const e = $(id);
    return !!e && getComputedStyle(e).display !== "none";
  }

  // Returns true if it closed something or went back a page
  function handleBackAction() {
    if ($("dbDlgS") && $("dbDlgS").classList.contains("on")) { $("dbDlgS").classList.remove("on"); return true; }
    if ($("dbSheetS") && $("dbSheetS").classList.contains("on")) { $("dbSheetS").classList.remove("on"); return true; }
    if ($("rv") && $("rv").classList.contains("open")) { closeReview(); return true; }
    if (sheetOpen()) { closeSheets(); return true; }
    if ($("photoViewer") && $("photoViewer").classList.contains("open")) { closePhotoViewer(); return true; }
    if ($("photoGallery") && $("photoGallery").classList.contains("open")) { closeLightbox(); return true; }
    const pm = $("productModal");
    if (pm && pm.classList.contains("open")) { closeProduct(); return true; }
    if (isShown("reportModal")) { closeReportModal(); return true; }
    if (isShown("sellerModal")) { postBack(); return true; }
    if (isShown("authModal")) { closeAuthModal(); return true; }
    const drawer = $("navDrawer");
    if (drawer && drawer.classList.contains("open")) { closeNav(); return true; }
    const v = currentViewId();
    if (v === "view-search" && ($("resultsSuggest") && !$("resultsSuggest").hidden || $("homeSuggest") && !$("homeSuggest").hidden)) { resultsBox.api.close(); homeBox.api.close(); return true; }
    if (v === "view-detail") { goBackFromDetail(); return true; }
    if (v === "view-search") { closeSearch(); return true; }
    if (v !== "view-home") { showHome(); return true; }
    return false;
  }

  function setupBackButton() {
    // Chrome only honours history entries after the person has touched the page
    const arm = () => {
      if (Back.ready) return;
      Back.ready = true;
      history.replaceState({ rf: "base" }, "");
      history.pushState({ rf: "app" }, "");
    };
    ["pointerdown", "touchstart", "keydown"].forEach((ev) =>
      window.addEventListener(ev, arm, { passive: true })
    );
    window.addEventListener("popstate", () => {
      if (!Back.ready) return;
      if (handleBackAction()) {
        Back.armed = false;
        history.pushState({ rf: "app" }, "");
        return;
      }
      if (Back.armed) {
        // second press on the home page: let the browser leave
        Back.ready = false;
        history.back();
        return;
      }
      Back.armed = true;
      toast("Press back again to exit");
      history.pushState({ rf: "app" }, "");
      clearTimeout(Back.timer);
      Back.timer = setTimeout(() => (Back.armed = false), 2200);
    });
  }

  // "Install app" button (Chrome/Edge via beforeinstallprompt; iPhone shows manual steps)
  let deferredInstall = null;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  function updateInstallButton() {
    const b = $("installAppBtn");
    if (!b) return;
    b.style.display = !isStandalone() && (deferredInstall || isIOS()) ? "" : "none";
  }

  function setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstall = e;
      updateInstallButton();
    });
    window.addEventListener("appinstalled", () => {
      deferredInstall = null;
      updateInstallButton();
      toast("Findorah installed.");
    });
    updateInstallButton();
  }

  async function installApp() {
    if (deferredInstall) {
      deferredInstall.prompt();
      try {
        await deferredInstall.userChoice;
      } catch (e) {}
      deferredInstall = null;
      updateInstallButton();
    } else if (isIOS()) {
      toast("Tap the Share button, then 'Add to Home Screen'.");
    } else {
      toast("Open your browser menu (⋮) and choose 'Install app' or 'Add to Home screen'.");
    }
  }

  function updateNotifButton() {
    const b = $("enableNotifBtn");
    if (!b) return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    b.style.display = supported && Notification.permission === "default" ? "" : "none";
  }

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      toast("Notifications aren't supported on this browser.", true);
      return;
    }
    const perm = await Notification.requestPermission();
    updateNotifButton();
    if (perm !== "granted") {
      toast("Notifications were not enabled.", true);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64urlToUint8(VAPID_PUBLIC_KEY)
        });
      }
      const j = sub.toJSON();
      if (supabase) {
        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            endpoint: j.endpoint,
            p256dh: j.keys.p256dh,
            auth: j.keys.auth,
            user_id: state.user ? state.user.id : null
          },
          { onConflict: "endpoint", ignoreDuplicates: true }
        );
        if (error) throw error;
      }
      toast("Notifications enabled.");
    } catch (e) {
      console.error(e);
      toast("Couldn't enable notifications.", true);
    }
  }

  window.openAuthModal = openAuthModal;
  window.enableNotifications = enableNotifications;
  window.installApp = installApp;
  window.closeAuthModal = closeAuthModal;
  window.switchAuthTab = switchAuthTab;
  window.togglePwd = togglePwd;
  window.handleLogin = handleLogin;
  window.handleSignup = handleSignup;
  window.handleForgotPassword = handleForgotPassword;
  window.handleResetPassword = handleResetPassword;
  window.handleLogout = handleLogout;
  window.openSellerPanel = openSellerPanel;
  window.closeSellerPanel = closeSellerPanel;
  window.selectListingMainCat = selectListingMainCat;
  window.handleSubCatChange = handleSubCatChange;
  window.handlePhotoSelect = handlePhotoSelect;
  window.handlePhotoDrop = handlePhotoDrop;
  window.removePhoto = removePhoto;
  window.submitListing = submitListing;
  window.editListing = editListing;
  window.deleteListing = deleteListing;
  window.showDashboard = showDashboard;
  window.trackContact = trackContact;
  window.toggleSave = toggleSave;
  window.showAdmin = showAdmin;

  /* ----------------------------------------------------------
     INIT
     ---------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async () => {
    buildBizUI();
    setupVehicleForm();
    setupDashboard();
    setupFilterUI();
    setupSearch();
    setupProductSheet();
    setupLightbox();
    if (supabase && supabase.auth && supabase.auth.onAuthStateChange) {
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          if (session && session.user) state.user = session.user;
          openResetPanel();
        }
      });
    }
    wireGlobalEvents();
    setupLaunchQueue();
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeProduct(); });
    renderAuthNav();
    updateNotifButton();
    setupInstallPrompt();
    setupBackButton();
    await restoreSession();
    await fetchListings();
    setMainCategory("stores");
    resolveAppReady();
    handleProtocolLink();
    consumeShare();
    registerPeriodicSync();
  });
})();
