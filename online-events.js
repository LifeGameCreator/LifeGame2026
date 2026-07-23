(() => {
  const ONLINE_VERSION = "2026-07-23-finder-autologin-stabil-1";
  const FIRESTORE_DATABASE_ID = "gamekl";
  const AUDIT_STORAGE_PREFIX = "lifebuilder-2026-online-audit:";
  const HEARTBEAT_MS = 25000;
  const ONLINE_WINDOW_MS = 70000;
  const hostedOnlineMode = /^https?:$/.test(window.location.protocol)
    && !["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(String(window.location.hostname || "").toLowerCase());

  let firebasePromise = null;
  let onlineUser = null;
  let authWaitPromise = null;
  let authWaitResolve = null;
  let authWaitReject = null;
  let playerSyncTimer = null;
  let heartbeatTimer = null;
  let commandsUnsubscribe = null;
  let eventUnsubscribe = null;
  let participantUnsubscribe = null;
  let moderationUnsubscribe = null;
  let currentEvent = null;
  let currentParticipant = null;
  let processingCommands = new Set();
  let interactiveAuthInProgress = false;
  let identityCheckPromise = null;
  let cloudSaveTimer = null;
  let cloudHydrationPromise = null;
  let cloudSaveReadyUid = "";
  let databaseReadyUid = "";
  let databaseVerificationPromise = null;
  let databaseConnectionError = "";

  const htmlEscape = (value) => typeof escapeHtml === "function"
    ? escapeHtml(value)
    : String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function onlineRequired() {
    return hostedOnlineMode;
  }

  async function loadOnlineFirebase() {
    if (firebasePromise) return firebasePromise;
    firebasePromise = (async () => {
      const [appMod, authMod, dbMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
      ]);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebasePhoneConfig);
      const auth = authMod.getAuth(app);
      // Die Sitzung ausdrücklich dauerhaft im Browser speichern. Das stabilisiert
      // die automatische Anmeldung besonders in Safari, installierten Web-Apps
      // und nach normalen Seitenaktualisierungen.
      try {
        await authMod.setPersistence(auth, authMod.browserLocalPersistence);
      } catch (error) {
        console.warn("Firebase-Login konnte die lokale Persistenz nicht ausdrücklich setzen", error);
      }
      // Warten, bis Firebase den bereits gespeicherten Account wiederhergestellt hat.
      // Firestore wird erst danach separat geprüft und darf den Auth-Status nicht blockieren.
      try { await auth.authStateReady?.(); } catch {}
      const db = dbMod.getFirestore(app, FIRESTORE_DATABASE_ID);
      return { ...authMod, ...dbMod, auth, db };
    })().catch((error) => {
      firebasePromise = null;
      throw error;
    });
    return firebasePromise;
  }

  function databaseErrorText(error) {
    const raw = String(error?.message || error || "");
    const code = String(error?.code || error?.name || "");
    if (/database.*does not exist/i.test(raw) || raw.includes("Cloud Firestore database")) {
      return `Die Firestore-Datenbank ${FIRESTORE_DATABASE_ID} fehlt oder ist nicht erreichbar. Wähle in Firebase die Datenbank ${FIRESTORE_DATABASE_ID} und veröffentliche dort die Regeln.`;
    }
    if (code.includes("permission-denied")) {
      return `Die Firestore-Datenbank ${FIRESTORE_DATABASE_ID} ist erreichbar, aber ihre Sicherheitsregeln lehnen den Zugriff ab. Veröffentliche die aktuellen Regeln ausdrücklich in ${FIRESTORE_DATABASE_ID}.`;
    }
    if (code.includes("unavailable") || code.includes("network-request-failed") || code.includes("failed-precondition")) {
      return "Die Live-Datenbank ist gerade nicht erreichbar. Prüfe Internet, Firestore-Einrichtung und die Firebase-Projekt-ID life-kl.";
    }
    return raw || "Die Live-Datenbank konnte nicht verbunden werden.";
  }

  async function verifyOnlineDatabase(fb = null, user = onlineUser, force = false) {
    if (!user) throw new Error("Bitte zuerst anmelden.");
    if (!force && databaseReadyUid === user.uid) return true;
    if (databaseVerificationPromise) return databaseVerificationPromise;
    databaseVerificationPromise = (async () => {
      const runtime = fb || await loadOnlineFirebase();
      const now = Date.now();
      try {
        await runtime.setDoc(runtime.doc(runtime.db, "connectionChecks", user.uid), {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "",
          lastConnectedAtMs: now,
          version: ONLINE_VERSION
        }, { merge: true });
        databaseReadyUid = user.uid;
        databaseConnectionError = "";
        updateOnlineStatusBadge();
        return true;
      } catch (error) {
        databaseReadyUid = "";
        databaseConnectionError = databaseErrorText(error);
        updateOnlineStatusBadge();
        throw error;
      }
    })().finally(() => { databaseVerificationPromise = null; });
    return databaseVerificationPromise;
  }

  function authErrorText(error) {
    const code = String(error?.code || error?.name || "");
    if (code.includes("username-taken")) return "Dieser Spielername ist bereits vergeben. Bitte einen anderen Namen wählen.";
    if (code.includes("username-locked")) return "Der Spielername dieses Accounts ist bereits fest vergeben.";
    if (code.includes("invalid-username")) return "Der Spielername muss 3 bis 30 Zeichen haben. Erlaubt sind Buchstaben, Zahlen, Leerzeichen, Punkt, Minus und Unterstrich.";
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "E-Mail oder Passwort ist falsch.";
    if (code.includes("email-already-in-use") || code.includes("email-already-exists")) return "Für diese E-Mail gibt es bereits einen Account.";
    if (code.includes("weak-password")) return "Das Passwort muss mindestens 8 Zeichen sowie Buchstaben und Zahlen enthalten.";
    if (code.includes("invalid-email")) return "Bitte eine gültige E-Mail-Adresse eingeben.";
    if (code.includes("too-many-requests")) return "Zu viele Versuche. Bitte kurz warten und erneut probieren.";
    const rawMessage = String(error?.message || "");
    if (/database.*does not exist/i.test(rawMessage) || rawMessage.includes("Cloud Firestore database")) {
      return `Die Firestore-Datenbank ${FIRESTORE_DATABASE_ID} fehlt oder ist nicht erreichbar. Öffne Firebase → Firestore Database, wähle ${FIRESTORE_DATABASE_ID} und veröffentliche dort die Regeln.`;
    }
    if (code.includes("permission-denied")) return "Firebase hat den Profilzugriff abgelehnt. Die Anmeldung bleibt gültig; bitte die aktuellen Firestore-Regeln veröffentlichen.";
    if (code.includes("network-request-failed") || code.includes("unavailable")) return "Firebase ist gerade nicht erreichbar. Internetverbindung prüfen und erneut versuchen.";
    return rawMessage || "Firebase-Anmeldung fehlgeschlagen.";
  }

  function normalizePlayerName(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ");
  }

  function playerNameKey(value) {
    return normalizePlayerName(value).toLocaleLowerCase("de-DE");
  }

  function validatePlayerName(value) {
    const name = normalizePlayerName(value);
    if (name.length < 3 || name.length > 30) return { ok: false, name, key: "", message: authErrorText({ code: "invalid-username" }) };
    if (!/^[A-Za-z0-9ÄÖÜäöüß._ -]+$/u.test(name)) return { ok: false, name, key: "", message: authErrorText({ code: "invalid-username" }) };
    return { ok: true, name, key: playerNameKey(name), message: "" };
  }

  function usernameError(code, message = "") {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }

  async function reserveUniquePlayerName(fb, user, requestedName) {
    const checked = validatePlayerName(requestedName);
    if (!checked.ok) throw usernameError("invalid-username", checked.message);
    const usernameRef = fb.doc(fb.db, "usernames", checked.key);
    const accountRef = fb.doc(fb.db, "accounts", user.uid);
    const now = Date.now();

    await fb.runTransaction(fb.db, async (transaction) => {
      const [usernameSnapshot, accountSnapshot] = await Promise.all([
        transaction.get(usernameRef),
        transaction.get(accountRef)
      ]);
      const usernameData = usernameSnapshot.exists() ? usernameSnapshot.data() : null;
      const accountData = accountSnapshot.exists() ? accountSnapshot.data() : null;
      const lockedKey = String(accountData?.usernameKey || "");

      if (usernameData && usernameData.uid !== user.uid) throw usernameError("username-taken");
      if (lockedKey && lockedKey !== checked.key) throw usernameError("username-locked");

      if (!usernameSnapshot.exists()) {
        transaction.set(usernameRef, {
          uid: user.uid,
          usernameKey: checked.key,
          displayName: checked.name,
          createdAtMs: now
        });
      }

      transaction.set(accountRef, {
        uid: user.uid,
        email: user.email || "",
        displayName: checked.name,
        usernameKey: checked.key,
        createdAtMs: Number(accountData?.createdAtMs || now),
        updatedAtMs: now
      }, { merge: true });
    });

    if (user.displayName !== checked.name) await fb.updateProfile(user, { displayName: checked.name });
    return { displayName: checked.name, usernameKey: checked.key };
  }

  function uniqueNameOverlay() {
    let overlay = document.querySelector("[data-unique-name-overlay]");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "online-auth-overlay";
    overlay.dataset.uniqueNameOverlay = "1";
    overlay.innerHTML = `
      <section class="online-auth-card" role="dialog" aria-modal="true" aria-labelledby="uniqueNameTitle">
        <p class="eyebrow">LifeBuilder Online</p>
        <h2 id="uniqueNameTitle">Einmaligen Spielernamen festlegen</h2>
        <p class="online-auth-copy">Jeder Spielername darf im gesamten Online-Spiel nur einmal vorkommen. Dieser Name wird fest mit deinem Account verbunden.</p>
        <label>Spielername<input data-unique-name maxlength="30" autocomplete="nickname" placeholder="Max Mustermann"></label>
        <p class="online-auth-message" data-unique-name-message></p>
        <div class="online-auth-actions">
          <button class="primary-button" data-unique-name-save>Namen speichern</button>
          <button class="secondary-button" data-unique-name-logout>Abmelden</button>
        </div>
        <small>Dein Passwort wird ausschließlich von Firebase Authentication verwaltet und nicht im LifeBuilder-Spielstand oder in Firestore gespeichert.</small>
      </section>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function askForUniquePlayerName(fb, user, suggestion = "", reason = "") {
    const overlay = uniqueNameOverlay();
    const input = overlay.querySelector("[data-unique-name]");
    const message = overlay.querySelector("[data-unique-name-message]");
    const saveButton = overlay.querySelector("[data-unique-name-save]");
    const logoutButton = overlay.querySelector("[data-unique-name-logout]");
    input.value = normalizePlayerName(suggestion).slice(0, 30);
    message.textContent = reason || "Bitte wähle einen noch freien Spielernamen.";
    overlay.classList.add("show");

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        saveButton.removeEventListener("click", save);
        logoutButton.removeEventListener("click", logout);
        input.removeEventListener("keydown", keydown);
      };
      const save = async () => {
        const checked = validatePlayerName(input.value);
        if (!checked.ok) { message.textContent = checked.message; return; }
        saveButton.disabled = true;
        message.textContent = "Spielername wird reserviert …";
        try {
          const identity = await reserveUniquePlayerName(fb, user, checked.name);
          overlay.classList.remove("show");
          cleanup();
          resolve(identity);
        } catch (error) {
          message.textContent = authErrorText(error);
        } finally {
          saveButton.disabled = false;
        }
      };
      const logout = async () => {
        cleanup();
        overlay.classList.remove("show");
        await fb.signOut(fb.auth).catch(() => {});
        reject(usernameError("name-required", "Ohne eindeutigen Spielernamen kann der Online-Modus nicht gestartet werden."));
      };
      const keydown = (event) => { if (event.key === "Enter") { event.preventDefault(); save(); } };
      saveButton.addEventListener("click", save);
      logoutButton.addEventListener("click", logout);
      input.addEventListener("keydown", keydown);
      setTimeout(() => input.focus(), 40);
    });
  }

  async function ensureOnlineIdentity(fb, user) {
    if (!user) throw usernameError("auth-required");
    if (identityCheckPromise) return identityCheckPromise;
    identityCheckPromise = (async () => {
      const accountRef = fb.doc(fb.db, "accounts", user.uid);
      const accountSnapshot = await fb.getDoc(accountRef);
      const account = accountSnapshot.exists() ? accountSnapshot.data() : {};
      const existingKey = String(account?.usernameKey || "");
      const existingName = normalizePlayerName(account?.displayName || user.displayName || "");

      if (existingKey && existingName) {
        const usernameSnapshot = await fb.getDoc(fb.doc(fb.db, "usernames", existingKey));
        if (usernameSnapshot.exists() && usernameSnapshot.data()?.uid === user.uid) {
          if (user.displayName !== existingName) await fb.updateProfile(user, { displayName: existingName });
          return { displayName: existingName, usernameKey: existingKey };
        }
        try {
          return await reserveUniquePlayerName(fb, user, existingName);
        } catch (error) {
          const code = String(error?.code || "");
          if (!code.includes("username-taken") && !code.includes("invalid-username")) throw error;
        }
      }

      const suggestion = existingName || normalizePlayerName(String(user.email || "").split("@")[0]);
      if (suggestion) {
        try {
          return await reserveUniquePlayerName(fb, user, suggestion);
        } catch (error) {
          const code = String(error?.code || "");
          if (!code.includes("username-taken") && !code.includes("invalid-username")) throw error;
        }
      }
      return askForUniquePlayerName(fb, user, suggestion, suggestion ? `„${suggestion}“ ist bereits vergeben. Bitte wähle einen anderen Namen.` : "Bitte lege deinen einmaligen Spielernamen fest.");
    })().finally(() => { identityCheckPromise = null; });
    return identityCheckPromise;
  }

  function authOverlay() {
    let overlay = document.querySelector("[data-online-auth-overlay]");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "online-auth-overlay";
    overlay.dataset.onlineAuthOverlay = "1";
    overlay.innerHTML = `
      <section class="online-auth-card" role="dialog" aria-modal="true" aria-labelledby="onlineAuthTitle">
        <button class="icon-button online-auth-close" data-online-auth-close aria-label="Schließen">×</button>
        <p class="eyebrow">LifeBuilder Online</p>
        <h2 id="onlineAuthTitle">Account anmelden</h2>
        <p class="online-auth-copy">Auf GitHub Pages wird dein Firebase-Account benötigt, damit Events, Online-Spieler, Shops, Nachrichten und Belohnungen eindeutig deinem Charakter zugeordnet werden.</p>
        <div class="online-auth-tabs">
          <button class="active" data-online-auth-tab="login">Anmelden</button>
          <button data-online-auth-tab="register">Registrieren</button>
        </div>
        <label class="online-auth-name" hidden>Spielername<input data-online-auth-name maxlength="30" autocomplete="nickname" placeholder="Max Mustermann"></label>
        <label>E-Mail<input data-online-auth-email type="email" autocomplete="email" placeholder="name@beispiel.de"></label>
        <label>Passwort<input data-online-auth-password type="password" minlength="8" autocomplete="current-password" placeholder="Mindestens 8 Zeichen"></label>
        <p class="online-auth-message" data-online-auth-message></p>
        <div class="online-auth-actions">
          <button class="primary-button" data-online-auth-submit>Anmelden</button>
          <button class="secondary-button" data-online-auth-continue hidden>Weiter zum Spiel</button>
          <button class="secondary-button" data-online-auth-logout hidden>Abmelden</button>
        </div>
        <small>Jede E-Mail und jeder Spielername kann nur einmal verwendet werden. Passwörter werden ausschließlich von Firebase Authentication verwaltet und niemals im Spielstand gespeichert.</small>
      </section>`;
    document.body.appendChild(overlay);

    let mode = "login";
    const setMode = (next) => {
      mode = next === "register" ? "register" : "login";
      overlay.querySelectorAll("[data-online-auth-tab]").forEach((button) => button.classList.toggle("active", button.dataset.onlineAuthTab === mode));
      overlay.querySelector(".online-auth-name").hidden = mode !== "register";
      overlay.querySelector("[data-online-auth-submit]").textContent = mode === "register" ? "Account erstellen" : "Anmelden";
      overlay.querySelector("[data-online-auth-password]").autocomplete = mode === "register" ? "new-password" : "current-password";
      overlay.querySelector("[data-online-auth-message]").textContent = "";
    };
    overlay.querySelectorAll("[data-online-auth-tab]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.onlineAuthTab)));
    overlay.querySelector("[data-online-auth-close]").addEventListener("click", () => {
      overlay.classList.remove("show");
      if (authWaitReject) authWaitReject(new Error("Anmeldung abgebrochen."));
      authWaitResolve = null;
      authWaitReject = null;
      authWaitPromise = null;
    });
    overlay.querySelector("[data-online-auth-continue]").addEventListener("click", async () => {
      const message = overlay.querySelector("[data-online-auth-message]");
      try {
        const fb = await loadOnlineFirebase();
        message.textContent = "Live-Datenbank wird geprüft …";
        await verifyOnlineDatabase(fb, onlineUser, true);
        overlay.classList.remove("show");
        if (authWaitResolve) authWaitResolve(onlineUser);
        authWaitResolve = null;
        authWaitReject = null;
        authWaitPromise = null;
      } catch (error) {
        message.textContent = databaseErrorText(error);
      }
    });
    overlay.querySelector("[data-online-auth-logout]").addEventListener("click", async () => {
      const fb = await loadOnlineFirebase();
      await setPlayerOffline().catch(() => {});
      await fb.signOut(fb.auth);
      updateAuthOverlayState();
    });
    overlay.querySelector("[data-online-auth-submit]").addEventListener("click", async () => {
      const message = overlay.querySelector("[data-online-auth-message]");
      const submit = overlay.querySelector("[data-online-auth-submit]");
      const email = overlay.querySelector("[data-online-auth-email]").value.trim().toLocaleLowerCase("de-DE");
      const password = overlay.querySelector("[data-online-auth-password]").value;
      const checkedName = validatePlayerName(overlay.querySelector("[data-online-auth-name]").value);
      if (!email || !password || (mode === "register" && !checkedName.ok)) {
        message.textContent = mode === "register"
          ? (!checkedName.ok ? checkedName.message : "Spielername, E-Mail und Passwort ausfüllen.")
          : "E-Mail und Passwort ausfüllen.";
        return;
      }
      if (mode === "register" && (password.length < 8 || !/[A-Za-zÄÖÜäöüß]/u.test(password) || !/\d/.test(password))) {
        message.textContent = "Das Passwort muss mindestens 8 Zeichen sowie mindestens einen Buchstaben und eine Zahl enthalten.";
        return;
      }
      submit.disabled = true;
      interactiveAuthInProgress = true;
      message.textContent = mode === "register" ? "Account und Spielername werden erstellt …" : "Anmeldung läuft …";
      let newlyCreatedUser = null;
      let fb = null;
      try {
        fb = await loadOnlineFirebase();
        let credentials;
        if (mode === "register") {
          credentials = await fb.createUserWithEmailAndPassword(fb.auth, email, password);
          newlyCreatedUser = credentials.user;
          try {
            await reserveUniquePlayerName(fb, credentials.user, checkedName.name);
          } catch (identityError) {
            await fb.deleteUser(credentials.user).catch(() => {});
            await fb.signOut(fb.auth).catch(() => {});
            throw identityError;
          }
        } else {
          credentials = await fb.signInWithEmailAndPassword(fb.auth, email, password);
          // Auth ist der entscheidende Login. Die Namens-/Profilsynchronisierung
          // läuft danach und darf alte Accounts nicht aus dem Spiel aussperren.
          onlineUser = credentials.user;
          try {
            await ensureOnlineIdentity(fb, credentials.user);
          } catch (identityError) {
            console.warn("Firebase-Anmeldung erfolgreich; Online-Profil folgt später", identityError);
          }
        }
        onlineUser = credentials.user;
        updateOnlineStatusBadge();
        updateAuthOverlayState();
        // Anmeldung sofort bestätigen. Die Live-Datenbank wird danach separat geprüft.
        if (authWaitResolve) authWaitResolve(credentials.user);
        authWaitResolve = null;
        authWaitReject = null;
        authWaitPromise = null;
        message.textContent = `Angemeldet als ${credentials.user.displayName || credentials.user.email}. Live-Daten werden im Hintergrund verbunden …`;
        setTimeout(() => overlay.classList.remove("show"), 180);
        void (async () => {
          try {
            await verifyOnlineDatabase(fb, credentials.user, true);
            try { await hydrateCloudSlots(credentials.user); } catch (error) { console.warn("Cloud-Spielstände folgen später", error); }
            startOnlineServices();
          } catch (error) {
            databaseConnectionError = databaseErrorText(error);
            updateOnlineStatusBadge();
            updateAuthOverlayState();
          }
        })();
      } catch (error) {
        if (newlyCreatedUser && fb?.auth?.currentUser?.uid === newlyCreatedUser.uid) {
          await fb.signOut(fb.auth).catch(() => {});
        }
        message.textContent = authErrorText(error);
      } finally {
        interactiveAuthInProgress = false;
        submit.disabled = false;
      }
    });
    setMode("login");
    return overlay;
  }

  function updateAuthOverlayState() {
    const overlay = authOverlay();
    const loggedIn = !!onlineUser;
    overlay.querySelector("[data-online-auth-submit]").hidden = loggedIn;
    overlay.querySelector("[data-online-auth-continue]").hidden = !loggedIn;
    overlay.querySelector("[data-online-auth-logout]").hidden = !loggedIn;
    overlay.querySelectorAll("[data-online-auth-tab]").forEach((button) => button.hidden = loggedIn);
    overlay.querySelectorAll("label").forEach((label) => {
      if (!label.classList.contains("online-auth-name")) label.hidden = loggedIn;
    });
    overlay.querySelector(".online-auth-name").hidden = true;
    const title = overlay.querySelector("#onlineAuthTitle");
    const copy = overlay.querySelector(".online-auth-copy");
    const message = overlay.querySelector("[data-online-auth-message]");
    if (loggedIn) {
      title.textContent = databaseReadyUid === onlineUser.uid ? "LifeBuilder live verbunden" : "Firebase-Account angemeldet";
      copy.textContent = databaseReadyUid === onlineUser.uid
        ? "Account, Spielstände, Tickets, Events und Online-Funktionen sind mit der Firestore-Datenbank verbunden."
        : "Der Account ist angemeldet, aber die Firestore-Datenbank wurde noch nicht erfolgreich geprüft.";
      message.textContent = databaseReadyUid === onlineUser.uid
        ? `${onlineUser.displayName || "Spieler"} · Live-Datenbank verbunden`
        : (databaseConnectionError || `${onlineUser.displayName || "Spieler"} · Datenbankprüfung erforderlich`);
    } else {
      title.textContent = "Account anmelden";
      copy.textContent = "Auf GitHub Pages wird dein Firebase-Account benötigt, damit Events, Online-Spieler, Shops, Nachrichten und Belohnungen eindeutig deinem Charakter zugeordnet werden.";
      message.textContent = "";
    }
    updateOnlineStatusBadge();
  }

  function showAuthOverlay() {
    const overlay = authOverlay();
    updateAuthOverlayState();
    overlay.classList.add("show");
    setTimeout(() => overlay.querySelector(onlineUser ? "[data-online-auth-continue]" : "[data-online-auth-email]")?.focus(), 50);
    return overlay;
  }

  async function requireUser(auth = null) {
    const fb = await loadOnlineFirebase();
    const activeAuth = auth || fb.auth;
    if (activeAuth.currentUser) {
      // Firebase Authentication ist die Anmeldung. Firestore-Prüfung, Profilabgleich
      // und Cloud-Spielstände laufen danach im Hintergrund und dürfen den Start
      // weder blockieren noch den Spieler erneut zum Login schicken.
      onlineUser = activeAuth.currentUser;
      updateOnlineStatusBadge();
      updateAuthOverlayState();
      void (async () => {
        try {
          if (hostedOnlineMode) await verifyOnlineDatabase(fb, onlineUser);
          try { await ensureOnlineIdentity(fb, onlineUser); } catch (error) { console.warn("Online-Profil folgt später", error); }
          try { await hydrateCloudSlots(onlineUser); } catch (error) { console.warn("Cloud-Spielstände folgen später", error); }
          startOnlineServices();
        } catch (error) {
          databaseConnectionError = databaseErrorText(error);
          updateOnlineStatusBadge();
          updateAuthOverlayState();
        }
      })();
      return onlineUser;
    }
    if (!authWaitPromise) {
      authWaitPromise = new Promise((resolve, reject) => { authWaitResolve = resolve; authWaitReject = reject; });
      showAuthOverlay();
    }
    return authWaitPromise;
  }

  function updateOnlineStatusBadge() {
    let badge = document.querySelector("[data-online-account-badge]");
    if (!badge) {
      badge = document.createElement("button");
      badge.type = "button";
      badge.className = "online-account-badge";
      badge.dataset.onlineAccountBadge = "1";
      badge.addEventListener("click", showAuthOverlay);
      document.querySelector(".start-actions")?.insertAdjacentElement("afterend", badge);
    }
    if (!badge) return;
    const liveConnected = !!onlineUser && databaseReadyUid === onlineUser.uid;
    badge.classList.toggle("online", liveConnected);
    badge.classList.toggle("error", !!onlineUser && !liveConnected);
    badge.innerHTML = liveConnected
      ? `<span></span><b>Live</b><small>${htmlEscape(onlineUser.displayName || onlineUser.email || "Account")}</small>`
      : onlineUser
        ? `<span></span><b>Datenbankfehler</b><small>${htmlEscape(databaseConnectionError || "Verbindung prüfen")}</small>`
        : `<span></span><b>Offline</b><small>${hostedOnlineMode ? "Anmeldung erforderlich" : "Lokaler Testmodus"}</small>`;
  }

  function cloudSlotRef(fb, uid, slotIndex) {
    return fb.doc(fb.db, "gameSaves", uid, "slots", `slot-${Number(slotIndex) + 1}`);
  }

  function persistLocalSlotsAfterCloudLoad() {
    localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saveSlots));
    localStorage.setItem(ACTIVE_SLOT_KEY, String(activeSlot));
    state = saveSlots[activeSlot] || null;
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
    if (typeof renderSaveSlots === "function") renderSaveSlots();
    if (typeof render === "function") render();
  }

  async function writeCloudSlot(slotIndex, slotState = saveSlots?.[slotIndex] || null) {
    if (!onlineUser || !slotState) return;
    const fb = await loadOnlineFirebase();
    const updatedAtMs = Math.max(Date.now(), Number(slotState.onlineUpdatedAtMs || 0));
    slotState.onlineUpdatedAtMs = updatedAtMs;
    const stateJson = JSON.stringify(slotState);
    if (stateJson.length > 900000) throw new Error("Der Spielstand ist zu groß für den Online-Speicher.");
    await fb.setDoc(cloudSlotRef(fb, onlineUser.uid, slotIndex), {
      uid: onlineUser.uid,
      slot: Number(slotIndex),
      stateJson,
      updatedAtMs,
      version: ONLINE_VERSION
    });
  }

  async function deleteCloudSlot(slotIndex) {
    if (!onlineUser) return;
    const fb = await loadOnlineFirebase();
    await fb.deleteDoc(cloudSlotRef(fb, onlineUser.uid, slotIndex));
  }

  function scheduleCloudSave(delay = 900) {
    if (!onlineUser || databaseReadyUid !== onlineUser.uid || window.__lifeBuilderCloudHydrating || !state) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      writeCloudSlot(selectedSlot, state).catch((error) => {
        console.warn("Cloud-Spielstand konnte nicht gespeichert werden", error);
        const message = String(error?.message || "");
        // Bei einem kurzen Netzwerkfehler wird automatisch erneut versucht.
        // Fehlt die Firestore-Datenbank, wird nicht im Sekundentakt gespammt.
        if (!/database.*does not exist/i.test(message)) {
          clearTimeout(cloudSaveTimer);
          cloudSaveTimer = setTimeout(() => scheduleCloudSave(0), 8000);
        }
      });
    }, delay);
  }

  async function hydrateCloudSlots(user = onlineUser) {
    if (!user) return;
    if (cloudSaveReadyUid === user.uid) return;
    if (cloudHydrationPromise) return cloudHydrationPromise;
    cloudHydrationPromise = (async () => {
      const fb = await loadOnlineFirebase();
      window.__lifeBuilderCloudHydrating = true;
      try {
        const snapshots = await Promise.all(Array.from({ length: 4 }, (_, index) => fb.getDoc(cloudSlotRef(fb, user.uid, index))));
        const uploads = [];
        snapshots.forEach((snapshot, index) => {
          const localState = saveSlots?.[index] || null;
          const localStamp = Number(localState?.onlineUpdatedAtMs || 0);
          if (snapshot.exists()) {
            const remoteData = snapshot.data() || {};
            let remoteState = null;
            try { remoteState = migrateState(JSON.parse(String(remoteData.stateJson || "null"))); } catch (error) { console.warn("Cloud-Slot beschädigt", index, error); }
            const remoteStamp = Number(remoteData.updatedAtMs || remoteState?.onlineUpdatedAtMs || 0);
            if (remoteState && (!localState || remoteStamp >= localStamp)) {
              remoteState.onlineUpdatedAtMs = remoteStamp || Date.now();
              saveSlots[index] = remoteState;
            } else if (localState) {
              uploads.push(writeCloudSlot(index, localState));
            }
          } else if (localState) {
            uploads.push(writeCloudSlot(index, localState));
          }
        });
        persistLocalSlotsAfterCloudLoad();
        await Promise.allSettled(uploads);
        cloudSaveReadyUid = user.uid;
      } finally {
        window.__lifeBuilderCloudHydrating = false;
      }
    })().finally(() => { cloudHydrationPromise = null; });
    return cloudHydrationPromise;
  }

  function inventoryCounts() {
    const counts = {};
    (state?.items || []).forEach((name) => { counts[name] = (counts[name] || 0) + 1; });
    Object.entries(state?.consumables || {}).forEach(([name, entry]) => { counts[name] = (counts[name] || 0) + Math.max(0, Number(entry?.count || 0)); });
    (state?.blackBusiness?.weapons || []).forEach((entry) => {
      const name = entry?.name || entry?.item || "Unbekannte Ware";
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }

  function auditSnapshot() {
    const counts = inventoryCounts();
    return {
      at: Date.now(),
      money: Math.round(Number(state?.bank || 0) + Number(state?.cash || 0)),
      bank: Math.round(Number(state?.bank || 0)),
      cash: Math.round(Number(state?.cash || 0)),
      level: Math.round(Number(state?.level || 0)),
      xp: Math.round(Number(state?.xp || 0)),
      itemCount: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0)
    };
  }

  function evaluateAudit(uid) {
    const current = auditSnapshot();
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(`${AUDIT_STORAGE_PREFIX}${uid}`) || "null"); } catch { previous = null; }
    const reasons = [];
    let riskScore = 0;
    const elapsed = previous ? Math.max(1, current.at - Number(previous.at || 0)) : 0;
    const adminGrace = Date.now() - Number(state?.onlineLastAdminCommandAt || 0) < 15000;
    if (!adminGrace && previous && elapsed < 120000) {
      const moneyGain = current.money - Number(previous.money || 0);
      const levelGain = current.level - Number(previous.level || 0);
      const itemGain = current.itemCount - Number(previous.itemCount || 0);
      if (moneyGain > 5000000) { reasons.push(`Ungewöhnlicher Geldanstieg: +${moneyGain.toLocaleString("de-DE")} € in ${Math.ceil(elapsed / 1000)} s`); riskScore += 60; }
      if (levelGain > 5) { reasons.push(`Ungewöhnlicher Levelanstieg: +${levelGain}`); riskScore += 35; }
      if (itemGain > 100) { reasons.push(`Ungewöhnlicher Inventaranstieg: +${itemGain} Items`); riskScore += 30; }
    }
    if (current.bank < 0 || current.cash < 0 || current.level < 0 || current.xp < 0) {
      reasons.push("Ungültige negative Spielwerte erkannt.");
      riskScore += 100;
    }
    localStorage.setItem(`${AUDIT_STORAGE_PREFIX}${uid}`, JSON.stringify(current));
    return { ...current, reasons, riskScore: Math.min(100, riskScore), suspicious: riskScore >= 50 };
  }

  function publicProfilePayload(audit, online = true) {
    const displayName = onlineUser?.displayName || `${state?.firstName || ""} ${state?.lastName || ""}`.trim() || "Spieler";
    return {
      uid: onlineUser.uid,
      displayName,
      displayNameLower: playerNameKey(displayName),
      level: Math.max(0, Math.round(Number(state?.level || 0))),
      city: String(state?.worldLocation || state?.homeCity || "Unbekannt").slice(0, 80),
      job: String(state?.job || "Kein Job").slice(0, 100),
      slot: Math.max(0, Math.round(Number(typeof selectedSlot !== "undefined" ? selectedSlot : 0))),
      online,
      lastSeenAtMs: Date.now(),
      updatedAtMs: Date.now(),
      version: ONLINE_VERSION,
      suspicious: !!audit.suspicious,
      riskScore: Number(audit.riskScore || 0)
    };
  }

  function onlineStatisticsPayload() {
    const relationship = state?.finder?.relationshipStats || state?.relationshipStats || {};
    const rawSkills = state?.skills && typeof state.skills === "object" ? state.skills : {};
    const skills = Object.fromEntries(Object.entries(rawSkills).slice(0, 80).map(([key, value]) => [String(key).slice(0, 60), Math.round(Number(value || 0))]));
    return {
      day: Math.max(1, Math.round(Number(state?.day || 1))),
      age: Math.max(0, Math.round(Number(state?.age || 0))),
      job: String(state?.job || "Kein Job").slice(0, 100),
      location: String(state?.location || "home").slice(0, 80),
      worldLocation: String(state?.worldLocation || state?.homeCity || "").slice(0, 80),
      homeCity: String(state?.homeCity || "").slice(0, 80),
      creditScore: Math.round(Number(state?.creditScore || state?.credit || 0)),
      casinoWallet: Math.round(Number(state?.casinoWalletCents ?? ((state?.casinoWallet || 0) * 100))) / 100,
      salaryPayouts: Math.max(0, Math.round(Number(state?.salaryPayouts || 0))),
      workDays: Math.max(0, Math.round(Number(state?.workDays || state?.workStats?.days || 0))),
      workSkillPoints: Math.max(0, Math.round(Number(state?.workSkillPoints || 0))),
      backpackSlots: Math.max(0, Math.round(Number(state?.backpackSlots || 0))),
      wardrobeCount: Array.isArray(state?.wardrobe) ? state.wardrobe.length : 0,
      propertyCount: Array.isArray(state?.properties) ? state.properties.length : 0,
      achievementCount: Array.isArray(state?.achievements) ? state.achievements.length : Object.keys(state?.achievements || {}).length,
      relationship: Math.round(Number(relationship.relationship || 0)),
      relationshipMood: Math.round(Number(relationship.mood || 0)),
      logisticsEmployees: Math.max(0, Math.round(Number(state?.logistics?.employees || state?.logisticsEmployees || 0))),
      logisticsSkillPoints: Math.max(0, Math.round(Number(state?.logistics?.skillPoints || state?.logisticsSkillPoints || 0))),
      shopSales: Math.max(0, Math.round(Number(state?.playerShop?.stats?.totalSales || 0))),
      shopRevenue: Math.max(0, Math.round(Number(state?.playerShop?.stats?.revenue || 0))),
      skills
    };
  }

  function privateProfilePayload(audit) {
    const counts = inventoryCounts();
    return {
      uid: onlineUser.uid,
      bank: Math.round(Number(state?.bank || 0)),
      cash: Math.round(Number(state?.cash || 0)),
      debt: Math.round(Number(state?.debt || 0)),
      phoneCredit: Math.round(Number(state?.phoneCredit || 0)),
      dirtyMoney: Math.round(Number(state?.dirtyMoney || 0)),
      hunger: Math.round(Number(state?.hunger || 0)),
      thirst: Math.round(Number(state?.thirst || 0)),
      energy: Math.round(Number(state?.energy || 0)),
      mood: Math.round(Number(state?.mood || 0)),
      health: Math.round(Number(state?.health || 0)),
      level: Math.round(Number(state?.level || 0)),
      xp: Math.round(Number(state?.xp || 0)),
      itemCounts: counts,
      itemCount: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0),
      properties: (state?.properties || []).slice(0, 100),
      statistics: onlineStatisticsPayload(),
      shop: {
        created: !!state?.playerShop?.created,
        name: String(state?.playerShop?.name || "").slice(0, 60),
        danger: Math.round(Number(state?.playerShop?.danger || 0)),
        reputation: Math.round(Number(state?.playerShop?.reputation || 0)),
        onlineEnabled: state?.playerShop?.onlineEnabled !== false,
        storageLevel: Math.max(0, Math.min(3, Math.round(Number(state?.playerShop?.storageLevel || 0)))),
        storageCapacity: [0, 500, 1000, 5000][Math.max(0, Math.min(3, Math.round(Number(state?.playerShop?.storageLevel || 0))))],
        listings: Array.isArray(state?.playerShop?.listings) ? state.playerShop.listings.length : 0
      },
      audit: {
        checkedAtMs: audit.at,
        suspicious: !!audit.suspicious,
        riskScore: Number(audit.riskScore || 0),
        reasons: audit.reasons.slice(0, 10)
      },
      updatedAtMs: Date.now(),
      version: ONLINE_VERSION
    };
  }

  async function syncPlayerOnline(force = false) {
    if (!onlineUser || !state) return;
    const fb = await loadOnlineFirebase();
    const audit = evaluateAudit(onlineUser.uid);
    const options = { merge: true };
    await Promise.all([
      fb.setDoc(fb.doc(fb.db, "playerProfiles", onlineUser.uid), publicProfilePayload(audit, true), options),
      fb.setDoc(fb.doc(fb.db, "playerPrivate", onlineUser.uid), privateProfilePayload(audit), options)
    ]);
    if (force) updateOnlineStatusBadge();
  }

  function schedulePlayerSync(delay = 1400) {
    if (!onlineUser || !state) return;
    clearTimeout(playerSyncTimer);
    playerSyncTimer = setTimeout(() => syncPlayerOnline().catch((error) => console.warn("Player sync", error)), delay);
  }

  async function setPlayerOffline() {
    if (!onlineUser) return;
    const fb = await loadOnlineFirebase();
    await fb.setDoc(fb.doc(fb.db, "playerProfiles", onlineUser.uid), { online: false, lastSeenAtMs: Date.now(), updatedAtMs: Date.now() }, { merge: true });
  }

  function removeInventoryItemById(itemId, amount = 1) {
    const record = typeof findCatalogItemById === "function" ? findCatalogItemById(itemId) : null;
    const name = record?.name || itemId;
    const entry = record?.entry || {};
    let remaining = Math.max(1, Math.round(Number(amount || 1)));
    let removed = 0;

    if (record?.source === "weapon" && Array.isArray(state?.blackBusiness?.weapons)) {
      state.blackBusiness.weapons = state.blackBusiness.weapons.filter((weapon) => {
        const weaponName = weapon?.name || weapon?.item;
        if (remaining > 0 && (weaponName === name || (typeof itemMatchesName === "function" && itemMatchesName(weaponName, name)))) {
          remaining -= 1; removed += 1; return false;
        }
        return true;
      });
      return { removed, name };
    }

    if ((record?.source === "property" || entry.property) && Array.isArray(state?.properties)) {
      const propertyId = entry.property?.id || entry.id;
      if (propertyId && state.properties.includes(propertyId) && remaining > 0) {
        state.properties = state.properties.filter((id) => id !== propertyId);
        if (state.propertyMeta) delete state.propertyMeta[propertyId];
        removed = 1; remaining = 0;
      }
      return { removed, name };
    }

    if (entry.wear && Array.isArray(state?.wardrobe)) {
      const wearName = entry.item || entry.name || name;
      const index = state.wardrobe.findIndex((owned) => owned === wearName || (typeof itemMatchesName === "function" && itemMatchesName(owned, wearName)));
      if (index >= 0) { state.wardrobe.splice(index, 1); removed = 1; remaining -= 1; }
    }

    const consumable = state?.consumables?.[name];
    if (remaining > 0 && consumable?.count > 0) {
      const take = Math.min(remaining, Number(consumable.count));
      consumable.count -= take;
      remaining -= take;
      removed += take;
      if (consumable.count <= 0) delete state.consumables[name];
    }
    if (remaining > 0 && Array.isArray(state?.items)) {
      state.items = state.items.filter((owned) => {
        if (remaining > 0 && (owned === name || (typeof itemMatchesName === "function" && itemMatchesName(owned, name)))) {
          remaining -= 1; removed += 1; return false;
        }
        return true;
      });
    }
    return { removed, name };
  }

  async function applyPlayerCommand(fb, commandDoc) {
    const command = commandDoc.data();
    if (!command || command.status !== "pending" || processingCommands.has(commandDoc.id)) return;
    processingCommands.add(commandDoc.id);
    let result = "Keine Änderung";
    try {
      if (command.kind === "reloadCloudSlot") {
        const slotIndex = Math.max(0, Math.min(3, Math.round(Number(command.slot || 0))));
        const remoteSnapshot = await fb.getDoc(cloudSlotRef(fb, onlineUser.uid, slotIndex));
        if (!remoteSnapshot.exists()) throw new Error("Der aktualisierte Cloud-Spielstand wurde nicht gefunden.");
        const remoteData = remoteSnapshot.data() || {};
        const remoteUpdatedAtMs = Number(remoteData.updatedAtMs || 0);
        if (Number(command.expectedUpdatedAtMs || 0) > remoteUpdatedAtMs) throw new Error("Die Cloud-Änderung ist noch nicht verfügbar.");
        let remoteState = null;
        try { remoteState = migrateState(JSON.parse(String(remoteData.stateJson || "null"))); }
        catch { throw new Error("Der aktualisierte Cloud-Spielstand ist beschädigt."); }
        if (!remoteState) throw new Error("Der aktualisierte Cloud-Spielstand ist leer.");
        remoteState.onlineUpdatedAtMs = remoteUpdatedAtMs || Date.now();
        remoteState.onlineLastAdminCommandAt = Date.now();
        saveSlots[slotIndex] = remoteState;
        localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saveSlots));
        const currentSlot = Math.max(0, Number(typeof selectedSlot !== "undefined" ? selectedSlot : activeSlot || 0));
        if (currentSlot === slotIndex) {
          state = remoteState;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          if (typeof addFeed === "function") addFeed("Online-Admin: Cloud-Änderung wurde übernommen.");
          if (typeof render === "function") render();
        }
        if (typeof renderSaveSlots === "function") renderSaveSlots();
        result = `Cloud-Slot ${slotIndex + 1} neu geladen`;
        await fb.updateDoc(commandDoc.ref, { status: "done", result, appliedAtMs: Date.now() });
        return;
      }
      state.onlineLastAdminCommandAt = Date.now();
      const amount = Math.max(1, Math.round(Number(command.amount || 1)));
      if (command.kind === "giveItem") {
        const given = giveInventoryItemById(command.itemId, amount);
        if (!given?.ok) throw new Error(given?.message || "Item-ID nicht gefunden");
        result = `${given.name} ${given.amount}x gegeben`;
      } else if (command.kind === "removeItem") {
        const removed = removeInventoryItemById(command.itemId, amount);
        result = `${removed.name} ${removed.removed}x entfernt`;
      } else if (["addMoney", "removeMoney", "setMoney"].includes(command.kind)) {
        const target = ["cash", "bank", "phoneCredit", "dirtyMoney"].includes(command.target) ? command.target : "bank";
        const value = Math.max(0, Math.round(Number(command.value || 0)));
        if (command.kind === "setMoney") state[target] = value;
        else state[target] = Math.max(0, Number(state[target] || 0) + (command.kind === "addMoney" ? value : -value));
        result = `${target} ${command.kind === "setMoney" ? "gesetzt" : command.kind === "addMoney" ? "erhöht" : "verringert"}: ${value}`;
      } else if (command.kind === "setShop") {
        state.playerShop ||= typeof createPlayerShopState === "function" ? createPlayerShopState() : {};
        if (typeof command.owned === "boolean") state.playerShop.created = command.owned;
        if (typeof command.created === "boolean") state.playerShop.created = command.created;
        if (Number.isFinite(Number(command.danger))) state.playerShop.danger = Math.max(0, Math.min(100, Number(command.danger)));
        if (Number.isFinite(Number(command.reputation))) state.playerShop.reputation = Math.max(0, Math.min(100, Number(command.reputation)));
        if (Number.isFinite(Number(command.storageLevel))) {
          state.playerShop.storageLevel = Math.max(0, Math.min(3, Math.round(Number(command.storageLevel))));
        } else if (Number.isFinite(Number(command.storageCapacity))) {
          const capacity = Math.max(0, Math.round(Number(command.storageCapacity)));
          state.playerShop.storageLevel = capacity >= 5000 ? 3 : capacity >= 1000 ? 2 : capacity >= 500 ? 1 : 0;
        }
        if (typeof command.onlineEnabled === "boolean") state.playerShop.onlineEnabled = command.onlineEnabled;
        result = "Shopdaten angepasst";
      } else if (command.kind === "setCharacter") {
        if (Number.isFinite(Number(command.level))) state.level = Math.max(0, Math.round(Number(command.level)));
        if (Number.isFinite(Number(command.xp))) state.xp = Math.max(0, Math.round(Number(command.xp)));
        if (Number.isFinite(Number(command.age))) state.age = Math.max(16, Math.min(120, Math.round(Number(command.age))));
        if (typeof command.job === "string" && command.job.trim()) state.job = command.job.trim().slice(0, 100);
        result = "Charakterdaten angepasst";
      } else if (command.kind === "setNeeds") {
        for (const key of ["hunger", "thirst", "energy", "mood", "health"]) {
          if (Number.isFinite(Number(command[key]))) state[key] = Math.max(0, Math.min(100, Math.round(Number(command[key]))));
        }
        result = "Statuswerte angepasst";
      } else if (command.kind === "setPhone") {
        if (Number.isFinite(Number(command.phoneCredit))) state.phoneCredit = Math.max(0, Math.round(Number(command.phoneCredit)));
        if (Number.isFinite(Number(command.battery))) state.phoneBattery = Math.max(0, Math.min(100, Math.round(Number(command.battery))));
        if (typeof command.simPlan === "string") state.phonePlan = command.simPlan.slice(0, 40);
        state.installedPhoneApps = Array.isArray(state.installedPhoneApps) ? state.installedPhoneApps : [];
        for (const appId of Array.isArray(command.installApps) ? command.installApps : []) {
          if (["finder", "finster", "event"].includes(appId) && !state.installedPhoneApps.includes(appId)) state.installedPhoneApps.push(appId);
        }
        if (command.resetFinder === true) state.finder = {};
        if (command.resetFinster === true) state.finster = {};
        result = "Smartphone angepasst";
      } else if (command.kind === "setWork") {
        if (Number.isFinite(Number(command.workSkillPoints))) state.workSkillPoints = Math.max(0, Math.round(Number(command.workSkillPoints)));
        state.logistics ||= {};
        if (Number.isFinite(Number(command.logisticsEmployees))) state.logistics.employees = Math.max(0, Math.min(20, Math.round(Number(command.logisticsEmployees))));
        if (Number.isFinite(Number(command.logisticsSkillPoints))) state.logistics.skillPoints = Math.max(0, Math.round(Number(command.logisticsSkillPoints)));
        if (command.resetWorkedDay === true) state.workedDay = 0;
        result = "Arbeit angepasst";
      } else if (command.kind === "setGame") {
        if (command.resetLimits === true) {
          state.cooldowns = {};
          state.gameLimits = {};
          state.dailyGameLimits = {};
        }
        if (Number.isFinite(Number(command.kingdomCoins))) state.kingdomCoins = Math.max(0, Math.round(Number(command.kingdomCoins)));
        if (Number.isFinite(Number(command.strongResources))) state.strongResources = Math.max(0, Math.round(Number(command.strongResources)));
        result = "Games angepasst";
      } else if (command.kind === "setWorld") {
        if (typeof command.worldLocation === "string" && command.worldLocation.trim()) state.worldLocation = command.worldLocation.trim().slice(0, 80);
        if (typeof command.location === "string" && command.location.trim()) state.location = command.location.trim().slice(0, 80);
        if (command.finishLocalTravel === true) state.localTravel = null;
        if (command.finishWorldTravel === true) state.worldTravel = null;
        if (command.clearStationBan === true) state.stationBanUntil = 0;
        result = "Stadtkarte und Flughafen angepasst";
      } else if (command.kind === "setProperty") {
        state.properties = Array.isArray(state.properties) ? state.properties : [];
        if (command.clearAll === true) {
          state.properties = [];
          state.propertyMeta = {};
        }
        if (typeof command.addPropertyId === "string" && command.addPropertyId.trim() && !state.properties.includes(command.addPropertyId.trim())) state.properties.push(command.addPropertyId.trim());
        result = "Immobilien angepasst";
      } else if (command.kind === "resetPlayer") {
        const identity = { firstName: state.firstName, lastName: state.lastName, gender: state.gender, age: state.age, homeCity: state.homeCity };
        const fresh = typeof createInitialState === "function" ? createInitialState(identity) : null;
        if (!fresh) throw new Error("Spielstand-Reset ist in dieser Version nicht verfügbar");
        Object.keys(state).forEach((key) => delete state[key]);
        Object.assign(state, fresh);
        result = "Spielstand zurückgesetzt";
      } else {
        throw new Error(`Unbekannter Admin-Befehl: ${command.kind}`);
      }
      if (typeof addFeed === "function") addFeed(`Online-Admin: ${result}.`);
      save();
      if (typeof render === "function") render();
      await fb.updateDoc(commandDoc.ref, { status: "done", result, appliedAtMs: Date.now() });
    } catch (error) {
      await fb.updateDoc(commandDoc.ref, { status: "failed", result: error.message || String(error), appliedAtMs: Date.now() }).catch(() => {});
    } finally {
      processingCommands.delete(commandDoc.id);
    }
  }

  async function startCommandListener() {
    if (!onlineUser) return;
    const fb = await loadOnlineFirebase();
    commandsUnsubscribe?.();
    commandsUnsubscribe = fb.onSnapshot(fb.collection(fb.db, "playerCommands", onlineUser.uid, "queue"), (snapshot) => {
      snapshot.docs.forEach((docSnap) => applyPlayerCommand(fb, docSnap));
    }, (error) => console.warn("Admin command listener", error));
  }

  function eventIsActive(eventData = currentEvent) {
    if (!eventData || eventData.status !== "active") return false;
    const now = Date.now();
    if (eventData.startsAtMs && now < eventData.startsAtMs) return false;
    if (eventData.endsAtMs && now > eventData.endsAtMs) return false;
    return true;
  }

  function eventCountdownText(eventData) {
    if (!eventData) return "";
    const now = Date.now();
    const target = now < Number(eventData.startsAtMs || 0) ? Number(eventData.startsAtMs) : Number(eventData.endsAtMs || 0);
    if (!target) return "Ohne feste Endzeit";
    const left = target - now;
    if (left <= 0) return now < Number(eventData.startsAtMs || 0) ? "Startet jetzt" : "Beendet";
    const minutes = Math.ceil(left / 60000);
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} Std. ${rest} Min.`;
  }

  function rewardItemsHtml(items) {
    if (!Array.isArray(items) || !items.length) return `<span>Keine Item-Belohnung</span>`;
    return items.map((entry) => `<span><b>${Math.max(1, Number(entry.amount || 1))}×</b> ${htmlEscape(entry.label || entry.itemId || "Item")}</span>`).join("");
  }

  function eventAppHtml() {
    if (!onlineUser) {
      return `<div class="event-app-empty"><span class="event-app-logo">E</span><h4>Event-App</h4><p>Bitte melde dich mit deinem LifeBuilder-Account an, damit Live-Events und Belohnungen geladen werden.</p><button class="mini-button gold" data-event-login>Anmelden</button></div>`;
    }
    const eventData = currentEvent;
    if (!eventData || eventData.status !== "active") {
      return `<div class="event-app-empty"><span class="event-app-logo">E</span><p class="eyebrow">LifeBuilder Events</p><h4>Aktuell ist kein Event gestartet.</h4><p>Hier werden Community-Events geplant und gestartet. Sobald ein Event aktiv ist, siehst du Aufgabe, Laufzeit, Preise, Teilnehmer und Gewinner direkt in dieser App.</p><div class="event-app-feature-grid"><span>🏆 Preise & Geschenke</span><span>⏱ Live-Laufzeit</span><span>👥 Online-Teilnehmer</span><span>✓ Gewinnerliste</span></div><button class="mini-button" data-event-refresh>Neu laden</button></div>`;
    }
    const active = eventIsActive(eventData);
    const winners = Array.isArray(eventData.winners) ? eventData.winners : [];
    const joined = !!currentParticipant;
    return `
      <div class="event-app-live ${active ? "active" : "waiting"}">
        <header><span class="event-app-logo">E</span><div><p class="eyebrow">${active ? "Live-Event" : "Geplantes Event"}</p><h4>${htmlEscape(eventData.title || "LifeBuilder Event")}</h4></div><b>${eventCountdownText(eventData)}</b></header>
        <p class="event-app-description">${htmlEscape(eventData.description || "")}</p>
        <section class="event-app-task"><small>DEINE AUFGABE</small><strong>${htmlEscape(eventData.task || "Warte auf die Aufgabenbeschreibung des Event-Teams.")}</strong>${eventData.proofHint ? `<p>${htmlEscape(eventData.proofHint)}</p>` : ""}</section>
        <section class="event-app-rewards"><h5>Belohnungen</h5><div>${eventData.rewardMoney ? `<span><b>${Number(eventData.rewardMoney).toLocaleString("de-DE")} €</b> Spielgeld</span>` : ""}${rewardItemsHtml(eventData.rewardItems)}</div><small>${Math.max(1, Number(eventData.maxWinners || 1))} Gewinnerplatz/-plätze</small></section>
        <section class="event-app-meta"><span><small>Teilnehmer</small><b>${Number(eventData.participantCount || 0)}</b></span><span><small>Gewinner</small><b>${winners.length}</b></span><span><small>Status</small><b>${active ? "Läuft" : "Wartet"}</b></span></section>
        ${joined ? `<section class="event-app-progress"><b>Du nimmst teil</b><small>${htmlEscape(currentParticipant.statusText || "Noch kein Fortschritt gemeldet.")}</small><textarea data-event-progress maxlength="300" placeholder="Kurz beschreiben, was du erledigt hast …"></textarea><button class="mini-button gold" data-event-progress-send>Fortschritt senden</button></section>` : `<button class="mini-button gold event-join-button" data-event-join ${active ? "" : "disabled"}>${active ? "Am Event teilnehmen" : "Event startet später"}</button>`}
        ${winners.length ? `<section class="event-app-winners"><h5>Gewinner</h5>${winners.map((winner, index) => `<span><b>${index + 1}.</b> ${htmlEscape(winner.displayName || "Spieler")}</span>`).join("")}</section>` : ""}
        <button class="mini-button" data-event-refresh>Aktualisieren</button>
      </div>`;
  }

  async function loadOwnParticipant() {
    participantUnsubscribe?.();
    currentParticipant = null;
    if (!onlineUser || !currentEvent?.id) return;
    const fb = await loadOnlineFirebase();
    const ref = fb.doc(fb.db, "events", "current", "participants", onlineUser.uid);
    participantUnsubscribe = fb.onSnapshot(ref, (snapshot) => {
      currentParticipant = snapshot.exists() ? snapshot.data() : null;
      refreshOpenEventApp();
    });
  }

  async function startEventListener() {
    const fb = await loadOnlineFirebase();
    eventUnsubscribe?.();
    eventUnsubscribe = fb.onSnapshot(fb.doc(fb.db, "events", "current"), (snapshot) => {
      currentEvent = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
      loadOwnParticipant().catch(() => {});
      refreshOpenEventApp();
    }, (error) => console.warn("Event listener", error));
  }

  function refreshOpenEventApp() {
    if (!document.querySelector('[data-device-app="event"].active')) return;
    const phone = typeof ownedPhoneItem === "function" ? ownedPhoneItem() : "";
    if (phone && typeof openDeviceInterface === "function") {
      pendingDeviceScrollTop = document.querySelector(".device-screen")?.scrollTop ?? null;
      openDeviceInterface(phone, "event", false);
    }
  }

  async function joinCurrentEvent() {
    if (!onlineUser) return requireUser();
    if (!eventIsActive()) return addFeed?.("Dieses Event ist noch nicht aktiv oder bereits beendet.");
    const fb = await loadOnlineFirebase();
    const displayName = onlineUser.displayName || `${state?.firstName || ""} ${state?.lastName || ""}`.trim() || "Spieler";
    await fb.setDoc(fb.doc(fb.db, "events", "current", "participants", onlineUser.uid), {
      uid: onlineUser.uid,
      displayName,
      displayNameLower: playerNameKey(displayName),
      joinedAtMs: Date.now(),
      updatedAtMs: Date.now(),
      status: "joined",
      statusText: "Teilnahme bestätigt"
    }, { merge: true });
    await fb.setDoc(fb.doc(fb.db, "events", "current"), { participantCount: fb.increment(1), updatedAtMs: Date.now() }, { merge: true }).catch(() => {});
  }

  async function sendEventProgress(text) {
    const clean = String(text || "").trim().slice(0, 300);
    if (!onlineUser || !currentParticipant || !clean) return;
    const fb = await loadOnlineFirebase();
    await fb.setDoc(fb.doc(fb.db, "events", "current", "participants", onlineUser.uid), {
      status: "submitted",
      statusText: clean,
      submittedAtMs: Date.now(),
      updatedAtMs: Date.now()
    }, { merge: true });
  }

  function bindEventApp(shell) {
    shell.querySelector("[data-event-login]")?.addEventListener("click", showAuthOverlay);
    shell.querySelectorAll("[data-event-refresh]").forEach((button) => button.addEventListener("click", () => startEventListener().catch((error) => addFeed?.(`Event konnte nicht geladen werden: ${error.message || error}`))));
    shell.querySelector("[data-event-join]")?.addEventListener("click", () => joinCurrentEvent().catch((error) => addFeed?.(`Event-Teilnahme fehlgeschlagen: ${error.message || error}`)));
    shell.querySelector("[data-event-progress-send]")?.addEventListener("click", () => sendEventProgress(shell.querySelector("[data-event-progress]")?.value).catch((error) => addFeed?.(`Fortschritt konnte nicht gesendet werden: ${error.message || error}`)));
  }

  function moderationOverlay() {
    let overlay = document.querySelector("[data-online-moderation-overlay]");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "online-moderation-overlay";
    overlay.dataset.onlineModerationOverlay = "1";
    overlay.innerHTML = `<section><p class="eyebrow">LifeBuilder Moderation</p><h2 data-moderation-title>Zugriff eingeschränkt</h2><p data-moderation-text></p><button class="primary-button" data-moderation-logout>Abmelden</button></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-moderation-logout]").addEventListener("click", async () => {
      const fb = await loadOnlineFirebase();
      await fb.signOut(fb.auth);
      overlay.classList.remove("show");
    });
    return overlay;
  }

  function renderModerationState(data = {}) {
    const now = Date.now();
    const bannedUntil = Number(data.bannedUntilMs || 0);
    const timeoutUntil = Number(data.timeoutUntilMs || 0);
    const kickNonce = Number(data.kickNonce || 0);
    const kickKey = onlineUser ? `lifebuilder-kick-nonce:${onlineUser.uid}` : "";
    const seenKick = Number(kickKey ? sessionStorage.getItem(kickKey) || 0 : 0);
    const overlay = moderationOverlay();
    if (bannedUntil > now) {
      overlay.querySelector("[data-moderation-title]").textContent = "Account vorübergehend gebannt";
      overlay.querySelector("[data-moderation-text]").textContent = `${data.reason || "Moderationsmaßnahme"} · Ende: ${new Date(bannedUntil).toLocaleString("de-DE")}`;
      overlay.classList.add("show");
      return;
    }
    if (kickNonce > seenKick && kickKey) {
      sessionStorage.setItem(kickKey, String(kickNonce));
      overlay.querySelector("[data-moderation-title]").textContent = "Du wurdest aus der Sitzung entfernt";
      overlay.querySelector("[data-moderation-text]").textContent = data.reason || "Bitte melde dich erneut an.";
      overlay.classList.add("show");
      return;
    }
    overlay.classList.remove("show");
    document.body.classList.toggle("online-timeout-active", timeoutUntil > now);
    let badge = document.querySelector("[data-timeout-badge]");
    if (timeoutUntil > now) {
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "online-timeout-badge";
        badge.dataset.timeoutBadge = "1";
        document.body.appendChild(badge);
      }
      badge.textContent = `Timeout bis ${new Date(timeoutUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    } else badge?.remove();
  }

  async function startModerationListener() {
    if (!onlineUser) return;
    const fb = await loadOnlineFirebase();
    moderationUnsubscribe?.();
    moderationUnsubscribe = fb.onSnapshot(fb.doc(fb.db, "moderation", onlineUser.uid), (snapshot) => renderModerationState(snapshot.exists() ? snapshot.data() : {}), (error) => console.warn("Moderation listener", error));
  }

  function startOnlineServices() {
    if (!onlineUser) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!document.hidden) syncPlayerOnline().catch(() => {});
    }, HEARTBEAT_MS);
    syncPlayerOnline(true).catch(() => {});
    startCommandListener().catch(() => {});
    startEventListener().catch(() => {});
    startModerationListener().catch(() => {});
  }

  function stopOnlineServices() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    commandsUnsubscribe?.(); commandsUnsubscribe = null;
    eventUnsubscribe?.(); eventUnsubscribe = null;
    participantUnsubscribe?.(); participantUnsubscribe = null;
    moderationUnsubscribe?.(); moderationUnsubscribe = null;
    currentEvent = null;
    currentParticipant = null;
  }

  async function initializeAuthState() {
    try {
      const fb = await loadOnlineFirebase();
      fb.onAuthStateChanged(fb.auth, (user) => {
        if (!user) {
          onlineUser = null;
          cloudSaveReadyUid = "";
          databaseReadyUid = "";
          databaseConnectionError = "";
          clearTimeout(cloudSaveTimer);
          updateOnlineStatusBadge();
          updateAuthOverlayState();
          stopOnlineServices();
          return;
        }

        // Der Account ist ab hier gültig angemeldet. Dies wird sofort übernommen,
        // auch wenn Firestore, Finder.KL oder ein Cloud-Spielstand kurz nicht lädt.
        onlineUser = user;
        updateOnlineStatusBadge();
        updateAuthOverlayState();
        document.querySelector("[data-online-auth-overlay]")?.classList.remove("show");
        if (authWaitResolve) authWaitResolve(user);
        authWaitResolve = null;
        authWaitReject = null;
        authWaitPromise = null;

        if (interactiveAuthInProgress) return;
        void (async () => {
          try {
            await verifyOnlineDatabase(fb, user, true);
          } catch (error) {
            databaseConnectionError = databaseErrorText(error);
            updateOnlineStatusBadge();
            updateAuthOverlayState();
            return;
          }
          try {
            await ensureOnlineIdentity(fb, user);
          } catch (error) {
            console.warn("Online-Identität wird später erneut synchronisiert", error);
          }
          try {
            await hydrateCloudSlots(user);
          } catch (error) {
            console.warn("Cloud-Spielstände werden später erneut geladen", error);
          }
          startOnlineServices();
        })();
      });
    } catch (error) {
      console.warn("Firebase Auth konnte nicht geladen werden", error);
      updateOnlineStatusBadge();
    }
  }

  // Event-App in den App Store einfügen.
  if (!phoneAppStoreCatalog.some((app) => app.id === "event")) {
    phoneAppStoreCatalog.push({
      id: "event",
      label: "Event",
      icon: "E",
      minTier: 1,
      status: "available",
      description: "Live-Events, Aufgaben, Preise, Teilnehmer, Fortschritt und Gewinner werden über Firebase geladen."
    });
  }

  const basePhoneAppStoreHtml = phoneAppStoreHtml;
  phoneAppStoreHtml = function patchedPhoneAppStoreHtml(item) {
    return basePhoneAppStoreHtml(item).replace(
      "Finder.KL und finster.kl erscheinen nach dem Download als eigene Apps unten im Handy. Die Casino-App bleibt bis zum nächsten Ausbau gesperrt.",
      "Finder.KL, finster.kl und Event erscheinen nach dem Download als eigene Apps unten im Handy. Die Casino-App bleibt bis zum nächsten Ausbau gesperrt."
    );
  };

  const baseDeviceAppsFor = deviceAppsFor;
  deviceAppsFor = function patchedDeviceAppsFor(item) {
    const apps = baseDeviceAppsFor(item);
    const isPhone = phoneItems().includes(item);
    if (!isPhone || !isPhoneAppInstalled("event") || apps.some((app) => app.id === "event")) return apps;
    const tier = deviceTier(item);
    const missingTier = tier < 1;
    const missingSim = !hasPhoneSim();
    apps.push({
      id: "event",
      min: 1,
      data: true,
      label: "Event",
      icon: "E",
      text: "Hier werden Events geplant und gestartet. Aufgaben, Geschenke, Geldpreise, Teilnehmer und Gewinner werden live über Firebase geladen.",
      layoutClass: "device-downloaded-app",
      locked: missingTier || missingSim,
      lockText: missingTier ? "Benötigt mindestens ein Einsteiger-Smartphone." : missingSim ? "Benötigt eine SIM-Karte für Online-Events." : ""
    });
    return apps;
  };

  const baseDeviceAppActions = deviceAppActions;
  deviceAppActions = function patchedDeviceAppActions(appId, item) {
    if (appId === "event") return eventAppHtml();
    return baseDeviceAppActions(appId, item);
  };

  const baseOpenDeviceInterface = openDeviceInterface;
  openDeviceInterface = function patchedOpenDeviceInterface(item, activeApp = "home", activeUse = true) {
    const result = baseOpenDeviceInterface(item, activeApp, activeUse);
    const shell = document.querySelector("#detailDialog .device-shell:last-of-type") || document.querySelector("#detailDialog .device-shell");
    if (shell && activeApp === "event") bindEventApp(shell);
    return result;
  };

  const baseSave = save;
  save = function patchedSave(...args) {
    const result = baseSave.apply(this, args);
    schedulePlayerSync();
    scheduleCloudSave();
    return result;
  };

  // GitHub/Firebase-Start erzwingt die Anmeldung. Lokale Dateien bleiben für Entwicklung nutzbar.
  els.openSlotsBtn?.addEventListener("click", (event) => {
    if (!onlineRequired()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    requireUser().then(async (user) => {
      if (!user) return;
      await hydrateCloudSlots(user).catch((error) => console.warn("Cloud-Spielstände konnten noch nicht geladen werden", error));
      setSetupView("slots");
      syncPlayerOnline(true).catch(() => {});
    }).catch(() => {});
  }, true);

  if (hostedOnlineMode && els.openSlotsBtn) els.openSlotsBtn.textContent = "Anmelden & Spiel starten";
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedulePlayerSync(100);
    else setPlayerOffline().catch(() => {});
  });
  window.addEventListener("pagehide", () => { setPlayerOffline().catch(() => {}); });

  window.LifeBuilderOnline = {
    requireUser,
    showLogin: showAuthOverlay,
    getUser: () => onlineUser,
    getFirebase: loadOnlineFirebase,
    verifyDatabase: (force = false) => verifyOnlineDatabase(null, onlineUser, force),
    isDatabaseReady: () => !!onlineUser && databaseReadyUid === onlineUser.uid,
    getDatabaseError: () => databaseConnectionError,
    syncPlayer: syncPlayerOnline,
    saveSlot: writeCloudSlot,
    deleteSlot: deleteCloudSlot,
    hydrateSlots: hydrateCloudSlots,
    getCurrentEvent: () => currentEvent,
    onlineWindowMs: ONLINE_WINDOW_MS
  };


  const moderationStyle = document.createElement("style");
  moderationStyle.textContent = `.online-moderation-overlay{position:fixed;inset:0;z-index:100050;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.9);backdrop-filter:blur(10px)}.online-moderation-overlay.show{display:grid}.online-moderation-overlay section{width:min(520px,100%);padding:24px;border:1px solid rgba(255,115,105,.35);border-radius:20px;background:#14231d;color:#fff;text-align:center;box-shadow:0 30px 90px rgba(0,0,0,.55)}.online-timeout-badge{position:fixed;z-index:10000;right:14px;top:14px;padding:8px 12px;border-radius:999px;background:#7b311f;color:#fff;font-weight:900;box-shadow:0 10px 30px rgba(0,0,0,.35)}`;
  document.head.appendChild(moderationStyle);
  const onlineAuthFixStyle = document.createElement("style");
  onlineAuthFixStyle.textContent = `.online-auth-card [hidden],.online-auth-name[hidden]{display:none!important}`;
  document.head.appendChild(onlineAuthFixStyle);
  updateOnlineStatusBadge();
  initializeAuthState();
})();
