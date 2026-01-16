// Configuration
// Hash SHA-256 du mot de passe par défaut (fallback)
const DEFAULT_PASSWORD_HASH = "04b60e8e42ac31ab5e5fa8af7e0841a5bd4e40ae7343017dbeac4ad3f845fc5c";
const VENTES_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=VENTES%20(Livre%20des%20recettes)";
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
const accountingPanel = document.getElementById("accountingPanel");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const accountingBody = document.getElementById("accountingBody");
const searchEl = document.getElementById("search");
const dateFilterEl = document.getElementById("dateFilter");
const clientFilterEl = document.getElementById("clientFilter");
const productFilterEl = document.getElementById("productFilter");
const amountFilterEl = document.getElementById("amountFilter");
const exportBtn = document.getElementById("exportBtn");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const editModal = document.getElementById("editModal");
const closeModalBtn = document.getElementById("closeModal");
const cancelEditBtn = document.getElementById("cancelEdit");
const editForm = document.getElementById("editForm");
const ventesCountNumber = document.getElementById("ventesCountNumber");

let allVentes = [];
let displayedVentes = []; // Ventes actuellement affichées (après filtres)
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

// Authentification (copié de orders.js)
function checkAuth() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";
  if (isAuthenticated) {
    showAccountingPanel();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  accountingPanel.classList.add("hidden");

  // Vérifier si l'utilisateur est bloqué
  const blockedUntil = isBlocked();
  if (blockedUntil) {
    disableLoginForm();
    updateLockoutMessage(blockedUntil);
  } else {
    enableLoginForm();
  }
}

