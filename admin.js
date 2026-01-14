// Configuration
// Hash SHA-256 du mot de passe par défaut (fallback)
const DEFAULT_PASSWORD_HASH = "04b60e8e42ac31ab5e5fa8af7e0841a5bd4e40ae7343017dbeac4ad3f845fc5c";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

// Hash actuel (sera récupéré depuis Google Sheets ou utilisera le défaut)
let ADMIN_PASSWORD_HASH = DEFAULT_PASSWORD_HASH;

// Protection anti-brute-force
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes en millisecondes

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
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const container = document.querySelector("#products");
const searchEl = document.querySelector("#search");
const categoryEl = document.querySelector("#category");
const sortEl = document.querySelector("#sort");

let allProducts = [];
let lockoutTimer = null;

// Fonctions anti-brute-force
function getLoginAttempts() {
  try {
    const data = localStorage.getItem("adminLoginAttempts");
    return data ? JSON.parse(data) : { count: 0, blockedUntil: null };
  } catch {
    return { count: 0, blockedUntil: null };
  }
}

function saveLoginAttempts(count, blockedUntil = null) {
  localStorage.setItem("adminLoginAttempts", JSON.stringify({ count, blockedUntil }));
}

function isBlocked() {
  const attempts = getLoginAttempts();
  if (attempts.blockedUntil && Date.now() < attempts.blockedUntil) {
    return attempts.blockedUntil;
  }
  // Si le blocage est expiré, réinitialiser
  if (attempts.blockedUntil && Date.now() >= attempts.blockedUntil) {
    saveLoginAttempts(0, null);
  }
  return false;
}

function incrementFailedAttempts() {
  const attempts = getLoginAttempts();
  const newCount = attempts.count + 1;

  if (newCount >= MAX_ATTEMPTS) {
    const blockedUntil = Date.now() + LOCKOUT_DURATION;
    saveLoginAttempts(newCount, blockedUntil);
    return blockedUntil;
  } else {
    saveLoginAttempts(newCount, null);
    return false;
  }
}

function resetLoginAttempts() {
  saveLoginAttempts(0, null);
}

function formatTimeRemaining(blockedUntil) {
  const remaining = Math.ceil((blockedUntil - Date.now()) / 1000);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateLockoutMessage(blockedUntil) {
  const timeRemaining = formatTimeRemaining(blockedUntil);
  showError(`Trop de tentatives échouées. Réessayez dans ${timeRemaining}.`);

  // Mettre à jour le message chaque seconde
  lockoutTimer = setTimeout(() => {
    if (Date.now() < blockedUntil) {
      updateLockoutMessage(blockedUntil);
    } else {
      showError("");
      enableLoginForm();
      resetLoginAttempts();
    }
  }, 1000);
}

function disableLoginForm() {
  const passwordInput = document.getElementById("password");
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  if (passwordInput) passwordInput.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
}

function enableLoginForm() {
  const passwordInput = document.getElementById("password");
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  if (passwordInput) passwordInput.disabled = false;
  if (submitBtn) submitBtn.disabled = false;
}

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

  // Vérifier si l'utilisateur est bloqué
  const blockedUntil = isBlocked();
  if (blockedUntil) {
    disableLoginForm();
    updateLockoutMessage(blockedUntil);
  } else {
    enableLoginForm();
  }
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
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Vérifier si bloqué
  const blockedUntil = isBlocked();
  if (blockedUntil) {
    updateLockoutMessage(blockedUntil);
    return;
  }

  const password = document.getElementById("password").value;

  // Hasher le mot de passe entré et comparer avec le hash stocké
  const passwordHash = await hashPassword(password);

  if (passwordHash === ADMIN_PASSWORD_HASH) {
    // Connexion réussie - réinitialiser les tentatives
    resetLoginAttempts();
    if (lockoutTimer) clearTimeout(lockoutTimer);
    sessionStorage.setItem("adminAuth", "true");
    showAdminPanel();
    loginForm.reset();
  } else {
    // Échec - incrémenter les tentatives
    const newBlockedUntil = incrementFailedAttempts();

    if (newBlockedUntil) {
      // Bloqué après 3 tentatives
      disableLoginForm();
      updateLockoutMessage(newBlockedUntil);
    } else {
      // Pas encore bloqué
      const attempts = getLoginAttempts();
      const remaining = MAX_ATTEMPTS - attempts.count;
      showError(`Mot de passe incorrect. ${remaining} tentative(s) restante(s).`);
    }
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

    // Utiliser le nouveau parser qui gère les retours à la ligne dans les guillemets
    const lines = parseCSVToLines(csv);

    if (lines.length === 0) {
      console.warn("Aucune ligne trouvée dans le CSV");
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

      p.price_eur = Number(p.price_eur || 0);
      p.stock = p.stock === "" ? null : Number(p.stock);
      p.active = toBoolOrNull(p.active);

      return p;
    });

    // ✅ Filtrer les produits invalides (sans ID ou avec ID vide)
    const validProducts = products.filter((p) => p.id && p.id.trim() !== "");

    console.log("Admin - Produits totaux:", products.length);
    console.log("Admin - Produits valides:", validProducts.length);

    return validProducts;
  } catch (error) {
    console.error("Erreur:", error);
    return [];
  }
}

// Fonctions de parsing CSV (copiées de products.js)
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

// Initialiser: vérifier l'auth d'abord, puis récupérer le hash en arrière-plan
(async function() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";

  if (isAuthenticated) {
    // Si déjà authentifié, afficher le contenu immédiatement
    showAdminPanel();
    // Récupérer le hash en arrière-plan (pour prochaine connexion)
    fetchPasswordHash();
  } else {
    // Si non authentifié, récupérer le hash puis afficher la page de connexion
    await fetchPasswordHash();
    checkAuth();
  }
})();
