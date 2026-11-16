// Malika Print — Telegram Mini App do'kon (1-bosqich)
(function () {
  "use strict";

  const tg = window.Telegram ? window.Telegram.WebApp : null;
  const inTelegram = !!(tg && tg.initData);

  const state = {
    shop: {}, categories: [], products: [], byId: {},
    cat: "all", q: "", cart: {}, view: "catalog",
  };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";

  // ---------- Savatni saqlash ----------
  function saveCart() { try { localStorage.setItem("mp_cart", JSON.stringify(state.cart)); } catch (e) {} }
  function loadCart() {
    try {
      const c = JSON.parse(localStorage.getItem("mp_cart") || "{}");
      for (const id in c) if (state.byId[id] && c[id] > 0) state.cart[id] = c[id];
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
    if (p.image) return `<div class="thumb" style="background:${esc(p.color || "#eee")}"><img src="${esc(p.image)}" alt="" loading="lazy"></div>`;
    return `<div class="thumb" style="background:${esc(p.color || "#eee")}">${esc(p.emoji || "📦")}</div>`;
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
      (state.cat === "all" || p.category === state.cat) && (!q || p.name.toLowerCase().includes(q)));
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
  function setMainButton(text, visible) {
    if (inTelegram) {
      tg.MainButton.setText(text);
      visible ? tg.MainButton.show() : tg.MainButton.hide();
    } else {
      const b = $("#fallback-btn"); b.textContent = text; b.hidden = !visible;
    }
  }
  function onMainButton() {
    if (state.view === "catalog") showView("cart");
    else if (state.view === "cart") { if (cartCount()) showView("checkout"); }
    else if (state.view === "checkout") submitOrder();
  }

  function render() {
    renderGrid();
    renderCart();
    const n = cartCount(), t = money(cartTotal());
    if (state.view === "catalog") setMainButton(`🛒 Savat (${n}) — ${t}`, n > 0);
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
  function goBack() { showView(state.view === "checkout" ? "cart" : "catalog"); }

  // ---------- Buyurtma ----------
  function submitOrder() {
    const f = $("#form");
    const data = {
      name: f.elements.name.value.trim(),
      phone: f.elements.phone.value.trim(),
      delivery: f.elements.delivery.value,
      address: f.elements.address.value.trim(),
      comment: f.elements.comment.value.trim(),
    };
    const errors = [];
    f.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    if (data.name.length < 2) { errors.push("Ismingizni kiriting"); f.elements.name.classList.add("invalid"); }
    if (data.phone.replace(/\D/g, "").length < 9) { errors.push("Telefon raqamni to'liq kiriting"); f.elements.phone.classList.add("invalid"); }
    if (data.delivery === "delivery" && data.address.length < 5) { errors.push("Manzilni kiriting"); f.elements.address.classList.add("invalid"); }
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
      const b = e.target.closest("[data-act],[data-cat]");
      if (!b) return;
      if (b.dataset.cat) { state.cat = b.dataset.cat; renderChips(); renderGrid(); return; }
      const id = b.dataset.id, q = state.cart[id] || 0;
      if (b.dataset.act === "add") { setQty(id, 1); toast("Savatga qo'shildi"); }
      if (b.dataset.act === "inc") setQty(id, q + 1);
      if (b.dataset.act === "dec") setQty(id, q - 1);
    });
    $("#search").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
    $("#clear-cart").addEventListener("click", () => { state.cart = {}; saveCart(); render(); });
    $("#fallback-btn").addEventListener("click", onMainButton);
    $("#form").addEventListener("change", () => {
      $("#address-wrap").hidden = $("#form").elements.delivery.value !== "delivery";
    });
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
      const res = await fetch("products.json", { cache: "no-store" });
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
  }

  init();
})();
