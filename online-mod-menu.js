(() => {
  "use strict";

  const VERSION = "2026-07-22-online-modmenu-mobile-1";
  const DB_ID = "gamekl";
  const REGION = "europe-west3";
  const SESSION_KEY = "lifebuilder-2026-online-mod-session";
  const ROLE_LABELS = {
    test_member: "Testmitglied",
    test_supporter: "Test-Supporter",
    supporter: "Supporter",
    test_moderator: "Test-Moderator",
    moderator: "Moderator",
    admin: "Admin",
    owner: "Owner"
  };
  const ROLE_ORDER = ["test_member", "test_supporter", "supporter", "test_moderator", "moderator", "admin", "owner"];
  const ROLE_PERMISSIONS = {
    test_member: ["players.read", "character.read", "audit.read"],
    test_supporter: ["players.read", "character.read", "audit.read", "tickets.work", "smartphone.write", "world.write"],
    supporter: ["players.read", "character.read", "audit.read", "tickets.work", "tickets.all", "tickets.delete", "smartphone.write", "world.write", "work.write", "games.write", "shop.write", "moderation.kick", "moderation.timeout"],
    test_moderator: ["players.read", "character.read", "character.write", "player.write", "audit.read", "tickets.work", "tickets.all", "tickets.delete", "smartphone.write", "world.write", "work.write", "games.write", "shop.write", "items.write", "ids.read", "moderation.kick", "moderation.timeout", "moderation.ban.week"],
    moderator: ["players.read", "character.read", "character.write", "player.write", "audit.read", "tickets.work", "tickets.all", "tickets.delete", "smartphone.write", "world.write", "work.write", "games.write", "shop.write", "items.write", "ids.read", "money.write", "properties.write", "moderation.kick", "moderation.timeout", "moderation.ban.year", "player.reset", "staff.timeout"],
    admin: ["players.read", "character.read", "character.write", "player.write", "audit.read", "tickets.work", "tickets.all", "tickets.delete", "smartphone.write", "world.write", "work.write", "games.write", "shop.write", "items.write", "ids.read", "money.write", "properties.write", "moderation.kick", "moderation.timeout", "moderation.ban.year", "player.reset", "staff.timeout", "staff.manage", "events.write", "session.unlimited"],
    owner: ["*"]
  };

  let runtimePromise = null;
  let currentUser = null;
  let roleData = null;
  let roleUnsubscribe = null;
  let overlay = null;
  let activePanel = "home";
  let selectedPlayer = null;
  let players = [];
  let tickets = [];
  let selectedTicket = null;
  let originalBodyOverflow = "";

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const euro = (value) => `${Math.round(num(value)).toLocaleString("de-DE")} €`;
  const dateTime = (value) => value ? new Date(num(value)).toLocaleString("de-DE") : "–";

  async function runtime() {
    if (runtimePromise) return runtimePromise;
    runtimePromise = (async () => {
      const [appMod, authMod, dbMod, fnMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js")
      ]);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebasePhoneConfig);
      const auth = authMod.getAuth(app);
      const db = dbMod.getFirestore(app, DB_ID);
      const functions = fnMod.getFunctions(app, REGION);
      return { ...authMod, ...dbMod, ...fnMod, app, auth, db, functions };
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
    return runtimePromise;
  }

  async function callFunction(name, data = {}) {
    const fb = await runtime();
    try {
      const result = await fb.httpsCallable(fb.functions, name)(data);
      return result.data || {};
    } catch (error) {
      const raw = String(error?.message || error || "Unbekannter Fehler");
      if (/not-found|internal/i.test(String(error?.code || "")) && /function/i.test(raw)) {
        throw new Error("Die Online-Mod-Functions sind noch nicht in Firebase veröffentlicht.");
      }
      throw new Error(raw.replace(/^FirebaseError:\s*/i, ""));
    }
  }

  function permissions() {
    if (Array.isArray(roleData?.permissions)) return roleData.permissions;
    return ROLE_PERMISSIONS[roleData?.role] || [];
  }

  function has(permission) {
    const list = permissions();
    return list.includes("*") || list.includes(permission);
  }

  function sessionActive() {
    return !!roleData?.active && num(roleData.activeSessionExpiresAtMs) > Date.now();
  }

  function roleLabel() {
    return roleData?.roleLabel || ROLE_LABELS[roleData?.role] || "Teamrolle";
  }

  function saveBrowserSession() {
    if (!roleData?.active || !sessionActive()) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      authorized: true,
      online: true,
      uid: currentUser?.uid || "",
      role: roleData.role,
      permissions: permissions(),
      expiresAt: num(roleData.activeSessionExpiresAtMs),
      version: VERSION
    }));
  }

  function updateSettingsEntry() {
    const panel = document.querySelector("#settingsView .settings-panel");
    if (!panel) return;
    let card = panel.querySelector("[data-online-mod-settings]");
    if (!currentUser) {
      card?.remove();
      return;
    }
    if (!card) {
      card = document.createElement("section");
      card.className = "online-mod-settings-card";
      card.dataset.onlineModSettings = "1";
      card.innerHTML = `<div><small>ONLINE-TEAM</small><b data-online-mod-settings-role>Team-Code</b><p data-online-mod-settings-state></p></div><button type="button" class="primary-button" data-online-mod-settings-action>Code eingeben</button>`;
      panel.appendChild(card);
      card.querySelector("[data-online-mod-settings-action]").addEventListener("click", () => roleData?.active ? openModMenu() : redeemInviteFromSettings());
    }
    const action = card.querySelector("[data-online-mod-settings-action]");
    if (roleData?.active) {
      card.querySelector("[data-online-mod-settings-role]").textContent = `${roleLabel()} · Mod-Menü`;
      card.querySelector("[data-online-mod-settings-state]").textContent = sessionActive()
        ? `Auf diesem Account online freigeschaltet · Sitzung bis ${dateTime(roleData.activeSessionExpiresAtMs)}`
        : "Rolle ist auf diesem Account gespeichert. Sitzungscode zur erneuten Freigabe eingeben.";
      action.textContent = "Öffnen";
    } else {
      card.querySelector("[data-online-mod-settings-role]").textContent = "Team-/Mod-Code aktivieren";
      card.querySelector("[data-online-mod-settings-state]").textContent = "Nur mit einem einmaligen Code vom Owner wird das Mod-Menü für diesen Account freigeschaltet.";
      action.textContent = "Code eingeben";
    }
  }

  async function redeemInviteFromSettings() {
    const code = prompt("Einmaligen Team-/Mod-Code eingeben:");
    if (!code) return;
    try {
      const response = await callFunction("redeemStaffInvite", { code });
      alert(`Rolle freigeschaltet: ${response.roleLabel || response.role}\n\nDein persönlicher Sitzungscode:\n${response.sessionPin}\n\nDiesen Code sicher speichern.`);
      await refreshRoleContext(true);
    } catch (error) {
      alert(`Code konnte nicht aktiviert werden: ${error.message}`);
    }
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "online-mod-overlay";
    overlay.dataset.onlineModOverlay = "1";
    overlay.innerHTML = `
      <section class="online-mod-shell" role="dialog" aria-modal="true" aria-label="LifeBuilder Online Mod-Menü">
        <header class="online-mod-header">
          <div><small>LifeBuilder Online</small><h2>Mod-Menü</h2><p data-mod-role-line></p></div>
          <button type="button" class="online-mod-close" data-mod-close aria-label="Schließen">×</button>
        </header>
        <nav class="online-mod-nav" data-mod-nav></nav>
        <main class="online-mod-content" data-mod-content></main>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-mod-close]").addEventListener("click", closeModMenu);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModMenu();
    });
    overlay.addEventListener("click", handleClick);
    overlay.addEventListener("submit", handleSubmit);
    return overlay;
  }

  function lockPage() {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("online-mod-open");
  }

  function unlockPage() {
    document.body.style.overflow = originalBodyOverflow;
    document.documentElement.classList.remove("online-mod-open");
  }

  async function openModMenu() {
    if (!currentUser || !roleData?.active) return;
    ensureOverlay().classList.add("show");
    lockPage();
    overlay.querySelector("[data-mod-role-line]").textContent = `${roleLabel()} · ${currentUser.email || currentUser.displayName || currentUser.uid}`;
    if (!sessionActive()) {
      renderSessionLogin();
      return;
    }
    saveBrowserSession();
    activePanel = "home";
    renderNavigation();
    renderPanel();
  }

  function closeModMenu() {
    overlay?.classList.remove("show");
    unlockPage();
  }

  function renderSessionLogin(message = "") {
    const content = ensureOverlay().querySelector("[data-mod-content]");
    ensureOverlay().querySelector("[data-mod-nav]").innerHTML = "";
    content.innerHTML = `
      <section class="online-mod-login-card">
        <span>🔐</span><h3>Mod-Sitzung öffnen</h3>
        <p>Deine Rolle <b>${esc(roleLabel())}</b> ist mit diesem Firebase-Account verbunden. Gib den persönlichen Sitzungscode ein.</p>
        <form data-mod-session-form>
          <label>Sitzungscode<input name="pin" type="password" autocomplete="one-time-code" placeholder="KL-XXXXX-XXXXX-XXXXX" required></label>
          <button class="primary-button" type="submit">Sitzung öffnen</button>
          <p class="online-mod-message ${message ? "error" : ""}">${esc(message)}</p>
        </form>
      </section>`;
  }

  function navigationItems() {
    const items = [{ id: "home", label: "Übersicht", icon: "⌂" }];
    if (has("players.read")) items.push({ id: "players", label: "Online-Player", icon: "👥" });
    if (has("tickets.work")) items.push({ id: "tickets", label: "Tickets", icon: "🎫" });
    if (has("events.write")) items.push({ id: "events", label: "Event", icon: "🏆" });
    if (has("ids.read")) items.push({ id: "ids", label: "Item-IDs", icon: "#" });
    if (has("staff.manage")) items.push({ id: "staff", label: "Team", icon: "🛡" });
    if (roleData?.role === "owner") items.push({ id: "owner", label: "Owner", icon: "◆" });
    return items;
  }

  function renderNavigation() {
    const nav = ensureOverlay().querySelector("[data-mod-nav]");
    nav.innerHTML = navigationItems().map((item) => `<button type="button" class="${item.id === activePanel ? "active" : ""}" data-mod-panel="${item.id}"><span>${item.icon}</span>${esc(item.label)}</button>`).join("");
  }

  function renderPanel() {
    renderNavigation();
    if (activePanel === "players") return renderPlayersPanel();
    if (activePanel === "tickets") return renderTicketsPanel();
    if (activePanel === "events") return renderEventsPanel();
    if (activePanel === "ids") return renderIdsPanel();
    if (activePanel === "staff") return renderStaffPanel();
    if (activePanel === "owner") return renderOwnerPanel();
    return renderHomePanel();
  }

  function content() {
    return ensureOverlay().querySelector("[data-mod-content]");
  }

  function renderHomePanel() {
    const expires = num(roleData?.activeSessionExpiresAtMs);
    content().innerHTML = `
      <section class="online-mod-grid online-mod-dashboard">
        <article class="online-mod-card highlight"><small>AKTIVE ROLLE</small><h3>${esc(roleLabel())}</h3><p>Diese Freigabe ist mit deinem Firebase-Account verbunden und funktioniert deshalb auch auf deinem Handy.</p></article>
        <article class="online-mod-card"><small>SITZUNG</small><h3>${expires > 4000000000000 ? "Dauerhaft" : dateTime(expires)}</h3><p>${permissions().length} Rechte geladen.</p></article>
        <article class="online-mod-card"><small>DATENBANK</small><h3>${DB_ID}</h3><p>Online-Spieler, Tickets, Events und Rollen werden live aus Firebase geladen.</p></article>
        <article class="online-mod-card"><small>GERÄT</small><h3>${matchMedia("(max-width:720px)").matches ? "Handyansicht" : "PC-Ansicht"}</h3><p>Das Menü passt sich automatisch an Hoch- und Querformat an.</p></article>
      </section>
      <section class="online-mod-card">
        <h3>Freigeschaltete Bereiche</h3>
        <div class="online-mod-chip-list">${permissions().map((permission) => `<span>${esc(permission)}</span>`).join("")}</div>
        <div class="online-mod-actions"><button type="button" data-mod-refresh-role>Rolle neu laden</button><button type="button" class="danger" data-mod-close-session>Sitzung schließen</button></div>
        <p class="online-mod-message" data-mod-home-message></p>
      </section>`;
  }

  async function renderPlayersPanel() {
    content().innerHTML = `<section class="online-mod-card"><div class="online-mod-card-head"><div><small>LIVE-DATEN</small><h3>Online-Player</h3></div><button type="button" data-mod-refresh-players>↻</button></div><input class="online-mod-search" data-player-search placeholder="Spielername, UID, Stadt oder Job"><div class="online-mod-player-layout"><div class="online-mod-player-list" data-player-list><p>Lade Spieler …</p></div><div class="online-mod-player-detail" data-player-detail><div class="online-mod-empty">Spieler auswählen</div></div></div></section>`;
    try {
      const response = await callFunction("listPlayers", {});
      players = Array.isArray(response.players) ? response.players : [];
      renderPlayerList();
    } catch (error) {
      content().querySelector("[data-player-list]").innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  function renderPlayerList(query = "") {
    const list = content().querySelector("[data-player-list]");
    if (!list) return;
    const filter = String(query || "").trim().toLowerCase();
    const shown = players.filter((player) => !filter || [player.displayName, player.uid, player.city, player.job].some((value) => String(value || "").toLowerCase().includes(filter)));
    list.innerHTML = shown.length ? shown.map((player) => `
      <button type="button" class="online-mod-player-row ${selectedPlayer?.uid === player.uid ? "active" : ""}" data-select-player="${esc(player.uid)}">
        <span class="online-dot ${player.online ? "online" : ""}"></span><span><b>${esc(player.displayName || "Spieler")}</b><small>Lvl ${num(player.level)} · ${esc(player.city || "–")} · ${esc(player.job || "–")}</small></span><em>${player.online ? "online" : dateTime(player.lastSeenAtMs)}</em>
      </button>`).join("") : `<p class="online-mod-empty">Keine Spieler gefunden.</p>`;
  }

  async function selectPlayer(uid) {
    const detail = content().querySelector("[data-player-detail]");
    if (!detail) return;
    detail.innerHTML = `<p>Spielerdaten werden geladen …</p>`;
    try {
      const response = await callFunction("getPlayerDetails", { targetUid: uid });
      selectedPlayer = response.player || null;
      renderPlayerList(content().querySelector("[data-player-search]")?.value || "");
      renderPlayerDetail();
    } catch (error) {
      detail.innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  function valueOf(path, fallback = 0) {
    let target = selectedPlayer;
    for (const key of path.split(".")) target = target?.[key];
    return target ?? fallback;
  }

  function renderPlayerDetail() {
    const detail = content().querySelector("[data-player-detail]");
    if (!detail || !selectedPlayer) return;
    const profile = selectedPlayer.profile || {};
    const privateData = selectedPlayer.private || {};
    const audit = privateData.audit || {};
    detail.innerHTML = `
      <section class="online-mod-player-summary">
        <div><small>AUSGEWÄHLT</small><h3>${esc(profile.displayName || selectedPlayer.account?.displayName || "Spieler")}</h3><p class="uid">${esc(selectedPlayer.uid)}</p></div>
        <span class="online-mod-risk ${audit.suspicious ? "danger" : "ok"}">${audit.suspicious ? `Verdacht ${num(audit.riskScore)}%` : "Unauffällig"}</span>
      </section>
      <div class="online-mod-stat-grid">
        <span><small>Level</small><b>${num(privateData.level ?? profile.level)}</b></span><span><small>EP</small><b>${num(privateData.xp)}</b></span><span><small>Konto</small><b>${euro(privateData.bank)}</b></span><span><small>Bargeld</small><b>${euro(privateData.cash)}</b></span><span><small>Items</small><b>${num(privateData.itemCount)}</b></span><span><small>Immobilien</small><b>${Array.isArray(privateData.properties) ? privateData.properties.length : 0}</b></span>
      </div>
      ${audit.reasons?.length ? `<section class="online-mod-warning"><b>Cheat-Prüfung</b>${audit.reasons.map((reason) => `<p>${esc(reason)}</p>`).join("")}</section>` : ""}
      ${playerToolsHtml()}
      <p class="online-mod-message" data-player-action-message></p>`;
  }

  function playerToolsHtml() {
    const blocks = [];
    if (has("character.write") || has("player.write")) blocks.push(`
      <details class="online-mod-tool" open><summary>Charakter & Status</summary>
        <form data-command-form="setCharacter" class="online-mod-form-grid"><label>Level<input name="level" type="number" min="0" value="${num(valueOf("private.level", valueOf("profile.level")))}"></label><label>EP<input name="xp" type="number" min="0" value="${num(valueOf("private.xp"))}"></label><label>Job<input name="job" value="${esc(valueOf("profile.job", "Kein Job"))}"></label><button type="submit">Charakter senden</button></form>
        <form data-command-form="setNeeds" class="online-mod-form-grid"><label>Hunger<input name="hunger" type="number" min="0" max="100" value="${num(valueOf("private.hunger"))}"></label><label>Durst<input name="thirst" type="number" min="0" max="100" value="${num(valueOf("private.thirst"))}"></label><label>Energie<input name="energy" type="number" min="0" max="100" value="${num(valueOf("private.energy"))}"></label><label>Stimmung<input name="mood" type="number" min="0" max="100" value="${num(valueOf("private.mood"))}"></label><label>Leben<input name="health" type="number" min="0" max="100" value="${num(valueOf("private.health"))}"></label><button type="submit">Status senden</button></form>
      </details>`);
    if (has("items.write")) blocks.push(`
      <details class="online-mod-tool"><summary>Items geben / nehmen</summary><form data-item-command class="online-mod-form-grid"><label>Item-ID<input name="itemId" required placeholder="itm-..."></label><label>Anzahl<input name="amount" type="number" min="1" max="999" value="1"></label><button type="submit" name="kind" value="giveItem">Geben</button><button type="submit" name="kind" value="removeItem">Nehmen</button></form></details>`);
    if (has("money.write")) blocks.push(`
      <details class="online-mod-tool"><summary>Geld</summary><form data-money-command class="online-mod-form-grid"><label>Ziel<select name="target"><option value="bank">Konto</option><option value="cash">Bargeld</option><option value="phoneCredit">Handyguthaben</option><option value="dirtyMoney">Schwarzgeld</option></select></label><label>Betrag<input name="value" type="number" min="0" value="1000"></label><button type="submit" name="kind" value="addMoney">Geben</button><button type="submit" name="kind" value="removeMoney">Nehmen</button><button type="submit" name="kind" value="setMoney">Setzen</button></form></details>`);
    if (has("smartphone.write")) blocks.push(`
      <details class="online-mod-tool"><summary>Smartphone & Apps</summary><form data-command-form="setPhone" class="online-mod-form-grid"><label>Guthaben<input name="phoneCredit" type="number" min="0" value="${num(valueOf("private.phoneCredit"))}"></label><label>Akku<input name="battery" type="number" min="0" max="100" value="100"></label><label>SIM-Tarif<input name="simPlan" value="Unlimited SIM"></label><label class="check"><input name="installApps" type="checkbox" value="finder" checked> Finder.KL</label><label class="check"><input name="installApps" type="checkbox" value="finster" checked> finster.kl</label><label class="check"><input name="installApps" type="checkbox" value="event" checked> Event</label><button type="submit">Smartphone senden</button></form></details>`);
    if (has("work.write")) blocks.push(`
      <details class="online-mod-tool"><summary>Arbeit & Logistik</summary><form data-command-form="setWork" class="online-mod-form-grid"><label>Arbeits-Skillpunkte<input name="workSkillPoints" type="number" min="0" value="20"></label><label>Mitarbeiter<input name="logisticsEmployees" type="number" min="0" max="20" value="20"></label><label>Logistik-Skillpunkte<input name="logisticsSkillPoints" type="number" min="0" value="100"></label><label class="check"><input name="resetWorkedDay" type="checkbox"> Arbeit heute freigeben</label><button type="submit">Arbeit senden</button></form></details>`);
    if (has("shop.write")) blocks.push(`
      <details class="online-mod-tool"><summary>Eigener Shop</summary><form data-command-form="setShop" class="online-mod-form-grid"><label>Gefahr<input name="danger" type="number" min="0" max="100" value="${num(valueOf("private.shop.danger"))}"></label><label>Ruf<input name="reputation" type="number" min="0" max="100" value="${num(valueOf("private.shop.reputation", 50))}"></label><label>Lagerstufe<select name="storageLevel"><option value="0">Kein Lager</option><option value="1">500 Items</option><option value="2">1.000 Items</option><option value="3">5.000 Items</option></select></label><label class="check"><input name="owned" type="checkbox" ${valueOf("private.shop.created") ? "checked" : ""}> Shop freigeschaltet</label><button type="submit">Shop senden</button></form></details>`);
    if (has("games.write")) blocks.push(`
      <details class="online-mod-tool"><summary>Games</summary><form data-command-form="setGame" class="online-mod-form-grid"><label>Kingdom-Münzen<input name="kingdomCoins" type="number" min="0" value="10000"></label><label>Strong-Rohstoffe<input name="strongResources" type="number" min="0" value="10000"></label><label class="check"><input name="resetLimits" type="checkbox" checked> Limits zurücksetzen</label><button type="submit">Games senden</button></form></details>`);
    if (has("world.write")) blocks.push(`
      <details class="online-mod-tool"><summary>Stadtkarte & Flughafen</summary><form data-command-form="setWorld" class="online-mod-form-grid"><label>Weltort<input name="worldLocation" value="${esc(valueOf("profile.city", "Berlin"))}"></label><label>Lokaler Ort<input name="location" value="home"></label><label class="check"><input name="finishLocalTravel" type="checkbox"> Lokale Fahrt beenden</label><label class="check"><input name="finishWorldTravel" type="checkbox"> Fernreise beenden</label><label class="check"><input name="clearStationBan" type="checkbox"> Sperre entfernen</label><button type="submit">Ort senden</button></form></details>`);
    if (has("moderation.kick") || has("moderation.timeout")) blocks.push(`
      <details class="online-mod-tool"><summary>Moderation</summary><form data-moderation-form class="online-mod-form-grid"><label>Grund<input name="reason" value="Moderationsmaßnahme"></label><label>Dauer in Minuten<input name="minutes" type="number" min="1" value="60"></label>${has("moderation.kick") ? `<button type="submit" name="mode" value="kick">Kicken</button>` : ""}${has("moderation.timeout") ? `<button type="submit" name="mode" value="timeout">Timeout</button>` : ""}${has("moderation.ban.week") || has("moderation.ban.year") || has("*") ? `<button type="submit" name="mode" value="ban" class="danger">Bannen</button>` : ""}${ROLE_ORDER.indexOf(roleData.role) >= ROLE_ORDER.indexOf("moderator") ? `<button type="submit" name="mode" value="unban">Entbannen</button>` : ""}${has("player.reset") ? `<button type="button" class="danger" data-reset-selected-player>Bei Cheat zurücksetzen</button>` : ""}</form></details>`);
    return blocks.length ? blocks.join("") : `<p class="online-mod-empty">Für diese Rolle stehen nur Leserechte zur Verfügung.</p>`;
  }

  async function queueCommand(command) {
    if (!selectedPlayer?.uid) throw new Error("Bitte zuerst einen Spieler auswählen.");
    const result = await callFunction("staffAction", { action: "queueCommand", targetUid: selectedPlayer.uid, command });
    return result;
  }

  async function renderTicketsPanel() {
    content().innerHTML = `<section class="online-mod-card"><div class="online-mod-card-head"><div><small>SUPPORT</small><h3>Tickets bearbeiten</h3></div><div class="online-mod-actions"><button type="button" data-load-tickets>Aktiv</button>${has("tickets.all") ? `<button type="button" data-load-ticket-archive>Speicher</button>` : ""}</div></div><div class="online-mod-ticket-layout"><div class="online-mod-ticket-list" data-ticket-list><p>Lade Tickets …</p></div><div class="online-mod-ticket-detail" data-ticket-detail><div class="online-mod-empty">Ticket auswählen</div></div></div></section>`;
    await loadTickets(false);
  }

  async function loadTickets(archive) {
    const list = content().querySelector("[data-ticket-list]");
    if (!list) return;
    list.innerHTML = `<p>Lade Tickets …</p>`;
    try {
      const response = await callFunction("listSupportTickets", { archive: !!archive });
      tickets = Array.isArray(response.tickets) ? response.tickets : [];
      list.innerHTML = tickets.length ? tickets.map((ticket) => `<button type="button" class="online-mod-ticket-row" data-select-ticket="${esc(ticket.id)}"><b>${esc(ticket.subject || "Ticket")}</b><small>${esc(ticket.ownerName || ticket.ownerEmail || "Spieler")} · ${esc(ticket.status || "open")}</small></button>`).join("") : `<p class="online-mod-empty">Keine Tickets vorhanden.</p>`;
    } catch (error) {
      list.innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  function renderTicketDetail(ticket) {
    selectedTicket = ticket;
    const detail = content().querySelector("[data-ticket-detail]");
    if (!detail) return;
    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    detail.innerHTML = `<section class="online-mod-ticket-head"><small>${esc(ticket.category || "Allgemein")}</small><h3>${esc(ticket.subject || "Support-Ticket")}</h3><p>${esc(ticket.ownerName || ticket.ownerEmail || ticket.ownerUid || "")}</p></section><div class="online-mod-ticket-thread">${messages.map((entry) => `<article class="${entry.senderRole === "player" ? "player" : "staff"}"><b>${esc(entry.senderName || entry.senderRole || "")}</b><p>${esc(entry.text || "")}</p><small>${dateTime(entry.createdAtMs)}</small></article>`).join("")}</div><form data-ticket-reply-form><textarea name="text" maxlength="2000" placeholder="Antwort schreiben …"></textarea><div class="online-mod-actions"><button type="button" data-ticket-action="claim">Übernehmen</button><button type="submit">Antwort senden</button><button type="button" data-ticket-action="resolve">Lösen</button>${has("tickets.delete") ? `<button type="button" class="danger" data-ticket-action="delete">Löschen</button>` : ""}</div><p class="online-mod-message" data-ticket-message></p></form>`;
  }

  async function renderEventsPanel() {
    content().innerHTML = `<section class="online-mod-card"><small>LIVE-EVENT</small><h3>Event planen und starten</h3><form data-event-form class="online-mod-form-grid"><label>Titel<input name="title" maxlength="80" required></label><label class="wide">Beschreibung<textarea name="description" maxlength="600"></textarea></label><label class="wide">Aufgabe<textarea name="task" maxlength="600"></textarea></label><label class="wide">Nachweis-Hinweis<input name="proofHint" maxlength="240"></label><label>Start<input name="startsAt" type="datetime-local"></label><label>Ende<input name="endsAt" type="datetime-local"></label><label>Geldpreis<input name="rewardMoney" type="number" min="0" value="0"></label><label>Gewinnerplätze<input name="maxWinners" type="number" min="1" max="100" value="1"></label><label class="wide">Items<textarea name="rewardItems" placeholder="ITEM-ID | Anzahl | Name – eine Zeile pro Item"></textarea></label><div class="online-mod-actions wide"><button type="submit" name="eventAction" value="save">Entwurf speichern</button><button type="submit" name="eventAction" value="start">Event starten</button><button type="submit" name="eventAction" value="end">Beenden</button><button type="submit" class="danger" name="eventAction" value="clear">Löschen</button></div><p class="online-mod-message wide" data-event-message></p></form></section>`;
    try {
      const fb = await runtime();
      const snap = await fb.getDoc(fb.doc(fb.db, "events", "current"));
      if (snap.exists()) fillEventForm(snap.data());
    } catch (error) {
      content().querySelector("[data-event-message]").textContent = error.message;
    }
  }

  function fillEventForm(event) {
    const form = content().querySelector("[data-event-form]");
    if (!form) return;
    for (const key of ["title", "description", "task", "proofHint", "rewardMoney", "maxWinners"]) if (form.elements[key]) form.elements[key].value = event[key] ?? "";
    const localDateTime = (ms) => ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    form.elements.startsAt.value = localDateTime(event.startsAtMs);
    form.elements.endsAt.value = localDateTime(event.endsAtMs);
    form.elements.rewardItems.value = (event.rewardItems || []).map((item) => `${item.itemId || ""} | ${item.amount || 1} | ${item.label || ""}`).join("\n");
  }

  function parseRewardItems(text) {
    return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [itemId = "", amount = "1", label = ""] = line.split("|").map((part) => part.trim());
      return { itemId, amount: Math.max(1, Math.min(999, Math.round(num(amount, 1)))), label: label || itemId };
    }).filter((item) => item.itemId);
  }

  function renderIdsPanel() {
    let rows = [];
    try {
      const registry = typeof buildItemRegistry === "function" ? buildItemRegistry(true) : null;
      if (registry?.values) rows = [...registry.values()].map((entry) => ({ id: entry.id, name: entry.name, source: entry.source }));
    } catch (error) {
      console.warn("Item-Katalog", error);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, "de"));
    content().innerHTML = `<section class="online-mod-card"><div class="online-mod-card-head"><div><small>ITEM-KATALOG</small><h3>IDs anzeigen und kopieren</h3></div><label class="online-mod-switch"><input type="checkbox" data-id-overlay-toggle ${document.body.classList.contains("mod-item-ids-visible") ? "checked" : ""}> IDs im Spiel</label></div><input class="online-mod-search" data-id-search placeholder="Name oder ID suchen"><div class="online-mod-id-list" data-id-list>${rows.slice(0, 500).map((row) => `<button type="button" data-copy-id="${esc(row.id)}"><b>${esc(row.name)}</b><code>${esc(row.id)}</code><small>${esc(row.source)}</small></button>`).join("")}</div></section>`;
    content().dataset.idRows = JSON.stringify(rows);
  }

  function filterIds(query) {
    let rows = [];
    try { rows = JSON.parse(content().dataset.idRows || "[]"); } catch {}
    const needle = String(query || "").toLowerCase().trim();
    const list = content().querySelector("[data-id-list]");
    if (!list) return;
    list.innerHTML = rows.filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)).slice(0, 500).map((row) => `<button type="button" data-copy-id="${esc(row.id)}"><b>${esc(row.name)}</b><code>${esc(row.id)}</code><small>${esc(row.source)}</small></button>`).join("");
  }

  async function renderStaffPanel() {
    content().innerHTML = `<section class="online-mod-card"><div class="online-mod-card-head"><div><small>TEAM</small><h3>Mitglieder verwalten</h3></div><button type="button" data-refresh-staff>↻</button></div><div data-staff-list><p>Lade Team …</p></div></section>`;
    try {
      const response = await callFunction("listStaffMembers", {});
      const members = response.members || [];
      content().querySelector("[data-staff-list]").innerHTML = members.length ? members.map((member) => `<form data-staff-member="${esc(member.uid)}" class="online-mod-staff-row"><div><b>${esc(member.roleLabel || member.role)}</b><small>${esc(member.uid)}</small></div><select name="role">${ROLE_ORDER.filter((role) => role !== "owner").map((role) => `<option value="${role}" ${member.role === role ? "selected" : ""}>${ROLE_LABELS[role]}</option>`).join("")}</select><label class="check"><input type="checkbox" name="active" ${member.active ? "checked" : ""}> Aktiv</label><button type="submit" ${member.isOwner ? "disabled" : ""}>Speichern</button></form>`).join("") : `<p class="online-mod-empty">Noch keine Teammitglieder.</p>`;
    } catch (error) {
      content().querySelector("[data-staff-list]").innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  async function renderOwnerPanel() {
    content().innerHTML = `<section class="online-mod-grid"><article class="online-mod-card"><small>OWNER-CODES</small><h3>Einmaligen Rollencode erstellen</h3><form data-create-invite><label>Rolle<select name="role">${ROLE_ORDER.filter((role) => !["owner"].includes(role)).map((role) => `<option value="${role}">${ROLE_LABELS[role]}</option>`).join("")}</select></label><label>Gültig in Stunden<input name="validHours" type="number" min="1" max="720" value="168"></label><label>Notiz<input name="note" maxlength="160"></label><button type="submit">Code erstellen</button><p class="online-mod-message" data-invite-message></p><div class="online-mod-secret" data-created-code hidden></div></form></article><article class="online-mod-card"><small>BESTEHENDE CODES</small><h3>Letzte Einladungen</h3><div data-invite-list><p>Lade Codes …</p></div></article></section>`;
    await loadInvites();
  }

  async function loadInvites() {
    const target = content().querySelector("[data-invite-list]");
    if (!target) return;
    try {
      const response = await callFunction("listStaffInvites", {});
      target.innerHTML = (response.invites || []).map((invite) => `<div class="online-mod-invite-row"><b>${esc(invite.roleLabel || invite.role)}</b><small>${esc(invite.maskedCode || "Code verborgen")} · ${invite.used ? "benutzt" : `gültig bis ${dateTime(invite.expiresAtMs)}`}</small></div>`).join("") || `<p class="online-mod-empty">Noch keine Codes erstellt.</p>`;
    } catch (error) {
      target.innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  function clickedSubmitter(event) {
    return event.submitter || document.activeElement;
  }

  async function handleClick(event) {
    const panelButton = event.target.closest("[data-mod-panel]");
    if (panelButton) {
      activePanel = panelButton.dataset.modPanel;
      renderPanel();
      return;
    }
    if (event.target.closest("[data-mod-refresh-role]")) return refreshRoleContext(true);
    if (event.target.closest("[data-mod-close-session]")) {
      try { await callFunction("closeStaffSession", {}); } catch {}
      roleData.activeSessionExpiresAtMs = 0;
      saveBrowserSession();
      renderSessionLogin("Sitzung wurde beendet.");
      return;
    }
    if (event.target.closest("[data-mod-refresh-players]")) return renderPlayersPanel();
    const playerButton = event.target.closest("[data-select-player]");
    if (playerButton) return selectPlayer(playerButton.dataset.selectPlayer);
    const ticketButton = event.target.closest("[data-select-ticket]");
    if (ticketButton) return renderTicketDetail(tickets.find((ticket) => ticket.id === ticketButton.dataset.selectTicket));
    if (event.target.closest("[data-load-tickets]")) return loadTickets(false);
    if (event.target.closest("[data-load-ticket-archive]")) return loadTickets(true);
    const ticketAction = event.target.closest("[data-ticket-action]");
    if (ticketAction && selectedTicket) return runTicketAction(ticketAction.dataset.ticketAction);
    const copyButton = event.target.closest("[data-copy-id]");
    if (copyButton) {
      await navigator.clipboard?.writeText(copyButton.dataset.copyId).catch(() => {});
      copyButton.classList.add("copied");
      setTimeout(() => copyButton.classList.remove("copied"), 800);
      return;
    }
    const toggle = event.target.closest("[data-id-overlay-toggle]");
    if (toggle) {
      document.body.classList.toggle("mod-item-ids-visible", toggle.checked);
      sessionStorage.setItem("lifebuilder-2026-item-id-display", toggle.checked ? "on" : "off");
      return;
    }
    if (event.target.closest("[data-refresh-staff]")) return renderStaffPanel();
    if (event.target.closest("[data-reset-selected-player]")) {
      if (!selectedPlayer?.uid || !confirm("Spielstand dieses Spielers wirklich zurücksetzen?")) return;
      return runCommand({ kind: "resetPlayer" });
    }
  }

  async function runTicketAction(action, extra = {}) {
    const message = content().querySelector("[data-ticket-message]");
    try {
      await callFunction("ticketAction", { ticketId: selectedTicket.id, action, ...extra });
      if (message) message.textContent = "Ticket aktualisiert.";
      await loadTickets(false);
    } catch (error) {
      if (message) { message.textContent = error.message; message.classList.add("error"); }
    }
  }

  function formDataObject(form) {
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (data[key] !== undefined) data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
      else data[key] = value;
    });
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      if (input.name && data[input.name] === undefined) data[input.name] = false;
      else if (input.name && input.checked && input.value === "on") data[input.name] = true;
    });
    return data;
  }

  function convertCommandValues(command) {
    const numeric = ["level", "xp", "age", "hunger", "thirst", "energy", "mood", "health", "phoneCredit", "battery", "workSkillPoints", "logisticsEmployees", "logisticsSkillPoints", "danger", "reputation", "storageLevel", "kingdomCoins", "strongResources"];
    for (const key of numeric) if (command[key] !== undefined && command[key] !== "") command[key] = num(command[key]);
    for (const key of ["resetWorkedDay", "owned", "resetLimits", "finishLocalTravel", "finishWorldTravel", "clearStationBan"]) command[key] = command[key] === true || command[key] === "on";
    if (command.installApps && !Array.isArray(command.installApps)) command.installApps = [command.installApps];
    return command;
  }

  async function runCommand(command) {
    const message = content().querySelector("[data-player-action-message]");
    try {
      await queueCommand(command);
      if (message) { message.textContent = "Befehl wurde an den Spieler gesendet. Er wird beim nächsten Live-Sync angewendet."; message.classList.remove("error"); }
    } catch (error) {
      if (message) { message.textContent = error.message; message.classList.add("error"); }
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (form.matches("[data-mod-session-form]")) {
      const pin = new FormData(form).get("pin");
      try {
        const response = await callFunction("openStaffSession", { pin });
        roleData = { ...roleData, ...response, active: true };
        saveBrowserSession();
        updateSettingsEntry();
        activePanel = "home";
        renderPanel();
      } catch (error) { renderSessionLogin(error.message); }
      return;
    }
    if (form.matches("[data-command-form]")) {
      const command = convertCommandValues({ kind: form.dataset.commandForm, ...formDataObject(form) });
      return runCommand(command);
    }
    if (form.matches("[data-item-command]")) {
      const submitter = clickedSubmitter(event);
      const data = formDataObject(form);
      return runCommand({ kind: submitter?.value || "giveItem", itemId: data.itemId, amount: num(data.amount, 1) });
    }
    if (form.matches("[data-money-command]")) {
      const submitter = clickedSubmitter(event);
      const data = formDataObject(form);
      return runCommand({ kind: submitter?.value || "addMoney", target: data.target, value: num(data.value) });
    }
    if (form.matches("[data-moderation-form]")) {
      const submitter = clickedSubmitter(event);
      const message = content().querySelector("[data-player-action-message]");
      try {
        await callFunction("staffAction", { action: "moderate", targetUid: selectedPlayer.uid, mode: submitter?.value, reason: form.elements.reason.value, minutes: num(form.elements.minutes.value, 60) });
        if (message) message.textContent = "Moderationsaktion durchgeführt.";
      } catch (error) { if (message) { message.textContent = error.message; message.classList.add("error"); } }
      return;
    }
    if (form.matches("[data-ticket-reply-form]")) {
      const text = String(new FormData(form).get("text") || "").trim();
      if (text) await runTicketAction("reply", { text });
      return;
    }
    if (form.matches("[data-event-form]")) {
      const submitter = clickedSubmitter(event);
      const action = submitter?.value || "save";
      const data = formDataObject(form);
      const message = form.querySelector("[data-event-message]");
      try {
        const payload = {
          title: data.title,
          description: data.description,
          task: data.task,
          proofHint: data.proofHint,
          startsAtMs: data.startsAt ? new Date(data.startsAt).getTime() : 0,
          endsAtMs: data.endsAt ? new Date(data.endsAt).getTime() : 0,
          rewardMoney: num(data.rewardMoney),
          maxWinners: num(data.maxWinners, 1),
          rewardItems: parseRewardItems(data.rewardItems)
        };
        await callFunction("eventAction", { action, event: payload });
        message.textContent = "Event aktualisiert.";
      } catch (error) { message.textContent = error.message; message.classList.add("error"); }
      return;
    }
    if (form.matches("[data-staff-member]")) {
      const data = formDataObject(form);
      try {
        await callFunction("manageStaffMember", { targetUid: form.dataset.staffMember, role: data.role, active: data.active === true || data.active === "on" });
        await renderStaffPanel();
      } catch (error) { alert(error.message); }
      return;
    }
    if (form.matches("[data-create-invite]")) {
      const data = formDataObject(form);
      const message = form.querySelector("[data-invite-message]");
      const box = form.querySelector("[data-created-code]");
      try {
        const response = await callFunction("createStaffInvite", { role: data.role, validHours: num(data.validHours, 168), note: data.note });
        box.hidden = false;
        box.innerHTML = `<small>Einmaliger Code</small><code>${esc(response.code)}</code><button type="button" data-copy-id="${esc(response.code)}">Kopieren</button>`;
        message.textContent = "Code wurde erstellt. Er ist nur einmal verwendbar.";
        await loadInvites();
      } catch (error) { message.textContent = error.message; message.classList.add("error"); }
    }
  }

  async function refreshRoleContext(force = false) {
    if (!currentUser) return;
    try {
      const response = await callFunction("getStaffContext", { force });
      roleData = response.role || roleData;
      saveBrowserSession();
      updateSettingsEntry();
      if (overlay?.classList.contains("show")) {
        overlay.querySelector("[data-mod-role-line]").textContent = `${roleLabel()} · ${currentUser.email || currentUser.uid}`;
        sessionActive() ? renderPanel() : renderSessionLogin();
      }
    } catch (error) {
      console.warn("Staff-Kontext", error);
    }
  }

  async function listenRole(user) {
    roleUnsubscribe?.();
    roleUnsubscribe = null;
    roleData = null;
    selectedPlayer = null;
    sessionStorage.removeItem(SESSION_KEY);
    updateSettingsEntry();
    if (!user) return;
    const fb = await runtime();
    roleUnsubscribe = fb.onSnapshot(fb.doc(fb.db, "staffRoles", user.uid), (snapshot) => {
      roleData = snapshot.exists() ? { uid: user.uid, ...snapshot.data() } : null;
      if (roleData?.active) {
        roleData.permissions ||= ROLE_PERMISSIONS[roleData.role] || [];
        roleData.roleLabel ||= ROLE_LABELS[roleData.role] || roleData.role;
      }
      saveBrowserSession();
      updateSettingsEntry();
      if (!roleData?.active && overlay?.classList.contains("show")) closeModMenu();
    }, (error) => console.warn("Mod-Rolle konnte nicht geladen werden", error));
  }

  function bindSearchInputs() {
    document.addEventListener("input", (event) => {
      if (event.target.matches("[data-player-search]")) renderPlayerList(event.target.value);
      if (event.target.matches("[data-id-search]")) filterIds(event.target.value);
    });
  }

  async function initialize() {
    bindSearchInputs();
    try {
      const fb = await runtime();
      fb.onAuthStateChanged(fb.auth, (user) => {
        currentUser = user;
        listenRole(user).catch((error) => console.warn(error));
      });
    } catch (error) {
      console.warn("Online-Mod-Menü konnte Firebase nicht laden", error);
    }
  }

  window.LifeBuilderOnlineMod = {
    open: openModMenu,
    close: closeModMenu,
    getRole: () => roleData,
    hasPermission: has,
    refresh: refreshRoleContext
  };

  initialize();
})();
