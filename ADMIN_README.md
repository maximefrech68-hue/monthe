# Interface Administration - MonThé

Interface d'administration complète pour gérer les produits du site MonThé.

## Accès à l'interface

**URL :** `admin.html`
**Mot de passe :** `Pdjs895(!s$`

## Fonctionnalités

### Interface principale (admin.html)
- Authentification sécurisée par mot de passe
- Affichage de tous les produits (actifs et inactifs)
- Recherche et filtrage par catégorie
- Tri par prix ou nom
- Boutons "Modifier" et "Supprimer" sur chaque produit
- Bouton "+" pour ajouter un nouveau produit
- Bouton déconnexion renvoyant à index.html

### Formulaire de gestion (admin-form.html)
- Ajout de nouveaux produits
- Modification de produits existants
- Upload d'images depuis l'ordinateur
- Validation des champs obligatoires
- Bouton retour vers l'interface admin
- Bouton déconnexion

## Structure des données

Les champs suivants correspondent EXACTEMENT aux colonnes de votre Google Sheet :

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `id` | Texte | ✅ | Identifiant unique (auto-généré) |
| `name` | Texte | ✅ | Nom du produit |
| `category` | Sélection | ✅ | noir, vert, oolong, infusion |
| `price_eur` | Nombre | ✅ | Prix en euros (ex: 12.50) |
| `format` | Texte | ✅ | Format (ex: "50g", "100g") |
| `stock` | Nombre | ❌ | Quantité disponible (vide = illimité) |
| `image_url` | URL | ❌ | Lien vers l'image du produit |
| `short_desc` | Texte | ❌ | Description courte (1 phrase) |
| `description` | Texte long | ❌ | Description complète |
| `origin` | Texte | ❌ | Pays d'origine |
| `tasting_notes` | Texte | ❌ | Notes de dégustation |
| `ingredients` | Texte long | ❌ | Liste des ingrédients |
| `active` | TRUE/FALSE | ✅ | Visible sur le site ou non |

## Configuration de Google Apps Script

### 1. Accéder à Apps Script

1. Ouvrez votre Google Sheet
2. Cliquez sur **Extensions** > **Apps Script**

### 2. Copier le code

Copiez le contenu du fichier **`apps-script-backend.js`** dans l'éditeur Apps Script.

### 3. Déployer

1. Cliquez sur **Déployer** > **Nouvelle application web**
2. Configuration :
   - **Qui a accès** : `Tout le monde`
   - **Exécuter en tant que** : `Moi`
3. Cliquez sur **Déployer**
4. **IMPORTANT** : Copiez l'URL de déploiement fournie

### 4. Mettre à jour l'URL

Remplacez `APPS_SCRIPT_URL` dans les fichiers suivants avec l'URL que vous avez copiée :
- **admin.js** (ligne 3-4)
- **admin-form.js** (ligne 3-4)

## Configuration de l'upload d'images

Les images sont automatiquement uploadées sur **Google Drive** dans un dossier "MonThe-Images".

**Aucune configuration supplémentaire n'est nécessaire** - le système utilise votre compte Google et configure automatiquement les permissions publiques.

Les images sont servies via l'URL : `https://drive.google.com/uc?export=view&id=FILE_ID`

### Redéployer le script après modification

Si vous modifiez le fichier `apps-script-backend.js` :

1. Ouvrez votre Google Sheet
2. **Extensions** > **Apps Script**
3. Copiez le contenu de `apps-script-backend.js` et collez-le dans l'éditeur
4. **Sauvegardez** (Ctrl+S ou icône disquette)
5. Cliquez sur **Déployer** > **Gérer les déploiements**
6. Cliquez sur l'icône ✏️ (crayon) à côté du déploiement existant
7. Dans "Version", sélectionnez **"Nouvelle version"**
8. Ajoutez une description (ex: "Fix image URLs")
9. Cliquez sur **Déployer**
10. **L'URL reste la même** - pas besoin de la modifier dans vos fichiers JS

## Format de l'onglet Google Sheet

L'onglet **Products** doit avoir exactement ces colonnes (en en-tête, ligne 1) :

```
id | name | category | price_eur | format | stock | image_url | short_desc | description | origin | tasting_notes | ingredients | active
```

**Important :**
- L'ordre des colonnes n'est pas important
- Les noms doivent correspondre exactement (respectez la casse)
- Assurez-vous qu'il n'y a pas de colonnes supplémentaires comme "brewing_temp" ou "brewing_time"

