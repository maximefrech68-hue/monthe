// Configuration
// Hash SHA-256 du mot de passe par défaut (fallback)
const DEFAULT_PASSWORD_HASH = "04b60e8e42ac31ab5e5fa8af7e0841a5bd4e40ae7343017dbeac4ad3f845fc5c";
const ORDERS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Orders";
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
const ordersPanel = document.getElementById("ordersPanel");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const ordersBody = document.getElementById("ordersBody");
const searchEl = document.getElementById("search");
const dateFilterEl = document.getElementById("dateFilter");
const clientFilterEl = document.getElementById("clientFilter");
const emailFilterEl = document.getElementById("emailFilter");
const cityFilterEl = document.getElementById("cityFilter");
const productFilterEl = document.getElementById("productFilter");
const amountFilterEl = document.getElementById("amountFilter");
const statusFilterEl = document.getElementById("statusFilter");
const exportBtn = document.getElementById("exportBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const orderModal = document.getElementById("orderModal");
const closeModal = document.querySelector(".close");
const ordersCountNumber = document.getElementById("ordersCountNumber");

let allOrders = [];
let displayedOrders = []; // Commandes actuellement affichées (après filtres)
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

// Authentification (copié de admin.js)
function checkAuth() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";
  if (isAuthenticated) {
    showOrdersPanel();
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  ordersPanel.classList.add("hidden");

  // Vérifier si l'utilisateur est bloqué
  const blockedUntil = isBlocked();
  if (blockedUntil) {
    disableLoginForm();
    updateLockoutMessage(blockedUntil);
  } else {
    enableLoginForm();
  }
}

function showOrdersPanel() {
  loginScreen.classList.add("hidden");
  ordersPanel.classList.remove("hidden");
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
    showOrdersPanel();
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

// Récupération des commandes depuis Google Sheet
async function fetchOrdersFromSheet() {
  try {
    const res = await fetch(ORDERS_SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Erreur chargement Google Sheet");

    const csv = await res.text();
    const lines = csv
      .split("\n")
      .map((l) => l.replace(/\r/g, ""))
      .filter((l) => l.trim() !== "");

    const sep = ",";
    const headers = parseCSVLine(lines[0], sep);

    const orders = lines.slice(1).map((line) => {
      const values = parseCSVLine(line, sep);
      const o = {};
      headers.forEach((h, i) => {
        o[h] = values[i] ?? "";
      });

      // Conversions
      o.total_eur = Number(o.total_eur || 0);

      // Garder la date brute pour debug
      o.date = o.date || "";

      // Parser items_json
      try {
        o.items = JSON.parse(o.items_json || "[]");
      } catch {
        o.items = [];
      }

      return o;
    });

    // Debug: afficher quelques dates brutes
    if (orders.length > 0) {
      console.log("=== DEBUG DATES ===");
      console.log("Première commande - date brute:", orders[0].date);
      console.log("Type:", typeof orders[0].date);
      const testDate = new Date(orders[0].date);
      console.log("Date parsée:", testDate);
      console.log("Date parsée ISO:", testDate.toISOString());
      console.log("Date parsée locale:", testDate.toLocaleString('fr-FR'));
      if (orders.length > 1) {
        console.log("Deuxième commande - date brute:", orders[1].date);
      }
    }

    // Trier par date décroissante (plus récent en premier)
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));

    return orders;
  } catch (error) {
    console.error("Erreur:", error);
    return [];
  }
}

// Fonctions de parsing CSV (copiées de admin.js)
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
function formatOrderDate(dateStr) {
  if (!dateStr || dateStr.trim() === "") {
    return "-";
  }

  try {
    // Format français : JJ/MM/AAAA HH:MM:SS
    // Regex pour capturer les parties de la date
    const frenchDateRegex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
    const match = dateStr.match(frenchDateRegex);

    if (match) {
      // Parser le format français
      const [, day, month, year, hour, minute, second] = match;
      // Créer la date (mois - 1 car les mois commencent à 0 en JavaScript)
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

    // Si la date n'est pas valide, essayer avec un format ISO
    if (isNaN(date.getTime())) {
      // Essayer en remplaçant les espaces par T pour format ISO
      const isoFormat = dateStr.replace(" ", "T");
      date = new Date(isoFormat);
    }

    // Vérifier si la date est maintenant valide
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
      return dateStr; // Retourner la date brute si on ne peut pas la parser
    }
  } catch (e) {
    console.error("Erreur parsing date:", dateStr, e);
    return dateStr; // Retourner la date brute en cas d'erreur
  }
}

// Rendu des commandes en tableau
function renderOrders(orders) {
  ordersBody.innerHTML = "";
  displayedOrders = orders; // Stocker les commandes affichées

  // Mettre à jour le compteur
  if (ordersCountNumber) {
    ordersCountNumber.textContent = orders.length;
  }

  if (orders.length === 0) {
    ordersBody.innerHTML =
      '<tr><td colspan="10" style="text-align: center; padding: 2rem;">Aucune commande trouvée.</td></tr>';
    selectAllCheckbox.checked = false;
    return;
  }

  orders.forEach((o) => {
    const row = document.createElement("tr");

    // Formater la date avec heure
    const dateStr = formatOrderDate(o.date);

    // Badge statut
    const statusClass = o.status === "paid" ? "status-paid" : "status-pending";
    const statusText = o.status === "paid" ? "Payée" : "En attente";

    // Extraire les noms des produits
    const productNames = o.items && o.items.length > 0
      ? o.items.map(item => `${item.name} (×${item.qty})`).join(", ")
      : "-";

    row.innerHTML = `
      <td><input type="checkbox" class="order-checkbox" data-id="${o.order_id}" /></td>
      <td><strong>${o.order_id}</strong></td>
      <td>${dateStr}</td>
      <td>${o.full_name}</td>
      <td>${o.email}</td>
      <td>${o.city} ${o.zip}</td>
      <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${productNames}">${productNames}</td>
      <td><strong>${o.total_eur.toFixed(2)} €</strong></td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>
        <button class="btn-details" data-id="${o.order_id}">Détails</button>
        <button class="btn-delete" data-id="${o.order_id}">Supprimer</button>
      </td>
    `;

    ordersBody.appendChild(row);
  });

  // Réinitialiser la checkbox "Tout sélectionner"
  selectAllCheckbox.checked = false;
}

// Filtrage des commandes avec mise à jour en cascade
function applyFilters() {
  const q = normalize(searchEl?.value);
  const dateFilter = normalize(dateFilterEl?.value);
  const clientFilter = normalize(clientFilterEl?.value);
  const emailFilter = normalize(emailFilterEl?.value);
  const cityFilter = normalize(cityFilterEl?.value);
  const productFilter = normalize(productFilterEl?.value);
  const amountFilter = normalize(amountFilterEl?.value);
  const status = normalize(statusFilterEl?.value);

  let filtered = [...allOrders];

  // Filtre recherche
  if (q) {
    filtered = filtered.filter(
      (o) =>
        normalize(o.order_id).includes(q) ||
        normalize(o.email).includes(q) ||
        normalize(o.full_name).includes(q)
    );
  }

  // Filtre date
  if (dateFilter && dateFilter !== "all") {
    const now = new Date();
    // Créer today en utilisant setHours pour mettre à minuit dans le fuseau horaire local
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    filtered = filtered.filter((o) => {
      if (!o.date) return false;

      // Parser la date de manière robuste
      let orderDate;
      try {
        // Format français : JJ/MM/AAAA HH:MM:SS
        const frenchDateRegex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
        const match = o.date.match(frenchDateRegex);

        if (match) {
          const [, day, month, year, hour, minute, second] = match;
          orderDate = new Date(year, month - 1, day, hour, minute, second);
        } else {
          // Essayer le parsing standard
          orderDate = new Date(o.date);
        }
      } catch (e) {
        orderDate = new Date(o.date);
      }

      // Vérifier que la date est valide
      if (isNaN(orderDate.getTime())) {
        console.warn('Date invalide:', o.date);
        return false;
      }

      if (dateFilter === "today") {
        // Créer une date pour le jour de la commande à minuit dans le même fuseau horaire
        const orderDay = new Date(orderDate);
        orderDay.setHours(0, 0, 0, 0);

        // Debug pour la première commande
        if (filtered.indexOf(o) === 0) {
          console.log("=== DEBUG FILTRE TODAY ===");
          console.log("Date brute commande:", o.date);
          console.log("orderDate:", orderDate);
          console.log("orderDate ISO:", orderDate.toISOString());
          console.log("orderDay (sans heure):", orderDay);
          console.log("orderDay ISO:", orderDay.toISOString());
          console.log("today (sans heure):", today);
          console.log("today ISO:", today.toISOString());
          console.log("orderDay timestamp:", orderDay.getTime());
          console.log("today timestamp:", today.getTime());
          console.log("Égaux?", orderDay.getTime() === today.getTime());
        }

        return orderDay.getTime() === today.getTime();
      } else if (dateFilter === "week") {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return orderDate >= weekAgo;
      } else if (dateFilter === "month") {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return orderDate >= monthAgo;
      }
      return true;
    });
  }

  // Filtre client
  if (clientFilter && clientFilter !== "all") {
    filtered = filtered.filter((o) => normalize(o.full_name) === clientFilter);
  }

  // Filtre email
  if (emailFilter && emailFilter !== "all") {
    filtered = filtered.filter((o) => normalize(o.email) === emailFilter);
  }

  // Filtre ville
  if (cityFilter && cityFilter !== "all") {
    filtered = filtered.filter((o) => normalize(o.city) === cityFilter);
  }

  // Filtre produit
  if (productFilter && productFilter !== "all") {
    filtered = filtered.filter((o) => {
      if (!o.items || o.items.length === 0) return false;
      // Vérifier si au moins un produit correspond au filtre
      return o.items.some((item) => normalize(item.name) === productFilter);
    });
  }

  // Filtre montant
  if (amountFilter && amountFilter !== "all") {
    filtered = filtered.filter((o) => {
      const amount = o.total_eur || 0;
      if (amountFilter === "0-20") {
        return amount >= 0 && amount < 20;
      } else if (amountFilter === "20-50") {
        return amount >= 20 && amount < 50;
      } else if (amountFilter === "50-100") {
        return amount >= 50 && amount < 100;
      } else if (amountFilter === "100+") {
        return amount >= 100;
      }
      return true;
    });
  }

  // Filtre statut
  if (status && status !== "all") {
    if (status === "empty") {
      // Filtrer les commandes avec statut vide
      filtered = filtered.filter((o) => !o.status || o.status.trim() === "");
    } else {
      // Filtrer par statut normal
      filtered = filtered.filter((o) => normalize(o.status) === status);
    }
  }

  // ✅ CASCADE: Mettre à jour les filtres en fonction des résultats filtrés
  updateCascadeFilters(filtered);

  renderOrders(filtered);
}

// Mettre à jour les filtres en cascade (en gardant les valeurs sélectionnées)
function updateCascadeFilters(filteredOrders) {
  // Sauvegarder les valeurs actuellement sélectionnées
  const currentClient = clientFilterEl?.value;
  const currentEmail = emailFilterEl?.value;
  const currentCity = cityFilterEl?.value;
  const currentProduct = productFilterEl?.value;
  const currentStatus = statusFilterEl?.value;

  // Repopuler les filtres avec les valeurs disponibles dans filteredOrders
  populateClientFilter(filteredOrders);
  populateEmailFilter(filteredOrders);
  populateCityFilter(filteredOrders);
  populateProductFilter(filteredOrders);
  populateStatusFilter(filteredOrders);

  // Restaurer les valeurs sélectionnées si elles existent toujours
  if (currentClient && Array.from(clientFilterEl.options).some(o => o.value === currentClient)) {
    clientFilterEl.value = currentClient;
  }
  if (currentEmail && Array.from(emailFilterEl.options).some(o => o.value === currentEmail)) {
    emailFilterEl.value = currentEmail;
  }
  if (currentCity && Array.from(cityFilterEl.options).some(o => o.value === currentCity)) {
    cityFilterEl.value = currentCity;
  }
  if (currentProduct && Array.from(productFilterEl.options).some(o => o.value === currentProduct)) {
    productFilterEl.value = currentProduct;
  }
  if (currentStatus && Array.from(statusFilterEl.options).some(o => o.value === currentStatus)) {
    statusFilterEl.value = currentStatus;
  }
}

// Peupler dynamiquement le filtre des clients
function populateClientFilter(orders = allOrders) {
  const clients = new Set();
  orders.forEach((o) => {
    if (o.full_name && o.full_name.trim() !== "") {
      clients.add(o.full_name.trim());
    }
  });

  // Trier les clients par ordre alphabétique
  const sortedClients = Array.from(clients).sort();

  // Vider les options existantes (sauf "Tous")
  clientFilterEl.innerHTML = '<option value="all">Tous</option>';

  // Ajouter chaque client
  sortedClients.forEach((client) => {
    const option = document.createElement("option");
    option.value = normalize(client);
    option.textContent = client;
    clientFilterEl.appendChild(option);
  });
}

// Peupler dynamiquement le filtre des emails
function populateEmailFilter(orders = allOrders) {
  const emails = new Set();
  orders.forEach((o) => {
    if (o.email && o.email.trim() !== "") {
      emails.add(o.email.trim());
    }
  });

  // Trier les emails par ordre alphabétique
  const sortedEmails = Array.from(emails).sort();

  // Vider les options existantes (sauf "Tous")
  emailFilterEl.innerHTML = '<option value="all">Tous</option>';

  // Ajouter chaque email
  sortedEmails.forEach((email) => {
    const option = document.createElement("option");
    option.value = normalize(email);
    option.textContent = email;
    emailFilterEl.appendChild(option);
  });
}

// Peupler dynamiquement le filtre des villes
function populateCityFilter(orders = allOrders) {
  const cities = new Set();
  orders.forEach((o) => {
    if (o.city && o.city.trim() !== "") {
      cities.add(o.city.trim());
    }
  });

  // Trier les villes par ordre alphabétique
  const sortedCities = Array.from(cities).sort();

  // Vider les options existantes (sauf "Toutes")
  cityFilterEl.innerHTML = '<option value="all">Toutes</option>';

  // Ajouter chaque ville
  sortedCities.forEach((city) => {
    const option = document.createElement("option");
    option.value = normalize(city);
    option.textContent = city;
    cityFilterEl.appendChild(option);
  });
}

// Peupler dynamiquement le filtre des produits
function populateProductFilter(orders = allOrders) {
  const products = new Set();
  orders.forEach((o) => {
    if (o.items && o.items.length > 0) {
      o.items.forEach((item) => {
        if (item.name && item.name.trim() !== "") {
          products.add(item.name.trim());
        }
      });
    }
  });

  // Trier les produits par ordre alphabétique
  const sortedProducts = Array.from(products).sort();

  // Vider les options existantes (sauf "Tous")
  productFilterEl.innerHTML = '<option value="all">Tous</option>';

  // Ajouter chaque produit
  sortedProducts.forEach((product) => {
    const option = document.createElement("option");
    option.value = normalize(product);
    option.textContent = product;
    productFilterEl.appendChild(option);
  });
}

// Peupler dynamiquement le filtre des statuts
function populateStatusFilter(orders = allOrders) {
  const statuses = new Set();
  let hasEmptyStatus = false;

  orders.forEach((o) => {
    if (o.status && o.status.trim() !== "") {
      statuses.add(o.status.trim());
    } else {
      hasEmptyStatus = true;
    }
  });

  // Trier les statuts par ordre alphabétique
  const sortedStatuses = Array.from(statuses).sort();

  // Vider les options existantes (sauf "Tous")
  statusFilterEl.innerHTML = '<option value="all">Tous</option>';

  // Ajouter chaque statut tel quel
  sortedStatuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = normalize(status);
    option.textContent = status;
    statusFilterEl.appendChild(option);
  });

  // Ajouter une option pour les statuts vides (En attente)
  if (hasEmptyStatus) {
    const option = document.createElement("option");
    option.value = "empty";
    option.textContent = "En attente (vide)";
    statusFilterEl.appendChild(option);
  }
}

