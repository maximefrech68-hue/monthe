// Configuration
const ADMIN_PASSWORD = "Pdjs895(!s$";
const ORDERS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Orders";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

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
const amountFilterEl = document.getElementById("amountFilter");
const statusFilterEl = document.getElementById("statusFilter");
const exportBtn = document.getElementById("exportBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAllCheckbox = document.getElementById("selectAllCheckbox");
const orderModal = document.getElementById("orderModal");
const closeModal = document.querySelector(".close");
const ordersCountNumber = document.getElementById("ordersCountNumber");

let allOrders = [];
let displayedOrders = []; // Commandes actuellement affichées (après filtres)

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
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;

  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem("adminAuth", "true");
    showOrdersPanel();
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
      o.date = o.date || "";

      // Parser items_json
      try {
        o.items = JSON.parse(o.items_json || "[]");
      } catch {
        o.items = [];
      }

      return o;
    });

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
      '<tr><td colspan="9" style="text-align: center; padding: 2rem;">Aucune commande trouvée.</td></tr>';
    selectAllCheckbox.checked = false;
    return;
  }

  orders.forEach((o) => {
    const row = document.createElement("tr");

    // Formater la date avec heure
    let dateStr = "-";
    if (o.date && o.date.trim() !== "") {
      try {
        const date = new Date(o.date);
        // Vérifier si la date est valide
        if (!isNaN(date.getTime())) {
          dateStr = date.toLocaleString("fr-FR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch (e) {
        console.error("Erreur parsing date:", o.date, e);
      }
    }

    // Badge statut
    const statusClass = o.status === "paid" ? "status-paid" : "status-pending";
    const statusText = o.status === "paid" ? "Payée" : "En attente";

    row.innerHTML = `
      <td><input type="checkbox" class="order-checkbox" data-id="${o.order_id}" /></td>
      <td><strong>${o.order_id}</strong></td>
      <td>${dateStr}</td>
      <td>${o.full_name}</td>
      <td>${o.email}</td>
      <td>${o.city} ${o.zip}</td>
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

// Filtrage des commandes
function applyFilters() {
  const q = normalize(searchEl?.value);
  const dateFilter = normalize(dateFilterEl?.value);
  const clientFilter = normalize(clientFilterEl?.value);
  const emailFilter = normalize(emailFilterEl?.value);
  const cityFilter = normalize(cityFilterEl?.value);
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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    filtered = filtered.filter((o) => {
      if (!o.date) return false;
      const orderDate = new Date(o.date);

      if (dateFilter === "today") {
        const orderDay = new Date(
          orderDate.getFullYear(),
          orderDate.getMonth(),
          orderDate.getDate()
        );
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

  renderOrders(filtered);
}

// Peupler dynamiquement le filtre des clients
function populateClientFilter() {
  const clients = new Set();
  allOrders.forEach((o) => {
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
function populateEmailFilter() {
  const emails = new Set();
  allOrders.forEach((o) => {
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
function populateCityFilter() {
  const cities = new Set();
  allOrders.forEach((o) => {
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

// Peupler dynamiquement le filtre des statuts
function populateStatusFilter() {
  const statuses = new Set();
  let hasEmptyStatus = false;

  allOrders.forEach((o) => {
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

  // Formater la date de façon sûre
  let dateStr = "-";
  if (order.date && order.date.trim() !== "") {
    try {
      const date = new Date(order.date);
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleString("fr-FR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (e) {
      console.error("Erreur parsing date dans détails:", order.date, e);
    }
  }

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
    // Formater la date de façon sûre
    let dateFormatted = "";
    if (o.date && o.date.trim() !== "") {
      try {
        const date = new Date(o.date);
        if (!isNaN(date.getTime())) {
          dateFormatted = date.toLocaleString("fr-FR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch (e) {
        console.error("Erreur parsing date pour CSV:", o.date, e);
      }
    }

    return [
      escapeCSVCell(o.order_id || ""),
      escapeCSVCell(dateFormatted),
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

// Initialisation
async function init() {
  try {
    allOrders = await fetchOrdersFromSheet();
    populateClientFilter();
    populateEmailFilter();
    populateCityFilter();
    populateStatusFilter();
    renderOrders(allOrders);

    searchEl?.addEventListener("input", applyFilters);
    dateFilterEl?.addEventListener("change", applyFilters);
    clientFilterEl?.addEventListener("change", applyFilters);
    emailFilterEl?.addEventListener("change", applyFilters);
    cityFilterEl?.addEventListener("change", applyFilters);
    amountFilterEl?.addEventListener("change", applyFilters);
    statusFilterEl?.addEventListener("change", applyFilters);
  } catch (err) {
    ordersBody.innerHTML =
      '<tr><td colspan="9">Erreur de chargement des commandes.</td></tr>';
    console.error(err);
  }
}

// Vérifier l'auth au chargement
checkAuth();
