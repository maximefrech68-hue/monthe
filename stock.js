// Configuration
const ADMIN_PASSWORD = "Pdjs895(!s$";
const PRODUCTS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

// Éléments DOM
const loginScreen = document.getElementById("loginScreen");
const stockPanel = document.getElementById("stockPanel");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const stockBody = document.getElementById("stockBody");
const searchEl = document.getElementById("search");
const categoryFilterEl = document.getElementById("categoryFilter");
const stockFilterEl = document.getElementById("stockFilter");
const productCount = document.getElementById("productCount");
const lowStockCount = document.getElementById("lowStockCount");

let allProducts = [];

// Authentification
function checkAuth() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";
  if (isAuthenticated) {
    showStockPanel();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  stockPanel.classList.add("hidden");
}

function showStockPanel() {
  loginScreen.classList.add("hidden");
  stockPanel.classList.remove("hidden");
  init();
}

function showError(message) {
  loginError.textContent = message;
  loginError.style.display = "block";
  setTimeout(() => {
    loginError.style.display = "none";
  }, 5000);
}

// Gestion de la connexion
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;

  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem("adminAuth", "true");
    showStockPanel();
    loginForm.reset();
  } else {
    showError("Mot de passe incorrect.");
  }
});

// Gestion de la déconnexion
logoutBtn.addEventListener("click", () => {
  if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
    sessionStorage.removeItem("adminAuth");
    window.location.href = "index.html";
  }
});

// Récupération des produits depuis Google Sheet
async function fetchProductsFromSheet() {
  try {
    const res = await fetch(PRODUCTS_SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Erreur chargement Google Sheet");

    const csv = await res.text();
    const lines = csv
      .split("\n")
      .map((l) => l.replace(/\r/g, ""))
      .filter((l) => l.trim() !== "");

    const sep = ",";
    const headers = parseCSVLine(lines[0], sep);

    const products = lines.slice(1).map((line) => {
      const values = parseCSVLine(line, sep);
      const p = {};
      headers.forEach((h, i) => {
        p[h] = values[i] ?? "";
      });

      // Conversions
      p.price_eur = Number(p.price_eur || 0);
      p.stock = Number(p.stock || 0);

      return p;
    });

    return products;
  } catch (error) {
    console.error("Erreur:", error);
    return [];
  }
}

// Fonctions de parsing CSV
function parseCSVLine(line, sep = ",") {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => cleanCell(s));
}

function cleanCell(s) {
  return (s ?? "").replace(/^\uFEFF/, "").trim();
}

function normalize(s) {
  return (s ?? "").toString().toLowerCase().trim();
}

// Rendu des produits en tableau
function renderProducts(products) {
  stockBody.innerHTML = "";

  if (products.length === 0) {
    stockBody.innerHTML =
      '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Aucun produit trouvé.</td></tr>';
    return;
  }

  // Compter les produits en alerte
  const lowStock = products.filter((p) => p.stock < 5).length;
  productCount.textContent = products.length;
  lowStockCount.textContent = lowStock;

  products.forEach((p) => {
    const row = document.createElement("tr");

    // Ajouter la classe low-stock si stock < 5
    if (p.stock < 5) {
      row.classList.add("low-stock");
    }

    // Badge catégorie
    const categoryClass = `category-${normalize(p.category)}`;

    row.innerHTML = `
      <td><strong>${p.id}</strong></td>
      <td>${p.name}</td>
      <td><span class="category-badge ${categoryClass}">${p.category}</span></td>
      <td><strong>${p.price_eur.toFixed(2)} €</strong></td>
      <td><strong style="font-size: 16px;">${p.stock}</strong></td>
      <td>
        <div class="stock-controls">
          <button class="btn-stock btn-decrement" data-id="${p.id}" data-action="decrement">−</button>
          <input type="number" class="stock-input" value="${p.stock}" data-id="${p.id}" min="0" />
          <button class="btn-stock btn-increment" data-id="${p.id}" data-action="increment">+</button>
        </div>
      </td>
    `;

    stockBody.appendChild(row);
  });
}

// Filtrage des produits
function applyFilters() {
  const q = normalize(searchEl?.value);
  const category = normalize(categoryFilterEl?.value);
  const stockFilter = normalize(stockFilterEl?.value);

  let filtered = [...allProducts];

  // Filtre recherche
  if (q) {
    filtered = filtered.filter(
      (p) =>
        normalize(p.id).includes(q) ||
        normalize(p.name).includes(q) ||
        normalize(p.category).includes(q)
    );
  }

  // Filtre catégorie
  if (category && category !== "all") {
    filtered = filtered.filter((p) => normalize(p.category) === category);
  }

  // Filtre stock
  if (stockFilter && stockFilter !== "all") {
    if (stockFilter === "low") {
      filtered = filtered.filter((p) => p.stock < 5);
    } else if (stockFilter === "ok") {
      filtered = filtered.filter((p) => p.stock >= 5);
    }
  }

  renderProducts(filtered);
}

// Mettre à jour le stock d'un produit
async function updateProductStock(productId, newStock) {
  try {
    console.log(`Mise à jour stock ${productId} -> ${newStock}`);

    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateStock",
        product_id: productId,
        stock: newStock,
      }),
    });

    // Mettre à jour localement
    const product = allProducts.find((p) => p.id === productId);
    if (product) {
      product.stock = newStock;
      applyFilters(); // Rafraîchir l'affichage
    }

    console.log("Stock mis à jour avec succès");
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de la mise à jour du stock.");
  }
}

// Gestion des actions
stockBody.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-stock");
  if (!btn) return;

  const productId = btn.dataset.id;
  const action = btn.dataset.action;
  const product = allProducts.find((p) => p.id === productId);

  if (!product) return;

  let newStock = product.stock;

  if (action === "increment") {
    newStock = product.stock + 1;
  } else if (action === "decrement") {
    newStock = Math.max(0, product.stock - 1);
  }

  await updateProductStock(productId, newStock);
});

// Gestion de l'input manuel
stockBody.addEventListener("change", async (e) => {
  const input = e.target.closest(".stock-input");
  if (!input) return;

  const productId = input.dataset.id;
  const newStock = parseInt(input.value, 10);

  if (isNaN(newStock) || newStock < 0) {
    alert("Veuillez entrer un nombre valide (≥ 0)");
    const product = allProducts.find((p) => p.id === productId);
    if (product) {
      input.value = product.stock;
    }
    return;
  }

  await updateProductStock(productId, newStock);
});

// Initialisation
async function init() {
  try {
    allProducts = await fetchProductsFromSheet();
    renderProducts(allProducts);

    searchEl?.addEventListener("input", applyFilters);
    categoryFilterEl?.addEventListener("change", applyFilters);
    stockFilterEl?.addEventListener("change", applyFilters);
  } catch (err) {
    stockBody.innerHTML =
      '<tr><td colspan="6">Erreur de chargement des produits.</td></tr>';
    console.error(err);
  }
}

// Vérifier l'auth au chargement
checkAuth();