## Utilisation

### Connexion
1. Ouvrez `admin.html`
2. Entrez le mot de passe
3. Vous êtes redirigé vers l'interface de gestion

### Ajouter un produit
1. Cliquez sur le bouton "+" dans le bandeau
2. Remplissez le formulaire
3. Téléchargez une image (optionnel)
4. Cliquez sur "Ajouter le produit"
5. Vous êtes redirigé vers l'interface principale

### Modifier un produit
1. Dans l'interface principale, cliquez sur "Modifier" sur le produit
2. Modifiez les champs souhaités
3. Cliquez sur "Modifier le produit"
4. Vous êtes redirigé vers l'interface principale

### Supprimer un produit
1. Dans l'interface principale, cliquez sur "Supprimer" sur le produit
2. Confirmez la suppression
3. La page se recharge automatiquement

### Déconnexion
- Depuis l'interface principale : bouton "Déconnexion" dans le bandeau → retour à index.html
- Depuis le formulaire : bouton "Déconnexion" en haut à droite → retour à index.html

## Sécurité

- Le mot de passe est stocké dans les fichiers JavaScript (admin.js et admin-form.js)
- L'authentification utilise `sessionStorage` (expire à la fermeture du navigateur)
- Pour changer le mot de passe, modifiez la constante `ADMIN_PASSWORD` dans :
  - admin.js (ligne 2)
  - admin-form.js (ligne 2)

## Dépannage

### Le produit n'apparaît pas sur le site

- Vérifiez que le champ `active` est sur `TRUE`
- Rechargez complètement le site (Ctrl+F5)
- Vérifiez que le produit est bien présent dans la Google Sheet

### Erreur lors de l'ajout/modification

- Vérifiez que tous les champs obligatoires sont remplis
- Vérifiez l'URL du Apps Script dans admin.js et admin-form.js
- Consultez la console du navigateur (F12) pour plus de détails
- Vérifiez les logs dans Google Apps Script (Exécutions > Afficher les journaux)

### Erreur "La feuille 'Products' n'existe pas"

- L'onglet dans votre Google Sheet doit s'appeler exactement **Products** (respectez la casse)

### L'upload d'image ne fonctionne pas

- Vérifiez que l'image fait moins de 6MB
- Ouvrez Google Apps Script > Exécutions pour voir les logs
- Vérifiez que le dossier "MonThe-Images" a été créé dans votre Drive
- L'image doit s'afficher dans l'aperçu avant de soumettre le formulaire

### Le produit ne s'enregistre pas dans la Google Sheet

**Diagnostic étape par étape :**

1. **Ouvrez Google Apps Script** (Extensions > Apps Script depuis votre Sheet)
2. **Cliquez sur "Exécutions"** (icône ⚡️) dans la barre latérale gauche
3. **Essayez d'ajouter un produit** depuis admin-form.html
4. **Regardez les logs dans "Exécutions"** :
   - Si vous voyez une erreur en rouge : notez le message d'erreur
   - Si vous ne voyez rien : le script n'est pas appelé (problème d'URL ou de déploiement)

**Causes fréquentes :**

- **URL Apps Script incorrecte** : Vérifiez que l'URL dans admin-form.js correspond à celle de votre déploiement
- **Colonnes manquantes dans la Sheet** : Vérifiez que toutes les colonnes existent (voir "Format de l'onglet Google Sheet")
- **Nom de l'onglet incorrect** : L'onglet doit s'appeler exactement "Products" (avec P majuscule)
- **Déploiement non à jour** : Créez une nouvelle version du déploiement après avoir modifié le script

### Erreur "ID déjà existant"

- Chaque produit doit avoir un ID unique
- Modifiez l'ID pour qu'il soit différent

## Navigation

- **index.html** : Site public → Icône ⚙ → admin.html (avec authentification)
- **admin.html** : Interface de gestion → Bouton + → admin-form.html (ajout)
- **admin.html** : Interface de gestion → Bouton Modifier → admin-form.html?id=xxx (modification)
- **admin-form.html** : Formulaire → Bouton Retour → admin.html
- **admin.html / admin-form.html** : Bouton Déconnexion → index.html

## Thème

L'interface respecte le thème du site MonThé :
- Couleur principale : `#a0826d` (brun clair)
- Couleur ajout : `#4a7c59` (vert)
- Couleur suppression : `#b00020` (rouge)
- Fond : `#f7f4ef` (beige)
- Design cohérent avec le reste du site