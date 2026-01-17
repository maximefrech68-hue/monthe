let allProducts = [];
let cart = loadCart();

const GOOGLE_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwrcI_QuLKJtwYFDVwG1V7Z5xjWDRnT9ajYN5J5oY1reNzLStr8uG_WlUV8a2Adr6Y3/exec";

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
        2,
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
      <img src="${img}" alt="${p.name}" referrerpolicy="no-referrer">
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
  cartModal?.classList.add("hidden"),
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
    // Créer et afficher un spinner plein écran
    const loadingOverlay = document.createElement("div");
    loadingOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    const spinner = document.createElement("div");
    spinner.style.cssText = `
      width: 60px;
      height: 60px;
      border: 6px solid #f7f4ef;
      border-top: 6px solid #a0826d;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;

    const text = document.createElement("p");
    text.textContent = "Traitement de votre commande...";
    text.style.cssText = `
      margin-top: 1.5rem;
      font-size: 16px;
      color: #2b2b2b;
    `;

    // Ajouter l'animation spin si elle n'existe pas
    if (!document.querySelector("#spin-keyframes")) {
      const style = document.createElement("style");
      style.id = "spin-keyframes";
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    loadingOverlay.appendChild(spinner);
    loadingOverlay.appendChild(text);
    document.body.appendChild(loadingOverlay);

    // Le header et checkout-page sont déjà masqués par le style inline

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

      // Décrémenter le stock des produits commandés
      try {
        console.log("Décrémentation du stock pour les items:", pending.items);
        const stockRes = await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "decrementStock",
            items: pending.items,
          }),
        });
        const stockData = await safeJson(stockRes);
        console.log("Réponse décrémentation stock:", stockData);
        if (stockData.ok) {
          console.log("✅ Stock décrémenté avec succès:", stockData.data);
        } else {
          console.error("❌ Erreur décrémentation stock:", stockData.error);
        }
      } catch (stockErr) {
        console.error("❌ Exception décrémentation stock:", stockErr);
        // Ne pas bloquer la confirmation même si le stock n'a pas pu être mis à jour
      }

      // affiche confirmation
      orderRefEl.textContent = data.order_ref || pending.order_ref;

      // vide panier + cleanup
      cart = {};
      saveCart();
      updateCartBadge();
      renderSummary();
      clearPendingOrder();

      // Supprimer le spinner et afficher la confirmation
      loadingOverlay.remove();
      confirmation?.classList.remove("hidden");
    } catch (err) {
      // En cas d'erreur, supprimer le spinner et réafficher le formulaire
      loadingOverlay.remove();
      // Supprimer le style inline qui cachait le contenu
      const hideStyle = document.querySelector("style[data-hide-checkout]");
      if (!hideStyle) {
        // Si le style a été injecté via document.write, on doit forcer l'affichage
        document.querySelector("header").style.display = "";
        document.querySelector(".checkout-page").style.display = "";
      }
      alert(
        "Paiement OK, mais erreur d'enregistrement commande : " + err.message,
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
