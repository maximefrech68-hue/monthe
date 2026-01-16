/**
 * Script Google Apps Script UNIFIÉ
 * Gère : Commandes + Emails + Produits + Upload d'images
 */

const OWNER_EMAIL = "maxime.frech.68@gmail.com";
const SHOP_NAME = "MonThé";
const LOGO_FILE_ID = "1YIzBCrbPzZs_ujW3sfKrz7nUnGu-2Ub9"; // ID du fichier logo dans Google Drive
const INVOICE_FOLDER_ID = "1TwZkkYm0vdO8CQpIsNuS1qEr15As4aIT"; // Dossier Google Drive pour les factures
const VAT_RATE = 0.2; // Taux TVA 20%
const STRIPE_FEE_PERCENT = 0.014; // 1.4%
const STRIPE_FEE_FIXED = 0.25; // 0.25€

/**
 * Fonction GET - pour tester que le web app fonctionne et récupérer le hash
 */
function doGet(e) {
  // Si on demande le hash du mot de passe
  if (e && e.parameter && e.parameter.action === "getPasswordHash") {
    return getPasswordHash();
  }

  return ContentService.createTextOutput(
    "OK - Web App active ✅ (orders + emails + products)"
  ).setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Fonction POST UNIFIÉE - Route vers la bonne fonction
 */
function doPost(e) {
  try {
    const raw = e?.postData?.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);

    // Router selon l'action (check aussi les paramètres URL)
    const action = data.action || (e.parameter && e.parameter.action);

    if (action === "addProduct") {
      return addProductToSheet(data.data);
    } else if (action === "updateProduct") {
      return updateProductInSheet(data.data, data.originalId);
    } else if (action === "deleteProduct") {
      return deleteProductFromSheet(data.id);
    } else if (action === "uploadImage") {
      return uploadImageToDrive(data.fileName, data.mimeType, data.base64Data);
    } else if (action === "deleteOrder") {
      return deleteOrderFromSheet(data.order_id);
    } else if (action === "updateStock") {
      return updateProductStock(data.product_id, data.stock);
    } else if (action === "decrementStock") {
      return decrementProductStock(data.items);
    } else if (action === "changePassword") {
      return changePasswordHash(data.oldPasswordHash, data.newPasswordHash);
    } else if (action === "getPasswordHash") {
      return getPasswordHash();
    } else if (action === "updateVente") {
      return updateVenteEntry(data.order_id, data.updates);
    } else if (action === "deleteVente") {
      return deleteVenteEntry(data.order_id);
    } else if (data.order_id || data.order_ref || data.email) {
      // Si pas d'action mais qu'on a des infos de commande, c'est une commande
      return handleOrder(data);
    } else {
      return createResponse(false, "Action inconnue");
    }
  } catch (err) {
    console.error("doPost erreur:", err && err.message ? err.message : err);
    return createResponse(false, String(err.message || err));
  }
}

/* ==================== COMMANDES ==================== */

function handleOrder(data) {
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
    sh.getRange(existingRow, 1).setValue(new Date());

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, order_id: orderId, updated: true })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // Nouveau => append
  const row = buildRowFromHeaders(headers, rowObj);
  sh.appendRow(row);

  // Générer et sauvegarder la facture dans Drive + Créer entrée VENTES
  let invoiceUrl = "";
  try {
    const invoicePDF = generateInvoicePDF(
      {
        order_ref: orderId,
        full_name: data.full_name || "",
        email: data.email || "",
        address: data.address || "",
        city: data.city || "",
        zip: data.zip || "",
        items: data.items || [],
        total_eur: Number(data.total_eur || 0),
        created_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
      },
      LOGO_FILE_ID
    );

    invoiceUrl = saveInvoiceToDrive(invoicePDF, orderId);
    Logger.log("Facture sauvegardée: " + invoiceUrl);

    createVentesEntry(
      {
        order_id: orderId,
        full_name: data.full_name || "",
        items: data.items || [],
        total_eur: Number(data.total_eur || 0),
        date: new Date(),
      },
      invoiceUrl
    );
  } catch (driveErr) {
    Logger.log("Erreur Drive/VENTES: " + (driveErr.message || driveErr));
    // Ne pas bloquer la commande si erreur comptable
  }

  // Envoi emails
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
}

