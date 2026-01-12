// products.js — MonThé (Google Sheet -> Produits)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products";

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
      // "" داخل نص مقتبس => يعني " واحد
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

  const lines = csv
    .split("\n")
    .map((l) => l.replace(/\r/g, ""))
    .filter((l) => l.trim() !== "");

  // Séparateur attendu pour out:csv = virgule
  const sep = ",";

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

  // ✅ IMPORTANT : ici on choisit un filtrage STRICT
  // Seuls les TRUE s'affichent.
  const visible = products.filter((p) => p.active === true);

  console.log("Headers détectés :", headers);
  console.table(
    products.map((p) => ({
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
