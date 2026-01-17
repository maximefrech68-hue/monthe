// Configuration
const ACHATS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=ACHATS%20(Registre%20des%20d%C3%A9penses)";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

let allDepenses = [];
let currentFile = null;

// Elements DOM
const mainContent = document.getElementById("mainContent");
const depensesTableBody = document.getElementById("depensesTableBody");
const totalEntries = document.getElementById("totalEntries");

// Modal
const depenseModal = document.getElementById("depenseModal");
const closeModalBtn = document.getElementById("closeModal");
const depenseForm = document.getElementById("depenseForm");
const addDepenseBtn = document.getElementById("addDepenseBtn");
const cancelBtn = document.getElementById("cancelBtn");

// Filtres
const filterDate = document.getElementById("filterDate");
const filterFournisseur = document.getElementById("filterFournisseur");
const filterCategorie = document.getElementById("filterCategorie");
const resetFilters = document.getElementById("resetFilters");
const exportCSV = document.getElementById("exportCSV");

// Upload
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const filePreview = document.getElementById("filePreview");

// Chargement automatique
document.addEventListener("DOMContentLoaded", () => {
  loadDepenses();
});

// Parser une ligne CSV
function parseCSVLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Charger les dépenses
async function loadDepenses() {
  try {
    const res = await fetch(ACHATS_SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Erreur chargement Google Sheet");

    const csv = await res.text();
    const lines = csv
      .split("\n")
      .map((l) => l.replace(/\r/g, ""))
      .filter((l) => l.trim() !== "");

    const sep = ",";
    const headers = parseCSVLine(lines[0], sep);

    allDepenses = lines.slice(1).map((line) => {
      const values = parseCSVLine(line, sep);
      const d = {};
      headers.forEach((h, i) => {
        d[h] = values[i] ?? "";
      });

      // Mapper les colonnes
      d.date = d["Date"] || "";
      d.fournisseur = d["Fournisseur"] || "";
      d.categorie = d["Catégorie"] || "";
      d.description = d["Description"] || "";
      d.montant_ht = Number(String(d["HT"] || "0").replace(",", "."));
      d.tva = Number(String(d["TVA"] || "0").replace(",", "."));
      d.montant_ttc = Number(String(d["TTC"] || "0").replace(",", "."));
      d.paiement = d["Paiement"] || "";
      d.justificatif = d["Justificatif"] || "";

      return d;
    });

    // Trier par date décroissante
    allDepenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    updateFilters();
    renderTable();
  } catch (error) {
    console.error("Erreur:", error);
    depensesTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem; color: #c00;">Erreur de chargement : ${error.message}</td></tr>`;
  }
}

// Mettre à jour les filtres en cascade
function updateFilters() {
  const dates = [...new Set(allDepenses.map((d) => d.date).filter((d) => d))].sort().reverse();
  const fournisseurs = [...new Set(allDepenses.map((d) => d.fournisseur).filter((f) => f))].sort();
  const categories = [...new Set(allDepenses.map((d) => d.categorie).filter((c) => c))].sort();

  // Remplir les selects
  filterDate.innerHTML = '<option value="">Toutes les dates</option>' +
    dates.map((d) => `<option value="${d}">${d}</option>`).join("");

  filterFournisseur.innerHTML = '<option value="">Tous les fournisseurs</option>' +
    fournisseurs.map((f) => `<option value="${f}">${f}</option>`).join("");

  filterCategorie.innerHTML = '<option value="">Toutes les catégories</option>' +
    categories.map((c) => `<option value="${c}">${c}</option>`).join("");
}

// Filtrer les dépenses
function getFilteredDepenses() {
  let filtered = [...allDepenses];

  const dateFilter = filterDate.value;
  const fournisseurFilter = filterFournisseur.value;
  const categorieFilter = filterCategorie.value;

  if (dateFilter) {
    filtered = filtered.filter((d) => d.date === dateFilter);
  }

  if (fournisseurFilter) {
    filtered = filtered.filter((d) => d.fournisseur === fournisseurFilter);
  }

  if (categorieFilter) {
    filtered = filtered.filter((d) => d.categorie === categorieFilter);
  }

  return filtered;
}

// Render le tableau
function renderTable() {
  const filtered = getFilteredDepenses();

  totalEntries.textContent = `${filtered.length} entrée(s)`;

  if (filtered.length === 0) {
    depensesTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem; color: #999;">Aucune entrée trouvée.</td></tr>`;
    return;
  }

  depensesTableBody.innerHTML = filtered
    .map(
      (d, idx) => {
        const safeDate = (d.date || "").replace(/'/g, "\\'");
        const safeFournisseur = (d.fournisseur || "").replace(/'/g, "\\'");

        return `
      <tr>
        <td><input type="checkbox" data-index="${idx}" /></td>
        <td>${d.date || "-"}</td>
        <td>${d.fournisseur || "-"}</td>
        <td>${d.categorie || "-"}</td>
        <td>${d.description || "-"}</td>
        <td style="text-align: right;">${d.montant_ht.toFixed(2)} €</td>
        <td style="text-align: right;">${d.tva.toFixed(2)} €</td>
        <td style="text-align: right; font-weight: bold;">${d.montant_ttc.toFixed(2)} €</td>
        <td>${d.paiement || "-"}</td>
        <td>
          ${d.justificatif ? `<a href="${d.justificatif}" target="_blank" class="justificatif-link">📄 Voir</a>` : "-"}
        </td>
        <td>
          <button class="action-btn" onclick="editDepense('${safeDate}', '${safeFournisseur}')">✏️ Modifier</button>
          <button class="danger-btn" onclick="deleteDepense('${safeDate}', '${safeFournisseur}')">🗑️</button>
        </td>
      </tr>
    `;
      }
    )
    .join("");
}

// Event listeners filtres
filterDate.addEventListener("change", renderTable);
filterFournisseur.addEventListener("change", renderTable);
filterCategorie.addEventListener("change", renderTable);

resetFilters.addEventListener("click", () => {
  filterDate.value = "";
  filterFournisseur.value = "";
  filterCategorie.value = "";
  renderTable();
});

// Export CSV
exportCSV.addEventListener("click", () => {
  const filtered = getFilteredDepenses();

  const headers = ["Date", "Fournisseur", "Catégorie", "Description", "HT", "TVA", "TTC", "Paiement", "Justificatif"];
  const rows = filtered.map((d) => [
    d.date,
    d.fournisseur,
    d.categorie,
    d.description,
    d.montant_ht.toFixed(2),
    d.tva.toFixed(2),
    d.montant_ttc.toFixed(2),
    d.paiement,
    d.justificatif
  ]);

  const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `depenses_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
});

// Modal - Ajouter
addDepenseBtn.addEventListener("click", () => {
  document.getElementById("modalTitle").textContent = "Ajouter une dépense";
  depenseForm.reset();
  document.getElementById("depenseId").value = "";
  document.getElementById("depenseDate").value = new Date().toISOString().split('T')[0];
  currentFile = null;
  filePreview.style.display = "none";
  depenseModal.classList.remove("hidden");
});

// Modal - Fermer
closeModalBtn.addEventListener("click", () => {
  depenseModal.classList.add("hidden");
});

cancelBtn.addEventListener("click", () => {
  depenseModal.classList.add("hidden");
});

// Clic en dehors du modal
window.addEventListener("click", (e) => {
  if (e.target === depenseModal) {
    depenseModal.classList.add("hidden");
  }
});

// Calcul automatique TVA et TTC
document.getElementById("depenseHT").addEventListener("input", calculateAmountsDepense);
document.getElementById("depenseTauxTVA").addEventListener("input", calculateAmountsDepense);

function calculateAmountsDepense() {
  const ht = parseFloat(document.getElementById("depenseHT").value) || 0;
  const tauxTVA = parseFloat(document.getElementById("depenseTauxTVA").value) || 0;

  const montantTVA = ht * (tauxTVA / 100);
  const ttc = ht + montantTVA;

  document.getElementById("calculatedTVA").textContent = montantTVA.toFixed(2) + " €";
  document.getElementById("calculatedTTC").textContent = ttc.toFixed(2) + " €";
}

// Upload de fichier
uploadArea.addEventListener("click", () => {
  fileInput.click();
});

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFileSelect(files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
  }
});

function handleFileSelect(file) {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

  if (!allowedTypes.includes(file.type)) {
    alert("Type de fichier non autorisé. Utilisez PDF, JPG ou PNG.");
    return;
  }

  if (file.size > maxSize) {
    alert("Fichier trop volumineux. Maximum 5MB.");
    return;
  }

  currentFile = file;
  filePreview.style.display = "block";
  filePreview.innerHTML = `<strong>Fichier sélectionné :</strong> ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

/**
 * Convertit un fichier en base64
 * @param {File} file - Le fichier à convertir
 * @returns {Promise<string>} La chaîne base64 (sans le préfixe data:...)
 */
function getFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Soumettre le formulaire
depenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const depenseId = document.getElementById("depenseId").value;
  const isEditMode = depenseId && depenseId.trim() !== "";

  const date = document.getElementById("depenseDate").value;
  const fournisseur = document.getElementById("depenseFournisseur").value;
  const categorie = document.getElementById("depenseCategorie").value;
  const description = document.getElementById("depenseDescription").value;
  const ht = parseFloat(document.getElementById("depenseHT").value);
  const tauxTVA = parseFloat(document.getElementById("depenseTauxTVA").value);
  const montantTVA = ht * (tauxTVA / 100);
  const ttc = ht + montantTVA;
  const paiement = document.getElementById("depensePaiement").value;

  if (!date || !fournisseur || !categorie || isNaN(ht) || isNaN(tauxTVA) || !paiement) {
    alert("Veuillez remplir tous les champs obligatoires.");
    return;
  }

  // Préparer les données du fichier si présent
  let fileData = null;
  if (currentFile) {
    try {
      const base64Data = await getFileBase64(currentFile);
      fileData = {
        fileName: currentFile.name,
        mimeType: currentFile.type,
        base64Data: base64Data
      };
      console.log("Fichier préparé:", fileData.fileName, "Taille base64:", base64Data.length);
    } catch (error) {
      console.error("Erreur préparation fichier:", error);
      alert("Erreur lors de la préparation du fichier. Veuillez réessayer.");
      return;
    }
  }

  try {
    console.log("===== DÉBUT SOUMISSION FORMULAIRE =====");
    console.log("Mode édition:", isEditMode);
    console.log("depenseId:", depenseId);

    let payload;
    let successMessage;

    if (isEditMode) {
      // Mode modification
      const [originalDate, originalFournisseur] = depenseId.split("|");
      console.log("Date originale:", originalDate);
      console.log("Fournisseur original:", originalFournisseur);

      const updates = {
        Date: date,
        Fournisseur: fournisseur,
        Catégorie: categorie,
        Description: description,
        HT: ht,
        TVA: montantTVA,
        TTC: ttc,
        Paiement: paiement
      };

      payload = {
        action: fileData ? "updateDepenseWithFile" : "updateDepense",
        date: originalDate,
        fournisseur: originalFournisseur,
        updates: updates
      };

      if (fileData) {
        payload.fileData = fileData;
      }

      console.log("Payload MODIFICATION:", JSON.stringify(payload, null, 2));
      successMessage = "Dépense modifiée avec succès !";
    } else {
      // Mode ajout
      const depenseData = {
        Date: date,
        Fournisseur: fournisseur,
        Catégorie: categorie,
        Description: description,
        HT: ht,
        TVA: montantTVA,
        TTC: ttc,
        Paiement: paiement,
        Justificatif: ""
      };

      payload = {
        action: fileData ? "addDepenseWithFile" : "addDepense",
        data: depenseData
      };

      if (fileData) {
        payload.fileData = fileData;
      }

      console.log("Payload AJOUT:", JSON.stringify(payload, null, 2));
      successMessage = "Dépense ajoutée avec succès !";
    }

    console.log("===== ENVOI REQUÊTE FETCH =====");
    console.log("URL:", APPS_SCRIPT_URL);
    console.log("Payload final:", JSON.stringify(payload, null, 2));

    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("✓ Fetch terminé sans erreur");
    console.log("===== FIN SOUMISSION =====");

    alert(successMessage);
    depenseModal.classList.add("hidden");
    setTimeout(() => location.reload(), 500);
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de l'opération: " + error.message);
  }
});

/**
 * Convertit date CSV (JJ/MM/AAAA) vers format input HTML (YYYY-MM-DD)
 * @param {string} dateStr - Date au format "16/01/2026" ou "2026-01-16"
 * @returns {string} Date au format "2026-01-16"
 */
function convertDateToInputFormat(dateStr) {
  if (!dateStr) return "";

  // Si déjà au format YYYY-MM-DD, retourner tel quel
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Si format JJ/MM/AAAA (du CSV)
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  // Sinon retourner tel quel
  return dateStr;
}

// Modifier une dépense
window.editDepense = function(date, fournisseur) {
  console.log("===== editDepense appelée =====");
  console.log("Date:", date);
  console.log("Fournisseur:", fournisseur);

  const depense = allDepenses.find((d) => d.date === date && d.fournisseur === fournisseur);

  if (!depense) {
    console.error("Dépense non trouvée dans allDepenses!");
    return;
  }

  console.log("Dépense trouvée:", depense);

  document.getElementById("modalTitle").textContent = "Modifier la dépense";

  // Stocker la date au format BRUT du CSV pour pouvoir retrouver la ligne dans le backend
  const depenseIdValue = `${depense.date}|${fournisseur}`;
  document.getElementById("depenseId").value = depenseIdValue;
  console.log("depenseId défini à:", depenseIdValue);
  console.log("Format date brute du CSV:", depense.date);

  // Convertir la date du format CSV (16/01/2026) vers format input HTML (2026-01-16)
  const dateInputValue = convertDateToInputFormat(depense.date);
  console.log("Date convertie pour input:", dateInputValue);
  document.getElementById("depenseDate").value = dateInputValue;
  document.getElementById("depenseFournisseur").value = depense.fournisseur;
  document.getElementById("depenseCategorie").value = depense.categorie;
  document.getElementById("depenseDescription").value = depense.description;
  document.getElementById("depenseHT").value = depense.montant_ht.toFixed(2);

  // Calculer le taux de TVA à partir du montant TVA et HT
  const tauxTVA = depense.montant_ht > 0 ? (depense.tva / depense.montant_ht) * 100 : 20;
  document.getElementById("depenseTauxTVA").value = Math.round(tauxTVA * 100) / 100;

  document.getElementById("depensePaiement").value = depense.paiement;

  currentFile = null;
  filePreview.style.display = "none";

  // Déclencher le calcul automatique pour afficher TVA et TTC
  calculateAmountsDepense();

  depenseModal.classList.remove("hidden");
};

// Supprimer une dépense
window.deleteDepense = async function(date, fournisseur) {
  if (!confirm(`Supprimer la dépense du ${date} (${fournisseur}) ?`)) {
    return;
  }

  console.log("1. Tentative de suppression:", { date, fournisseur });
  console.log("2. URL:", APPS_SCRIPT_URL);

  const payload = {
    action: "deleteDepense",
    date: date,
    fournisseur: fournisseur,
  };
  console.log("3. Payload:", JSON.stringify(payload));

  try {
    console.log("4. Envoi de la requête...");

    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("6. Suppression envoyée avec succès");

    setTimeout(() => {
      location.reload();
    }, 500);
  } catch (error) {
    console.error("9. Erreur complète:", error);
    alert("Erreur lors de la suppression: " + error.message);
  }
};