/**
 * Crée une entrée dans la feuille VENTES pour une commande payée
 * @param {Object} order - Données de la commande
 * @param {string} invoiceUrl - URL de la facture dans Drive
 * @returns {boolean} True si succès, false sinon
 */
function createVentesEntry(order, invoiceUrl) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh =
      ss.getSheetByName("VENTES (Livre des recettes)") ||
      ss.insertSheet("VENTES (Livre des recettes)");

    // Headers pour la feuille VENTES
    const headersWanted = [
      "date_paiement",
      "order_id",
      "client",
      "produits",
      "montant_ht",
      "tva",
      "montant_ttc",
      "moyen_paiement",
      "plateforme",
      "frais_paiement",
      "net_encaisse",
      "url_facture",
    ];

    const headers = ensureHeaders(sh, headersWanted);

    // Calculs
    const vat = calculateVAT(order.total_eur, VAT_RATE);
    const fees = calculateStripeFees(order.total_eur);
    const net = order.total_eur - fees;

    // Concaténer les noms de produits
    const products = (order.items || [])
      .map((item) => item.name || item.id)
      .join(", ");

    // Construire la ligne
    const rowObj = {
      date_paiement: order.date || new Date(),
      order_id: order.order_id,
      client: order.full_name || "",
      produits: products,
      montant_ht: vat.ht,
      tva: vat.tva,
      montant_ttc: vat.ttc,
      moyen_paiement: "Stripe",
      plateforme: "Netlify",
      frais_paiement: fees,
      net_encaisse: net,
      url_facture: invoiceUrl || "",
    };

    // Vérifier les doublons
    const orderIdCol = headers.indexOf("order_id");
    if (orderIdCol === -1) {
      throw new Error("Colonne 'order_id' introuvable dans VENTES");
    }

    const existingRow = findRowByOrderRef(sh, order.order_id, orderIdCol);
    if (existingRow !== -1) {
      Logger.log("Entrée VENTES existe déjà: " + order.order_id);
      return false;
    }

    // Ajouter la ligne
    const row = buildRowFromHeaders(headers, rowObj);
    sh.appendRow(row);

    Logger.log("Entrée VENTES créée: " + order.order_id);
    return true;
  } catch (error) {
    Logger.log("Erreur createVentesEntry: " + (error.message || error));
    return false;
  }
}

/**
 * Met à jour une entrée dans la feuille VENTES
 * @param {string} orderId - ID de la commande
 * @param {Object} updates - Objet avec les champs à mettre à jour
 * @returns {Object} Résultat de l'opération
 */
function updateVenteEntry(orderId, updates) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("VENTES (Livre des recettes)");

    if (!sheet) {
      throw new Error("La feuille 'VENTES (Livre des recettes)' n'existe pas");
    }

    // Récupérer les headers et data
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Trouver l'index de la colonne order_id
    const orderIdColIndex = headers.indexOf("order_id");
    if (orderIdColIndex === -1) {
      throw new Error("Colonne 'order_id' non trouvée");
    }

    // Trouver la ligne
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][orderIdColIndex] === orderId) {
        rowIndex = i + 1; // +1 car getRange est 1-indexed
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Entrée VENTES non trouvée: " + orderId);
    }

    // Mettre à jour les champs fournis
    Object.keys(updates).forEach((field) => {
      const colIndex = headers.indexOf(field);
      if (colIndex !== -1) {
        sheet.getRange(rowIndex, colIndex + 1).setValue(updates[field]);
      }
    });

    // Si montant_ttc a été modifié, recalculer les champs dépendants
    if (updates.montant_ttc !== undefined) {
      const newTTC = Number(updates.montant_ttc);
      const vat = calculateVAT(newTTC, VAT_RATE);
      const fees = calculateStripeFees(newTTC);
      const net = newTTC - fees;

      const htColIndex = headers.indexOf("montant_ht");
      const tvaColIndex = headers.indexOf("tva");
      const feesColIndex = headers.indexOf("frais_paiement");
      const netColIndex = headers.indexOf("net_encaisse");

      if (htColIndex !== -1)
        sheet.getRange(rowIndex, htColIndex + 1).setValue(vat.ht);
      if (tvaColIndex !== -1)
        sheet.getRange(rowIndex, tvaColIndex + 1).setValue(vat.tva);
      if (feesColIndex !== -1)
        sheet.getRange(rowIndex, feesColIndex + 1).setValue(fees);
      if (netColIndex !== -1)
        sheet.getRange(rowIndex, netColIndex + 1).setValue(net);
    }

    Logger.log("Entrée VENTES mise à jour: " + orderId);
    return createResponse(true, "Entrée mise à jour avec succès", { orderId });
  } catch (error) {
    Logger.log("Erreur updateVenteEntry: " + error);
    return createResponse(false, error.toString());
  }
}

