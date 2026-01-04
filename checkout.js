let allProducts = [];
let cart = loadCart();

const summaryEl = document.querySelector("#summary");
const totalEl = document.querySelector("#total");
const cartCountEl = document.querySelector("#cartCount");

const form = document.querySelector("#checkoutForm");
const confirmation = document.querySelector("#confirmation");
const orderRefEl = document.querySelector("#orderRef");

// modal panier (optionnel)
const cartModal = document.querySelector("#cartModal");
const cartItemsEl = document.querySelector("#cartItems");
const cartTotalEl = document.querySelector("#cartTotal");
const openCartBtn = document.querySelector("#openCart");
const closeCartBtn = document.querySelector("#closeCart");
const checkoutBtn = document.querySelector("#checkoutBtn");

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

/* --- Modal panier (pour rester cohérent) --- */
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

    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <img src="${p.image_url}" alt="${p.name}">
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

/* --- Soumission commande (simulation) --- */
form?.addEventListener("submit", (e) => {
  e.preventDefault();

  if (Object.keys(cart).length === 0) {
    alert("Votre panier est vide.");
    return;
  }

  const ref = "MT-" + Math.random().toString(16).slice(2, 8).toUpperCase();

  // Ici plus tard : on enverra la commande à un backend / Stripe
  orderRefEl.textContent = ref;

  // Vide le panier
  cart = {};
  saveCart();
  updateCartBadge();
  renderSummary();

  // Affiche confirmation
  form.closest(".checkout-card").classList.add("hidden");
  confirmation.classList.remove("hidden");
});

/* --- Init --- */
async function init() {
  try {
    allProducts = await fetchProductsFromSheet();
    updateCartBadge();
    renderSummary();
  } catch (err) {
    summaryEl.textContent = "Erreur de chargement (produits).";
    console.error(err);
  }
}
init();
