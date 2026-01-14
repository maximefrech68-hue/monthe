// Configuration
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

// Éléments DOM
const productForm = document.getElementById("productForm");
const errorMsg = document.getElementById("errorMsg");
const successMsg = document.getElementById("successMsg");
const submitBtn = document.getElementById("submitBtn");
const logoutBtn = document.getElementById("logoutBtn");
const formTitle = document.getElementById("formTitle");
const editModeInput = document.getElementById("editMode");
const originalIdInput = document.getElementById("originalId");
const imageFileInput = document.getElementById("imageFile");
const uploadBtn = document.getElementById("uploadBtn");
const imagePreview = document.getElementById("imagePreview");
const imageUrlInput = document.getElementById("image_url");

let isEditMode = false;
let currentProductId = null;

// Vérifier l'authentification
function checkAuth() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";
  if (!isAuthenticated) {
    alert("Vous devez être connecté pour accéder à cette page.");
    window.location.href = "admin.html";
  }
}

// Déconnexion
logoutBtn.addEventListener("click", () => {
  if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
    sessionStorage.removeItem("adminAuth");
    window.location.href = "index.html";
  }
});

// Afficher les messages
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = "block";
  successMsg.style.display = "none";
  setTimeout(() => {
    errorMsg.style.display = "none";
  }, 5000);
}

function showSuccess(message) {
  successMsg.textContent = message;
  successMsg.style.display = "block";
  errorMsg.style.display = "none";
  setTimeout(() => {
    successMsg.style.display = "none";
  }, 5000);
}

// Auto-génération de l'ID
document.getElementById("name").addEventListener("input", (e) => {
  const idField = document.getElementById("id");
  if (!idField.value || !isEditMode) {
    const name = e.target.value;
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    idField.value = slug;
  }
});