function showAccountingPanel() {
  loginScreen.classList.add("hidden");
  accountingPanel.classList.remove("hidden");
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
    showAccountingPanel();
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

// Récupération des ventes depuis Google Sheet
async function fetchVentesFromSheet() {
  try {
    const res = await fetch(VENTES_SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Erreur chargement Google Sheet");

    const csv = await res.text();
    const lines = csv
      .split("\n")
      .map((l) => l.replace(/\r/g, ""))
      .filter((l) => l.trim() !== "");

    const sep = ",";
    const headers = parseCSVLine(lines[0], sep);

    const ventes = lines.slice(1).map((line) => {
      const values = parseCSVLine(line, sep);
      const v = {};
      headers.forEach((h, i) => {
        v[h] = values[i] ?? "";
      });

      // Conversions numériques (remplacer virgule par point pour format français)
      v.montant_ht = Number(String(v["Montant HT"] || "0").replace(",", "."));
      v.tva = Number(String(v["TVA"] || "0").replace(",", "."));
      v.montant_ttc = Number(String(v["Montant TTC"] || "0").replace(",", "."));
      v.frais_paiement = Number(String(v["Frais paiement"] || "0").replace(",", "."));
      v.net_encaisse = Number(String(v["Net encaissé"] || "0").replace(",", "."));

      // Garder la date brute
      v.date_paiement = v["Date paiement"] || "";
      v.order_id = v["N° commande"] || "";
      v.client = v["Client"] || "";
      v.produits = v["Produit"] || "";
      v.moyen_paiement = v["Moyen paiement"] || "";
      v.plateforme = v["Plateforme"] || "";
      v.url_facture = v["url_facture"] || "";

      return v;
    });

    // Trier par date décroissante (plus récent en premier)
    ventes.sort((a, b) => new Date(b.date_paiement) - new Date(a.date_paiement));

    return ventes;
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

// Fonction helper pour formater une date de façon robuste
function formatVenteDate(dateStr) {
  if (!dateStr || dateStr.trim() === "") {
    return "-";
  }

  try {
    // Format français : JJ/MM/AAAA HH:MM:SS
    const frenchDateRegex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
    const match = dateStr.match(frenchDateRegex);

    if (match) {
      const [, day, month, year, hour, minute, second] = match;
      const date = new Date(year, month - 1, day, hour, minute, second);

      if (!isNaN(date.getTime())) {
        return date.toLocaleString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }

    // Si pas de match avec le format français, essayer le parsing standard
    let date = new Date(dateStr);

    if (isNaN(date.getTime())) {
      const isoFormat = dateStr.replace(" ", "T");
      date = new Date(isoFormat);
    }

    if (!isNaN(date.getTime())) {
      return date.toLocaleString("fr-FR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      console.warn("Date invalide après parsing:", dateStr);
      return dateStr;
    }
  } catch (e) {
    console.error("Erreur parsing date:", dateStr, e);
    return dateStr;
  }
}

// Rendu des ventes en tableau
function renderVentes(ventes) {
  accountingBody.innerHTML = "";
  displayedVentes = ventes; // Stocker les ventes affichées

  // Mettre à jour le compteur
  if (ventesCountNumber) {
    ventesCountNumber.textContent = ventes.length;
  }

  if (ventes.length === 0) {
    accountingBody.innerHTML =
      '<tr><td colspan="14" style="text-align: center; padding: 2rem;">Aucune entrée trouvée.</td></tr>';
    selectAllCheckbox.checked = false;
    return;
  }

  ventes.forEach((v) => {
    const row = document.createElement("tr");

    // Formater la date avec heure
    const dateStr = formatVenteDate(v.date_paiement);

    // Lien de téléchargement facture
    const invoiceLink = v.url_facture && v.url_facture.trim() !== ""
      ? `<a href="${v.url_facture}" target="_blank" class="download-link" title="Télécharger la facture">📄 PDF</a>`
      : "-";

    row.innerHTML = `
      <td><input type="checkbox" class="vente-checkbox" data-id="${v.order_id}" /></td>
      <td style="min-width: 140px;">${dateStr}</td>
      <td style="min-width: 120px;"><strong>${v.order_id}</strong></td>
      <td style="min-width: 150px;">${v.client}</td>
      <td style="min-width: 200px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${v.produits}">${v.produits}</td>
      <td style="min-width: 90px; text-align: right;">${v.montant_ht.toFixed(2)} €</td>
      <td style="min-width: 80px; text-align: right;">${v.tva.toFixed(2)} €</td>
      <td style="min-width: 100px; text-align: right;"><strong>${v.montant_ttc.toFixed(2)} €</strong></td>
      <td style="min-width: 100px;">${v.moyen_paiement}</td>
      <td style="min-width: 100px;">${v.plateforme}</td>
      <td style="min-width: 90px; text-align: right;">${v.frais_paiement.toFixed(2)} €</td>
      <td style="min-width: 100px; text-align: right;"><strong>${v.net_encaisse.toFixed(2)} €</strong></td>
      <td style="min-width: 100px;">${invoiceLink}</td>
      <td style="min-width: 150px;">
        <button class="btn-edit" data-id="${v.order_id}">Modifier</button>
        <button class="btn-delete" data-id="${v.order_id}">Supprimer</button>
      </td>
    `;

    accountingBody.appendChild(row);
  });

  // Réinitialiser la checkbox "Tout sélectionner"
  selectAllCheckbox.checked = false;
}

// Filtrage des ventes avec mise à jour en cascade
function applyFilters() {
  const q = normalize(searchEl?.value);
  const dateFilter = normalize(dateFilterEl?.value);
  const clientFilter = normalize(clientFilterEl?.value);
  const productFilter = normalize(productFilterEl?.value);
  const amountFilter = normalize(amountFilterEl?.value);

  let filtered = [...allVentes];

  // Filtre recherche
  if (q) {
    filtered = filtered.filter(
      (v) =>
        normalize(v.order_id).includes(q) ||
        normalize(v.client).includes(q) ||
        normalize(v.produits).includes(q)
    );
  }

  // Filtre date
  if (dateFilter && dateFilter !== "") {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    filtered = filtered.filter((v) => {
      if (!v.date_paiement) return false;

      let venteDate;
      try {
        const frenchDateRegex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
        const match = v.date_paiement.match(frenchDateRegex);

        if (match) {
          const [, day, month, year, hour, minute, second] = match;
          venteDate = new Date(year, month - 1, day, hour, minute, second);
        } else {
          venteDate = new Date(v.date_paiement);
        }
      } catch (e) {
        venteDate = new Date(v.date_paiement);
      }

      if (isNaN(venteDate.getTime())) {
        console.warn('Date invalide:', v.date_paiement);
        return false;
      }

      if (dateFilter === "today") {
        const venteDay = new Date(venteDate);
        venteDay.setHours(0, 0, 0, 0);
        return venteDay.getTime() === today.getTime();
      } else if (dateFilter === "week") {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return venteDate >= weekAgo;
      } else if (dateFilter === "month") {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return venteDate >= monthAgo;
      }
      return true;
    });
  }

  // Filtre client
  if (clientFilter && clientFilter !== "") {
    filtered = filtered.filter((v) => normalize(v.client) === clientFilter);
  }

  // Filtre produit
  if (productFilter && productFilter !== "") {
    filtered = filtered.filter((v) => {
      return normalize(v.produits).includes(productFilter);
    });
  }

  // Filtre montant
  if (amountFilter && amountFilter !== "") {
    filtered = filtered.filter((v) => {
      const amount = v.montant_ttc || 0;
      if (amountFilter === "0-50") {
        return amount >= 0 && amount < 50;
      } else if (amountFilter === "50-100") {
        return amount >= 50 && amount < 100;
      } else if (amountFilter === "100-200") {
        return amount >= 100 && amount < 200;
      } else if (amountFilter === "200+") {
        return amount >= 200;
      }
      return true;
    });
  }

  // Mettre à jour les filtres en cascade
  updateCascadeFilters(filtered);

  renderVentes(filtered);
}

// Mettre à jour les filtres en cascade
function updateCascadeFilters(filteredVentes) {
  const currentClient = clientFilterEl?.value;
  const currentProduct = productFilterEl?.value;

  populateClientFilter(filteredVentes);
  populateProductFilter(filteredVentes);

  // Restaurer les valeurs sélectionnées si elles existent toujours
  if (currentClient && Array.from(clientFilterEl.options).some(o => o.value === currentClient)) {
    clientFilterEl.value = currentClient;
  }
  if (currentProduct && Array.from(productFilterEl.options).some(o => o.value === currentProduct)) {
    productFilterEl.value = currentProduct;
  }
}

// Peupler dynamiquement le filtre des clients
function populateClientFilter(ventes = allVentes) {
  const clients = new Set();
  ventes.forEach((v) => {
    if (v.client && v.client.trim() !== "") {
      clients.add(v.client.trim());
    }
  });

  const sortedClients = Array.from(clients).sort();

  clientFilterEl.innerHTML = '<option value="">Tous les clients</option>';

  sortedClients.forEach((client) => {
    const option = document.createElement("option");
    option.value = normalize(client);
    option.textContent = client;
    clientFilterEl.appendChild(option);
  });
}

// Peupler dynamiquement le filtre des produits
function populateProductFilter(ventes = allVentes) {
  const products = new Set();
  ventes.forEach((v) => {
    if (v.produits && v.produits.trim() !== "") {
      // Diviser les produits séparés par virgule
      const productList = v.produits.split(",").map(p => p.trim());
      productList.forEach(p => {
        if (p !== "") products.add(p);
      });
    }
  });

  const sortedProducts = Array.from(products).sort();

  productFilterEl.innerHTML = '<option value="">Tous les produits</option>';

  sortedProducts.forEach((product) => {
    const option = document.createElement("option");
    option.value = normalize(product);
    option.textContent = product;
    productFilterEl.appendChild(option);
  });
}

// Gestion des actions (Modifier, Supprimer)
accountingBody.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".btn-edit");
  const deleteBtn = e.target.closest(".btn-delete");

  if (editBtn) {
    const orderId = editBtn.dataset.id;
    showEditModal(orderId);
  }

  if (deleteBtn) {
    const orderId = deleteBtn.dataset.id;
    if (confirm(`Voulez-vous vraiment supprimer l'entrée ${orderId} ?`)) {
      await deleteVente(orderId);
    }
  }
});

// Calculer les montants automatiquement
function calculateAmounts() {
  const ttc = parseFloat(document.getElementById("editMontantTTC").value) || 0;
  const tauxTVA = parseFloat(document.getElementById("editTauxTVA").value) || 0;
  const frais = parseFloat(document.getElementById("editFraisPaiement").value) || 0;

  // Calculs
  const ht = ttc / (1 + tauxTVA / 100);
  const tva = ttc - ht;
  const net = ht - frais;

  // Afficher les valeurs calculées
  document.getElementById("calculatedHT").textContent = ht.toFixed(2) + " €";
  document.getElementById("calculatedTVA").textContent = tva.toFixed(2) + " €";
  document.getElementById("calculatedNet").textContent = net.toFixed(2) + " €";
}

// Afficher modal d'édition
function showEditModal(orderId) {
  const vente = allVentes.find((v) => v.order_id === orderId);
  if (!vente) return;

  // Remplir le formulaire
  document.getElementById("editOrderId").value = vente.order_id;
  document.getElementById("editMontantTTC").value = vente.montant_ttc.toFixed(2);

  // Calculer le taux TVA depuis les données existantes
  const tauxTVA = vente.montant_ttc > 0 ? ((vente.tva / (vente.montant_ttc - vente.tva)) * 100) : 20;
  document.getElementById("editTauxTVA").value = tauxTVA.toFixed(2);

  document.getElementById("editFraisPaiement").value = vente.frais_paiement.toFixed(2);

  // Calculer et afficher les montants
  calculateAmounts();

  // Ajouter les listeners pour recalcul automatique
  document.getElementById("editMontantTTC").addEventListener("input", calculateAmounts);
  document.getElementById("editTauxTVA").addEventListener("input", calculateAmounts);
  document.getElementById("editFraisPaiement").addEventListener("input", calculateAmounts);

  // Afficher le modal
  editModal.classList.remove("hidden");
}

// Fermer modal d'édition
closeModalBtn.addEventListener("click", () => {
  editModal.classList.add("hidden");
});

cancelEditBtn.addEventListener("click", () => {
  editModal.classList.add("hidden");
});

window.addEventListener("click", (e) => {
  if (e.target === editModal) {
    editModal.classList.add("hidden");
  }
});

// Sauvegarder les modifications
editForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const orderId = document.getElementById("editOrderId").value;
  const montantTTC = parseFloat(document.getElementById("editMontantTTC").value);
  const tauxTVA = parseFloat(document.getElementById("editTauxTVA").value);
  const fraisPaiement = parseFloat(document.getElementById("editFraisPaiement").value);

  if (!orderId || isNaN(montantTTC) || isNaN(tauxTVA) || isNaN(fraisPaiement)) {
    alert("Veuillez remplir tous les champs obligatoires.");
    return;
  }

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateVente",
        order_id: orderId,
        updates: {
          "Montant TTC": montantTTC,
          "taux_tva": tauxTVA,
          "Frais paiement": fraisPaiement
        }
      }),
    });

    alert("Entrée modifiée avec succès !");
    editModal.classList.add("hidden");
    location.reload();
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de la modification de l'entrée.");
  }
});

