// --- Panier (copié depuis index) ---
let allProducts = [];
let cart = loadCart();

const cartModal = document.querySelector("#cartModal");
const cartItemsEl = document.querySelector("#cartItems");
const cartTotalEl = document.querySelector("#cartTotal");
const cartCountEl = document.querySelector("#cartCount");
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
function cartTotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(cart)) {
    const p = getProductById(id);
    if (!p) continue;
    total += Number(p.price_eur || 0) * qty;
  }
  return total;
}
function renderCart() {
  if (!cartItemsEl) return;
  const entries = Object.entries(cart);
  cartItemsEl.innerHTML = "";

  if (entries.length === 0) {
    cartItemsEl.innerHTML = "<p>Votre panier est vide.</p>";
    if (cartTotalEl) cartTotalEl.textContent = "0.00";
    return;
  }

  for (const [id, qty] of entries) {
    const p = getProductById(id);
    if (!p) continue;

    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <img src="${p.image_url}" alt="${p.name}" referrerpolicy="no-referrer">
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

  if (cartTotalEl) cartTotalEl.textContent = cartTotal().toFixed(2);
}
function changeQty(id, delta) {
  const next = (cart[id] || 0) + delta;
  if (next <= 0) delete cart[id];
  else cart[id] = next;
  saveCart();
  updateCartBadge();
  renderCart();
}
function removeFromCart(id) {
  delete cart[id];
  saveCart();
  updateCartBadge();
  renderCart();
}
function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  updateCartBadge();
}

openCartBtn?.addEventListener("click", () => {
  cartModal?.classList.remove("hidden");
  renderCart();
});
closeCartBtn?.addEventListener("click", () =>
  cartModal?.classList.add("hidden")
);
cartModal?.addEventListener("click", (e) => {
  if (e.target === cartModal) cartModal.classList.add("hidden");
});
cartItemsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!id) return;

  if (action === "inc") changeQty(id, +1);
  if (action === "dec") changeQty(id, -1);
  if (action === "remove") removeFromCart(id);
});
checkoutBtn?.addEventListener("click", () => {
  window.location.href = "checkout.html";
});

// --- Page produit ---
const productEl = document.querySelector("#product");

function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function renderProduct(p) {
  document.title = `${p.name} – MonThé`;

  productEl.innerHTML = `
    <img src="${p.image_url}" alt="${p.name}" referrerpolicy="no-referrer">
    <div>
      <h2>${p.name}</h2>
      <div class="price" style="font-size:18px;">${Number(
        p.price_eur || 0
      ).toFixed(2)} €</div>

      <div class="kv">
        <b>Catégorie</b><div>${p.category || "-"}</div>
        <b>Format</b><div>${p.format || "-"}</div>
        <b>Origine</b><div>${p.origin || "-"}</div>
        <b>Notes</b><div>${p.tasting_notes || "-"}</div>
        <b>Ingrédients</b><div>${p.ingredients || "-"}</div>
      </div>

      <p>${p.description || ""}</p>

      <button id="addToCart" class="primary-btn">Ajouter au panier</button>
    </div>
  `;

  productEl.querySelector("#addToCart").addEventListener("click", () => {
    addToCart(p.id);
    alert("Ajouté au panier ✅");
  });
}

async function init() {
  try {
    allProducts = await fetchProductsFromSheet();
    updateCartBadge();

    const id = getIdFromUrl();
    if (!id) {
      productEl.textContent = "Produit introuvable (id manquant).";
      return;
    }

    const p = allProducts.find((x) => x.id === id);
    if (!p) {
      productEl.textContent = "Produit introuvable.";
      return;
    }

    renderProduct(p);
  } catch (err) {
    productEl.textContent = "Erreur de chargement du produit.";
    console.error(err);
  }
}

init();
