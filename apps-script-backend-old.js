const OWNER_EMAIL = "maxime.frech.68@gmail.com";
const SHOP_NAME = "MonThé";

function doGet(e) {
  return ContentService.createTextOutput(
    "OK - Web App active ✅ (orders + emails)"
  ).setMimeType(ContentService.MimeType.TEXT);
}

/* ---------------- EMAILS ---------------- */
function formatItemsText(items) {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return items
    .map(
      (it) =>
        `- ${it.name || it.id} × ${it.qty || it.quantity || 1} (${Number(
          it.price_eur || 0
        ).toFixed(2)} €)`
    )
    .join("\n");
}

function sendOrderEmails(order) {
  // sécurité si exécutée sans param
  if (!order || typeof order !== "object") {
    throw new Error("sendOrderEmails(order) : paramètre 'order' manquant.");
  }

  const clientEmail = (order.email || "").trim();
  if (!clientEmail) throw new Error("Email client manquant.");

  const itemsText = formatItemsText(order.items);

  // Mail CLIENT
  const subjectClient = `✅ Confirmation de commande ${order.order_ref} – ${SHOP_NAME}`;
  const bodyClient = `
Bonjour ${order.full_name || ""},

Merci pour votre commande chez ${SHOP_NAME} ❤️

Référence : ${order.order_ref}
Total : ${Number(order.total_eur || 0).toFixed(2)} €
Statut : ${order.status || "paid"}

Articles :
${itemsText}

Adresse de livraison :
${order.address || ""}, ${order.zip || ""} ${order.city || ""}

À très vite,
${SHOP_NAME}
`.trim();

  MailApp.sendEmail({
    to: clientEmail,
    subject: subjectClient,
    body: bodyClient,
  });

  // Mail OWNER
  const subjectOwner = `🧾 Nouvelle commande ${order.order_ref} – ${Number(
    order.total_eur || 0
  ).toFixed(2)} €`;
  const bodyOwner = `
Nouvelle commande reçue ✅

Réf : ${order.order_ref}
Client : ${order.full_name || ""} (${clientEmail})
Adresse : ${order.address || ""}, ${order.zip || ""} ${order.city || ""}
Total : ${Number(order.total_eur || 0).toFixed(2)} €
Statut : ${order.status || "paid"}

Articles :
${itemsText}
`.trim();

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: subjectOwner,
    body: bodyOwner,
  });
}

/* ---------------- HELPERS SHEET ---------------- */
function ensureHeaders(sh, headersWanted) {
  if (sh.getLastRow() === 0) {
    sh.appendRow(headersWanted);
    return headersWanted;
  }
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function findRowByOrderRef(sh, orderRef, orderRefColIndex) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;

  const values = sh
    .getRange(2, orderRefColIndex + 1, lastRow - 1, 1)
    .getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(orderRef).trim()) return i + 2;
  }
  return -1;
}

function buildRowFromHeaders(headers, rowObj) {
  return headers.map((h) => {
    const key = String(h || "").trim();
    return key in rowObj ? rowObj[key] : "";
  });
}

