// Configuration
// Hash SHA-256 du mot de passe par défaut (fallback)
const DEFAULT_PASSWORD_HASH = "04b60e8e42ac31ab5e5fa8af7e0841a5bd4e40ae7343017dbeac4ad3f845fc5c";
const PRODUCTS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

// Hash actuel (sera récupéré depuis Google Sheets ou utilisera le défaut)
let ADMIN_PASSWORD_HASH = DEFAULT_PASSWORD_HASH;

// Fonction de hashage SHA-256
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Fonction pour récupérer le hash depuis Google Sheets
async function fetchPasswordHash() {
  // Vérifier d'abord le cache
  const cachedHash = sessionStorage.getItem('adminPasswordHash');
  if (cachedHash) {
    ADMIN_PASSWORD_HASH = cachedHash;
    console.log('Hash chargé depuis le cache');
    return;
  }

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?action=getPasswordHash`);
    const data = await response.json();

    if (data.success && data.hash) {
      ADMIN_PASSWORD_HASH = data.hash;
      // Mettre en cache pour les prochaines pages
      sessionStorage.setItem('adminPasswordHash', data.hash);
      console.log('Hash personnalisé chargé depuis Google Sheets');
    } else {
      console.log('Utilisation du hash par défaut');
    }
  } catch (error) {
    console.warn('Impossible de récupérer le hash personnalisé, utilisation du hash par défaut:', error);
  }
}

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
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;

  // Hasher le mot de passe entré et comparer avec le hash stocké
  const passwordHash = await hashPassword(password);

  if (passwordHash === ADMIN_PASSWORD_HASH) {
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
    sessionStorage.removeItem("adminPasswordHash");
    window.location.href = "index.html";
  }
});

// Récupération des produits depuis Google Sheet
async function fetchProductsFromSheet() {
  try {
    const res = await fetch(PRODUCTS_SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Erreur chargement Google Sheet");

    const csv = await res.text();

    // Utiliser le nouveau parser qui gère les retours à la ligne dans les guillemets
    const lines = parseCSVToLines(csv);

    if (lines.length === 0) {
      console.warn("Aucune ligne trouvée dans le CSV des produits");
      return [];
    }

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
/**
 * Parse le CSV complet en gérant les retours à la ligne dans les champs entre guillemets.
 * Retourne un tableau de lignes (chaque ligne = string complète).
 */
function parseCSVToLines(csv) {
  const lines = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    const nextCh = csv[i + 1];

    // Gérer les guillemets
    if (ch === '"') {
      // Double guillemet "" = guillemet échappé
      if (inQuotes && nextCh === '"') {
        currentLine += '""';
        i++; // Sauter le prochain guillemet
        continue;
      }
      // Sinon, toggle l'état inQuotes
      inQuotes = !inQuotes;
      currentLine += ch;
      continue;
    }

    // Gérer les retours à la ligne
    if (ch === '\n' || ch === '\r') {
      if (!inQuotes) {
        // Fin de ligne réelle (hors guillemets)
        if (currentLine.trim() !== "") {
          lines.push(currentLine);
          currentLine = "";
        }
        // Ignorer \r\n (Windows) en sautant le \n après \r
        if (ch === '\r' && nextCh === '\n') {
          i++;
        }
      } else {
        // On est dans des guillemets, conserver le retour à la ligne
        currentLine += ch;
      }
      continue;
    }

    // Caractère normal
    currentLine += ch;
  }

  // Ajouter la dernière ligne si elle n'est pas vide
  if (currentLine.trim() !== "") {
    lines.push(currentLine);
  }

  return lines;
}

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

// Initialiser: vérifier l'auth d'abord, puis récupérer le hash en arrière-plan
(async function() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";

  if (isAuthenticated) {
    // Si déjà authentifié, afficher le contenu immédiatement
    showStockPanel();
    // Récupérer le hash en arrière-plan (pour prochaine connexion)
    fetchPasswordHash();
  } else {
    // Si non authentifié, récupérer le hash puis afficher la page de connexion
    await fetchPasswordHash();
    checkAuth();
  }
})();
