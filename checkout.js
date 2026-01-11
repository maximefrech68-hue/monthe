let allProducts = [];
let cart = loadCart();

const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxpzkcwbH2a9ZtOBlcaaXMJmQNkD3ZRmcG2K6_0Pnw7M3PET2BasT3enWo4JZpoa3vl/exec";

// IMPORTANT : ton domaine Netlify (prod)
const SITE_URL = "https://zippy-hamster-4154f1.netlify.app";

const summaryEl = document.querySelector("#summary");
const totalEl = document.querySelector("#total");
const cartCountEl = document.querySelector("#cartCount");

const form = document.querySelector("#checkoutForm");
const confirmation = document.querySelector("#confirmation");
const orderRefEl = document.querySelector("#orderRef");

// modal panier
const cartModal = document.querySelector("#cartModal");
const cartItemsEl = document.querySelector("#cartItems");
const cartTotalEl = document.querySelector("#cartTotal");
const openCartBtn = document.querySelector("#openCart");
const closeCartBtn = document.querySelector("#closeCart");
const checkoutBtn = document.querySelector("#checkoutBtn");

/* -------------------- CART UTILS -------------------- */
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("cart") || "{}");
  } catch {
    return {};
  }
}
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}
function cartCount() {
  return Object.values(cart).reduce((s, q) => s + q, 0);
}
function updateCartBadge() {
  if (cartCountEl) cartCountEl.textContent = String(cartCount());
}
function getProductById(id) {
  return allProducts.find((p) => p.id === id);
}
function computeTotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const p = getProductById(id);
    if (!p) continue;
    total += Number(p.price_eur || 0) * qty;
  }
  return total;
}

/* -------------------- RENDER SUMMARY -------------------- */
function renderSummary() {
  if (!summaryEl || !totalEl) return;

  summaryEl.innerHTML = "";
  const entries = Object.entries(cart);

  if (entries.length === 0) {
    summaryEl.innerHTML =
      "<p>Votre panier est vide. <a href='index.html'>Retour boutique</a></p>";
    totalEl.textContent = "0.00";
    return;
  }

  for (const [id, qty] of entries) {
    const p = getProductById(id);
    if (!p) continue;

    const row = document.createElement("div");
    row.className = "summary-item";
    row.innerHTML = `
      <div>
        <strong>${p.name}</strong><br/>
        <span>${qty} × ${Number(p.price_eur || 0).toFixed(2)} €</span>
      </div>
      <div><strong>${(Number(p.price_eur || 0) * qty).toFixed(
        2
      )} €</strong></div>
    `;
    summaryEl.appendChild(row);
  }

  totalEl.textContent = computeTotal().toFixed(2);
}

