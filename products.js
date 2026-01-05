// products.js — MonThé (Google Sheet -> Produits)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products";

/**
 * Nettoie une cellule CSV
 */
function cleanCell(s) {
  return (s ?? "")
    .replace(/^\uFEFF/, "") // enlève BOM si présent
    .trim()
    .replace(/^"|"$/g, ""); // enlève guillemets autour
}

/**
 * Split simple (OK si tu évites les virgules/; dans les textes)
 */
function splitLine(line, sep) {
  return line.split(sep).map(cleanCell);
}

/**
 * Convertit "TRUE"/"FALSE"/"1"/"0"/"VRAI"/"FAUX" en booléen.
 * - Si vide => null (pour choisir un comportement par défaut)
 */
function toBoolOrNull(v) {
  const s = cleanCell(v).toLowerCase();
  if (s === "") return null;
  if (["true", "vrai", "1", "yes", "y"].includes(s)) return true;
  if (["false", "faux", "0", "no", "n"].includes(s)) return false;
  // valeur inconnue => null
  return null;
}

/**
 * Charge produits depuis Google Sheet (CSV)
 * Retourne un tableau d'objets produits
 */
async function fetchProductsFromSheet() {
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error("Erreur chargement Google Sheet");

  const csv = await res.text();

  const lines = csv
    .trim()
    .split("\n")
    .map((l) => l.replace(/\r/g, ""))
    .filter(Boolean);

  // détecte séparateur
  const first = lines[0];
  const sep = first.includes(";") && !first.includes(",") ? ";" : ",";

  const headers = splitLine(lines[0], sep);

  const products = lines.slice(1).map((line) => {
    const values = splitLine(line, sep);
    const p = {};

    headers.forEach((h, i) => {
      p[h] = values[i] ?? "";
    });

    // conversions utiles
    p.price_eur = Number(p.price_eur || 0);
    p.stock = p.stock === "" ? null : Number(p.stock);

    // conversion ACTIVE (très important !)
    // - null si vide
    // - true/false sinon
    p.active = toBoolOrNull(p.active);

    // image fallback
    if (!p.image_url)
      p.image_url = "https://via.placeholder.com/600x400?text=MonTh%C3%A9";

    return p;
  });

  // ✅ Filtrage : par défaut on affiche si active est vide (null) OU true
  const visible = products.filter(
    (p) => p.active === null || p.active === true
  );

  console.log("Headers détectés :", headers);
  console.log(
    "Exemples active :",
    products.map((p) => p.active)
  );
  console.log("Produits visibles :", visible);

  return visible;
}

// Expose la fonction globalement (si tes autres scripts l’appellent)
window.fetchProductsFromSheet = fetchProductsFromSheet;
