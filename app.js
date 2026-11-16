// Malika Print — Telegram Mini App do'kon (1-bosqich)
(function () {
  "use strict";

  const tg = window.Telegram ? window.Telegram.WebApp : null;
  // Klaviatura tugmasidan ochilganda initData bo'sh bo'ladi, shuning uchun platform bo'yicha aniqlaymiz
  const inTelegram = !!(tg && tg.platform && tg.platform !== "unknown");

  const state = {
    shop: {}, categories: [], products: [], byId: {},
    cat: "all", q: "", cart: {}, view: "catalog",
  };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";

  // ---------- Ish vaqti (Toshkent vaqti bilan, telefon soatiga bog'liq emas) ----------
  const DAY_SHORT = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
  const DAY_FULL = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
  const TZ_OFFSET_MIN = 5 * 60;
  const toMin = (s) => { const [a, b] = String(s).split(":").map(Number); return a * 60 + (b || 0); };
  function hours() {
    const h = state.shop.hours || {};
    return { days: h.days || [1, 2, 3, 4, 5, 6], open: h.open || "08:00", close: h.close || "18:00" };
  }
  function nowTashkent() {
    const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
    return { day: ((d.getUTCDay() + 6) % 7) + 1, min: d.getUTCHours() * 60 + d.getUTCMinutes() }; // 1=Du ... 7=Ya
  }
  function daysText(days) {
    const s = [...days].sort((a, b) => a - b);
    const row = s.length > 2 && s.every((d, i) => i === 0 || d === s[i - 1] + 1);
    return row ? `${DAY_SHORT[s[0] - 1]}–${DAY_SHORT[s[s.length - 1] - 1]}` : s.map((d) => DAY_SHORT[d - 1]).join(", ");
  }
  function shopStatus() {
    const h = hours(), n = nowTashkent(), o = toMin(h.open), c = toMin(h.close);
    const schedule = `${daysText(h.days)}, ${h.open}–${h.close}`;
    if (h.days.includes(n.day) && n.min >= o && n.min < c) return { open: true, schedule };
    let when = "ish vaqtida";
    if (h.days.includes(n.day) && n.min < o) when = `bugun soat ${h.open} dan`;
    else for (let i = 1; i <= 7; i++) {
      const d = ((n.day - 1 + i) % 7) + 1;
      if (h.days.includes(d)) { when = i === 1 ? `ertaga soat ${h.open} dan` : `${DAY_FULL[d - 1]} kuni soat ${h.open} dan`; break; }
    }
    const reason = !h.days.includes(n.day) ? "Bugun dam olish kuni"
      : n.min < o ? "Ish vaqti hali boshlanmadi" : "Bugungi ish vaqti tugadi";
    return { open: false, schedule, when, reason };
  }
  function renderStatus(st) {
    const top = $("#closed-banner"), cart = $("#cart-closed");
    top.hidden = cart.hidden = st.open;
    if (st.open) return;
    top.innerHTML = `🕗 <b>${esc(st.reason)}.</b> Buyurtmalar ${esc(st.when)} qabul qilinadi.` +
      `<small>Ish vaqti: ${esc(st.schedule)}. Mahsulotlarni hozir savatga qo'shib qo'yishingiz mumkin.</small>`;
    cart.innerHTML = `🕗 Buyurtmani ${esc(st.when)} bera olasiz. Savatingiz saqlanib turadi.`;
  }

  // ---------- Savatni saqlash ----------
  function saveCart() { try { localStorage.setItem("mp_cart", JSON.stringify(state.cart)); } catch (e) {} }
  function loadCart() {
    try {
      const c = JSON.parse(localStorage.getItem("mp_cart") || "{}");
      for (const id in c) if (state.byId[id] && state.byId[id].available !== false && c[id] > 0) state.cart[id] = c[id];
    } catch (e) {}
  }
  const cartCount = () => Object.values(state.cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => Object.entries(state.cart).reduce((s, [id, q]) => s + state.byId[id].price * q, 0);

  function setQty(id, qty) {
    qty = Math.max(0, Math.min(999, qty));
    if (qty === 0) delete state.cart[id]; else state.cart[id] = qty;
    saveCart();
    haptic();
    render();
  }

  function haptic() { try { if (inTelegram) tg.HapticFeedback.impactOccurred("light"); } catch (e) {} }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 1800);
  }

  // ---------- Rasm yoki test-rasm ----------
  function thumb(p) {
    const attrs = `class="thumb" data-act="view" data-id="${esc(p.id)}" style="background:${esc(p.image ? "#fff" : p.color || "#eee")}"`;
    const n = imagesOf(p).length;
    const badge = n > 1 ? `<span class="img-count">📷 ${n}</span>` : "";
    if (p.image) return `<div ${attrs}><img src="${esc(p.image)}" alt="" loading="lazy">${badge}</div>`;
    return `<div ${attrs}>${esc(p.emoji || "📦")}</div>`;
  }

  // ---------- Mahsulotni katta ko'rish ----------
  const imagesOf = (p) => (p.images && p.images.length ? p.images : p.image ? [p.image] : []);

  function openViewer(id) {
    const p = state.byId[id];
    if (!p) return;
    state.viewer = id;
    // galereya faqat ochilganda chiziladi (savatga qo'shganda varaqlangan joy o'zgarmasligi uchun)
    const imgs = imagesOf(p);
    const slides = imgs.length
      ? imgs.map((src) => `<div class="slide"><img src="${esc(src)}" alt=""></div>`).join("")
      : `<div class="slide" style="background:${esc(p.color || "#eee")}"><span>${esc(p.emoji || "📦")}</span></div>`;
    const dots = imgs.length > 1
      ? `<div class="dots">${imgs.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : "";
    $("#viewer-gallery").innerHTML = `<div class="gallery">${slides}</div>${dots}` +
      (imgs.length > 1 ? `<div class="counter">1 / ${imgs.length}</div>` : "");
    const g = $("#viewer-gallery .gallery");
    g.addEventListener("scroll", () => {
      const i = Math.round(g.scrollLeft / g.clientWidth);
      document.querySelectorAll("#viewer-gallery .dots i").forEach((d, k) => d.classList.toggle("on", k === i));
      const c = $("#viewer-gallery .counter");
      if (c) c.textContent = `${i + 1} / ${imgs.length}`;
    }, { passive: true });
    $("#viewer").hidden = false;
    document.body.style.overflow = "hidden";
    if (inTelegram) tg.BackButton.show();
    renderViewer();
  }
  function closeViewer() {
    state.viewer = null;
    $("#viewer").hidden = true;
    document.body.style.overflow = "";
    if (inTelegram && state.view === "catalog") tg.BackButton.hide();
  }
  function renderViewer() {
    if (!state.viewer) return;
    const p = state.byId[state.viewer], qty = state.cart[p.id] || 0;
    const cat = state.categories.find((c) => c.id === p.category);
    $("#viewer-body").innerHTML = `<div class="viewer-info">
      ${cat ? `<div class="viewer-cat">${esc(cat.emoji || "")} ${esc(cat.name)}</div>` : ""}
      <div class="viewer-name">${esc(p.name)}</div>
      <div class="viewer-price">${money(p.price)} <span>/ ${esc(p.unit || "dona")}</span></div>
      ${qty ? stepper(p.id, qty) : `<button class="add-btn" data-act="add" data-id="${esc(p.id)}">Savatga qo'shish</button>`}
    </div>`;
  }
  function stepper(id, qty) {
    return `<div class="stepper"><button data-act="dec" data-id="${id}">−</button><span>${qty}</span><button data-act="inc" data-id="${id}">+</button></div>`;
  }

  // ---------- Katalog ----------
  function renderChips() {
    const all = [{ id: "all", name: "Hammasi", emoji: "🛍️" }, ...state.categories];
    $("#chips").innerHTML = all.map((c) =>
      `<button class="chip ${state.cat === c.id ? "active" : ""}" data-cat="${esc(c.id)}">${esc(c.emoji || "")} ${esc(c.name)}</button>`).join("");
  }
  function renderGrid() {
    const q = state.q.trim().toLowerCase();
    const list = state.products.filter((p) =>
      p.available !== false && (state.cat === "all" || p.category === state.cat) && (!q || p.name.toLowerCase().includes(q)));
    $("#empty").hidden = list.length > 0;
    $("#grid").innerHTML = list.map((p) => {
      const qty = state.cart[p.id] || 0;
      return `<div class="card">${thumb(p)}<div class="card-body">
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-price">${money(p.price)} <span class="card-unit">/ ${esc(p.unit || "dona")}</span></div>
        ${qty ? stepper(p.id, qty) : `<button class="add-btn" data-act="add" data-id="${p.id}">Savatga</button>`}
      </div></div>`;
    }).join("");
  }

  // ---------- Savat ----------
  function renderCart() {
    const ids = Object.keys(state.cart);
    $("#cart-list").innerHTML = ids.length ? ids.map((id) => {
      const p = state.byId[id], q = state.cart[id];
      return `<div class="cart-item">${thumb(p)}<div class="cart-info"><div class="name">${esc(p.name)}</div>
        <div class="sum">${money(p.price)} × ${q} = <b>${money(p.price * q)}</b></div></div>${stepper(id, q)}</div>`;
    }).join("") : `<div class="empty">Savat bo'sh</div>`;
    $("#cart-total").textContent = money(cartTotal());
    $("#checkout-total").textContent = money(cartTotal());
  }

  // ---------- Asosiy tugma (Telegram MainButton yoki brauzerda zaxira tugma) ----------
  function setMainButton(text, visible, active = true) {
    if (inTelegram) {
      const color = active ? ((tg.themeParams && tg.themeParams.button_color) || "#2a7de1") : "#9aa3ae";
      tg.MainButton.setParams({ text, color, text_color: "#ffffff", is_active: active, is_visible: visible });
    } else {
      const b = $("#fallback-btn"); b.textContent = text; b.hidden = !visible; b.disabled = !active;
    }
  }
  function onMainButton() {
    const st = shopStatus();
    if (state.view === "catalog") showView("cart");
    else if (!st.open) { toast(`Buyurtma ${st.when} qabul qilinadi`); render(); }
    else if (state.view === "cart") { if (cartCount()) showView("checkout"); }
    else if (state.view === "checkout") submitOrder();
  }

  function render() {
    const st = shopStatus();
    if (!st.open && state.view === "checkout") { showView("cart"); return; }
    renderStatus(st);
    renderGrid();
    renderCart();
    renderViewer();
    const n = cartCount(), t = money(cartTotal());
    if (state.view === "catalog") setMainButton(`🛒 Savat (${n}) — ${t}`, n > 0);
    else if (!st.open) setMainButton(`🕗 Buyurtma ${st.when}`, n > 0, false);
    else if (state.view === "cart") setMainButton(`Rasmiylashtirish — ${t}`, n > 0);
    else setMainButton(`✅ Buyurtma berish — ${t}`, n > 0);
  }

  function showView(v) {
    state.view = v;
    ["catalog", "cart", "checkout"].forEach((name) => ($("#view-" + name).hidden = name !== v));
    if (inTelegram) v === "catalog" ? tg.BackButton.hide() : tg.BackButton.show();
    window.scrollTo(0, 0);
    render();
  }
  function goBack() {
    if (state.viewer) { closeViewer(); return; }
    showView(state.view === "checkout" ? "cart" : "catalog");
  }

  // ---------- Buyurtma ----------
  function submitOrder() {
    if (!shopStatus().open) { render(); return; }
    const f = $("#form");
    const data = {
      name: f.elements.name.value.trim(),
      phone: f.elements.phone.value.trim(),
      delivery: "pickup", // yetkazib berish xizmati yo'q
      address: "",
      comment: f.elements.comment.value.trim(),
    };
    const errors = [];
    f.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    if (data.name.length < 2) { errors.push("Ismingizni kiriting"); f.elements.name.classList.add("invalid"); }
    if (data.phone.replace(/\D/g, "").length < 9) { errors.push("Telefon raqamni to'liq kiriting"); f.elements.phone.classList.add("invalid"); }
    const err = $("#form-error");
    if (errors.length) {
      err.textContent = errors.join(" · "); err.hidden = false;
      try { if (inTelegram) tg.HapticFeedback.notificationOccurred("error"); } catch (e) {}
      return;
    }
    err.hidden = true;

    // Narxlar botda products.json dan qayta hisoblanadi — bu yerda faqat id va soni yuboriladi
    const payload = { v: 1, items: Object.entries(state.cart), total: cartTotal(), ...data };

    if (inTelegram) {
      state.cart = {}; saveCart();
      tg.sendData(JSON.stringify(payload)); // Mini App yopiladi, buyurtma botga keladi
    } else {
      console.log("TEST buyurtma:", payload);
      alert("Test rejim (Telegramdan tashqarida).\nBotga shu ma'lumot yuboriladi:\n\n" + JSON.stringify(payload, null, 2));
    }
  }

  // ---------- Hodisalar ----------
  function bindEvents() {
    document.body.addEventListener("click", (e) => {
      if (e.target.id === "viewer") { closeViewer(); return; }   // qora fonga bosilsa yopiladi
      const b = e.target.closest("[data-act],[data-cat]");
      if (!b) return;
      if (b.dataset.act === "view") { openViewer(b.dataset.id); return; }
      if (b.dataset.act === "close-viewer") { closeViewer(); return; }
      if (b.dataset.cat) { state.cat = b.dataset.cat; renderChips(); renderGrid(); return; }
      const id = b.dataset.id, q = state.cart[id] || 0;
      if (b.dataset.act === "add") { setQty(id, 1); if (!state.viewer) toast("Savatga qo'shildi"); }
      if (b.dataset.act === "inc") setQty(id, q + 1);
      if (b.dataset.act === "dec") setQty(id, q - 1);
    });
    $("#search").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
    $("#clear-cart").addEventListener("click", () => { state.cart = {}; saveCart(); render(); });
    $("#fallback-btn").addEventListener("click", onMainButton);
    if (inTelegram) {
      tg.MainButton.onClick(onMainButton);
      tg.BackButton.onClick(goBack);
    }
  }

  // ---------- Ishga tushirish ----------
  async function init() {
    if (inTelegram) {
      tg.ready();
      tg.expand();
      const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u) $("#form").elements.name.value = [u.first_name, u.last_name].filter(Boolean).join(" ");
    }
    try {
      // ?t=... — GitHub keshi eski ro'yxatni bermasligi uchun har safar yangi manzil
      const res = await fetch("products.json?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      state.shop = data.shop || {};
      state.categories = data.categories || [];
      state.products = data.products || [];
      state.products.forEach((p) => (state.byId[p.id] = p));
    } catch (e) {
      $("#grid").innerHTML = `<div class="empty" style="grid-column:1/-1">Mahsulotlarni yuklab bo'lmadi.<br>Saytni server orqali oching (README ga qarang).</div>`;
      return;
    }
    if (state.shop.name) $("#shop-name").textContent = state.shop.name;
    if (state.shop.subtitle) $("#shop-sub").textContent = state.shop.subtitle;
    loadCart();
    renderChips();
    bindEvents();
    showView("catalog");
    setInterval(render, 30000); // ish vaqti boshlansa/tugasa tugmalar o'zi yangilanadi
  }

  init();
})();