/* ---------------- WEBHOOK ORDERS ---------------- */
function doPost(e) {
  try {
    const raw = e?.postData?.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);

    // LOG: vérifier ce que tu reçois vraiment
    console.log(
      "doPost reçu:",
      JSON.stringify({
        order_id: data.order_id,
        order_ref: data.order_ref,
        email: data.email,
        full_name: data.full_name,
        total_eur: data.total_eur,
        items_count: Array.isArray(data.items) ? data.items.length : null,
      })
    );

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName("Orders") || ss.insertSheet("Orders");

    // Colonnes EXACTES de ta sheet
    const headersWanted = [
      "date",
      "order_id",
      "email",
      "full_name",
      "address",
      "city",
      "zip",
      "items_json",
      "total_eur",
      "status",
    ];

    const headers = ensureHeaders(sh, headersWanted);

    const orderIdCol = headers.indexOf("order_id");
    const statusCol = headers.indexOf("status");

    if (orderIdCol === -1)
      throw new Error("Colonne 'order_id' introuvable dans Orders");
    if (statusCol === -1)
      throw new Error("Colonne 'status' introuvable dans Orders");

    const orderId =
      data.order_id ||
      data.order_ref ||
      "MT-" + Math.random().toString(16).slice(2, 8).toUpperCase();

    const status = data.status || data.payment_status || "paid";

    const rowObj = {
      date: new Date(),
      order_id: orderId,
      email: data.email || "",
      full_name: data.full_name || "",
      address: data.address || "",
      city: data.city || "",
      zip: data.zip || "",
      items_json: JSON.stringify(data.items || []),
      total_eur: Number(data.total_eur || 0),
      status: status,
    };

    // Anti-doublon
    const existingRow = findRowByOrderRef(sh, orderId, orderIdCol);

    if (existingRow !== -1) {
      sh.getRange(existingRow, statusCol + 1).setValue(status);
      sh.getRange(existingRow, 1).setValue(new Date()); // date

      // IMPORTANT: on n’envoie pas d’email en update (sinon double mails)
      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, order_id: orderId, updated: true })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Nouveau => append
    const row = buildRowFromHeaders(headers, rowObj);
    sh.appendRow(row);

    // ✅ ENVOI EMAILS (corrigé) : order_ref = orderId
    sendOrderEmails({
      order_ref: orderId,
      full_name: data.full_name || "",
      email: data.email || "",
      address: data.address || "",
      city: data.city || "",
      zip: data.zip || "",
      items: data.items || [],
      total_eur: Number(data.total_eur || 0),
      status: status,
    });

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, order_id: orderId, created: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error("doPost erreur:", err && err.message ? err.message : err);
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err.message || err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ----- TEST MANUEL (optionnel) ----- */
function testSendOrderEmails() {
  const fakeOrder = {
    order_ref: "TEST-1234",
    full_name: "Maxime Frech",
    email: OWNER_EMAIL,
    address: "12 rue test",
    city: "Mulhouse",
    zip: "68100",
    items: [
      { id: "sencha", name: "Sencha Vert", qty: 1, price_eur: 14.5 },
      { id: "earl-grey", name: "Earl Grey Noir", qty: 2, price_eur: 12.9 },
    ],
    total_eur: 40.3,
    status: "paid",
  };
  sendOrderEmails(fakeOrder);
}

/**
 * Script Google Apps Script pour gérer les produits
 *
 * Instructions de déploiement :
 * 1. Ouvrir votre Google Sheet
 * 2. Extensions > Apps Script
 * 3. Coller ce code et sauvegarder
 * 4. Déployer > Nouvelle application web
 * 5. Qui a accès : "Tout le monde"
 * 6. Copier l'URL de déploiement dans admin.js et admin-form.js (APPS_SCRIPT_URL)
 *
 * IMPORTANT : L'onglet "Products" doit exister avec ces colonnes :
 * id, name, category, price_eur, format, stock, image_url, short_desc, description, origin, tasting_notes, ingredients, active
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {
      case "addProduct":
        return addProductToSheet(data.data);
      case "updateProduct":
        return updateProductInSheet(data.data, data.originalId);
      case "deleteProduct":
        return deleteProductFromSheet(data.id);
      default:
        return createResponse(false, "Action inconnue");
    }
  } catch (error) {
    Logger.log("Erreur: " + error);
    return createResponse(false, error.toString());
  }
}

function createResponse(success, message, additionalData = {}) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: success,
      message: message,
      ...additionalData,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ajouter un nouveau produit
 */
