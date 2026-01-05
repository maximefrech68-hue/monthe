const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1KXDB5K0NSrdsyyOTxqRef4yBR2n-GDQnEgvT9MNxNY0/gviz/tq?tqx=out:csv&sheet=Products";

function cleanCell(s) {
  return (s ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"|"$/g, "");
}

function splitLine(line, sep) {
  return line.split(sep).map(cleanCell);
}

function toBoolActive(value) {
  // Tout ce qui ressemble à "false" => false. Sinon true par défaut.
  const v = String(value ?? "")
    .trim()
    .toUpperCase();

  const falsy = new Set(["FALSE", "FAUX", "0", "NO", "NON", "N"]);
  const truthy = new Set(["TRUE", "VRAI", "1", "YES", "OUI", "Y"]);

  if (v === "") return true; // vide => visible
  if (falsy.has(v)) return false;
  if (truthy.has(v)) return true;

  // si l'utilisateur écrit autre chose (ex: "draft"), on considère visible
  return true;
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

  const first = lines[0];
  const sep = first.includes(";") && !first.includes(",") ? ";" : ",";

  const headers = splitLine(lines[0], sep);

  const products = lines.slice(1).map((line) => {
    const values = splitLine(line, sep);
    const product = {};

    headers.forEach((h, i) => {
      product[h] = values[i] ?? "";
    });

    product.price_eur = Number(product.price_eur || 0);
    product.stock = product.stock === "" ? null : Number(product.stock);

    // active
    product.active = toBoolActive(product.active);

    return product;
  });

  console.log("Headers détectés :", headers);
  console.log(
    "Exemples active :",
    products.map((p) => ({
      id: p.id,
      activeRaw: p.active,
      activeCell: p.active,
    }))
  );

  const visible = products.filter((p) => p.active === true);

  console.log(
    "Produits visibles :",
    visible.map((p) => p.id)
  );

  return visible;
}