// Supprimer une vente
async function deleteVente(orderId) {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteVente",
        order_id: orderId,
      }),
    });

    alert("Entrée supprimée avec succès !");
    location.reload();
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de la suppression de l'entrée.");
  }
}

// Fonction pour échapper les cellules CSV correctement
function escapeCSVCell(cell) {
  if (cell == null) return "";
  const str = String(cell);
  if (str.includes('"') || str.includes(";") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Exporter en CSV
exportBtn.addEventListener("click", () => {
  if (displayedVentes.length === 0) {
    alert("Aucune entrée à exporter.");
    return;
  }

  // Utiliser un point-virgule comme séparateur (standard Excel français)
  const separator = ";";

  // En-têtes du CSV
  const headers = [
    "Date Paiement",
    "N° Commande",
    "Client",
    "Produits",
    "Montant HT (EUR)",
    "TVA (EUR)",
    "Montant TTC (EUR)",
    "Moyen Paiement",
    "Plateforme",
    "Frais Paiement (EUR)",
    "Net Encaissé (EUR)",
    "URL Facture",
  ];

  // Créer les lignes de données
  const rows = displayedVentes.map((v) => {
    return [
      escapeCSVCell(formatVenteDate(v.date_paiement)),
      escapeCSVCell(v.order_id || ""),
      escapeCSVCell(v.client || ""),
      escapeCSVCell(v.produits || ""),
      escapeCSVCell(v.montant_ht ? v.montant_ht.toFixed(2) : "0.00"),
      escapeCSVCell(v.tva ? v.tva.toFixed(2) : "0.00"),
      escapeCSVCell(v.montant_ttc ? v.montant_ttc.toFixed(2) : "0.00"),
      escapeCSVCell(v.moyen_paiement || ""),
      escapeCSVCell(v.plateforme || ""),
      escapeCSVCell(v.frais_paiement ? v.frais_paiement.toFixed(2) : "0.00"),
      escapeCSVCell(v.net_encaisse ? v.net_encaisse.toFixed(2) : "0.00"),
      escapeCSVCell(v.url_facture || ""),
    ];
  });

  // Construire le contenu CSV avec BOM UTF-8 pour Excel
  const BOM = "\uFEFF";
  let csvContent = BOM + headers.join(separator) + "\n";
  rows.forEach((row) => {
    csvContent += row.join(separator) + "\n";
  });

  // Télécharger le fichier
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `comptabilite_ventes_${new Date().toISOString().split("T")[0]}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Checkbox "Tout sélectionner" dans le header du tableau
selectAllCheckbox.addEventListener("change", (e) => {
  const checkboxes = document.querySelectorAll(".vente-checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = e.target.checked;
  });
});

// Réinitialiser tous les filtres
function resetAllFilters() {
  if (searchEl) searchEl.value = "";
  if (dateFilterEl) dateFilterEl.value = "";
  if (clientFilterEl) clientFilterEl.value = "";
  if (productFilterEl) productFilterEl.value = "";
  if (amountFilterEl) amountFilterEl.value = "";

  populateClientFilter(allVentes);
  populateProductFilter(allVentes);

  renderVentes(allVentes);
}

// Initialisation
async function init() {
  try {
    allVentes = await fetchVentesFromSheet();
    populateClientFilter();
    populateProductFilter();
    renderVentes(allVentes);

    searchEl?.addEventListener("input", applyFilters);
    dateFilterEl?.addEventListener("change", applyFilters);
    clientFilterEl?.addEventListener("change", applyFilters);
    productFilterEl?.addEventListener("change", applyFilters);
    amountFilterEl?.addEventListener("change", applyFilters);
    resetFiltersBtn?.addEventListener("click", resetAllFilters);
  } catch (err) {
    accountingBody.innerHTML =
      '<tr><td colspan="14">Erreur de chargement des données comptables.</td></tr>';
    console.error(err);
  }
}

// Initialiser: vérifier l'auth d'abord, puis récupérer le hash en arrière-plan
(async function() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";

  if (isAuthenticated) {
    showAccountingPanel();
    fetchPasswordHash();
  } else {
    await fetchPasswordHash();
    checkAuth();
  }
})();