function addProductToSheet(productData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Products");

    if (!sheet) {
      throw new Error("La feuille 'Products' n'existe pas");
    }

    // Vérifier que l'ID n'existe pas déjà
    const idColumn = getColumnIndex(sheet, "id");
    const ids = sheet
      .getRange(2, idColumn, sheet.getLastRow() - 1, 1)
      .getValues()
      .flat();

    if (ids.includes(productData.id)) {
      throw new Error("Un produit avec cet ID existe déjà");
    }

    // Récupérer les en-têtes
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];

    // Créer la nouvelle ligne
    const newRow = headers.map((header) => {
      return productData.hasOwnProperty(header) ? productData[header] : "";
    });

    // Ajouter la ligne
    sheet.appendRow(newRow);

    Logger.log("Produit ajouté: " + productData.name);
    return createResponse(true, "Produit ajouté avec succès", {
      productId: productData.id,
    });
  } catch (error) {
    Logger.log("Erreur addProductToSheet: " + error);
    return createResponse(false, error.toString());
  }
}

/**
 * Modifier un produit existant
 */
function updateProductInSheet(productData, originalId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Products");

    if (!sheet) {
      throw new Error("La feuille 'Products' n'existe pas");
    }

    // Trouver la ligne du produit
    const idColumn = getColumnIndex(sheet, "id");
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][idColumn - 1] === originalId) {
        rowIndex = i + 1; // +1 car les indices Google Sheets commencent à 1
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Produit non trouvé");
    }

    // Récupérer les en-têtes
    const headers = data[0];

    // Mettre à jour les valeurs
    headers.forEach((header, index) => {
      if (productData.hasOwnProperty(header)) {
        sheet.getRange(rowIndex, index + 1).setValue(productData[header]);
      }
    });

    Logger.log("Produit modifié: " + productData.name);
    return createResponse(true, "Produit modifié avec succès", {
      productId: productData.id,
    });
  } catch (error) {
    Logger.log("Erreur updateProductInSheet: " + error);
    return createResponse(false, error.toString());
  }
}

/**
 * Supprimer un produit
 */
function deleteProductFromSheet(productId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Products");

    if (!sheet) {
      throw new Error("La feuille 'Products' n'existe pas");
    }

    // Trouver la ligne du produit
    const idColumn = getColumnIndex(sheet, "id");
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][idColumn - 1] === productId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Produit non trouvé");
    }

    // Supprimer la ligne
    sheet.deleteRow(rowIndex);

    Logger.log("Produit supprimé: " + productId);
    return createResponse(true, "Produit supprimé avec succès", {
      productId: productId,
    });
  } catch (error) {
    Logger.log("Erreur deleteProductFromSheet: " + error);
    return createResponse(false, error.toString());
  }
}

/**
 * Obtenir l'index d'une colonne par son nom
 */
function getColumnIndex(sheet, columnName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const index = headers.indexOf(columnName);
  if (index === -1) {
    throw new Error("Colonne '" + columnName + "' non trouvée");
  }
  return index + 1; // +1 car Google Sheets commence à 1
}

/**
 * Fonction de test pour ajouter un produit
 */
function testAddProduct() {
  const testData = {
    id: "test-produit-2",
    name: "Produit Test 2",
    category: "vert",
    price_eur: "15.99",
    format: "100g",
    stock: "50",
    image_url: "https://via.placeholder.com/600x400",
    short_desc: "Description courte",
    description: "Description complète du produit test",
    origin: "Japon",
    tasting_notes: "Notes florales",
    ingredients: "Thé vert, fleurs de jasmin",
    active: "TRUE",
  };

  const result = addProductToSheet(testData);
  Logger.log(result.getContent());
}

/**
 * Fonction de test pour modifier un produit
 */
function testUpdateProduct() {
  const testData = {
    id: "test-produit-2",
    name: "Produit Test Modifié",
    category: "vert",
    price_eur: "17.99",
    format: "100g",
    stock: "30",
    image_url: "https://via.placeholder.com/600x400",
    short_desc: "Description courte modifiée",
    description: "Description complète modifiée",
    origin: "Chine",
    tasting_notes: "Notes florales et fruitées",
    ingredients: "Thé vert bio, fleurs",
    active: "TRUE",
  };

  const result = updateProductInSheet(testData, "test-produit-2");
  Logger.log(result.getContent());
}

/**
 * Fonction de test pour supprimer un produit
 */
function testDeleteProduct() {
  const result = deleteProductFromSheet("test-produit-2");
  Logger.log(result.getContent());
}
