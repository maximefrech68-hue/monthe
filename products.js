// products.js — MonThé (Google Sheet -> Produits)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products";

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

/**
 * Parse une ligne CSV en respectant les guillemets.
 * Supporte les virgules dans les champs ("rooibos, vanille").
 */
function parseCSVLine(line, sep = ",") {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" dans un champ entre guillemets = un seul guillemet
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
  return (s ?? "")
    .replace(/^\uFEFF/, "") // enlève BOM si présent
    .trim();
}

/**
 * Convertit "TRUE"/"FALSE"/"1"/"0"/"VRAI"/"FAUX" en bool.
 * Retourne null si vide ou inconnu.
 */
function toBoolOrNull(v) {
  const s = cleanCell(v).toLowerCase();
  if (s === "") return null;
  if (["true", "vrai", "1", "yes", "y"].includes(s)) return true;
  if (["false", "faux", "0", "no", "n"].includes(s)) return false;
  return null;
}

async function fetchProductsFromSheet() {
  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Erreur chargement Google Sheet");

  const csv = await res.text();

  // Utiliser le nouveau parser qui gère les retours à la ligne dans les guillemets
  const lines = parseCSVToLines(csv);

  // Séparateur attendu pour out:csv = virgule
  const sep = ",";

  if (lines.length === 0) {
    console.warn("Aucune ligne trouvée dans le CSV");
    return [];
  }

  const headers = parseCSVLine(lines[0], sep);

  const products = lines.slice(1).map((line) => {
    const values = parseCSVLine(line, sep);

    const p = {};
    headers.forEach((h, i) => {
      p[h] = values[i] ?? "";
    });

    // conversions utiles
    p.price_eur = Number(p.price_eur || 0);
    p.stock = p.stock === "" ? null : Number(p.stock);

    // active -> bool
    p.active = toBoolOrNull(p.active);

    // image fallback - SVG inline si pas d'image
    if (!p.image_url) {
      p.image_url =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'%3E%3Crect width='600' height='400' fill='%23f7f4ef'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='24' fill='%23a0826d'%3EMonThé - Pas d'image%3C/text%3E%3C/svg%3E";
    }

    return p;
  });

  // ✅ Filtrer les produits invalides (sans ID ou avec ID vide)
  const validProducts = products.filter((p) => p.id && p.id.trim() !== "");

  // ✅ IMPORTANT : ici on choisit un filtrage STRICT
  // Seuls les TRUE s'affichent.
  const visible = validProducts.filter((p) => p.active === true);

  console.log("Headers détectés :", headers);
  console.log("Produits totaux:", products.length);
  console.log("Produits valides:", validProducts.length);
  console.table(
    validProducts.map((p) => ({
      id: p.id,
      active_raw: p.active,
      active_type: typeof p.active,
      name: p.name,
    }))
  );
  console.log(
    "Produits visibles :",
    visible.map((p) => p.id)
  );

  return visible;
}

// Rend la fonction accessible aux autres scripts
window.fetchProductsFromSheet = fetchProductsFromSheet;