/**
 * Supprime une entrée de la feuille VENTES
 * @param {string} orderId - ID de la commande à supprimer
 * @returns {Object} Résultat de l'opération
 */
function deleteVenteEntry(orderId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("VENTES (Livre des recettes)");

    if (!sheet) {
      throw new Error("La feuille 'VENTES (Livre des recettes)' n'existe pas");
    }

    // Récupérer les données
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Trouver l'index de la colonne order_id
    const orderIdColIndex = headers.indexOf("order_id");
    if (orderIdColIndex === -1) {
      throw new Error("Colonne 'order_id' non trouvée");
    }

    // Trouver la ligne
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][orderIdColIndex] === orderId) {
        rowIndex = i + 1; // +1 car deleteRow est 1-indexed
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Entrée VENTES non trouvée: " + orderId);
    }

    // Supprimer la ligne
    sheet.deleteRow(rowIndex);

    Logger.log("Entrée VENTES supprimée: " + orderId);
    return createResponse(true, "Entrée supprimée avec succès", { orderId });
  } catch (error) {
    Logger.log("Erreur deleteVenteEntry: " + error);
    return createResponse(false, error.toString());
  }
}

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

/**
 * Calcule HT, TVA et TTC à partir d'un prix TTC
 * @param {number} priceTTC - Prix toutes taxes comprises
 * @param {number} vatRate - Taux de TVA (par défaut 0.20 pour 20%)
 * @returns {Object} { ht, tva, ttc }
 */
function calculateVAT(priceTTC, vatRate = 0.2) {
  const ttc = Number(priceTTC || 0);
  const ht = ttc / (1 + vatRate);
  const tva = ttc - ht;
  return {
    ht: ht,
    tva: tva,
    ttc: ttc,
  };
}

/**
 * Formate un nombre en format français (espace pour milliers, virgule pour décimales)
 * @param {number} num - Nombre à formater
 * @returns {string} Nombre formaté (ex: "1 234,56")
 */
function formatEuroFR(num) {
  return Number(num || 0)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Calcule les frais Stripe (1.4% + 0.25€)
 * @param {number} amountTTC - Montant TTC
 * @returns {number} Frais Stripe
 */
function calculateStripeFees(amountTTC) {
  const ttc = Number(amountTTC || 0);
  return ttc * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED;
}

/**
 * Récupère le logo depuis Google Drive et le convertit en base64
 * @param {string} fileId - ID du fichier logo dans Drive
 * @returns {string} Data URI base64 de l'image ou chaîne vide si erreur
 */
function getLogoAsBase64(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType();
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    Logger.log("Erreur chargement logo: " + err.message);
    return "";
  }
}

/**
 * Génère le HTML de la facture
 * @param {Object} order - Données de commande
 * @param {string} logoFileId - ID du fichier logo dans Drive
 * @returns {string} HTML de la facture
 */
