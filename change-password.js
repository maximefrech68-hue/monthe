// Configuration
// Hash SHA-256 du mot de passe par défaut (fallback)
const DEFAULT_PASSWORD_HASH = "04b60e8e42ac31ab5e5fa8af7e0841a5bd4e40ae7343017dbeac4ad3f845fc5c";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwWO8wmikXDUIuCLLZbi-Y4m-LdWoyJIF4ogNqFouDj8-XBVib3iK7CR05zVpXvMEHR/exec";

// Hash actuel (sera récupéré depuis Google Sheets ou utilisera le défaut)
let ADMIN_PASSWORD_HASH = DEFAULT_PASSWORD_HASH;

// Protection anti-brute-force
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes en millisecondes

// Fonction de hashage SHA-256
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Fonction pour récupérer le hash depuis Google Sheets
async function fetchPasswordHash() {
  // Vérifier d'abord le cache
  const cachedHash = sessionStorage.getItem('adminPasswordHash');
  if (cachedHash) {
    ADMIN_PASSWORD_HASH = cachedHash;
    console.log('Hash chargé depuis le cache');
    return;
  }

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?action=getPasswordHash`);
    const data = await response.json();

    if (data.success && data.hash) {
      ADMIN_PASSWORD_HASH = data.hash;
      // Mettre en cache pour les prochaines pages
      sessionStorage.setItem('adminPasswordHash', data.hash);
      console.log('Hash personnalisé chargé depuis Google Sheets');
    } else {
      console.log('Utilisation du hash par défaut');
    }
  } catch (error) {
    console.warn('Impossible de récupérer le hash personnalisé, utilisation du hash par défaut:', error);
  }
}

// Éléments DOM
const changePasswordForm = document.getElementById("changePasswordForm");
const errorMsg = document.getElementById("errorMsg");
const successMsg = document.getElementById("successMsg");
const logoutBtn = document.getElementById("logoutBtn");
const submitBtn = document.getElementById("submitBtn");

let lockoutTimer = null;

// Fonctions anti-brute-force
function getLoginAttempts() {
  try {
    const data = localStorage.getItem("changePasswordAttempts");
    return data ? JSON.parse(data) : { count: 0, blockedUntil: null };
  } catch {
    return { count: 0, blockedUntil: null };
  }
}

function saveLoginAttempts(count, blockedUntil = null) {
  localStorage.setItem("changePasswordAttempts", JSON.stringify({ count, blockedUntil }));
}

function isBlocked() {
  const attempts = getLoginAttempts();
  if (attempts.blockedUntil && Date.now() < attempts.blockedUntil) {
    return attempts.blockedUntil;
  }
  // Si le blocage est expiré, réinitialiser
  if (attempts.blockedUntil && Date.now() >= attempts.blockedUntil) {
    saveLoginAttempts(0, null);
  }
  return false;
}

function incrementFailedAttempts() {
  const attempts = getLoginAttempts();
  const newCount = attempts.count + 1;

  if (newCount >= MAX_ATTEMPTS) {
    const blockedUntil = Date.now() + LOCKOUT_DURATION;
    saveLoginAttempts(newCount, blockedUntil);
    return blockedUntil;
  } else {
    saveLoginAttempts(newCount, null);
    return false;
  }
}

function resetLoginAttempts() {
  saveLoginAttempts(0, null);
}

function formatTimeRemaining(blockedUntil) {
  const remaining = Math.ceil((blockedUntil - Date.now()) / 1000);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateLockoutMessage(blockedUntil) {
  const timeRemaining = formatTimeRemaining(blockedUntil);
  showError(`Trop de tentatives échouées. Réessayez dans ${timeRemaining}.`);

  // Mettre à jour le message chaque seconde
  lockoutTimer = setTimeout(() => {
    if (Date.now() < blockedUntil) {
      updateLockoutMessage(blockedUntil);
    } else {
      hideError();
      enableForm();
      resetLoginAttempts();
    }
  }, 1000);
}

function disableForm() {
  submitBtn.disabled = true;
  document.getElementById("currentPassword").disabled = true;
  document.getElementById("newPassword").disabled = true;
  document.getElementById("confirmPassword").disabled = true;
}

function enableForm() {
  submitBtn.disabled = false;
  document.getElementById("currentPassword").disabled = false;
  document.getElementById("newPassword").disabled = false;
  document.getElementById("confirmPassword").disabled = false;
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = "block";
  successMsg.style.display = "none";
}

function hideError() {
  errorMsg.style.display = "none";
}

function showSuccess(message) {
  successMsg.textContent = message;
  successMsg.style.display = "block";
  errorMsg.style.display = "none";

  // Cacher après 5 secondes
  setTimeout(() => {
    successMsg.style.display = "none";
  }, 5000);
}

// Vérifier l'authentification au chargement
function checkAuth() {
  const isAuthenticated = sessionStorage.getItem("adminAuth") === "true";
  if (!isAuthenticated) {
    alert("Vous devez être connecté pour accéder à cette page.");
    window.location.href = "admin.html";
    return false;
  }
  return true;
}

// Vérifier si bloqué au chargement
function checkIfBlocked() {
  const blockedUntil = isBlocked();
  if (blockedUntil) {
    disableForm();
    updateLockoutMessage(blockedUntil);
  }
}

// Gestion du formulaire
changePasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Vérifier si bloqué
  const blockedUntil = isBlocked();
  if (blockedUntil) {
    updateLockoutMessage(blockedUntil);
    return;
  }

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  // Validation côté client
  if (newPassword.length < 8) {
    showError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showError("Les nouveaux mots de passe ne correspondent pas.");
    return;
  }

  if (currentPassword === newPassword) {
    showError("Le nouveau mot de passe doit être différent de l'ancien.");
    return;
  }

  // Hasher le mot de passe actuel et vérifier
  const currentPasswordHash = await hashPassword(currentPassword);

  if (currentPasswordHash !== ADMIN_PASSWORD_HASH) {
    // Échec - incrémenter les tentatives
    const newBlockedUntil = incrementFailedAttempts();

    if (newBlockedUntil) {
      // Bloqué après 3 tentatives
      disableForm();
      updateLockoutMessage(newBlockedUntil);
    } else {
      // Pas encore bloqué
      const attempts = getLoginAttempts();
      const remaining = MAX_ATTEMPTS - attempts.count;
      showError(`Mot de passe actuel incorrect. ${remaining} tentative(s) restante(s).`);
    }
    return;
  }

  // Mot de passe actuel correct - hasher le nouveau
  const newPasswordHash = await hashPassword(newPassword);

  // Désactiver le bouton pendant l'envoi
  submitBtn.disabled = true;
  submitBtn.textContent = "Changement en cours...";

  try {
    // Envoyer au backend
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "changePassword",
        oldPasswordHash: currentPasswordHash,
        newPasswordHash: newPasswordHash,
      }),
    });

    // Mode no-cors ne permet pas de lire la réponse
    // On considère que c'est un succès si pas d'erreur
    resetLoginAttempts();
    if (lockoutTimer) clearTimeout(lockoutTimer);

    showSuccess("Mot de passe changé avec succès ! IMPORTANT : Notez le nouveau hash ci-dessous pour mettre à jour vos fichiers JS si nécessaire.");

    // Afficher le nouveau hash pour l'utilisateur
    const hashDisplay = document.createElement("div");
    hashDisplay.style.cssText = "background: #f7f4ef; padding: 1rem; border-radius: 8px; margin-top: 1rem; word-break: break-all; font-family: monospace; font-size: 12px;";
    hashDisplay.innerHTML = `<strong>Nouveau hash SHA-256 :</strong><br>${newPasswordHash}<br><br><small>⚠️ Conservez ce hash en lieu sûr. Il a été enregistré dans Google Sheets pour une utilisation future.</small>`;

    changePasswordForm.insertAdjacentElement('afterend', hashDisplay);

    // Réinitialiser le formulaire
    changePasswordForm.reset();

    // Déconnexion automatique après 5 secondes
    setTimeout(() => {
      sessionStorage.removeItem("adminAuth");
      sessionStorage.removeItem("adminPasswordHash");
      alert("Vous allez être déconnecté. Reconnectez-vous avec votre nouveau mot de passe.");
      window.location.href = "admin.html";
    }, 5000);

  } catch (error) {
    console.error("Erreur:", error);
    showError("Erreur lors du changement de mot de passe. Veuillez réessayer.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Changer le mot de passe";
  }
});

// Gestion de la déconnexion
logoutBtn.addEventListener("click", () => {
  if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
    sessionStorage.removeItem("adminAuth");
      sessionStorage.removeItem("adminPasswordHash");
    window.location.href = "index.html";
  }
});

// Initialisation
(async function() {
  // Vérifier l'auth d'abord (redirection si non authentifié)
  checkAuth();
  checkIfBlocked();
  // Récupérer le hash en arrière-plan
  fetchPasswordHash();
})();
