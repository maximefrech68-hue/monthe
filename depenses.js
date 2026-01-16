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
      (d, idx) => `
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
          <button class="action-btn" onclick="editDepense('${d.date}', '${d.fournisseur}')">✏️ Modifier</button>
          <button class="danger-btn" onclick="deleteDepense('${d.date}', '${d.fournisseur}')">🗑️</button>
        </td>
      </tr>
    `
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

// Upload vers Google Drive
async function uploadFile(file) {
  if (!file) return "";

  try {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        const base64Data = reader.result.split(",")[1];

        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "uploadImage",
            fileName: file.name,
            mimeType: file.type,
            base64Data: base64Data,
          }),
        });

        if (!response.ok) {
          throw new Error("Erreur lors de l'upload");
        }

        const result = await response.json();
        if (result.success && result.driveUrl) {
          resolve(result.driveUrl);
        } else {
          throw new Error(result.message || "Erreur inconnue");
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch (error) {
    console.error("Erreur upload:", error);
    alert("Erreur lors de l'upload du fichier: " + error.message);
    return "";
  }
}

// Soumettre le formulaire
depenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();

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

  // Upload du fichier si présent
  let justificatif = "";
  if (currentFile) {
    justificatif = await uploadFile(currentFile);
  }

  const depenseData = {
    Date: date,
    Fournisseur: fournisseur,
    Catégorie: categorie,
    Description: description,
    HT: ht,
    TVA: montantTVA,
    TTC: ttc,
    Paiement: paiement,
    Justificatif: justificatif
  };

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addDepense",
        data: depenseData,
      }),
    });

    const result = await response.json();
    if (result.success) {
      alert("Dépense ajoutée avec succès !");
      depenseModal.classList.add("hidden");
      setTimeout(() => location.reload(), 500);
    } else {
      throw new Error(result.message || "Erreur inconnue");
    }
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de l'ajout de la dépense: " + error.message);
  }
});

// Modifier une dépense
window.editDepense = function(date, fournisseur) {
  const depense = allDepenses.find((d) => d.date === date && d.fournisseur === fournisseur);
  if (!depense) return;

  document.getElementById("modalTitle").textContent = "Modifier la dépense";
  document.getElementById("depenseId").value = `${date}|${fournisseur}`;
  document.getElementById("depenseDate").value = depense.date;
  document.getElementById("depenseFournisseur").value = depense.fournisseur;
  document.getElementById("depenseCategorie").value = depense.categorie;
  document.getElementById("depenseDescription").value = depense.description;
  document.getElementById("depenseHT").value = depense.montant_ht.toFixed(2);

  // Calculer le taux de TVA à partir du montant TVA et HT
  const tauxTVA = depense.montant_ht > 0 ? (depense.tva / depense.montant_ht) * 100 : 20;
  document.getElementById("depenseTauxTVA").value = tauxTVA.toFixed(2);

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

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteDepense",
        date: date,
        fournisseur: fournisseur,
      }),
    });

    const result = await response.json();
    if (result.success) {
      alert("Dépense supprimée !");
      location.reload();
    } else {
      throw new Error(result.message || "Erreur inconnue");
    }
  } catch (error) {
    console.error("Erreur:", error);
    alert("Erreur lors de la suppression: " + error.message);
  }
};