function generateInvoiceHTML(order, logoFileId) {
  const VAT_RATE = 0.2;

  // Charger le logo en base64
  const logoBase64 = logoFileId ? getLogoAsBase64(logoFileId) : "";

  // Calculer les totaux
  let totalHT = 0;
  let totalTVA = 0;
  let totalTTC = 0;

  // Générer les lignes d'articles
  const itemsHTML = (order.items || [])
    .map((item) => {
      const vat = calculateVAT(item.price_eur, VAT_RATE);
      const lineVAT = calculateVAT(item.line_total_eur, VAT_RATE);

      totalHT += lineVAT.ht;
      totalTVA += lineVAT.tva;
      totalTTC += lineVAT.ttc;

      return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${
          item.name || item.id
        }</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${
          item.qty || 1
        }</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatEuroFR(
          vat.ht
        )} €</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">20%</td>
        <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: bold;">${formatEuroFR(
          lineVAT.ttc
        )} €</td>
      </tr>
    `;
    })
    .join("");

  // Date formatée en français
  const orderDate = new Date(order.created_at || order.paid_at || Date.now());
  const dateStr = orderDate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #2b2b2b;
          margin: 0;
          padding: 20px;
          font-size: 11pt;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          display: table;
          width: 100%;
          margin-bottom: 30px;
        }
        .header-left {
          display: table-cell;
          width: 50%;
          vertical-align: top;
        }
        .header-right {
          display: table-cell;
          width: 50%;
          text-align: right;
          vertical-align: top;
        }
        .logo {
          max-width: 150px;
          margin-bottom: 10px;
        }
        .company-info {
          color: #666;
          font-size: 10pt;
        }
        .invoice-title {
          font-size: 24pt;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .invoice-number {
          font-size: 12pt;
          color: #666;
        }
        .billing-section {
          background: #f7f4ef;
          padding: 15px;
          margin-bottom: 30px;
          border-radius: 4px;
        }
        .billing-title {
          font-weight: bold;
          margin-bottom: 8px;
          color: #a0826d;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th {
          background: #a0826d;
          color: white;
          padding: 10px 8px;
          text-align: left;
          font-weight: normal;
        }
        th:nth-child(2),
        th:nth-child(4) {
          text-align: center;
        }
        th:nth-child(3),
        th:nth-child(5) {
          text-align: right;
        }
        .totals {
          width: 300px;
          margin-left: auto;
          margin-top: 20px;
        }
        .totals-row {
          display: table;
          width: 100%;
          padding: 5px 0;
        }
        .totals-label {
          display: table-cell;
          text-align: left;
        }
        .totals-value {
          display: table-cell;
          text-align: right;
          font-weight: bold;
        }
        .totals-row.final {
          border-top: 2px solid #2b2b2b;
          padding-top: 10px;
          margin-top: 10px;
          font-size: 14pt;
        }
        .footer {
          text-align: center;
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          color: #666;
          font-size: 10pt;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <div class="header-left">
            ${
              logoBase64
                ? `<img src="${logoBase64}" alt="MonThé" class="logo">`
                : ""
            }
            <div style="font-size: 18pt; font-weight: bold; margin-bottom: 5px;">${SHOP_NAME}</div>
            <div class="company-info">
              ${OWNER_EMAIL}
            </div>
          </div>
          <div class="header-right">
            <div class="invoice-title">FACTURE</div>
            <div class="invoice-number">N° ${order.order_ref}</div>
            <div class="invoice-number">Date: ${dateStr}</div>
          </div>
        </div>

        <div class="billing-section">
          <div class="billing-title">Facturation</div>
          <div>${order.full_name || ""}</div>
          <div>${order.address || ""}</div>
          <div>${order.zip || ""} ${order.city || ""}</div>
          <div>${order.email || ""}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Désignation</th>
              <th>Qté</th>
              <th>P.U. HT</th>
              <th>TVA</th>
              <th>Total TTC</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row">
            <div class="totals-label">Total HT</div>
            <div class="totals-value">${formatEuroFR(totalHT)} €</div>
          </div>
          <div class="totals-row">
            <div class="totals-label">TVA (20%)</div>
            <div class="totals-value">${formatEuroFR(totalTVA)} €</div>
          </div>
          <div class="totals-row final">
            <div class="totals-label">Total TTC</div>
            <div class="totals-value">${formatEuroFR(totalTTC)} €</div>
          </div>
        </div>

        <div class="footer">
          Merci pour votre commande!<br>
          ${SHOP_NAME} - ${OWNER_EMAIL}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Génère un PDF depuis du HTML et retourne un Blob
 * @param {string} htmlContent - Contenu HTML
 * @param {string} filename - Nom du fichier PDF
 * @returns {Blob} PDF blob
 */
function generatePDFFromHTML(htmlContent, filename) {
  // Créer un fichier HTML temporaire dans Drive
  const tempFolder = DriveApp.getRootFolder();

  // Créer un blob HTML
  const htmlBlob = Utilities.newBlob(htmlContent, "text/html", "temp.html");
  const htmlFile = tempFolder.createFile(htmlBlob);

  // Obtenir le PDF
  const pdfBlob = htmlFile.getAs("application/pdf");
  pdfBlob.setName(filename);

  // Supprimer le fichier temporaire
  htmlFile.setTrashed(true);

  return pdfBlob;
}

/**
 * Génère la facture PDF pour une commande
 * @param {Object} order - Données de commande
 * @param {string} logoFileId - ID du fichier logo dans Drive (optionnel)
 * @returns {Blob} PDF blob de la facture
 */
function generateInvoicePDF(order, logoFileId) {
  const html = generateInvoiceHTML(order, logoFileId);
  const filename = `Facture_${order.order_ref}.pdf`;
  return generatePDFFromHTML(html, filename);
}

/**
 * Sauvegarde une facture PDF dans Google Drive et retourne l'URL publique
 * @param {Blob} pdfBlob - Le blob PDF généré
 * @param {string} orderId - L'ID de la commande pour nommer le fichier
 * @returns {string} URL publique du fichier dans Drive
 */
function saveInvoiceToDrive(pdfBlob, orderId) {
  try {
    // Récupérer le dossier de destination
    const folder = DriveApp.getFolderById(INVOICE_FOLDER_ID);

    // Nom du fichier
    const filename = `Facture_${orderId}.pdf`;

    // Vérifier si un fichier avec ce nom existe déjà
    const existingFiles = folder.getFilesByName(filename);
    if (existingFiles.hasNext()) {
      Logger.log("Facture existe déjà: " + filename);
      const existingFile = existingFiles.next();
      return existingFile.getUrl();
    }

    // Créer le fichier dans le dossier
    const file = folder.createFile(pdfBlob);
    file.setName(filename);

    // Rendre le fichier accessible publiquement
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Retourner l'URL publique
    const fileUrl = file.getUrl();
    Logger.log("Facture sauvegardée: " + fileUrl);

    return fileUrl;
  } catch (error) {
    Logger.log("Erreur saveInvoiceToDrive: " + (error.message || error));
    throw new Error(
      "Impossible de sauvegarder la facture dans Drive: " + error.message
    );
  }
}

function sendOrderEmails(order) {
  if (!order || typeof order !== "object") {
    throw new Error("sendOrderEmails(order) : paramètre 'order' manquant.");
  }

  const clientEmail = (order.email || "").trim();
  if (!clientEmail) throw new Error("Email client manquant.");

  const itemsText = formatItemsText(order.items);

  // Générer la facture PDF
  let pdfAttachment = null;
  try {
    pdfAttachment = generateInvoicePDF(order, LOGO_FILE_ID);
    Logger.log("Facture PDF générée: " + order.order_ref);
  } catch (pdfErr) {
    Logger.log("Erreur génération PDF: " + (pdfErr.message || pdfErr));
    // Continuer sans PDF en cas d'erreur
  }

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

Vous trouverez votre facture en pièce jointe de cet email.

À très vite,
${SHOP_NAME}
`.trim();

  // Configuration de l'email client
  const emailConfig = {
    to: clientEmail,
    subject: subjectClient,
    body: bodyClient,
  };

  // Attacher le PDF si généré avec succès
  if (pdfAttachment) {
    emailConfig.attachments = [pdfAttachment];
  }

  MailApp.sendEmail(emailConfig);

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

  // Configuration de l'email owner
  const emailOwnerConfig = {
    to: OWNER_EMAIL,
    subject: subjectOwner,
    body: bodyOwner,
  };

  // Attacher le PDF si disponible
  if (pdfAttachment) {
    emailOwnerConfig.attachments = [pdfAttachment];
  }

  MailApp.sendEmail(emailOwnerConfig);
}

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

