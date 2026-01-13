// Configuration
const ADMIN_PASSWORD = "Pdjs895(!s$";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

// Éléments DOM
const loginScreen = document.getElementById("loginScreen");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const container = document.querySelector("#products");
const searchEl = document.querySelector("#search");
const categoryEl = document.querySelector("#category");
const sortEl = document.querySelector("#sort");

let allProducts = [];

// Vérifier l'authentification
function checkAuth() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";
  if (isAuthenticated) {
    showAdminPanel();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  adminPanel.classList.add("hidden");
}

function showAdminPanel() {
  loginScreen.classList.add("hidden");
  adminPanel.classList.remove("hidden");
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
    showAdminPanel();
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

// Normalisation des chaînes
function normalize(s) {
  return (s ?? "").toString().toLowerCase().trim();
}

// Rendre les produits
function renderProducts(products) {
  container.innerHTML = "";

  if (products.length === 0) {
    container.innerHTML = "<p>Aucun produit trouvé.</p>";
    return;
  }

  products.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product";

    // Utiliser une image par défaut si l'URL est vide
    const imageUrl = p.image_url && p.image_url.trim() !== ""
      ? p.image_url
      : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%23f7f4ef'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='24' fill='%23a0826d'%3EMonThé - Pas d'image%3C/text%3E%3C/svg%3E";

    card.innerHTML = `
      <img src="${imageUrl}" alt="${p.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'600\\' height=\\'400\\' viewBox=\\'0 0 600 400\\'%3E%3Crect width=\\'600\\' height=\\'400\\' fill=\\'%23f7f4ef\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-family=\\'Arial\\' font-size=\\'24\\' fill=\\'%23a0826d\\'%3EImage non disponible%3C/text%3E%3C/svg%3E'">
      <h3>${p.name}</h3>
      <p>${p.short_desc ?? ""}</p>
      <p class="price">${Number(p.price_eur || 0).toFixed(2)} €</p>
      <div class="product-actions">
        <button class="primary-btn btn-edit" data-edit="${
          p.id
        }">Modifier</button>
        <button class="primary-btn btn-delete" data-delete="${
          p.id
        }">Supprimer</button>
      </div>
    `;

    container.appendChild(card);
  });
}

// Gestion des actions
container.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("button[data-edit]");
  const deleteBtn = e.target.closest("button[data-delete]");

  if (editBtn) {
    const id = editBtn.dataset.edit;
    window.location.href = `admin-form.html?id=${id}`;
  }

  if (deleteBtn) {
    const id = deleteBtn.dataset.delete;
    if (confirm("Voulez-vous vraiment supprimer ce produit ?")) {
      await deleteProduct(id);
    }
  }
});

// Suppression d'un produit
async function deleteProduct(id) {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "deleteProduct",
        id: id,
      }),
    });

    alert("Produit supprimé avec succès !");
    // Recharger la page pour mettre à jour la liste
    location.reload();
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de la suppression du produit.");
  }
}

// Appliquer les filtres
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

// Charger tous les produits (actifs ET inactifs pour l'admin)
async function fetchAllProducts() {
  try {
    const res = await fetch(
      "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products",
      { cache: "no-store" }
    );
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

      p.price_eur = Number(p.price_eur || 0);
      p.stock = p.stock === "" ? null : Number(p.stock);
      p.active = toBoolOrNull(p.active);

      return p;
    });

    return products;
  } catch (error) {
    console.error("Erreur:", error);
    return [];
  }
}

// Fonctions de parsing CSV (copiées de products.js)
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

function toBoolOrNull(v) {
  const s = cleanCell(v).toLowerCase();
  if (s === "") return null;
  if (["true", "vrai", "1", "yes", "y"].includes(s)) return true;
  if (["false", "faux", "0", "no", "n"].includes(s)) return false;
  return null;
}

// Initialisation
async function init() {
  try {
    allProducts = await fetchAllProducts();
    renderProducts(allProducts);

    searchEl?.addEventListener("input", applyUIFilters);
    categoryEl?.addEventListener("change", applyUIFilters);
    sortEl?.addEventListener("change", applyUIFilters);
  } catch (err) {
    container.textContent = "Erreur de chargement des produits.";
    console.error(err);
  }
}

// Vérifier l'auth au chargement
checkAuth();