/* -------------------- MODAL CART -------------------- */
function renderCartModal() {
  if (!cartItemsEl || !cartTotalEl) return;

  cartItemsEl.innerHTML = "";

  const entries = Object.entries(cart);
  if (entries.length === 0) {
    cartItemsEl.innerHTML = "<p>Votre panier est vide.</p>";
    cartTotalEl.textContent = "0.00";
    return;
  }

  for (const [id, qty] of entries) {
    const p = getProductById(id);
    if (!p) continue;

    const img =
      p.image_url || "https://via.placeholder.com/600x400?text=MonTh%C3%A9";

    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <img src="${img}" alt="${p.name}">
      <div>
        <strong>${p.name}</strong><br/>
        <span>${Number(p.price_eur || 0).toFixed(2)} €</span>
      </div>
      <div style="text-align:right;">
        <div class="qty">
          <button data-action="dec" data-id="${id}">-</button>
          <span>${qty}</span>
          <button data-action="inc" data-id="${id}">+</button>
        </div>
        <button class="remove-btn" data-action="remove" data-id="${id}">Supprimer</button>
      </div>
    `;
    cartItemsEl.appendChild(row);
  }

  cartTotalEl.textContent = computeTotal().toFixed(2);
}

function changeQty(id, delta) {
  const next = (cart[id] || 0) + delta;
  if (next <= 0) delete cart[id];
  else cart[id] = next;

  saveCart();
  updateCartBadge();
  renderSummary();
  renderCartModal();
}

cartItemsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!id) return;

  if (action === "inc") changeQty(id, +1);
  if (action === "dec") changeQty(id, -1);
  if (action === "remove") {
    delete cart[id];
    saveCart();
    updateCartBadge();
    renderSummary();
    renderCartModal();
  }
});

openCartBtn?.addEventListener("click", () => {
  cartModal?.classList.remove("hidden");
  renderCartModal();
});
closeCartBtn?.addEventListener("click", () =>
  cartModal?.classList.add("hidden")
);
cartModal?.addEventListener("click", (e) => {
  if (e.target === cartModal) cartModal.classList.add("hidden");
});
checkoutBtn?.addEventListener("click", () => {
  cartModal?.classList.add("hidden");
});

/* -------------------- HELPERS -------------------- */
function buildOrderPayload() {
  const ref = "MT-" + Math.random().toString(16).slice(2, 8).toUpperCase();

  const items = Object.entries(cart)
    .map(([id, qty]) => {
      const p = getProductById(id);
      if (!p) return null;
      return {
        id,
        name: p.name,
        qty,
        price_eur: Number(p.price_eur || 0),
        line_total_eur: Number(p.price_eur || 0) * qty,
      };
    })
    .filter(Boolean);

  return {
    order_ref: ref,
    email: document.querySelector("#email")?.value.trim() || "",
    full_name: document.querySelector("#fullName")?.value.trim() || "",
    address: document.querySelector("#address")?.value.trim() || "",
    city: document.querySelector("#city")?.value.trim() || "",
    zip: document.querySelector("#zip")?.value.trim() || "",
    items,
    total_eur: computeTotal(),
    payment_status: "pending", // on passe "paid" après succès
    created_at: new Date().toISOString(),
  };
}

function savePendingOrder(payload) {
  localStorage.setItem("pending_order", JSON.stringify(payload));
}
function loadPendingOrder() {
  try {
    return JSON.parse(localStorage.getItem("pending_order") || "null");
  } catch {
    return null;
  }
}
function clearPendingOrder() {
  localStorage.removeItem("pending_order");
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "Réponse non-JSON", raw: text };
  }
}

/* -------------------- STRIPE PAYMENT -------------------- */
async function payWithStripe() {
  if (Object.keys(cart).length === 0) {
    alert("Votre panier est vide.");
    return;
  }

  const items = Object.entries(cart)
    .map(([id, qty]) => {
      const p = getProductById(id);
      if (!p) return null;
      return {
        name: p.name,
        unit_amount: Math.round(Number(p.price_eur || 0) * 100),
        quantity: qty,
      };
    })
    .filter(Boolean);

  if (items.length === 0) {
    alert("Impossible de préparer le paiement (produits introuvables).");
    return;
  }

  const res = await fetch("/.netlify/functions/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      success_url: `${SITE_URL}/checkout.html?success=1`,
      cancel_url: `${SITE_URL}/checkout.html?canceled=1`,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur Stripe");

  window.location.href = data.url;
}

/* -------------------- SAVE ORDER TO APPS SCRIPT -------------------- */
async function sendOrderToGoogleSheet(orderPayload) {
  const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(orderPayload),
  });

  const data = await safeJson(res);
  if (!data.ok) throw new Error(data.error || "Erreur Google Sheet");

  return data;
}

/* -------------------- FORM SUBMIT (START PAYMENT) -------------------- */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (Object.keys(cart).length === 0) {
    alert("Votre panier est vide.");
    return;
  }

  // 1) crée commande "pending" et stocke en local
  const payload = buildOrderPayload();

  // minimum de validation
  if (
    !payload.email ||
    !payload.full_name ||
    !payload.address ||
    !payload.city ||
    !payload.zip
  ) {
    alert("Merci de remplir tous les champs.");
    return;
  }

  savePendingOrder(payload);

  // 2) lance Stripe
  try {
    await payWithStripe();
  } catch (err) {
    alert("Paiement impossible : " + err.message);
    console.error(err);
  }
});

/* -------------------- AFTER RETURN FROM STRIPE -------------------- */
async function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const success = params.get("success");
  const canceled = params.get("canceled");

  if (canceled === "1") {
    alert("Paiement annulé. Votre panier est toujours là 🙂");
    return;
  }

  if (success === "1") {
    // Stripe OK → on envoie la commande "paid" à Google Sheet
    const pending = loadPendingOrder();
    if (!pending) {
      alert("Paiement OK, mais commande introuvable (pending_order manquant).");
      return;
    }

    pending.payment_status = "paid";
    pending.paid_at = new Date().toISOString();

    try {
      const data = await sendOrderToGoogleSheet(pending);

      // affiche confirmation
      orderRefEl.textContent = data.order_ref || pending.order_ref;

      // vide panier + cleanup
      cart = {};
      saveCart();
      updateCartBadge();
      renderSummary();
      clearPendingOrder();

      form?.closest(".checkout-card")?.classList.add("hidden");
      confirmation?.classList.remove("hidden");
    } catch (err) {
      alert(
        "Paiement OK, mais erreur d'enregistrement commande : " + err.message
      );
      console.error(err);
    }
  }
}

/* -------------------- INIT -------------------- */
async function init() {
  try {
    allProducts = await fetchProductsFromSheet(); // fournie par products.js
    cart = loadCart();
    updateCartBadge();
    renderSummary();
    await handleStripeReturn();
  } catch (err) {
    if (summaryEl) summaryEl.textContent = "Erreur de chargement (produits).";
    console.error(err);
  }
}
init();