/* ==================== PRODUITS ==================== */

function createResponse(success, message, additionalData = {}) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: success,
      message: message,
      ...additionalData,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

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
        rowIndex = i + 1;
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

function getColumnIndex(sheet, columnName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const index = headers.indexOf(columnName);
  if (index === -1) {
    throw new Error("Colonne '" + columnName + "' non trouvée");
  }
  return index + 1;
}

function deleteOrderFromSheet(orderId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Orders");

    if (!sheet) {
      throw new Error("La feuille 'Orders' n'existe pas");
    }

    // Trouver la ligne de la commande
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // Chercher dans la colonne order_id (colonne 2, index 1)
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === orderId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Commande non trouvée");
    }

    // Supprimer la ligne
    sheet.deleteRow(rowIndex);

    Logger.log("Commande supprimée: " + orderId);
    return createResponse(true, "Commande supprimée avec succès", {
      orderId: orderId,
    });
  } catch (error) {
    Logger.log("Erreur deleteOrderFromSheet: " + error);
    return createResponse(false, error.toString());
  }
}

/* ==================== GESTION DU STOCK ==================== */

function updateProductStock(productId, newStock) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Products");

    if (!sheet) {
      throw new Error("La feuille 'Products' n'existe pas");
    }

    // Trouver la ligne du produit
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // Chercher dans la colonne id (colonne 1, index 0)
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === productId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("Produit non trouvé: " + productId);
    }

    // Trouver l'index de la colonne stock
    const headers = data[0];
    const stockColIndex = headers.indexOf("stock");

    if (stockColIndex === -1) {
      throw new Error("Colonne 'stock' non trouvée");
    }

    // Mettre à jour le stock (colonne stock, indexé à partir de 1)
    sheet.getRange(rowIndex, stockColIndex + 1).setValue(newStock);

    Logger.log("Stock mis à jour: " + productId + " -> " + newStock);
    return createResponse(true, "Stock mis à jour avec succès", {
      productId: productId,
      stock: newStock,
    });
  } catch (error) {
    Logger.log("Erreur updateProductStock: " + error);
    return createResponse(false, error.toString());
  }
}

