const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products";

function cleanCell(s) {
  return (s ?? "")
    .replace(/^\uFEFF/, "") // enlève BOM si présent
    .trim()
    .replace(/^"|"$/g, ""); // enlève guillemets autour
}

function splitLine(line, sep) {
  // version simple (ok si tu évites les virgules/; dans les textes)
  return line.split(sep).map(cleanCell);
}

async function fetchProductsFromSheet() {
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error("Erreur chargement Google Sheet");

  const csv = await res.text();
  const lines = csv
    .trim()
    .split("\n")
    .map((l) => l.replace(/\r/g, ""))
    .filter(Boolean);

  // détecte si séparateur = "," ou ";"
  const first = lines[0];
  const sep = first.includes(";") && !first.includes(",") ? ";" : ",";

  const headers = splitLine(lines[0], sep);

  const products = lines.slice(1).map((line) => {
    const values = splitLine(line, sep);
    const product = {};
    headers.forEach((h, i) => {
      product[h] = values[i] ?? "";
    });

    // conversions utiles
    product.price_eur = Number(product.price_eur || 0);
    product.stock = product.stock === "" ? null : Number(product.stock);

    return product;
  });

  console.log("Headers détectés :", headers);
  console.log("Produit #1 :", products[0]);

  return products;
}