// Gestion des actions (Détails, Supprimer)
ordersBody.addEventListener("click", async (e) => {
  const detailsBtn = e.target.closest(".btn-details");
  const deleteBtn = e.target.closest(".btn-delete");

  if (detailsBtn) {
    const orderId = detailsBtn.dataset.id;
    showOrderDetails(orderId);
  }

  if (deleteBtn) {
    const orderId = deleteBtn.dataset.id;
    if (confirm(`Voulez-vous vraiment supprimer la commande ${orderId} ?`)) {
      await deleteOrder(orderId);
    }
  }
});

// Afficher détails commande dans modal
function showOrderDetails(orderId) {
  const order = allOrders.find((o) => o.order_id === orderId);
  if (!order) return;

  // Formater la date avec la fonction helper
  const dateStr = formatOrderDate(order.date);

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.qty}</td>
      <td>${Number(item.price_eur || 0).toFixed(2)} €</td>
      <td><strong>${Number(item.line_total_eur || 0).toFixed(2)} €</strong></td>
    </tr>
  `
    )
    .join("");

  const detailsHtml = `
    <h2>Commande ${order.order_id}</h2>
    <p><strong>Date :</strong> ${dateStr}</p>
    <p><strong>Client :</strong> ${order.full_name}</p>
    <p><strong>Email :</strong> ${order.email}</p>
    <p><strong>Adresse :</strong> ${order.address}, ${order.zip} ${order.city}</p>
    <p><strong>Statut :</strong> ${order.status === "paid" ? "✅ Payée" : "⏳ En attente"}</p>

    <h3>Articles commandés</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f7f4ef;">
          <th style="padding: 8px; text-align: left;">Produit</th>
          <th style="padding: 8px; text-align: center;">Qté</th>
          <th style="padding: 8px; text-align: right;">Prix unit.</th>
          <th style="padding: 8px; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <p style="text-align: right; font-size: 18px; margin-top: 1rem;">
      <strong>TOTAL : ${order.total_eur.toFixed(2)} €</strong>
    </p>
  `;

  document.getElementById("orderDetails").innerHTML = detailsHtml;
  orderModal.classList.remove("hidden");
}

// Fermer modal
closeModal.addEventListener("click", () => {
  orderModal.classList.add("hidden");
});

window.addEventListener("click", (e) => {
  if (e.target === orderModal) {
    orderModal.classList.add("hidden");
  }
});

// Supprimer une commande
async function deleteOrder(orderId) {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteOrder",
        order_id: orderId,
      }),
    });

    alert("Commande supprimée avec succès !");
    location.reload();
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de la suppression de la commande.");
  }
}

// Fonction pour échapper les cellules CSV correctement
function escapeCSVCell(cell) {
  if (cell == null) return "";
  const str = String(cell);
  // Si la cellule contient des guillemets, virgules, retours à la ligne ou point-virgules, on l'encadre de guillemets
  if (str.includes('"') || str.includes(";") || str.includes("\n") || str.includes("\r")) {
    // Doubler les guillemets à l'intérieur
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Exporter en CSV
exportBtn.addEventListener("click", () => {
  if (allOrders.length === 0) {
    alert("Aucune commande à exporter.");
    return;
  }

  // Utiliser un point-virgule comme séparateur (standard Excel français)
  const separator = ";";

  // En-têtes du CSV
  const headers = [
    "Référence",
    "Date",
    "Client",
    "Email",
    "Adresse",
    "Ville",
    "Code Postal",
    "Montant (EUR)",
    "Statut",
  ];

  // Créer les lignes de données
  const rows = allOrders.map((o) => {
    return [
      escapeCSVCell(o.order_id || ""),
      escapeCSVCell(formatOrderDate(o.date)),
      escapeCSVCell(o.full_name || ""),
      escapeCSVCell(o.email || ""),
      escapeCSVCell(o.address || ""),
      escapeCSVCell(o.city || ""),
      escapeCSVCell(o.zip || ""),
      escapeCSVCell(o.total_eur ? o.total_eur.toFixed(2) : "0.00"),
      escapeCSVCell(o.status || ""),
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
    `commandes_${new Date().toISOString().split("T")[0]}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Checkbox "Tout sélectionner" dans le header du tableau