function decrementProductStock(items) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Products");

    if (!sheet) {
      throw new Error("La feuille 'Products' n'existe pas");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const stockColIndex = headers.indexOf("stock");

    if (stockColIndex === -1) {
      throw new Error("Colonne 'stock' non trouvée");
    }

    let updatedCount = 0;

    // Pour chaque article commandé
    items.forEach((item) => {
      // Trouver la ligne du produit
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === item.id) {
          const currentStock = Number(data[i][stockColIndex]) || 0;
          const newStock = Math.max(0, currentStock - item.qty);

          // Mettre à jour le stock
          sheet.getRange(i + 1, stockColIndex + 1).setValue(newStock);
          updatedCount++;

          Logger.log(
            "Stock décrémenté: " +
              item.id +
              " (" +
              currentStock +
              " -> " +
              newStock +
              ")"
          );
          break;
        }
      }
    });

    return createResponse(true, "Stock décrémenté avec succès", {
      updatedCount: updatedCount,
    });
  } catch (error) {
    Logger.log("Erreur decrementProductStock: " + error);
    return createResponse(false, error.toString());
  }
}

/* ==================== UPLOAD IMAGES ==================== */

function uploadImageToDrive(fileName, mimeType, base64Data) {
  try {
    // Créer ou récupérer le dossier "MonThe-Images" à la racine de Drive
    let folder;
    const folders = DriveApp.getFoldersByName("MonThe-Images");

    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder("MonThe-Images");
      Logger.log("Dossier MonThe-Images créé");
    }

    // Décoder le base64
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      fileName
    );

    // Créer le fichier dans le dossier
    const file = folder.createFile(blob);

    // Rendre le fichier VRAIMENT public (accessible par tout le monde)
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);

    // Alternative : si la ligne ci-dessus ne fonctionne pas, essayer :
    // Drive.Permissions.insert(
    //   {
    //     'type': 'anyone',
    //     'role': 'reader'
    //   },
    //   file.getId()
    // );

    // Obtenir l'URL publique optimisée pour affichage dans <img>
    const fileId = file.getId();

    // MEILLEURE URL pour embedding direct dans <img>
    // Cette URL fonctionne mieux avec referrerpolicy="no-referrer"
    const publicUrl =
      "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000";

    // URLs alternatives
    const directUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
    const googleUserContentUrl =
      "https://lh3.googleusercontent.com/d/" + fileId;
    const driveUrl = "https://drive.google.com/file/d/" + fileId + "/view";

    Logger.log("Image uploadée: " + fileName + " -> " + publicUrl);

    return createResponse(true, "Image téléchargée avec succès", {
      url: publicUrl,
      googleUserContentUrl: googleUserContentUrl,
      driveUrl: driveUrl,
      fileId: fileId,
      fileName: fileName,
    });
  } catch (error) {
    Logger.log("Erreur uploadImageToDrive: " + error);
    return createResponse(false, error.toString());
  }
}