// Gestion de l'upload d'image vers Google Drive
uploadBtn.addEventListener("click", async () => {
  const file = imageFileInput.files[0];
  if (!file) {
    showError("Veuillez sélectionner une image.");
    return;
  }

  // Vérifier la taille du fichier (max 6MB)
  if (file.size > 6 * 1024 * 1024) {
    showError("L'image est trop volumineuse (max 6MB).");
    return;
  }

  // Vérifier le type de fichier
  if (!file.type.startsWith("image/")) {
    showError("Le fichier doit être une image.");
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Téléchargement...";

  try {
    // Lire le fichier en base64
    const reader = new FileReader();

    reader.onload = async function (e) {
      try {
        const base64Data = e.target.result.split(",")[1]; // Enlever le préfixe data:image/...;base64,

        console.log("=== DÉBUT UPLOAD IMAGE ===");
        console.log("Nom fichier:", file.name);
        console.log("Type MIME:", file.type);
        console.log("Taille base64:", base64Data.length, "caractères");
        console.log("URL Apps Script:", APPS_SCRIPT_URL);

        // Envoyer à Google Apps Script pour upload sur Drive
        // Note: On retire le header Content-Type pour éviter CORS preflight
        const response = await fetch(APPS_SCRIPT_URL + "?action=uploadImage", {
          method: "POST",
          body: JSON.stringify({
            action: "uploadImage",
            fileName: file.name,
            mimeType: file.type,
            base64Data: base64Data,
          }),
        });

        console.log("=== RÉPONSE REÇUE ===");
        console.log("Status HTTP:", response.status);
        console.log("Status OK:", response.ok);
        console.log("Headers:", [...response.headers.entries()]);

        const responseText = await response.text();
        console.log("=== CORPS DE LA RÉPONSE ===");
        console.log("Longueur:", responseText.length);
        console.log("Contenu brut:", responseText);

        if (!response.ok) {
          console.error("Erreur HTTP:", response.status, response.statusText);
          throw new Error(
            `Erreur HTTP ${response.status}: ${responseText.substring(0, 200)}`
          );
        }

        let data;
        try {
          data = JSON.parse(responseText);
          console.log("=== JSON PARSÉ ===");
          console.log("Success:", data.success);
          console.log("Message:", data.message);
          console.log("URL:", data.url);
        } catch (parseError) {
          console.error("Erreur parsing JSON:", parseError);
          throw new Error(
            `Impossible de parser la réponse JSON: ${responseText.substring(
              0,
              100
            )}`
          );
        }

        if (data.success && data.fileId) {
          console.log("=== MISE À JOUR DE L'APERÇU ===");
          console.log("URL reçue:", data.url);
          console.log("fileId:", data.fileId);

          // Utiliser l'URL thumbnail de Google Drive (meilleure pour embedding)
          const displayUrl = `https://drive.google.com/thumbnail?id=${data.fileId}&sz=w1000`;
          console.log("URL pour affichage:", displayUrl);

          // Mettre à jour le champ caché avec la bonne URL
          imageUrlInput.value = displayUrl;

          showSuccess("Image téléchargée avec succès sur Google Drive !");
          console.log("=== UPLOAD RÉUSSI ===");

          // Configurer les événements AVANT de définir le src
          imagePreview.onload = () => {
            console.log("Image chargée avec succès, dimensions:", imagePreview.naturalWidth, "x", imagePreview.naturalHeight);
            imagePreview.style.display = "block";
          };

          imagePreview.onerror = () => {
            console.error("Erreur de chargement de l'aperçu - Restrictions CORS de Google Drive");
            // Ne PAS changer l'URL - garder celle avec export=view qui fonctionne sur le site
            showSuccess("Image téléchargée ! L'aperçu ne s'affiche pas à cause des restrictions Google Drive, mais l'image sera visible sur le site après ajout du produit.");
            // Créer un aperçu avec un placeholder
            imagePreview.style.display = "none";
          };

          // Définir le src APRÈS avoir configuré les événements
          imagePreview.src = displayUrl;
        } else {
          console.error("Échec selon la réponse:", data);
          throw new Error(
            data.message || data.error || "Erreur lors du téléchargement"
          );
        }
      } catch (error) {
        console.error("=== ERREUR UPLOAD ===");
        console.error("Type:", error.name);
        console.error("Message:", error.message);
        console.error("Stack:", error.stack);
        showError("Erreur: " + error.message);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "Télécharger l'image";
      }
    };

    reader.onerror = function () {
      showError("Erreur lors de la lecture du fichier.");
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Télécharger l'image";
    };

    reader.readAsDataURL(file);
  } catch (error) {
    console.error("Erreur:", error);
    showError("Erreur lors du téléchargement de l'image.");
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Télécharger l'image";
  }
});

// Charger les données du produit en mode édition
async function loadProduct(id) {
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
      return p;
    });

    const product = products.find((p) => p.id === id);
    if (!product) {
      throw new Error("Produit non trouvé");
    }

    // Remplir le formulaire
    document.getElementById("id").value = product.id;
    document.getElementById("name").value = product.name;
    document.getElementById("category").value = product.category;
    document.getElementById("price_eur").value = product.price_eur;
    document.getElementById("format").value = product.format || "";
    document.getElementById("stock").value = product.stock || "";
    document.getElementById("image_url").value = product.image_url || "";
    document.getElementById("short_desc").value = product.short_desc || "";
    document.getElementById("description").value = product.description || "";
    document.getElementById("origin").value = product.origin || "";
    document.getElementById("tasting_notes").value =
      product.tasting_notes || "";
    document.getElementById("ingredients").value = product.ingredients || "";
    document.getElementById("active").value = product.active || "TRUE";

    // Afficher l'aperçu de l'image
    if (product.image_url) {
      imagePreview.src = product.image_url;
      imagePreview.style.display = "block";
    }

    originalIdInput.value = id;
  } catch (error) {
    console.error("Erreur:", error);
    showError("Erreur lors du chargement du produit.");
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

// Soumission du formulaire
productForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  submitBtn.disabled = true;
  submitBtn.textContent = isEditMode
    ? "Modification en cours..."
    : "Ajout en cours...";

  try {
    const formData = new FormData(productForm);
    const productData = {};

    // Champs exactement comme dans la Google Sheet
    const fields = [
      "id",
      "name",
      "category",
      "price_eur",
      "format",
      "stock",
      "image_url",
      "short_desc",
      "description",
      "origin",
      "tasting_notes",
      "ingredients",
      "active",
    ];

    fields.forEach((field) => {
      const value = formData.get(field);
      productData[field] = value ? value.trim() : "";
    });

    // Debug: Afficher les données avant envoi
    console.log("=== DONNÉES DU PRODUIT ===");
    console.log("image_url:", productData.image_url);
    console.log("Toutes les données:", productData);

    // Validation
    if (
      !productData.id ||
      !productData.name ||
      !productData.category ||
      !productData.price_eur ||
      !productData.format
    ) {
      throw new Error("Veuillez remplir tous les champs obligatoires.");
    }

    // Envoyer à Google Apps Script
    const action = isEditMode ? "updateProduct" : "addProduct";
    const body = {
      action: action,
      data: productData,
    };

    if (isEditMode) {
      body.originalId = originalIdInput.value;
    }

    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const message = isEditMode
      ? "Produit modifié avec succès !"
      : "Produit ajouté avec succès !";
    showSuccess(message);

    setTimeout(() => {
      window.location.href = "admin.html";
    }, 2000);
  } catch (error) {
    console.error("Erreur:", error);
    showError(error.message || "Erreur lors de l'opération.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isEditMode
      ? "Modifier le produit"
      : "Ajouter le produit";
  }
});

// Vérifier l'authentification au chargement
checkAuth();

// Vérifier si on est en mode édition
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get("id");

if (productId) {
  isEditMode = true;
  currentProductId = productId;
  editModeInput.value = "true";
  formTitle.textContent = "Modifier un produit";
  submitBtn.textContent = "Modifier le produit";
  document.getElementById("id").readOnly = true;
  loadProduct(productId);
}
