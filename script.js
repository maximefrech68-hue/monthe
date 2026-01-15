const container = document.querySelector("#products");

const searchEl = document.querySelector("#search");
const categoryEl = document.querySelector("#category");
const sortEl = document.querySelector("#sort");

// Panier UI
const openCartBtn = document.querySelector("#openCart");
const closeCartBtn = document.querySelector("#closeCart");
const cartModal = document.querySelector("#cartModal");
const cartItemsEl = document.querySelector("#cartItems");
const cartTotalEl = document.querySelector("#cartTotal");
const cartCountEl = document.querySelector("#cartCount");
const checkoutBtn = document.querySelector("#checkoutBtn");

let allProducts = [];
let cart = loadCart(); // { [id]: qty }

function normalize(s) {
  return (s ?? "").toString().toLowerCase().trim();
}

/* ------------------ PANIER (localStorage) ------------------ */

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

function getProductById(id) {
  return allProducts.find((p) => p.id === id);
}

function cartCount() {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
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

function updateCartBadge() {
  if (cartCountEl) cartCountEl.textContent = String(cartCount());
}

function addToCart(id) {
  const product = getProductById(id);
  if (!product) return false;

  const stock = Number(product.stock || 0);
  const currentQty = cart[id] || 0;

  // Vérifier si l'ajout dépasserait le stock disponible
  if (currentQty >= stock) {
    alert(`Stock insuffisant. Seulement ${stock} unité(s) disponible(s).`);
    return false;
  }

  cart[id] = currentQty + 1;
  saveCart();
  updateCartBadge();
  return true;
}

function changeQty(id, delta) {
  const product = getProductById(id);
  if (!product) return;

  const stock = Number(product.stock || 0);
  const currentQty = cart[id] || 0;
  const next = currentQty + delta;

  // Empêcher de dépasser le stock
  if (delta > 0 && next > stock) {
    alert(`Stock insuffisant. Seulement ${stock} unité(s) disponible(s).`);
    return;
  }

  if (next <= 0) {
    delete cart[id];
  } else {
    cart[id] = next;
  }
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
      <div>
        <div class="qty-remove-container">
          <div class="qty">
            <button data-action="dec" data-id="${id}">-</button>
            <span>${qty}</span>
            <button data-action="inc" data-id="${id}">+</button>
          </div>
          <button class="remove-btn" data-action="remove" data-id="${id}">Supprimer</button>
        </div>
      </div>
    `;

    cartItemsEl.appendChild(row);
  }

  if (cartTotalEl) cartTotalEl.textContent = cartTotal().toFixed(2);
}

// Events panier
openCartBtn?.addEventListener("click", () => {
  cartModal?.classList.remove("hidden");
  renderCart();
});

closeCartBtn?.addEventListener("click", () => {
  cartModal?.classList.add("hidden");
});

// clic sur fond sombre = fermer
cartModal?.addEventListener("click", (e) => {
  if (e.target === cartModal) cartModal.classList.add("hidden");
});

// actions +/-
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

/* ------------------ LISTE PRODUITS + FILTRES ------------------ */

function renderProducts(products) {
  container.innerHTML = "";

  if (products.length === 0) {
    container.innerHTML = "<p>Aucun produit trouvé.</p>";
    return;
  }

  products.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product";

    // Déterminer le statut du stock
    const stock = Number(p.stock || 0);
    const isInStock = stock > 0;
    const stockBadgeClass = isInStock ? "stock-badge stock-available" : "stock-badge stock-unavailable";
    const stockBadgeText = isInStock ? "En stock" : "Indisponible";

    card.innerHTML = `
      <img src="${p.image_url}" alt="${p.name}" referrerpolicy="no-referrer">
      <h3>${p.name}</h3>
      <p>${p.short_desc ?? ""}</p>
      <div class="price-stock-container">
        <p class="price">${Number(p.price_eur || 0).toFixed(2)} €</p>
        <span class="${stockBadgeClass}">${stockBadgeText}</span>
      </div>
      <button class="primary-btn ${!isInStock ? 'btn-disabled' : ''}" data-add="${p.id}" ${!isInStock ? 'disabled' : ''}>
        ${isInStock ? 'Ajouter au panier' : 'Indisponible'}
      </button>
    `;
    card.style.cursor = "pointer";
    card.addEventListener("click", (e) => {
      // si on clique sur le bouton "Ajouter", on ne navigue pas
      if (e.target.closest("button")) return;
      window.location.href = `product.html?id=${p.id}`;
    });

    container.appendChild(card);
  });
}

// clic "Ajouter au panier"
container.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-add]");
  if (!btn) return;

  // Empêcher l'ajout au panier si le bouton est désactivé
  if (btn.disabled || btn.classList.contains("btn-disabled")) return;

  const id = btn.dataset.add;
  if (addToCart(id)) {
    alert("Ajouté au panier ✅");
  }
});

// applique recherche/filtre/tri
function applyUIFilters() {
  const q = normalize(searchEl?.value);
  const cat = normalize(categoryEl?.value);
  const sort = normalize(sortEl?.value);

  let filtered = [...allProducts];

  if (q) {
    filtered = filtered.filter(
      (p) =>
        normalize(p.name).includes(q) ||
        normalize(p.short_desc).includes(q) ||
        normalize(p.description).includes(q) ||
        normalize(p.tasting_notes).includes(q)
    );
  }

  if (cat && cat !== "all") {
    filtered = filtered.filter((p) => normalize(p.category) === cat);
  }

  if (sort === "price-asc") {
    filtered.sort((a, b) => (a.price_eur || 0) - (b.price_eur || 0));
  } else if (sort === "price-desc") {
    filtered.sort((a, b) => (b.price_eur || 0) - (a.price_eur || 0));
  } else if (sort === "name-asc") {
    filtered.sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));
  }

  renderProducts(filtered);
}

async function init() {
  try {
    allProducts = await fetchProductsFromSheet();

    renderProducts(allProducts);

    // listeners UI
    searchEl?.addEventListener("input", applyUIFilters);
    categoryEl?.addEventListener("change", applyUIFilters);
    sortEl?.addEventListener("change", applyUIFilters);

    updateCartBadge();
  } catch (err) {
    container.textContent = "Erreur de chargement des produits.";
    console.error(err);
  }
}

init();