/* ==================== CHANGEMENT DE MOT DE PASSE ==================== */

function changePasswordHash(oldPasswordHash, newPasswordHash) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Settings");

    // Créer la feuille Settings si elle n'existe pas
    if (!sheet) {
      sheet = ss.insertSheet("Settings");
      sheet.appendRow(["key", "value"]);
      Logger.log("Feuille Settings créée");
    }

    // Chercher si une entrée password_hash existe déjà
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === "password_hash") {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      // Pas d'entrée existante, ajouter une nouvelle ligne
      sheet.appendRow(["password_hash", newPasswordHash]);
      Logger.log("Nouveau hash de mot de passe ajouté");
    } else {
      // Mettre à jour l'entrée existante
      sheet.getRange(rowIndex, 2).setValue(newPasswordHash);
      Logger.log("Hash de mot de passe mis à jour");
    }

    return createResponse(true, "Mot de passe changé avec succès", {
      newHash: newPasswordHash,
    });
  } catch (error) {
    Logger.log("Erreur changePasswordHash: " + error);
    return createResponse(false, error.toString());
  }
}

function getPasswordHash() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Settings");

    // Si la feuille n'existe pas, retourner null
    if (!sheet) {
      return createResponse(true, "Aucun hash personnalisé trouvé", {
        hash: null,
      });
    }

    // Chercher l'entrée password_hash
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === "password_hash") {
        return createResponse(true, "Hash trouvé", {
          hash: data[i][1],
        });
      }
    }

    // Pas d'entrée trouvée
    return createResponse(true, "Aucun hash personnalisé trouvé", {
      hash: null,
    });
  } catch (error) {
    Logger.log("Erreur getPasswordHash: " + error);
    return createResponse(false, error.toString());
  }
}

/* ==================== TESTS ==================== */

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

function testAddProduct() {
  const testData = {
    id: "test-produit-3",
    name: "Produit Test 3",
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

function testUploadImage() {
  // Image de test en base64 (une petite image 1x1 pixel rouge)
  const base64Data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

  const result = uploadImageToDrive("test-image.png", "image/png", base64Data);
  Logger.log(result.getContent());
}

/**
 * Fonction de test pour la génération de facture PDF
 */
function testGenerateInvoicePDF() {
  const fakeOrder = {
    order_ref: "TEST-1234",
    full_name: "Maxime Frech",
    email: OWNER_EMAIL,
    address: "12 rue test",
    city: "Mulhouse",
    zip: "68100",
    items: [
      {
        id: "sencha",
        name: "Sencha Vert",
        qty: 1,
        price_eur: 14.5,
        line_total_eur: 14.5,
      },
      {
        id: "earl-grey",
        name: "Earl Grey Noir",
        qty: 2,
        price_eur: 12.9,
        line_total_eur: 25.8,
      },
    ],
    total_eur: 40.3,
    status: "paid",
    created_at: new Date().toISOString(),
    paid_at: new Date().toISOString(),
  };

  try {
    const pdf = generateInvoicePDF(fakeOrder, LOGO_FILE_ID);
    Logger.log("PDF généré avec succès: " + pdf.getName());
    Logger.log("Taille: " + pdf.getBytes().length + " octets");

    // Optionnellement, sauvegarder dans Drive pour inspection
    const testFolder = DriveApp.getFoldersByName("MonThe-Test").hasNext()
      ? DriveApp.getFoldersByName("MonThe-Test").next()
      : DriveApp.createFolder("MonThe-Test");

    const file = testFolder.createFile(pdf);
    Logger.log("PDF sauvegardé: " + file.getUrl());

    return "OK - PDF généré";
  } catch (err) {
    Logger.log("Erreur: " + err.message);
    return "Erreur: " + err.message;
  }
}