selectAllCheckbox.addEventListener("change", (e) => {
  const checkboxes = document.querySelectorAll(".order-checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = e.target.checked;
  });
});

// Bouton "Tout sélectionner" (sélectionne les lignes filtrées visibles)
selectAllBtn.addEventListener("click", () => {
  const checkboxes = document.querySelectorAll(".order-checkbox");
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

  // Toggle : si tout est coché, tout décocher, sinon tout cocher
  checkboxes.forEach((checkbox) => {
    checkbox.checked = !allChecked;
  });

  selectAllCheckbox.checked = !allChecked;
});

// Bouton "Supprimer sélection"
deleteSelectedBtn?.addEventListener("click", async () => {
  console.log("Bouton Supprimer sélection cliqué");
  const checkboxes = document.querySelectorAll(".order-checkbox:checked");
  console.log("Checkboxes cochées:", checkboxes.length);

  if (checkboxes.length === 0) {
    alert("Aucune commande sélectionnée.");
    return;
  }

  const orderIds = Array.from(checkboxes).map((cb) => cb.dataset.id);
  console.log("IDs à supprimer:", orderIds);

  if (
    !confirm(
      `Voulez-vous vraiment supprimer ${orderIds.length} commande(s) ?\n\n${orderIds.join(", ")}`
    )
  ) {
    console.log("Suppression annulée par l'utilisateur");
    return;
  }

  // Supprimer toutes les commandes sélectionnées
  let successCount = 0;
  let errorCount = 0;

  console.log("Début de la suppression...");
  for (const orderId of orderIds) {
    try {
      console.log(`Suppression de ${orderId}...`);
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteOrder",
          order_id: orderId,
        }),
      });
      successCount++;
      console.log(`${orderId} supprimée`);
    } catch (error) {
      console.error(`Erreur suppression ${orderId}:`, error);
      errorCount++;
    }
  }

  console.log(`Résultat: ${successCount} succès, ${errorCount} erreurs`);

  if (errorCount === 0) {
    alert(`${successCount} commande(s) supprimée(s) avec succès !`);
  } else {
    alert(
      `${successCount} commande(s) supprimée(s), ${errorCount} erreur(s).`
    );
  }

  location.reload();
});

