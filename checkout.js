let allProducts = [];
let cart = loadCart();

const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzDJg_qstHTSrSg6HJi6-UdaJ5XkXX5PXde7Bw5JWqXso2lgYsWP2BoIjr73oe140Fd/exec";

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
  if (!cartItemsEl) return;
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
      p.image_url || "https://via.placeholder.com/120x80?text=MonTh%C3%A9";

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

/* -------------------- STRIPE PAYMENT -------------------- */
async function payWithStripe() {
  // 1) panier vide ?
  if (Object.keys(cart).length === 0) {
    alert("Votre panier est vide.");
    return;
  }

  // 2) construire items Stripe
  const items = Object.entries(cart)
    .map(([id, qty]) => {
      const p = getProductById(id);
      if (!p) return null;

      return {
        name: p.name,
        unit_amount: Math.round(Number(p.price_eur || 0) * 100), // centimes
        quantity: qty,
      };
    })
    .filter(Boolean);

  if (items.length === 0) {
    alert("Impossible de préparer le paiement (produits introuvables).");
    return;
  }

  // 3) appeler function Netlify
  const res = await fetch("/.netlify/functions/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      success_url: `${SITE_URL}/checkout.html?success=1`,
      cancel_url: `${SITE_URL}/checkout.html?canceled=1`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Erreur Stripe");
  }

  // 4) redirection
  window.location.href = data.url;
}

/* -------------------- FORM SUBMIT (REAL PAYMENT) ------------------- */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (Object.keys(cart).length === 0) {
    alert("Votre panier est vide.");
    return;
  }

  const ref = "MT-" + Math.random().toString(16).slice(2, 8).toUpperCase();

  // prépare items détaillés
  const items = Object.entries(cart).map(([id, qty]) => {
    const p = getProductById(id);
    return {
      id,
      name: p?.name || id,
      qty,
      price_eur: Number(p?.price_eur || 0),
      line_total_eur: Number(p?.price_eur || 0) * qty,
    };
  });

  const payload = {
    order_ref: ref,
    full_name: document.querySelector("#fullName").value.trim(),
    email: document.querySelector("#email").value.trim(),
    address: document.querySelector("#address").value.trim(),
    city: document.querySelector("#city").value.trim(),
    zip: document.querySelector("#zip").value.trim(),
    items,
    total_eur: computeTotal(),
  };

  try {
    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // important pour Apps Script
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Erreur inconnue");

    // OK => affiche confirmation + vide panier
    orderRefEl.textContent = data.order_ref || ref;

    cart = {};
    saveCart();
    updateCartBadge();
    renderSummary();

    form.closest(".checkout-card").classList.add("hidden");
    confirmation.classList.remove("hidden");
  } catch (err) {
    alert("Erreur envoi commande : " + err.message);
    console.error(err);
  }
});

/* -------------------- AFTER RETURN FROM STRIPE -------------------- */
// si Stripe renvoie success=1, on peut afficher la confirmation ici
function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const success = params.get("success");
  const canceled = params.get("canceled");

  if (success === "1") {
    // "paiement réussi" (en vrai on devrait vérifier côté serveur,
    // mais pour démarrer, on affiche juste un message)
    const ref = "PAY-" + Math.random().toString(16).slice(2, 8).toUpperCase();
    if (orderRefEl) orderRefEl.textContent = ref;

    cart = {};
    saveCart();
    updateCartBadge();
    renderSummary();

    form?.closest(".checkout-card")?.classList.add("hidden");
    confirmation?.classList.remove("hidden");
  }

  if (canceled === "1") {
    // paiement annulé
    // on ne vide pas le panier
    // petit message simple :
    alert("Paiement annulé. Votre panier est toujours là 🙂");
  }
}

/* -------------------- INIT -------------------- */
async function init() {
  try {
    allProducts = await fetchProductsFromSheet(); // fourni par products.js
    cart = loadCart();
    updateCartBadge();
    renderSummary();
    handleStripeReturn();
  } catch (err) {
    summaryEl.textContent = "Erreur de chargement (produits).";
    console.error(err);
  }
}
init();