// Réinitialiser tous les filtres
function resetAllFilters() {
  // Réinitialiser tous les filtres à "all"
  if (searchEl) searchEl.value = "";
  if (dateFilterEl) dateFilterEl.value = "all";
  if (clientFilterEl) clientFilterEl.value = "all";
  if (emailFilterEl) emailFilterEl.value = "all";
  if (cityFilterEl) cityFilterEl.value = "all";
  if (productFilterEl) productFilterEl.value = "all";
  if (amountFilterEl) amountFilterEl.value = "all";
  if (statusFilterEl) statusFilterEl.value = "all";

  // Repopuler tous les filtres avec toutes les commandes
  populateClientFilter(allOrders);
  populateEmailFilter(allOrders);
  populateCityFilter(allOrders);
  populateProductFilter(allOrders);
  populateStatusFilter(allOrders);

  // Re-rendre toutes les commandes
  renderOrders(allOrders);
}

// Initialisation
async function init() {
  try {
    allOrders = await fetchOrdersFromSheet();
    populateClientFilter();
    populateEmailFilter();
    populateCityFilter();
    populateProductFilter();
    populateStatusFilter();
    renderOrders(allOrders);

    searchEl?.addEventListener("input", applyFilters);
    dateFilterEl?.addEventListener("change", applyFilters);
    clientFilterEl?.addEventListener("change", applyFilters);
    emailFilterEl?.addEventListener("change", applyFilters);
    cityFilterEl?.addEventListener("change", applyFilters);
    productFilterEl?.addEventListener("change", applyFilters);
    amountFilterEl?.addEventListener("change", applyFilters);
    statusFilterEl?.addEventListener("change", applyFilters);
    resetFiltersBtn?.addEventListener("click", resetAllFilters);
  } catch (err) {
    ordersBody.innerHTML =
      '<tr><td colspan="10">Erreur de chargement des commandes.</td></tr>';
    console.error(err);
  }
}

// Initialiser: vérifier l'auth d'abord, puis récupérer le hash en arrière-plan
(async function() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";

  if (isAuthenticated) {
    // Si déjà authentifié, afficher le contenu immédiatement
    showOrdersPanel();
    // Récupérer le hash en arrière-plan (pour prochaine connexion)
    fetchPasswordHash();
  } else {
    // Si non authentifié, récupérer le hash puis afficher la page de connexion
    await fetchPasswordHash();
    checkAuth();
  }
})();
