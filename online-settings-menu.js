(() => {
  "use strict";

  const VERSION = "2026-07-24-settings-menu-character-slots-v3";
  const DB_ID = "gamekl";
  const REGION = "europe-west3";
  const SESSION_KEY = "lifebuilder-2026-online-mod-session";
  const ITEM_ID_DISPLAY_KEY = "lifebuilder-2026-item-id-display";

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

  const PANEL_DEFS = [
    { id: "home", label: "Übersicht", short: "Start", icon: "⌂", permission: null },
    { id: "players", label: "Online-Player", short: "Player", icon: "👥", permission: "players.read" },
    { id: "tickets", label: "Support-Tickets", short: "Tickets", icon: "🎫", permission: "tickets.work" },
    { id: "events", label: "Event-Zentrale", short: "Event", icon: "🏆", permission: "events.write" },
    { id: "ids", label: "Item-IDs", short: "IDs", icon: "#", permission: "ids.read" },
    { id: "staff", label: "Teamverwaltung", short: "Team", icon: "🛡", permission: "staff.manage" },
    { id: "owner", label: "Owner-Codes", short: "Owner", icon: "◆", ownerOnly: true }
  ];

  const PLAYER_TABS = [
    { id: "overview", label: "Übersicht", icon: "⌂" },
    { id: "character", label: "Charakter", icon: "👤", permission: "player.write" },
    { id: "needs", label: "Status", icon: "♥", permission: "player.write" },
    { id: "money", label: "Geld", icon: "€", permission: "money.write" },
    { id: "inventory", label: "Inventar", icon: "📦", permission: "items.write" },
    { id: "phone", label: "Handy", icon: "📱", permission: "smartphone.write" },
    { id: "workshop", label: "Arbeit & Shop", icon: "🧰", any: ["work.write", "shop.write"] },
    { id: "worldgames", label: "Welt & Games", icon: "🌍", any: ["world.write", "games.write"] },
    { id: "moderation", label: "Moderation", icon: "⚠", any: ["moderation.kick", "moderation.timeout"] }
  ];

  const CATEGORY_ORDER = [
    "Wohnung & Immobilien", "Möbel & Haushalt", "Essen & Trinken", "Kleidung", "Technik & Handy",
    "Fahrzeuge", "Rucksäcke", "Waffen", "Schwarzmarkt", "Dokumente & SIM", "Sonstiges"
  ];
  const CATEGORY_ICONS = {
    "Wohnung & Immobilien": "⌂", "Möbel & Haushalt": "🛋", "Essen & Trinken": "🍔", "Kleidung": "👕",
    "Technik & Handy": "📱", "Fahrzeuge": "🚗", "Rucksäcke": "🎒", "Waffen": "⚔",
    "Schwarzmarkt": "☠", "Dokumente & SIM": "🪪", "Sonstiges": "📦"
  };

  let runtimePromise = null;
  let currentUser = null;
  let roleData = null;
  let roleUnsubscribe = null;
  let overlay = null;
  let activePanel = "home";
  let originalBodyOverflow = "";

  let players = [];
  let playerAccounts = [];
  const expandedAccounts = new Set();
  let selectedPlayer = null;
  let selectedPlayerUid = "";
  let selectedPlayerSlotIndex = 0;
  let playerTab = "overview";
  let playerSearch = "";
  let playerFilter = "all";
  let playerSort = "online";
  let selectedCatalogItemId = "";
  let playerItemSearch = "";
  let playerItemCategory = "all";
  let playerActionReason = "";
  let firebaseOnline = navigator.onLine !== false;

  let tickets = [];
  let selectedTicket = null;
  let ticketArchive = false;
  let ticketSearch = "";
  let ticketStatus = "all";

  let itemRows = [];
  let idSearch = "";
  let idCategory = "all";
  let eventItemSearch = "";

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, num(value, min)));
  const euro = (value) => `${Math.round(num(value)).toLocaleString("de-DE")} €`;
  const compactNumber = (value) => new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(num(value));
  const dateTime = (value) => value ? new Date(num(value)).toLocaleString("de-DE") : "–";
  const relativeTime = (value) => {
    const ms = Date.now() - num(value);
    if (!value) return "nie";
    if (ms < 60000) return "gerade eben";
    if (ms < 3600000) return `vor ${Math.max(1, Math.round(ms / 60000))} Min.`;
    if (ms < 86400000) return `vor ${Math.max(1, Math.round(ms / 3600000))} Std.`;
    return `vor ${Math.max(1, Math.round(ms / 86400000))} Tagen`;
  };
  const safeArray = (value) => Array.isArray(value) ? value : [];
  const safeObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const selectedPlayerSlot = (fallback = 0) => Number.isFinite(Number(selectedPlayerSlotIndex))
    ? Math.max(0, Math.min(3, Math.floor(Number(selectedPlayerSlotIndex))))
    : num(selectedPlayer?.save?.slot ?? selectedPlayer?.profile?.slot ?? selectedPlayer?.slot, fallback);

  function normalizePlayerAccounts(value) {
    return safeArray(value)
      .filter((account) => account && typeof account === "object" && !Array.isArray(account))
      .map((account) => {
        const rawCharacters = safeArray(account.characters)
          .filter((character) => character && typeof character === "object" && !Array.isArray(character));
        const fallbackUid = account.uid
          ?? account.id
          ?? account.accountUid
          ?? account.userId
          ?? rawCharacters.find((character) => character.uid)?.uid
          ?? "";
        const accountUid = String(fallbackUid || "").trim();
        const characters = rawCharacters
          .map((character, index) => ({
            ...character,
            uid: String(character.uid || accountUid || "").trim(),
            slot: num(character.slot, index)
          }))
          .filter((character) => character.uid);
        return {
          ...account,
          uid: accountUid || characters[0]?.uid || "",
          characters
        };
      })
      .filter((account) => account.uid && account.characters.length);
  }

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
      firebaseOnline = true;
      updateConnectionStatus();
      return result.data || {};
    } catch (error) {
      if (/network|unavailable|offline|failed-precondition/i.test(String(error?.code || error?.message || ""))) firebaseOnline = false;
      updateConnectionStatus();
      const raw = String(error?.message || error || "Unbekannter Fehler");
      if (/not-found|internal/i.test(String(error?.code || "")) && /function/i.test(raw)) {
        throw new Error("Die Einstellungsmenü-Functions sind noch nicht in Firebase veröffentlicht.");
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
  function hasAny(list = []) {
    return list.some((permission) => has(permission));
  }
  function sessionActive() {
    return !!roleData?.active && num(roleData.activeSessionExpiresAtMs) > Date.now();
  }
  function roleLabel() {
    return roleData?.roleLabel || ROLE_LABELS[roleData?.role] || "Teamrolle";
  }

  function roleRank(role = roleData?.role) {
    return ROLE_ORDER.indexOf(String(role || ""));
  }
  function isOwnerRole() {
    return roleData?.role === "owner";
  }
  function canInspectTrust() {
    return ["admin", "owner"].includes(roleData?.role);
  }
  function currentConnectionOnline() {
    return navigator.onLine !== false && firebaseOnline && !!currentUser;
  }
  function trustOf(player = selectedPlayer) {
    return safeObject(player?.trust);
  }
  function characterStatus(player = selectedPlayer) {
    const trust = trustOf(player);
    return trust.status === "hack" ? "hack" : trust.status === "mod" ? "mod" : "clean";
  }
  function characterStatusLabel(status = characterStatus()) {
    return status === "hack" ? "Hack-Charakter" : status === "mod" ? "Mod-Charakter" : "Unauffällig";
  }
  function characterStatusClass(status = characterStatus()) {
    return status === "hack" ? "danger" : status === "mod" ? "mod" : "ok";
  }
  function updateConnectionStatus() {
    const online = currentConnectionOnline();
    document.querySelectorAll("[data-mod-connection-status]").forEach((node) => {
      node.classList.toggle("offline", !online);
      const label = node.querySelector("b");
      if (label) label.textContent = online ? "Online" : "Offline";
    });
  }

  function availablePanels() {
    return PANEL_DEFS.filter((panel) => {
      if (panel.ownerOnly) return roleData?.role === "owner";
      return !panel.permission || has(panel.permission);
    });
  }
  function availablePlayerTabs() {
    return PLAYER_TABS.filter((tab) => {
      if (tab.id === "overview") return true;
      if (tab.permission) return has(tab.permission);
      if (tab.any) return hasAny(tab.any);
      return true;
    });
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
      card.querySelector("[data-online-mod-settings-role]").textContent = `${roleLabel()} · Einstellungsmenü`;
      card.querySelector("[data-online-mod-settings-state]").textContent = sessionActive()
        ? "Online freigeschaltet · auf PC und Handy verfügbar"
        : "Rolle gespeichert · Sitzungscode erneut eingeben";
      action.textContent = "Öffnen";
    } else {
      card.querySelector("[data-online-mod-settings-role]").textContent = "Einstellungsmenü freischalten";
      card.querySelector("[data-online-mod-settings-state]").textContent = "Einmaligen Code vom Owner eingeben.";
      action.textContent = "Code eingeben";
    }
  }

  async function redeemInviteFromSettings() {
    const code = prompt("Einmaligen Team-Code eingeben:");
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
      <section class="online-mod-shell" role="dialog" aria-modal="true" aria-label="LifeBuilder Einstellungsmenü">
        <header class="online-mod-header">
          <div class="online-mod-brand"><span>KL</span><div><small>LIVE ADMINISTRATION</small><h2>Einstellungsmenü</h2></div></div>
          <div class="online-mod-session-pill"><i></i><span data-mod-role-line></span></div>
          <div class="online-mod-head-actions">
            <button type="button" data-mod-refresh-role title="Rolle und Sitzung neu laden">↻</button>
            <button type="button" class="online-mod-close" data-mod-close aria-label="Schließen">×</button>
          </div>
        </header>
        <div class="online-mod-body">
          <aside class="online-mod-sidebar">
            <div class="online-mod-sidebar-title"><small>WERKZEUGE</small><b>Administration</b></div>
            <nav class="online-mod-nav" data-mod-nav></nav>
            <div class="online-mod-sidebar-footer" data-mod-connection-status><span class="online-mod-db-dot"></span><div><b>${currentConnectionOnline() ? "Online" : "Offline"}</b></div></div>
          </aside>
          <main class="online-mod-content" data-mod-content></main>
        </div>
        <div class="online-mod-toast-holder" data-mod-toasts></div>
      </section>`;
    document.body.appendChild(overlay);
    updateConnectionStatus();
    overlay.querySelector("[data-mod-close]").addEventListener("click", closeModMenu);
    overlay.addEventListener("click", handleClick);
    overlay.addEventListener("submit", handleSubmit);
    overlay.addEventListener("input", handleInput);
    overlay.addEventListener("change", handleChange);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModMenu();
    });
    return overlay;
  }

  function toast(message, type = "ok") {
    const host = ensureOverlay().querySelector("[data-mod-toasts]");
    if (!host) return;
    const node = document.createElement("div");
    node.className = `online-mod-toast ${type === "error" ? "danger" : ""}`;
    node.innerHTML = `<b>${type === "error" ? "!" : "✓"}</b><span>${esc(message)}</span>`;
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add("show"));
    setTimeout(() => {
      node.classList.remove("show");
      setTimeout(() => node.remove(), 250);
    }, 3200);
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
    if (!availablePanels().some((panel) => panel.id === activePanel)) activePanel = "home";
    renderNavigation();
    renderPanel();
  }

  function closeModMenu() {
    overlay?.classList.remove("show");
    unlockPage();
  }

  function renderSessionLogin(message = "") {
    const target = content();
    renderNavigation(true);
    target.innerHTML = `
      <section class="online-mod-login-card">
        <span>🔐</span><small>${esc(roleLabel())}</small><h2>Einstellungs-Sitzung öffnen</h2>
        <p>Gib deinen persönlichen Sitzungscode ein. Die Rolle selbst bleibt mit deinem Firebase-Account verbunden.</p>
        <form data-mod-session-form>
          <label>Sitzungscode<input name="pin" required autocomplete="off" placeholder="KL-…"></label>
          <button class="online-mod-primary" type="submit">Sitzung öffnen</button>
          <p class="online-mod-message ${message ? "error" : ""}">${esc(message)}</p>
        </form>
      </section>`;
  }

  function renderNavigation(disabled = false) {
    const nav = ensureOverlay().querySelector("[data-mod-nav]");
    nav.innerHTML = availablePanels().map((item) => `
      <button type="button" class="${item.id === activePanel ? "active" : ""}" data-mod-panel="${item.id}" ${disabled ? "disabled" : ""}>
        <span class="online-mod-nav-icon">${item.icon}</span><span class="online-mod-nav-label"><b>${esc(item.label)}</b><small>${esc(item.short)}</small></span>
      </button>`).join("");
  }

  function content() {
    return ensureOverlay().querySelector("[data-mod-content]");
  }

  function renderPanel() {
    renderNavigation();
    const target = content();
    target.scrollTop = 0;
    if (activePanel === "players") return renderPlayersPanel();
    if (activePanel === "tickets") return renderTicketsPanel();
    if (activePanel === "events") return renderEventsPanel();
    if (activePanel === "ids") return renderIdsPanel();
    if (activePanel === "staff") return renderStaffPanel();
    if (activePanel === "owner") return renderOwnerPanel();
    return renderHomePanel();
  }

  function pageHead(kicker, title, text, actions = "") {
    return `<header class="online-mod-page-head"><div><small>${esc(kicker)}</small><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${actions ? `<div class="online-mod-page-actions">${actions}</div>` : ""}</header>`;
  }

  function renderHomePanel() {
    const expires = num(roleData?.activeSessionExpiresAtMs);
    const ownerView = isOwnerRole();
    const online = currentConnectionOnline();
    const quick = availablePanels().filter((panel) => panel.id !== "home").map((panel) => `
      <button type="button" class="online-mod-launch-card" data-mod-panel="${panel.id}">
        <span>${panel.icon}</span><div><b>${esc(panel.label)}</b><small>${panel.id === "players" ? "Spieler prüfen und bearbeiten" : panel.id === "tickets" ? "Anfragen übernehmen und lösen" : panel.id === "ids" ? "Suchen, kopieren und vergeben" : "Bereich öffnen"}</small></div><em>›</em>
      </button>`).join("");
    const ownerSecurity = ownerView ? `<p>Owner-Ansicht: Serverseitige Prüfung und Audit sind aktiv.</p><div class="online-mod-chip-list">${permissions().slice(0, 18).map((permission) => `<span>${esc(permission)}</span>`).join("")}${permissions().length > 18 ? `<span>+${permissions().length - 18}</span>` : ""}</div>` : "";
    content().innerHTML = `
      ${pageHead("ONLINE-MOD-ZENTRALE", "Übersicht", "Schneller Zugriff auf Spieler, Support, Events und Item-Katalog.")}
      <section class="online-mod-metric-grid">
        <article><small>AKTIVE ROLLE</small><b>${esc(roleLabel())}</b><span>${ownerView ? `${permissions().length} Rechte geladen` : "Rolle aktiv"}</span></article>
        <article><small>SITZUNG</small><b>${expires > 4000000000000 ? "Dauerhaft" : relativeTime(expires)}</b><span>${expires > 4000000000000 ? `${roleLabel()}-Zugriff` : `bis ${dateTime(expires)}`}</span></article>
        <article><small>VERBINDUNG</small><b>${online ? "Online" : "Offline"}</b><span>${online ? "Server erreichbar" : "Verbindung unterbrochen"}</span></article>
        <article><small>GERÄT</small><b>${matchMedia("(max-width:760px)").matches ? "Handy" : "PC"}</b><span>Ansicht automatisch angepasst</span></article>
      </section>
      <section class="online-mod-home-grid">
        <article class="online-mod-card"><div class="online-mod-card-title"><span>⚡</span><div><small>SCHNELLSTART</small><h3>Werkzeuge öffnen</h3></div></div><div class="online-mod-launch-grid">${quick}</div></article>
        <article class="online-mod-card online-mod-session-card"><div class="online-mod-card-title"><span>🛡</span><div><small>SITZUNG</small><h3>${ownerView ? "Sicherheit & Status" : "Sitzung"}</h3></div></div>${ownerSecurity}<div class="online-mod-actions"><button type="button" data-mod-refresh-role>Rolle neu laden</button><button type="button" class="danger" data-mod-close-session>Sitzung schließen</button></div><p class="online-mod-message" data-mod-home-message></p></article>
      </section>`;
    updateConnectionStatus();
  }

  async function renderPlayersPanel() {
    buildCatalogRows();
    content().innerHTML = `
      ${pageHead("LIVE-SPIELER", "Online-Player", "Spieler auswählen, Werte prüfen und Änderungen direkt in den Cloud-Spielstand schreiben.", `<button type="button" data-mod-refresh-players>↻ Aktualisieren</button>`)}
      <section class="online-mod-player-workspace">
        <aside class="online-mod-player-browser">
          <div class="online-mod-browser-head"><b>Spielerliste</b><span data-player-count>0</span></div>
          <label class="online-mod-search-box"><span>⌕</span><input data-player-search value="${esc(playerSearch)}" placeholder="Name, UID, Stadt oder Job"></label>
          <div class="online-mod-segmented" data-player-filter>
            <button type="button" data-player-filter-value="all" class="${playerFilter === "all" ? "active" : ""}">Alle</button>
            <button type="button" data-player-filter-value="online" class="${playerFilter === "online" ? "active" : ""}">Online</button>
            <button type="button" data-player-filter-value="risk" class="${playerFilter === "risk" ? "active" : ""}">Auffällig</button>
          </div>
          <label class="online-mod-mini-select">Sortierung<select data-player-sort><option value="online" ${playerSort === "online" ? "selected" : ""}>Online zuerst</option><option value="level" ${playerSort === "level" ? "selected" : ""}>Höchstes Level</option><option value="recent" ${playerSort === "recent" ? "selected" : ""}>Zuletzt aktiv</option><option value="name" ${playerSort === "name" ? "selected" : ""}>Name A–Z</option></select></label>
          <div class="online-mod-player-list" data-player-list><p>Lade Spieler …</p></div>
        </aside>
        <div class="online-mod-player-detail" data-player-detail><div class="online-mod-empty-state"><span>👥</span><h3>Spieler auswählen</h3><p>Links einen Spieler anklicken, um Charakter, Geld, Inventar und weitere Bereiche zu öffnen.</p></div></div>
      </section>`;
    try {
      const response = await callFunction("listPlayers", {});
      playerAccounts = normalizePlayerAccounts(response.accounts);
      players = playerAccounts.flatMap((account) => account.characters.map((character) => ({ ...character, uid: character.uid || account.uid, email: account.email, accountName: account.accountName, online: account.online, lastSeenAtMs: account.lastSeenAtMs, key: `${character.uid || account.uid}:${character.slot}` })));
      renderPlayerList();
      if (selectedPlayerUid && players.some((player) => player.uid === selectedPlayerUid && num(player.slot) === selectedPlayerSlot())) await selectPlayer(selectedPlayerUid, selectedPlayerSlot(), true);
    } catch (error) {
      const list = content().querySelector("[data-player-list]");
      if (list) list.innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  function filteredPlayers() {
    const needle = playerSearch.trim().toLowerCase();
    let rows = players.filter((player) => {
      if (playerFilter === "online" && !player.online) return false;
      if (playerFilter === "risk" && !(player.suspicious || num(player.riskScore) >= 50)) return false;
      return !needle || [player.email, player.displayName, player.uid, player.city, player.job].some((value) => String(value || "").toLowerCase().includes(needle));
    });
    rows = [...rows].sort((a, b) => {
      if (playerSort === "level") return num(b.level) - num(a.level) || String(a.displayName).localeCompare(String(b.displayName), "de");
      if (playerSort === "recent") return num(b.lastSeenAtMs) - num(a.lastSeenAtMs);
      if (playerSort === "name") return String(a.displayName || "").localeCompare(String(b.displayName || ""), "de");
      return Number(b.online) - Number(a.online) || Number(b.suspicious) - Number(a.suspicious) || num(b.lastSeenAtMs) - num(a.lastSeenAtMs);
    });
    return rows;
  }

  function renderPlayerList() {
    const list = content().querySelector("[data-player-list]");
    const count = content().querySelector("[data-player-count]");
    if (!list) return;
    const shown = filteredPlayers();
    const shownKeys = new Set(shown.map((row) => `${row.uid}:${row.slot}`));
    const accounts = playerAccounts.filter((account) => safeArray(account.characters).some((character) => shownKeys.has(`${account.uid}:${character.slot}`)));
    if (count) count.textContent = `${shown.length} Charaktere / ${accounts.length} Accounts`;
    list.innerHTML = accounts.length ? accounts.map((account) => {
      const chars = safeArray(account.characters).filter((character) => shownKeys.has(`${account.uid}:${character.slot}`));
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const expanded = mobile || expandedAccounts.has(account.uid) || (selectedPlayerUid === account.uid);
      return `<section class="online-mod-account-group ${expanded ? "expanded" : ""}">
        <button type="button" class="online-mod-account-row" data-toggle-account="${esc(account.uid)}"><span class="online-dot ${account.online ? "online" : ""}"></span><span><b>${esc(account.email || "E-Mail unbekannt")}</b><small>${chars.length} getrennte Charakter${chars.length === 1 ? "-Akte" : "-Akten"} · ${account.online ? "LIVE" : relativeTime(account.lastSeenAtMs)}</small></span><em>${expanded ? "▾" : "▸"}</em></button>
        <div class="online-mod-character-list">${chars.map((player) => `<button type="button" class="online-mod-player-row ${selectedPlayerUid === player.uid && selectedPlayerSlot() === num(player.slot) ? "active" : ""}" data-select-player="${esc(player.uid)}" data-select-slot="${num(player.slot)}"><span class="online-mod-avatar mini">${esc(String(player.displayName || "C").slice(0,1).toUpperCase())}</span><span class="online-mod-player-row-main"><b>${esc(player.displayName || `Charakter ${num(player.slot)+1}`)}</b><small>Slot ${num(player.slot)+1} · Level ${num(player.level)} · ${esc(player.city || "Kein Ort")}</small><small>${esc(player.job || "Kein Job")} · eigene Mod/Hack-Akte</small></span><span class="online-mod-player-row-meta">${player.characterStatus === "hack" ? `<i class="risk">HACK</i>` : player.characterStatus === "mod" ? `<i class="mod">MOD</i>` : ""}</span></button>`).join("")}</div>
      </section>`;
    }).join("") : `<div class="online-mod-empty-state compact"><span>⌕</span><p>Keine passenden Accounts oder Charaktere gefunden.</p></div>`;
  }

  async function readCharacterSlotDirect(uid, slot) {
    try {
      const fb = await runtime();
      const ref = fb.doc(fb.db, "gameSaves", uid, "slots", `slot-${slot + 1}`);
      const snapshot = await fb.getDoc(ref);
      if (!snapshot.exists()) return null;
      const raw = snapshot.data() || {};
      const save = safeObject(raw.state || raw.save || raw.gameState || raw);
      return Object.keys(save).length ? save : null;
    } catch (error) {
      console.warn("Einstellungsmenü: direkter Charakter-Slot konnte nicht gelesen werden", uid, slot, error?.message || error);
      return null;
    }
  }

  function clickedCharacterSummary(uid, slot) {
    return players.find((player) => player.uid === uid && num(player.slot) === num(slot)) || null;
  }

  async function selectPlayer(uid, slot = 0, silent = false) {
    const detail = content().querySelector("[data-player-detail]");
    const normalizedSlot = Math.max(0, Math.min(3, Math.floor(num(slot))));
    if (selectedPlayerUid !== uid || selectedPlayerSlot() !== normalizedSlot) playerActionReason = "";
    selectedPlayerUid = String(uid || "");
    selectedPlayerSlotIndex = normalizedSlot;
    if (!detail) return;
    if (!silent) detail.innerHTML = `<div class="online-mod-loading"><i></i><p>Charakter-Slot ${normalizedSlot + 1} wird geladen …</p></div>`;
    try {
      const summary = clickedCharacterSummary(uid, normalizedSlot);
      const payload = { targetUid: uid, slot: normalizedSlot, slotIndex: normalizedSlot, characterSlot: normalizedSlot, saveSlot: normalizedSlot };
      const [response, directSave] = await Promise.all([
        callFunction("getPlayerDetails", payload),
        readCharacterSlotDirect(uid, normalizedSlot)
      ]);
      const received = safeObject(response.player);
      const receivedProfile = safeObject(received.profile);
      const receivedSave = safeObject(received.save);
      const mergedSave = directSave ? { ...receivedSave, ...directSave, slot: normalizedSlot } : { ...receivedSave, slot: normalizedSlot };
      const displayName = summary?.displayName || mergedSave.firstName && `${mergedSave.firstName} ${mergedSave.lastName || ""}`.trim() || receivedProfile.displayName || `Charakter ${normalizedSlot + 1}`;
      selectedPlayer = {
        ...received,
        uid: String(uid),
        slot: normalizedSlot,
        save: mergedSave,
        profile: {
          ...receivedProfile,
          slot: normalizedSlot,
          displayName,
          level: summary?.level ?? mergedSave.level ?? receivedProfile.level,
          city: summary?.city ?? mergedSave.worldLocation ?? mergedSave.homeCity ?? receivedProfile.city,
          job: summary?.job ?? mergedSave.job ?? receivedProfile.job,
          online: summary?.online ?? receivedProfile.online,
          lastSeenAtMs: summary?.lastSeenAtMs ?? receivedProfile.lastSeenAtMs
        }
      };
      if (!availablePlayerTabs().some((tab) => tab.id === playerTab)) playerTab = "overview";
      renderPlayerList();
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

  function playerName() {
    return selectedPlayer?.profile?.displayName || selectedPlayer?.account?.displayName || selectedPlayer?.account?.email || "Spieler";
  }

  function renderPlayerDetail() {
    const detail = content().querySelector("[data-player-detail]");
    if (!detail || !selectedPlayer) return;
    const profile = safeObject(selectedPlayer.profile);
    const trust = trustOf();
    const status = characterStatus();
    const tabs = availablePlayerTabs();
    const canChange = hasAny(["player.write", "money.write", "items.write", "smartphone.write", "work.write", "games.write", "world.write", "shop.write", "properties.write", "player.reset"]);
    detail.innerHTML = `
      <section class="online-mod-player-hero">
        <div class="online-mod-avatar">${esc(playerName().slice(0, 1).toUpperCase())}</div>
        <div class="online-mod-player-identity"><small>AUSGEWÄHLTER SPIELER</small><h2>${esc(playerName())}</h2><p>${profile.online ? "Online" : relativeTime(profile.lastSeenAtMs)} · Slot ${num(profile.slot) + 1}</p><code>${esc(selectedPlayer.uid)}</code></div>
        <div class="online-mod-player-hero-actions"><span class="online-mod-risk ${characterStatusClass(status)}">${esc(characterStatusLabel(status))}${status === "hack" && trust.riskScore ? ` · ${num(trust.riskScore)}%` : ""}</span><button type="button" data-copy-id="${esc(selectedPlayer.uid)}">UID kopieren</button></div>
      </section>
      ${canChange ? `<label class="online-mod-change-reason"><span>Grund / Supportfall</span><input data-player-change-reason maxlength="240" value="${esc(playerActionReason)}" placeholder="z. B. Supportfall: verlorenes Item ersetzt"><small>Jede Änderung wird damit nachvollziehbar als Team-Änderung gespeichert.</small></label>` : ""}
      <nav class="online-mod-player-tabs">${tabs.map((tab) => `<button type="button" class="${playerTab === tab.id ? "active" : ""}" data-player-tab="${tab.id}"><span>${tab.icon}</span>${esc(tab.label)}</button>`).join("")}</nav>
      <div class="online-mod-player-tab-content" data-player-tab-content>${playerTabHtml(playerTab)}</div>
      <div class="online-mod-command-status"><span></span><p class="online-mod-message" data-player-action-message></p></div>`;
  }

  function statCard(label, value, sub = "") {
    return `<article class="online-mod-stat-card"><small>${esc(label)}</small><b>${esc(value)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</article>`;
  }

  function playerTabHtml(tab) {
    const profile = safeObject(selectedPlayer.profile);
    const privateData = safeObject(selectedPlayer.private);
    const stats = safeObject(privateData.statistics);
    const save = safeObject(selectedPlayer?.save);
    const trust = trustOf();
    const status = characterStatus();
    const itemCounts = safeObject(save.itemCounts || privateData.itemCounts);

    if (tab === "character") {
      return `
        <section class="online-mod-section-grid two">
          <article class="online-mod-card"><div class="online-mod-card-title"><span>👤</span><div><small>CHARAKTER</small><h3>Grunddaten bearbeiten</h3></div></div>
            <form data-command-form="setCharacter" class="online-mod-form-grid">
              <label>Level<input name="level" type="number" min="0" value="${num(privateData.level ?? profile.level)}"></label>
              <label>EP<input name="xp" type="number" min="0" value="${num(privateData.xp)}"></label>
              <label>Alter<input name="age" type="number" min="16" max="120" value="${num(stats.age || save.age || 18)}"></label>
              <label>Job<input name="job" value="${esc(profile.job || stats.job || save.job || "Kein Job")}"></label>
              <button class="online-mod-primary wide" type="submit">Charakter speichern</button>
            </form>
          </article>
          <article class="online-mod-card"><div class="online-mod-card-title"><span>📋</span><div><small>AKTUELL</small><h3>Spielerinformationen</h3></div></div>
            <div class="online-mod-data-list"><span><small>Tag</small><b>${num(stats.day || save.day || 1)}</b></span><span><small>Stadt</small><b>${esc(profile.city || stats.worldLocation || save.worldLocation || "–")}</b></span><span><small>Lokaler Ort</small><b>${esc(stats.location || save.location || "–")}</b></span><span><small>Bonität</small><b>${num(stats.creditScore || save.creditScore)} Punkte</b></span></div>
          </article>
        </section>`;
    }

    if (tab === "needs") {
      return `
        <section class="online-mod-section-grid two">
          <article class="online-mod-card"><div class="online-mod-card-title"><span>♥</span><div><small>STATUSWERTE</small><h3>Bedürfnisse einstellen</h3></div></div>
            <form data-command-form="setNeeds" class="online-mod-form-grid" data-needs-form>
              ${needInput("Hunger", "hunger", privateData.hunger)}${needInput("Durst", "thirst", privateData.thirst)}${needInput("Energie", "energy", privateData.energy)}${needInput("Stimmung", "mood", privateData.mood)}${needInput("Leben", "health", privateData.health)}
              <div class="online-mod-actions wide"><button type="button" data-fill-needs="100">Alles 100</button><button type="button" data-fill-needs="50">Alles 50</button><button class="online-mod-primary" type="submit">Status speichern</button></div>
            </form>
          </article>
          <article class="online-mod-card"><div class="online-mod-card-title"><span>▥</span><div><small>LIVE-ANZEIGE</small><h3>Aktueller Zustand</h3></div></div><div class="online-mod-bars">${needBar("Hunger", privateData.hunger)}${needBar("Durst", privateData.thirst)}${needBar("Energie", privateData.energy)}${needBar("Stimmung", privateData.mood)}${needBar("Leben", privateData.health)}</div></article>
        </section>`;
    }

    if (tab === "money") {
      return `
        <section class="online-mod-metric-grid compact">
          ${statCard("BANKKONTO", euro(privateData.bank), compactNumber(privateData.bank))}
          ${statCard("BARGELD", euro(privateData.cash), compactNumber(privateData.cash))}
          ${statCard("HANDYGUTHABEN", euro(privateData.phoneCredit), compactNumber(privateData.phoneCredit))}
          ${statCard("SCHWARZGELD", euro(privateData.dirtyMoney), compactNumber(privateData.dirtyMoney))}
        </section>
        <article class="online-mod-card"><div class="online-mod-card-title"><span>€</span><div><small>GELDWERKZEUG</small><h3>Geld geben, nehmen oder setzen</h3></div></div>
          <form data-money-command class="online-mod-form-grid">
            <label>Ziel<select name="target"><option value="bank">Bankkonto</option><option value="cash">Bargeld</option><option value="phoneCredit">Handyguthaben</option><option value="dirtyMoney">Schwarzgeld</option></select></label>
            <label>Betrag<input name="value" type="number" min="0" value="1000"></label>
            <div class="online-mod-quick-values wide"><button type="button" data-set-money-value="1000">1.000</button><button type="button" data-set-money-value="10000">10.000</button><button type="button" data-set-money-value="100000">100.000</button><button type="button" data-set-money-value="1000000">1 Mio.</button></div>
            <button type="submit" name="kind" value="addMoney">Geben</button><button type="submit" name="kind" value="removeMoney">Nehmen</button><button class="online-mod-primary" type="submit" name="kind" value="setMoney">Genau setzen</button>
          </form>
        </article>`;
    }

    if (tab === "inventory") return inventoryTabHtml(itemCounts);

    if (tab === "phone") {
      const apps = safeArray(save.installedPhoneApps || privateData.installedPhoneApps);
      return `
        <section class="online-mod-section-grid two">
          <article class="online-mod-card"><div class="online-mod-card-title"><span>📱</span><div><small>SMARTPHONE</small><h3>Gerät & Apps</h3></div></div>
            <form data-command-form="setPhone" class="online-mod-form-grid">
              <label>Guthaben<input name="phoneCredit" type="number" min="0" value="${num(privateData.phoneCredit)}"></label><label>Akku<input name="battery" type="number" min="0" max="100" value="${num(save.phoneBattery || 100)}"></label><label class="wide">SIM-Tarif<input name="simPlan" value="${esc(save.phonePlan || "Unlimited SIM")}"></label>
              <label class="check"><input name="installApps" type="checkbox" value="finder" ${apps.includes("finder") ? "checked" : ""}> Finder.KL installieren</label><label class="check"><input name="installApps" type="checkbox" value="finster" ${apps.includes("finster") ? "checked" : ""}> Finsta.KL installieren</label><label class="check"><input name="installApps" type="checkbox" value="event" ${apps.includes("event") ? "checked" : ""}> Event-App installieren</label>
              <button class="online-mod-primary wide" type="submit">Smartphone speichern</button>
            </form>
          </article>
          <article class="online-mod-card"><div class="online-mod-card-title"><span>▦</span><div><small>INSTALLIERT</small><h3>Apps auf dem Gerät</h3></div></div><div class="online-mod-chip-list">${apps.length ? apps.map((app) => `<span>${esc(app)}</span>`).join("") : "<span>Keine App-Daten</span>"}</div></article>
          <article class="online-mod-card"><div class="online-mod-card-title"><span>◉</span><div><small>FINSTA.KL</small><h3>Online-Profil & Moderation</h3></div></div><div class="online-mod-data-list"><span><small>Konto</small><b>${save.finster?.accountCreated ? "Erstellt" : "Nicht erstellt"}</b></span><span><small>Benutzername</small><b>@${esc(save.finster?.handle || "–")}</b></span><span><small>Anzeigename</small><b>${esc(save.finster?.displayName || "–")}</b></span><span><small>Feed</small><b>Nur echte Spielerposts</b></span><span><small>Textfilter</small><b>Schimpfwörter maskiert</b></span></div></article>
          <article class="online-mod-card"><div class="online-mod-card-title"><span>♥</span><div><small>FINDER.KL</small><h3>Online-Dating-Profil</h3></div></div><div class="online-mod-data-list"><span><small>App</small><b>${apps.includes("finder") ? "Installiert" : "Nicht installiert"}</b></span><span><small>Online-Profil</small><b>${save.finder?.onlineProfileRegistered ? "Erstellt" : "Nicht erstellt"}</b></span><span><small>Sichtbarkeit</small><b>${save.finder?.onlineVisible ? "Online" : "Offline"}</b></span><span><small>Tarif</small><b>${esc(save.finder?.plan || "free")}</b></span><span><small>Matches</small><b>${safeArray(save.finder?.matches).length}</b></span><span><small>Spieler/Bots</small><b>Im Feed gekennzeichnet</b></span></div></article>
        </section>`;
    }

    if (tab === "workshop") {
      return `
        <section class="online-mod-section-grid two">
          ${has("work.write") ? `<article class="online-mod-card"><div class="online-mod-card-title"><span>🧰</span><div><small>ARBEIT</small><h3>Arbeit & Logistik</h3></div></div><form data-command-form="setWork" class="online-mod-form-grid"><label>Arbeits-Skillpunkte<input name="workSkillPoints" type="number" min="0" value="${num(stats.workSkillPoints || save.workSkillPoints || 0)}"></label><label>Mitarbeiter<input name="logisticsEmployees" type="number" min="0" max="20" value="${num(save.logistics?.employees ?? stats.logisticsEmployees ?? save.logisticsEmployees ?? 0)}"></label><label>Logistik-Skillpunkte<input name="logisticsSkillPoints" type="number" min="0" value="${num(save.logistics?.skillPoints ?? stats.logisticsSkillPoints ?? save.logisticsSkillPoints ?? 0)}"></label><label class="check"><input name="resetWorkedDay" type="checkbox"> Arbeit heute wieder freigeben</label><button class="online-mod-primary wide" type="submit">Arbeit speichern</button></form><div class="online-mod-data-list"><span><small>Automatische Schichten</small><b>${num(save.workStats?.automatic || 0)}</b></span><span><small>Manuelle Ergebnisse</small><b>${num(save.workStats?.manual || 0)}</b></span><span><small>Skill: Zeit</small><b>${num(save.workSkillTree?.time || 0)}/100</b></span><span><small>Skill: Auto-Lohn</small><b>${num(save.workSkillTree?.automatic || 0)}/100</b></span><span><small>Skill: Ausbeute</small><b>${num(save.workSkillTree?.manual || 0)}/100</b></span><span><small>Logistik-Status</small><b>${esc(save.logistics?.stage || "idle")}</b></span></div></article>` : ""}
          ${has("shop.write") ? `<article class="online-mod-card"><div class="online-mod-card-title"><span>🏪</span><div><small>EIGENER SHOP</small><h3>Shop bearbeiten</h3></div></div><form data-command-form="setShop" class="online-mod-form-grid"><label>Gefahr<input name="danger" type="number" min="0" max="100" value="${num(privateData.shop?.danger || save.shop?.danger)}"></label><label>Ruf<input name="reputation" type="number" min="0" max="100" value="${num(privateData.shop?.reputation || save.shop?.reputation || 50)}"></label><label>Lagerstufe<select name="storageLevel"><option value="0">Kein Lager</option><option value="1" ${num(privateData.shop?.storageLevel || save.shop?.storageLevel) === 1 ? "selected" : ""}>500 Items</option><option value="2" ${num(privateData.shop?.storageLevel || save.shop?.storageLevel) === 2 ? "selected" : ""}>1.000 Items</option><option value="3" ${num(privateData.shop?.storageLevel || save.shop?.storageLevel) === 3 ? "selected" : ""}>5.000 Items</option></select></label><label class="check"><input name="owned" type="checkbox" ${privateData.shop?.created || save.shop?.created ? "checked" : ""}> Shop freigeschaltet</label><button class="online-mod-primary wide" type="submit">Shop speichern</button></form></article>` : ""}
        </section>`;
    }

    if (tab === "worldgames") {
      return `
        <section class="online-mod-section-grid two">
          ${has("world.write") ? `<article class="online-mod-card"><div class="online-mod-card-title"><span>🌍</span><div><small>STADTKARTE</small><h3>Ort & Reisen</h3></div></div><form data-command-form="setWorld" class="online-mod-form-grid"><label>Weltort<input name="worldLocation" value="${esc(profile.city || stats.worldLocation || save.worldLocation || "Berlin")}"></label><label>Lokaler Ort<input name="location" value="${esc(stats.location || save.location || "home")}"></label><label class="check"><input name="finishLocalTravel" type="checkbox"> Lokale Fahrt beenden</label><label class="check"><input name="finishWorldTravel" type="checkbox"> Fernreise beenden</label><label class="check"><input name="clearStationBan" type="checkbox"> Bahnhofssperre entfernen</label><button class="online-mod-primary wide" type="submit">Ort speichern</button></form></article>` : ""}
          ${has("games.write") ? `<article class="online-mod-card"><div class="online-mod-card-title"><span>🎮</span><div><small>GAMES</small><h3>Spielwerte & Limits</h3></div></div><form data-command-form="setGame" class="online-mod-form-grid"><label>Kingdom-Münzen<input name="kingdomCoins" type="number" min="0" value="${num(save.kingdomCoins || 10000)}"></label><label>Strong-Rohstoffe<input name="strongResources" type="number" min="0" value="${num(save.strongResources || 10000)}"></label><label class="check wide"><input name="resetLimits" type="checkbox" checked> Game-Limits und Cooldowns zurücksetzen</label><button class="online-mod-primary wide" type="submit">Games speichern</button></form></article>` : ""}
        </section>`;
    }

    if (tab === "moderation") {
      const inspect = canInspectTrust();
      const events = inspect ? safeArray(trust.events) : [];
      const actionLabel = (kind) => ({ giveItem: "Item gegeben", removeItem: "Item entfernt", addMoney: "Geld hinzugefügt", removeMoney: "Geld entfernt", setMoney: "Geldstand gesetzt", setCharacter: "Charakterwerte geändert", setNeeds: "Bedürfnisse geändert", setPhone: "Handy geändert", setWork: "Arbeit geändert", setGame: "Spielwerte geändert", setWorld: "Ort/Reise geändert", setShop: "Shop geändert", setProperty: "Immobilie geändert", resetPlayer: "Spielstand zurückgesetzt" })[kind] || kind || "Statusänderung";
      const eventDetails = inspect && events.length ? `<div class="online-mod-trust-events">${events.slice(0, 20).map((entry) => { const meta = safeObject(entry.meta); const kind = meta.kind || meta.commandKind || entry.kind || entry.action; const detail = [meta.itemName || meta.itemId, meta.amount ? `Anzahl ${meta.amount}` : "", meta.value !== undefined ? `Wert ${meta.value}` : "", meta.target ? `Ziel ${meta.target}` : ""].filter(Boolean).join(" · "); return `<article><b>${entry.type === "hack" ? "Hack-Prüfung" : actionLabel(kind)}</b>${detail ? `<strong>${esc(detail)}</strong>` : ""}<span>${esc(entry.reason || "Ohne Grund")}</span><small>${dateTime(entry.createdAtMs)}${entry.actorRole ? ` · ${esc(ROLE_LABELS[entry.actorRole] || entry.actorRole)}` : ""}</small></article>`; }).join("")}</div>` : "";
      const markHacker = roleRank() >= roleRank("test_moderator") && status !== "hack" ? `<button type="button" class="danger full" data-mark-selected-hacker>Als Hacker markieren</button>` : "";
      const clearMod = isOwnerRole() && status === "mod" ? `<button type="button" class="full" data-clear-selected-mod>Mod-Markierung entfernen</button>` : "";
      const resetHack = has("player.reset") ? `<button type="button" class="danger full" data-reset-selected-player ${status === "hack" ? "" : "disabled"}>Spielstand wegen Hack zurücksetzen</button>` : "";
      return `
        <section class="online-mod-section-grid two">
          <article class="online-mod-card"><div class="online-mod-card-title"><span>⚠</span><div><small>MODERATION</small><h3>Maßnahme durchführen</h3></div></div><form data-moderation-form class="online-mod-form-grid"><label class="wide">Grund<input name="reason" value="Moderationsmaßnahme"></label><label>Dauer in Minuten<input name="minutes" type="number" min="1" value="60"></label><div></div>${has("moderation.kick") ? `<button type="submit" name="mode" value="kick">Kicken</button>` : ""}${has("moderation.timeout") ? `<button type="submit" name="mode" value="timeout">Timeout</button>` : ""}${has("moderation.ban.week") || has("moderation.ban.year") || has("*") ? `<button type="submit" name="mode" value="ban" class="danger">Bannen</button>` : ""}${roleRank() >= roleRank("moderator") ? `<button type="submit" name="mode" value="unban">Entbannen</button>` : ""}</form></article>
          <article class="online-mod-card"><div class="online-mod-card-title"><span>🔎</span><div><small>CHARAKTERSTATUS</small><h3>${esc(characterStatusLabel(status))}</h3></div></div>${status === "clean" ? `<p>Keine serverseitige Mod- oder Hack-Markierung vorhanden.</p>` : inspect ? `<p>${esc(trust.lastReason || "Status wurde serverseitig gespeichert.")}</p>${eventDetails}` : `<p>Der Status ist sichtbar. Einzelheiten dürfen nur Admin und Owner überprüfen.</p>`}<div class="online-mod-actions vertical">${markHacker}${clearMod}${resetHack}</div></article>
        </section>`;
    }

    const topItems = Object.entries(itemCounts).sort((a, b) => num(b[1]) - num(a[1])).slice(0, 12);
    return `
      <section class="online-mod-metric-grid compact">
        ${statCard("LEVEL", String(num(privateData.level ?? profile.level)), `${num(privateData.xp)} EP`)}
        ${statCard("BANKKONTO", euro(privateData.bank), compactNumber(privateData.bank))}
        ${statCard("BARGELD", euro(privateData.cash), compactNumber(privateData.cash))}
        ${statCard("INVENTAR", String(num(privateData.itemCount || Object.values(itemCounts).reduce((sum, value) => sum + num(value), 0))), `${Object.keys(itemCounts).length} Arten`)}
      </section>
      <section class="online-mod-section-grid two">
        <article class="online-mod-card"><div class="online-mod-card-title"><span>♥</span><div><small>STATUS</small><h3>Bedürfnisse</h3></div></div><div class="online-mod-bars">${needBar("Hunger", privateData.hunger)}${needBar("Durst", privateData.thirst)}${needBar("Energie", privateData.energy)}${needBar("Stimmung", privateData.mood)}${needBar("Leben", privateData.health)}</div></article>
        <article class="online-mod-card"><div class="online-mod-card-title"><span>📍</span><div><small>SPIELWELT</small><h3>Aktueller Stand</h3></div></div><div class="online-mod-data-list"><span><small>Stadt</small><b>${esc(profile.city || stats.worldLocation || save.worldLocation || "–")}</b></span><span><small>Ort</small><b>${esc(stats.location || save.location || "–")}</b></span><span><small>Job</small><b>${esc(profile.job || stats.job || save.job || "Kein Job")}</b></span><span><small>Tag / Alter</small><b>Tag ${num(stats.day || save.day || 1)} · ${num(stats.age || save.age || 18)} Jahre</b></span></div></article>
        <article class="online-mod-card"><div class="online-mod-card-title"><span>📦</span><div><small>INVENTAR</small><h3>Häufigste Items</h3></div></div><div class="online-mod-item-summary">${topItems.length ? topItems.map(([name, amount]) => `<span><b>${esc(name)}</b><em>${num(amount)}×</em></span>`).join("") : `<p>Keine Inventardaten vorhanden.</p>`}</div></article>
        <article class="online-mod-card"><div class="online-mod-card-title"><span>📊</span><div><small>STATISTIK</small><h3>Weitere Werte</h3></div></div><div class="online-mod-data-list"><span><small>Immobilien</small><b>${safeArray(save.properties || privateData.properties).length}</b></span><span><small>Kleidung</small><b>${num(stats.wardrobeCount || safeArray(save.wardrobe).length)}</b></span><span><small>Logistik-Mitarbeiter</small><b>${num(stats.logisticsEmployees || save.logisticsEmployees)}</b></span><span><small>Shop-Verkäufe</small><b>${num(stats.shopSales || save.shop?.sales)}</b></span></div></article>
      </section>
      ${canInspectTrust() && status === "hack" && trust.lastReason ? `<section class="online-mod-warning"><b>Hack-Prüfung · ${num(trust.riskScore)}%</b><p>${esc(trust.lastReason)}</p></section>` : ""}`;
  }

  function needInput(label, name, value) {
    return `<label>${esc(label)}<div class="online-mod-number-unit"><input name="${name}" type="number" min="0" max="100" value="${clamp(value, 0, 100)}"><span>%</span></div></label>`;
  }
  function needBar(label, value) {
    const amount = clamp(value, 0, 100);
    return `<div><span><b>${esc(label)}</b><em>${Math.round(amount)}%</em></span><i><u style="width:${amount}%"></u></i></div>`;
  }

  function inventoryTabHtml(itemCounts) {
    buildCatalogRows();
    const selected = itemRows.find((row) => row.id === selectedCatalogItemId) || null;
    const currentRows = Object.entries(itemCounts).sort((a, b) => String(a[0]).localeCompare(String(b[0]), "de"));
    return `
      <section class="online-mod-inventory-layout">
        <article class="online-mod-card online-mod-current-inventory"><div class="online-mod-card-title"><span>🎒</span><div><small>SPIELER-INVENTAR</small><h3>Aktueller Inhalt</h3></div><em>${currentRows.reduce((sum, entry) => sum + num(entry[1]), 0)} Items</em></div><label class="online-mod-search-box small"><span>⌕</span><input data-current-inventory-search placeholder="Inventar durchsuchen"></label><div class="online-mod-current-item-list" data-current-item-list>${renderCurrentInventoryRows(currentRows)}</div></article>
        <article class="online-mod-card online-mod-item-giver"><div class="online-mod-card-title"><span>#</span><div><small>ITEM GEBEN / NEHMEN</small><h3>Katalog durchsuchen</h3></div></div>
          <div class="online-mod-item-toolbar"><label class="online-mod-search-box"><span>⌕</span><input data-player-item-search value="${esc(playerItemSearch)}" placeholder="z. B. Wohnung, Wasser, Smartphone"></label><select data-player-item-category>${categoryOptions(playerItemCategory)}</select></div>
          <div class="online-mod-picker-list" data-player-item-list>${renderPlayerItemRows()}</div>
          <form data-item-command class="online-mod-picked-item ${selected ? "has-item" : ""}">
            <div data-picked-item-info>${selected ? pickedItemHtml(selected) : `<div class="online-mod-empty-state compact"><span>#</span><p>Item aus dem Katalog auswählen.</p></div>`}</div>
            <input type="hidden" name="itemId" value="${esc(selected?.id || "")}"><label>Anzahl<input name="amount" type="number" min="1" max="99" value="1"></label>
            <div class="online-mod-actions"><button type="submit" name="kind" value="giveItem" ${selected ? "" : "disabled"}>Item geben</button><button type="submit" name="kind" value="removeItem" class="danger" ${selected ? "" : "disabled"}>Item nehmen</button><button type="button" data-copy-id="${esc(selected?.id || "")}" ${selected ? "" : "disabled"}>ID kopieren</button></div>
          </form>
        </article>
      </section>`;
  }

  function renderCurrentInventoryRows(rows) {
    return rows.length ? rows.map(([name, amount]) => `<button type="button" data-find-catalog-name="${esc(name)}"><span><b>${esc(name)}</b><small>Im Katalog suchen</small></span><em>${num(amount)}×</em></button>`).join("") : `<div class="online-mod-empty-state compact"><span>📦</span><p>Inventar ist leer oder noch nicht synchronisiert.</p></div>`;
  }

  function buildCatalogRows() {
    if (itemRows.length) return itemRows;
    let rows = [];
    try {
      const registry = typeof buildItemRegistry === "function" ? buildItemRegistry(true) : null;
      if (registry?.values) {
        rows = [...registry.values()].map((record) => {
          const entry = safeObject(record.entry);
          const source = String(record.source || "inventory");
          return {
            id: String(record.id || ""),
            name: String(record.name || entry.item || entry.name || "Unbekannt"),
            source,
            category: categorizeItem(source, record.name, entry),
            meta: {
              itemName: String(entry.item || entry.name || record.name || ""),
              propertyId: String(entry.property?.id || entry.id || ""),
              weaponId: source === "weapon" ? String(entry.id || "") : "",
              wear: !!entry.wear,
              backpackSlots: num(entry.backpackSlots),
              effect: safeObject(entry.effect),
              vehicle: !!entry.vehicle,
              repeatable: !!entry.repeatable
            }
          };
        });
      }
    } catch (error) {
      console.warn("Item-Katalog", error);
    }
    const seen = new Set();
    itemRows = rows.filter((row) => row.id && !seen.has(row.id.toLowerCase()) && seen.add(row.id.toLowerCase())).sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category); const cb = CATEGORY_ORDER.indexOf(b.category);
      return (ca < 0 ? 999 : ca) - (cb < 0 ? 999 : cb) || a.name.localeCompare(b.name, "de");
    });
    return itemRows;
  }

  function categorizeItem(source, name, entry = {}) {
    const text = `${source} ${name} ${entry.item || ""}`.toLowerCase();
    if (source === "property" || entry.property) return "Wohnung & Immobilien";
    if (source === "furniture") return "Möbel & Haushalt";
    if (source === "weapon") return "Waffen";
    if (source === "blackmarket") return "Schwarzmarkt";
    if (/shop:(beverages|snacks|groceries|pharmacy)/.test(source) || entry.effect) return "Essen & Trinken";
    if (/shop:clothing/.test(source) || entry.wear) return "Kleidung";
    if (/shop:(smartphone|phonecredit|computer)/.test(source) || /smartphone|handy|laptop|computer|gaming-pc|powerbank|guthaben/.test(text)) return "Technik & Handy";
    if (/shop:(usedcars|newcars)/.test(source) || entry.vehicle || /auto|wagen|suv|limousine|fahrzeug|boot|yacht/.test(text)) return "Fahrzeuge";
    if (/shop:backpacks/.test(source) || entry.backpackSlots || /rucksack/.test(text)) return "Rucksäcke";
    if (/führerschein|reisepass|sim|bauplanung|bauteam|dokument/.test(text)) return "Dokumente & SIM";
    if (/wohnung|haus|apartment|villa|immobil/.test(text)) return "Wohnung & Immobilien";
    if (/tisch|stuhl|bett|sofa|schrank|lampe|küche|möbel/.test(text)) return "Möbel & Haushalt";
    return "Sonstiges";
  }

  function categoryOptions(selected = "all") {
    const counts = categoryCounts();
    return `<option value="all">Alle Kategorien (${itemRows.length})</option>${CATEGORY_ORDER.filter((category) => counts[category]).map((category) => `<option value="${esc(category)}" ${selected === category ? "selected" : ""}>${CATEGORY_ICONS[category]} ${esc(category)} (${counts[category]})</option>`).join("")}`;
  }
  function categoryCounts() {
    return itemRows.reduce((result, row) => { result[row.category] = (result[row.category] || 0) + 1; return result; }, {});
  }
  function filteredCatalog(query = "", category = "all") {
    const needle = String(query || "").trim().toLowerCase();
    return itemRows.filter((row) => (category === "all" || row.category === category) && (!needle || `${row.name} ${row.id} ${row.source} ${row.category}`.toLowerCase().includes(needle)));
  }
  function renderPlayerItemRows() {
    const rows = filteredCatalog(playerItemSearch, playerItemCategory).slice(0, 160);
    return rows.length ? rows.map((row) => `<button type="button" class="${selectedCatalogItemId === row.id ? "active" : ""}" data-pick-item="${esc(row.id)}"><span>${CATEGORY_ICONS[row.category] || "📦"}</span><div><b>${esc(row.name)}</b><small>${esc(row.category)}</small></div><code>${esc(row.id)}</code></button>`).join("") : `<div class="online-mod-empty-state compact"><span>⌕</span><p>Kein Item gefunden.</p></div>`;
  }
  function pickedItemHtml(row) {
    return `<span>${CATEGORY_ICONS[row.category] || "📦"}</span><div><small>${esc(row.category)}</small><b>${esc(row.name)}</b><code>${esc(row.id)}</code></div>`;
  }

  async function queueCommand(command, reason) {
    if (!selectedPlayer?.uid) throw new Error("Bitte zuerst einen Spieler auswählen.");
    return callFunction("staffAction", { action: "queueCommand", targetUid: selectedPlayer.uid, slot: selectedPlayerSlot(), command, reason });
  }

  async function renderTicketsPanel() {
    content().innerHTML = `
      ${pageHead("SUPPORT-ZENTRALE", "Tickets bearbeiten", "Offene Anfragen übernehmen, beantworten, lösen oder im Support-Speicher nachsehen.", `<button type="button" data-load-tickets>↻ Aktualisieren</button>`)}
      <section class="online-mod-ticket-workspace">
        <aside class="online-mod-ticket-browser">
          <div class="online-mod-ticket-mode"><button type="button" data-ticket-mode="active" class="${!ticketArchive ? "active" : ""}">Aktive Tickets</button>${has("tickets.all") ? `<button type="button" data-ticket-mode="archive" class="${ticketArchive ? "active" : ""}">Support-Speicher</button>` : ""}</div>
          <label class="online-mod-search-box"><span>⌕</span><input data-ticket-search value="${esc(ticketSearch)}" placeholder="Betreff, Spieler oder Kategorie"></label>
          <select class="online-mod-full-select" data-ticket-status><option value="all">Alle Status</option><option value="open" ${ticketStatus === "open" ? "selected" : ""}>Offen</option><option value="assigned" ${ticketStatus === "assigned" ? "selected" : ""}>Übernommen</option><option value="waiting_player" ${ticketStatus === "waiting_player" ? "selected" : ""}>Wartet auf Spieler</option><option value="resolved" ${ticketStatus === "resolved" ? "selected" : ""}>Gelöst</option><option value="closed" ${ticketStatus === "closed" ? "selected" : ""}>Geschlossen</option></select>
          <div class="online-mod-ticket-stats" data-ticket-stats></div>
          <div class="online-mod-ticket-list" data-ticket-list><p>Lade Tickets …</p></div>
        </aside>
        <div class="online-mod-ticket-detail" data-ticket-detail><div class="online-mod-empty-state"><span>🎫</span><h3>Ticket auswählen</h3><p>Links eine Anfrage anklicken, um den Verlauf und die Bearbeitung zu öffnen.</p></div></div>
      </section>`;
    await loadTickets(ticketArchive);
  }

  async function loadTickets(archive = ticketArchive) {
    ticketArchive = !!archive;
    const list = content().querySelector("[data-ticket-list]");
    if (!list) return;
    list.innerHTML = `<div class="online-mod-loading"><i></i><p>Lade Tickets …</p></div>`;
    try {
      const response = await callFunction("listSupportTickets", { archive: ticketArchive });
      tickets = Array.isArray(response.tickets) ? response.tickets : [];
      selectedTicket = selectedTicket && tickets.find((ticket) => ticket.id === selectedTicket.id) || null;
      renderTicketList();
      if (selectedTicket) renderTicketDetail(selectedTicket);
    } catch (error) {
      list.innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  function filteredTickets() {
    const needle = ticketSearch.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (ticketStatus !== "all" && String(ticket.status || "open") !== ticketStatus) return false;
      return !needle || [ticket.subject, ticket.ownerName, ticket.ownerEmail, ticket.category, ticket.id].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }

  function ticketStatusLabel(status) {
    return ({ open: "Offen", assigned: "Übernommen", waiting_player: "Wartet auf Spieler", waiting_staff: "Wartet auf Team", resolved: "Gelöst", closed: "Geschlossen" })[status] || status || "Offen";
  }

  function renderTicketList() {
    const list = content().querySelector("[data-ticket-list]");
    const stats = content().querySelector("[data-ticket-stats]");
    if (!list) return;
    const shown = filteredTickets();
    const open = tickets.filter((ticket) => ticket.status === "open").length;
    const assigned = tickets.filter((ticket) => ticket.status === "assigned" || ticket.status === "waiting_player").length;
    if (stats) stats.innerHTML = `<span><b>${tickets.length}</b><small>Gesamt</small></span><span><b>${open}</b><small>Offen</small></span><span><b>${assigned}</b><small>In Arbeit</small></span>`;
    list.innerHTML = shown.length ? shown.map((ticket) => {
      const messages = safeArray(ticket.messages);
      return `<button type="button" class="online-mod-ticket-row ${selectedTicket?.id === ticket.id ? "active" : ""}" data-select-ticket="${esc(ticket.id)}"><span class="online-mod-ticket-priority ${ticket.priority || "normal"}"></span><div><b>${esc(ticket.subject || "Support-Ticket")}</b><small>${esc(ticket.ownerName || ticket.ownerEmail || "Spieler")} · ${esc(ticket.category || "Allgemein")}</small><em>${messages.length} Nachrichten · ${relativeTime(ticket.updatedAtMs)}</em></div><i class="status-${esc(ticket.status || "open")}">${esc(ticketStatusLabel(ticket.status))}</i></button>`;
    }).join("") : `<div class="online-mod-empty-state compact"><span>🎫</span><p>Keine passenden Tickets vorhanden.</p></div>`;
  }

  function renderTicketDetail(ticket) {
    selectedTicket = ticket;
    renderTicketList();
    const detail = content().querySelector("[data-ticket-detail]");
    if (!detail) return;
    const messages = safeArray(ticket.messages);
    const archived = !!ticket.deleted || ["resolved", "closed"].includes(ticket.status);
    detail.innerHTML = `
      <section class="online-mod-ticket-hero"><div><small>${esc(ticket.category || "Allgemein")}</small><h2>${esc(ticket.subject || "Support-Ticket")}</h2><p>${esc(ticket.ownerName || ticket.ownerEmail || ticket.ownerUid || "Spieler")}</p></div><span class="online-mod-ticket-status status-${esc(ticket.status || "open")}">${esc(ticketStatusLabel(ticket.status))}</span></section>
      <div class="online-mod-ticket-meta"><span><small>Ticket-ID</small><code>${esc(ticket.id)}</code></span><span><small>Erstellt</small><b>${dateTime(ticket.createdAtMs)}</b></span><span><small>Bearbeiter</small><b>${esc(ticket.assignedToName || "Noch niemand")}</b></span></div>
      <div class="online-mod-ticket-thread">${messages.length ? messages.map((entry) => `<article class="${entry.senderRole === "player" ? "player" : "staff"}"><header><b>${esc(entry.senderName || entry.senderRole || "Unbekannt")}</b><small>${dateTime(entry.createdAtMs)}</small></header><p>${esc(entry.text || "")}</p></article>`).join("") : `<div class="online-mod-empty-state compact"><p>Noch keine Nachrichten.</p></div>`}</div>
      <form data-ticket-reply-form class="online-mod-ticket-reply"><label>Antwort<textarea name="text" maxlength="2000" placeholder="Antwort an den Spieler schreiben …"></textarea></label><div class="online-mod-actions">${!archived ? `<button type="button" data-ticket-action="claim">Übernehmen</button><button class="online-mod-primary" type="submit">Antwort senden</button><button type="button" data-ticket-action="resolve">Als gelöst markieren</button>` : `<button type="button" data-ticket-action="reopen">Ticket wieder öffnen</button>`}${has("tickets.delete") ? `<button type="button" class="danger" data-ticket-action="${archived ? "purge" : "delete"}">${archived ? "Dauerhaft löschen" : "In Speicher verschieben"}</button>` : ""}</div><p class="online-mod-message" data-ticket-message></p></form>`;
  }

  async function renderEventsPanel() {
    buildCatalogRows();
    content().innerHTML = `
      ${pageHead("EVENT-VERWALTUNG", "Event-Zentrale", "Event entwerfen, live starten, Preise festlegen und anschließend beenden.")}
      <section class="online-mod-event-layout">
        <form data-event-form class="online-mod-card online-mod-event-form">
          <div class="online-mod-card-title"><span>🏆</span><div><small>EVENT-DATEN</small><h3>Planung</h3></div></div>
          <div class="online-mod-form-grid"><label>Titel<input name="title" maxlength="80" required></label><label>Gewinnerplätze<input name="maxWinners" type="number" min="1" max="100" value="1"></label><label class="wide">Beschreibung<textarea name="description" maxlength="600"></textarea></label><label class="wide">Aufgabe<textarea name="task" maxlength="600" placeholder="Was sollen die Spieler machen?"></textarea></label><label>Event-Ziel<select name="criterionType"><option value="item">Item zuerst erhalten/kaufen</option><option value="achievement">Erfolg freischalten</option><option value="level">Level erreichen</option><option value="money">Geldwert erreichen</option><option value="manual">Manuell prüfen</option></select></label><label>Zielwert / Anzahl<input name="criterionValue" type="number" min="1" value="1"></label><label class="wide">Ziel-Item oder Erfolg<input name="criterionTarget" list="event-target-catalog" placeholder="Item-ID oder Erfolgs-ID auswählen/eingeben"><datalist id="event-target-catalog">${itemRows.slice(0,600).map((row) => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join("")}</datalist></label><label class="wide">Nachweis-Hinweis<input name="proofHint" maxlength="240"></label><label>Start<input name="startsAt" type="datetime-local"></label><label>Ende<input name="endsAt" type="datetime-local"></label><label>Geldpreis<input name="rewardMoney" type="number" min="0" value="0"></label><div></div><label class="wide">Item-Preise<textarea name="rewardItems" placeholder="ITEM-ID | Anzahl | Name – eine Zeile pro Item"></textarea></label></div>
          <div class="online-mod-actions"><button type="submit" name="eventAction" value="save">Entwurf speichern</button><button class="online-mod-primary" type="submit" name="eventAction" value="start">Event starten</button><button type="submit" name="eventAction" value="end">Beenden</button><button type="submit" class="danger" name="eventAction" value="clear">Löschen</button></div><p class="online-mod-message" data-event-message></p>
        </form>
        <aside class="online-mod-card online-mod-event-items"><div class="online-mod-card-title"><span>#</span><div><small>PREIS-KATALOG</small><h3>Item hinzufügen</h3></div></div><label class="online-mod-search-box"><span>⌕</span><input data-event-item-search value="${esc(eventItemSearch)}" placeholder="Preis-Item suchen"></label><div class="online-mod-event-item-list" data-event-item-list>${renderEventItemRows()}</div></aside>
      </section>`;
    try {
      const fb = await runtime();
      const snap = await fb.getDoc(fb.doc(fb.db, "events", "current"));
      if (snap.exists()) fillEventForm(snap.data());
    } catch (error) {
      const message = content().querySelector("[data-event-message]");
      if (message) message.textContent = error.message;
    }
  }

  function renderEventItemRows() {
    const rows = filteredCatalog(eventItemSearch, "all").slice(0, 100);
    return rows.map((row) => `<button type="button" data-add-event-item="${esc(row.id)}"><span>${CATEGORY_ICONS[row.category] || "📦"}</span><div><b>${esc(row.name)}</b><small>${esc(row.id)}</small></div><em>+</em></button>`).join("") || `<div class="online-mod-empty-state compact"><p>Kein Item gefunden.</p></div>`;
  }

  function fillEventForm(event) {
    const form = content().querySelector("[data-event-form]");
    if (!form) return;
    for (const key of ["title", "description", "task", "proofHint", "rewardMoney", "maxWinners"]) if (form.elements[key]) form.elements[key].value = event[key] ?? "";
    const localDateTime = (ms) => ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    form.elements.startsAt.value = localDateTime(event.startsAtMs);
    form.elements.endsAt.value = localDateTime(event.endsAtMs);
    if (form.elements.criterionType) form.elements.criterionType.value = event.criterion?.type || "item";
    if (form.elements.criterionTarget) form.elements.criterionTarget.value = event.criterion?.itemId || event.criterion?.achievementId || event.criterion?.label || "";
    if (form.elements.criterionValue) form.elements.criterionValue.value = event.criterion?.type === "item" ? (event.criterion?.amount || 1) : (event.criterion?.value || 1);
    form.elements.rewardItems.value = safeArray(event.rewardItems).map((item) => `${item.itemId || ""} | ${item.amount || 1} | ${item.label || ""}`).join("\n");
  }

  function parseRewardItems(text) {
    return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [itemId = "", amount = "1", label = ""] = line.split("|").map((part) => part.trim());
      return { itemId, amount: Math.max(1, Math.min(999, Math.round(num(amount, 1)))), label: label || itemId };
    }).filter((item) => item.itemId);
  }

  function renderIdsPanel() {
    buildCatalogRows();
    const counts = categoryCounts();
    content().innerHTML = `
      ${pageHead("ITEM-KATALOG", "Item-IDs", "Nach Kategorien sortiert suchen, IDs kopieren und die gewünschte Ware schnell finden.")}
      <section class="online-mod-id-overview">${CATEGORY_ORDER.filter((category) => counts[category]).map((category) => `<button type="button" class="${idCategory === category ? "active" : ""}" data-id-category="${esc(category)}"><span>${CATEGORY_ICONS[category]}</span><div><b>${esc(category)}</b><small>${counts[category]} Einträge</small></div></button>`).join("")}</section>
      <section class="online-mod-card online-mod-id-card">
        <div class="online-mod-id-toolbar"><label class="online-mod-search-box"><span>⌕</span><input data-id-search value="${esc(idSearch)}" placeholder="Name oder ID suchen – z. B. Wohnung"></label><select data-id-category-select>${categoryOptions(idCategory)}</select><label class="online-mod-switch"><input type="checkbox" data-id-overlay-toggle ${document.body.classList.contains("mod-item-ids-visible") ? "checked" : ""}><span>IDs im Spiel anzeigen</span></label></div>
        <div class="online-mod-id-result-head"><b data-id-result-count></b><button type="button" data-id-category="all">Alle anzeigen</button></div>
        <div class="online-mod-id-list" data-id-list></div>
      </section>`;
    renderIdRows();
  }

  function renderIdRows() {
    const list = content().querySelector("[data-id-list]");
    const count = content().querySelector("[data-id-result-count]");
    if (!list) return;
    const rows = filteredCatalog(idSearch, idCategory).slice(0, 600);
    if (count) count.textContent = `${rows.length} von ${itemRows.length} Item-IDs`;
    list.innerHTML = rows.length ? rows.map((row) => `<article class="online-mod-id-row"><span>${CATEGORY_ICONS[row.category] || "📦"}</span><div><small>${esc(row.category)}</small><b>${esc(row.name)}</b><code>${esc(row.id)}</code></div><div class="online-mod-id-actions"><button type="button" data-copy-id="${esc(row.id)}">ID kopieren</button>${selectedPlayer && has("items.write") ? `<button type="button" data-use-item-player="${esc(row.id)}">Beim Spieler</button>` : ""}</div></article>`).join("") : `<div class="online-mod-empty-state"><span>⌕</span><h3>Nichts gefunden</h3><p>Suchbegriff oder Kategorie ändern.</p></div>`;
  }

  async function renderStaffPanel() {
    content().innerHTML = `${pageHead("TEAM", "Teamverwaltung", "Rollen ansehen, verändern oder deaktivieren.", `<button type="button" data-refresh-staff>↻ Aktualisieren</button>`)}<section class="online-mod-card"><div data-staff-list><div class="online-mod-loading"><i></i><p>Lade Team …</p></div></div></section>`;
    try {
      const response = await callFunction("listStaffMembers", {});
      const members = response.members || [];
      content().querySelector("[data-staff-list]").innerHTML = members.length ? members.map((member) => `<form data-staff-member="${esc(member.uid)}" class="online-mod-staff-row"><div class="online-mod-avatar small">${esc((member.roleLabel || member.role || "T").slice(0, 1))}</div><div><b>${esc(member.roleLabel || member.role)}</b><small>${esc(member.uid)}</small></div><select name="role" ${member.isOwner ? "disabled" : ""}>${member.isOwner ? `<option value="owner" selected>Owner</option>` : ROLE_ORDER.filter((role) => role !== "owner").map((role) => `<option value="${role}" ${member.role === role ? "selected" : ""}>${ROLE_LABELS[role]}</option>`).join("")}</select><label class="check"><input type="checkbox" name="active" ${member.active ? "checked" : ""} ${member.isOwner ? "disabled" : ""}> Aktiv</label><div class="online-mod-staff-actions"><button type="submit" ${member.isOwner ? "disabled" : ""}>Speichern</button>${member.isOwner ? "" : `<button type="button" data-reset-staff-pin="${esc(member.uid)}">KL-Code neu</button>`}</div><div class="online-mod-secret online-mod-staff-pin-result" data-staff-pin-result="${esc(member.uid)}" hidden></div></form>`).join("") : `<div class="online-mod-empty-state"><p>Noch keine Teammitglieder.</p></div>`;
    } catch (error) {
      content().querySelector("[data-staff-list]").innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  async function renderOwnerPanel() {
    content().innerHTML = `
      ${pageHead("OWNER", "Rollencodes", "Einmalige Codes erstellen und letzte Einladungen kontrollieren.")}
      <section class="online-mod-section-grid two"><article class="online-mod-card"><div class="online-mod-card-title"><span>🔑</span><div><small>NEUER CODE</small><h3>Rolle freischalten</h3></div></div><form data-create-invite class="online-mod-form-grid"><label>Rolle<select name="role">${ROLE_ORDER.filter((role) => role !== "owner").map((role) => `<option value="${role}">${ROLE_LABELS[role]}</option>`).join("")}</select></label><label>Gültig in Stunden<input name="validHours" type="number" min="1" max="720" value="168"></label><label class="wide">Notiz<input name="note" maxlength="160"></label><button class="online-mod-primary wide" type="submit">Code erstellen</button><p class="online-mod-message wide" data-invite-message></p><div class="online-mod-secret wide" data-created-code hidden></div></form></article><article class="online-mod-card"><div class="online-mod-card-title"><span>☷</span><div><small>VERLAUF</small><h3>Letzte Codes</h3></div></div><div data-invite-list><div class="online-mod-loading"><i></i><p>Lade Codes …</p></div></div></article></section>
      <section class="online-mod-card"><div class="online-mod-card-title"><span>🛡</span><div><small>OWNER-SITZUNG</small><h3>Eigenen KL-Sitzungscode erneuern</h3></div></div><p>Hier kannst du einen neuen persönlichen Sitzungscode erzeugen. Der bisherige Code wird dadurch sofort ungültig.</p><div class="online-mod-actions"><button type="button" class="online-mod-primary" data-owner-reset-session-pin>Neuen KL-Sitzungscode erstellen</button></div><p class="online-mod-message" data-owner-session-message></p><div class="online-mod-secret" data-owner-session-result hidden></div></section>`;
    await loadInvites();
  }

  async function loadInvites() {
    const target = content().querySelector("[data-invite-list]");
    if (!target) return;
    try {
      const response = await callFunction("listStaffInvites", {});
      target.innerHTML = (response.invites || []).map((invite) => `<div class="online-mod-invite-row"><span>${invite.used ? "✓" : "🔑"}</span><div><b>${esc(invite.roleLabel || invite.role)}</b><small>${esc(invite.maskedCode || "Code verborgen")}</small><em>${invite.used ? "Bereits benutzt" : `Gültig bis ${dateTime(invite.expiresAtMs)}`}</em></div></div>`).join("") || `<div class="online-mod-empty-state compact"><p>Noch keine Codes erstellt.</p></div>`;
    } catch (error) {
      target.innerHTML = `<p class="online-mod-message error">${esc(error.message)}</p>`;
    }
  }

  function clickedSubmitter(event) {
    return event.submitter || document.activeElement?.closest?.('button[type="submit"]') || null;
  }

  async function copyText(value, button = null) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
    }
    button?.classList.add("copied");
    setTimeout(() => button?.classList.remove("copied"), 900);
    toast("In die Zwischenablage kopiert.");
  }

  async function handleClick(event) {
    const panelButton = event.target.closest("[data-mod-panel]");
    if (panelButton && !panelButton.disabled) {
      activePanel = panelButton.dataset.modPanel;
      renderPanel();
      return;
    }
    if (event.target.closest("[data-mod-close]")) return closeModMenu();
    if (event.target.closest("[data-mod-refresh-role]")) return refreshRoleContext(true);
    if (event.target.closest("[data-mod-close-session]")) {
      try { await callFunction("closeStaffSession", {}); } catch {}
      if (roleData) roleData.activeSessionExpiresAtMs = 0;
      saveBrowserSession(); renderSessionLogin("Sitzung wurde beendet."); return;
    }
    if (event.target.closest("[data-mod-refresh-players]")) return renderPlayersPanel();

    const resetOwnerPinButton = event.target.closest("[data-owner-reset-session-pin]");
    if (resetOwnerPinButton) {
      if (!confirm("Wirklich einen neuen Owner-Sitzungscode erzeugen? Der bisherige KL-Code wird sofort ungültig.")) return;
      const message = content().querySelector("[data-owner-session-message]");
      const box = content().querySelector("[data-owner-session-result]");
      resetOwnerPinButton.disabled = true;
      try {
        const response = await callFunction("bootstrapOwner", {});
        if (!response.sessionPin) throw new Error("Firebase hat keinen Sitzungscode zurückgegeben.");
        if (box) {
          box.hidden = false;
          box.innerHTML = `<small>Dein neuer persönlicher Sitzungscode</small><code>${esc(response.sessionPin)}</code><button type="button" data-copy-id="${esc(response.sessionPin)}">Code kopieren</button>`;
        }
        if (message) { message.textContent = "Neuer Sitzungscode erstellt. Bitte sicher speichern."; message.classList.remove("error"); }
        roleData = { ...roleData, active: true, activeSessionExpiresAtMs: 4102444800000 };
        saveBrowserSession(); updateSettingsEntry(); toast("Neuer KL-Sitzungscode erstellt.");
      } catch (error) {
        if (message) { message.textContent = error.message; message.classList.add("error"); }
        toast(error.message, "error");
      } finally {
        resetOwnerPinButton.disabled = false;
      }
      return;
    }

    const resetStaffPinButton = event.target.closest("[data-reset-staff-pin]");
    if (resetStaffPinButton) {
      const targetUid = resetStaffPinButton.dataset.resetStaffPin;
      if (!confirm("Neuen KL-Sitzungscode für dieses Mitglied erzeugen? Der bisherige Code und eine laufende Sitzung werden sofort ungültig.")) return;
      const box = content().querySelector(`[data-staff-pin-result="${CSS.escape(targetUid)}"]`);
      resetStaffPinButton.disabled = true;
      try {
        const response = await callFunction("resetStaffSessionPin", { targetUid });
        if (!response.sessionPin) throw new Error("Firebase hat keinen Sitzungscode zurückgegeben.");
        if (box) {
          box.hidden = false;
          box.innerHTML = `<small>Neuer persönlicher Sitzungscode für ${esc(response.roleLabel || "Mitglied")}</small><code>${esc(response.sessionPin)}</code><button type="button" data-copy-id="${esc(response.sessionPin)}">Code kopieren</button><em>Nur einmal sichtbar – jetzt sicher weitergeben.</em>`;
        }
        await copyText(response.sessionPin);
        toast("Neuer KL-Code erstellt und kopiert.");
      } catch (error) {
        if (box) { box.hidden = false; box.innerHTML = `<small class="error">${esc(error.message)}</small>`; }
        toast(error.message, "error");
      } finally {
        resetStaffPinButton.disabled = false;
      }
      return;
    }

    const filterButton = event.target.closest("[data-player-filter-value]");
    if (filterButton) { playerFilter = filterButton.dataset.playerFilterValue; content().querySelectorAll("[data-player-filter-value]").forEach((button) => button.classList.toggle("active", button === filterButton)); renderPlayerList(); return; }
    const accountButton = event.target.closest("[data-toggle-account]");
    if (accountButton) { const uid = accountButton.dataset.toggleAccount; expandedAccounts.has(uid) ? expandedAccounts.delete(uid) : expandedAccounts.add(uid); renderPlayerList(); return; }
    const playerButton = event.target.closest("[data-select-player]");
    if (playerButton) return selectPlayer(playerButton.dataset.selectPlayer, num(playerButton.dataset.selectSlot));
    const tabButton = event.target.closest("[data-player-tab]");
    if (tabButton) { playerTab = tabButton.dataset.playerTab; renderPlayerDetail(); return; }
    const needsButton = event.target.closest("[data-fill-needs]");
    if (needsButton) { const form = content().querySelector("[data-needs-form]"); form?.querySelectorAll('input[type="number"]').forEach((input) => { input.value = needsButton.dataset.fillNeeds; }); return; }
    const moneyValue = event.target.closest("[data-set-money-value]");
    if (moneyValue) { const input = content().querySelector('[data-money-command] input[name="value"]'); if (input) input.value = moneyValue.dataset.setMoneyValue; return; }
    const pickItem = event.target.closest("[data-pick-item]");
    if (pickItem) { selectedCatalogItemId = pickItem.dataset.pickItem; renderPlayerDetail(); return; }
    const findName = event.target.closest("[data-find-catalog-name]");
    if (findName) { playerItemSearch = findName.dataset.findCatalogName; playerItemCategory = "all"; const found = filteredCatalog(playerItemSearch, "all")[0]; if (found) selectedCatalogItemId = found.id; renderPlayerDetail(); return; }
    const currentSearch = event.target.closest("[data-current-inventory-search]");
    if (currentSearch) return;

    const copyButton = event.target.closest("[data-copy-id]");
    if (copyButton && !copyButton.disabled) return copyText(copyButton.dataset.copyId, copyButton);
    const useItem = event.target.closest("[data-use-item-player]");
    if (useItem) { selectedCatalogItemId = useItem.dataset.useItemPlayer; playerTab = "inventory"; activePanel = "players"; renderPanel(); if (selectedPlayer?.uid) setTimeout(() => selectPlayer(selectedPlayer.uid, selectedPlayerSlot(), true), 0); return; }
    const idCategoryButton = event.target.closest("[data-id-category]");
    if (idCategoryButton) { idCategory = idCategoryButton.dataset.idCategory; renderIdsPanel(); return; }
    const toggle = event.target.closest("[data-id-overlay-toggle]");
    if (toggle) { document.body.classList.toggle("mod-item-ids-visible", toggle.checked); sessionStorage.setItem(ITEM_ID_DISPLAY_KEY, toggle.checked ? "on" : "off"); return; }

    const ticketMode = event.target.closest("[data-ticket-mode]");
    if (ticketMode) { ticketArchive = ticketMode.dataset.ticketMode === "archive"; selectedTicket = null; return renderTicketsPanel(); }
    if (event.target.closest("[data-load-tickets]")) return loadTickets(ticketArchive);
    const ticketButton = event.target.closest("[data-select-ticket]");
    if (ticketButton) return renderTicketDetail(tickets.find((ticket) => ticket.id === ticketButton.dataset.selectTicket));
    const ticketAction = event.target.closest("[data-ticket-action]");
    if (ticketAction && selectedTicket) {
      if (ticketAction.dataset.ticketAction === "purge" && !confirm("Ticket wirklich dauerhaft löschen?")) return;
      return runTicketAction(ticketAction.dataset.ticketAction);
    }

    const eventItem = event.target.closest("[data-add-event-item]");
    if (eventItem) {
      const row = itemRows.find((item) => item.id === eventItem.dataset.addEventItem);
      const area = content().querySelector('[data-event-form] textarea[name="rewardItems"]');
      if (row && area) { const line = `${row.id} | 1 | ${row.name}`; area.value = area.value.trim() ? `${area.value.trim()}\n${line}` : line; toast(`${row.name} als Preis hinzugefügt.`); }
      return;
    }
    if (event.target.closest("[data-refresh-staff]")) return renderStaffPanel();
    if (event.target.closest("[data-mark-selected-hacker]")) {
      const reason = String(playerActionReason || content().querySelector("[data-player-change-reason]")?.value || "").trim();
      if (reason.length < 4) { content().querySelector("[data-player-change-reason]")?.focus(); return toast("Bitte zuerst einen Grund oder Supportfall eintragen.", "error"); }
      if (!selectedPlayer?.uid || !confirm("Diesen Spieler wirklich als Hack-Charakter markieren?")) return;
      try { await callFunction("staffAction", { action: "markHacker", targetUid: selectedPlayer.uid, slot: selectedPlayerSlot(), reason }); toast("Spieler wurde als Hack-Charakter markiert."); await selectPlayer(selectedPlayer.uid, selectedPlayerSlot(), true); }
      catch (error) { toast(error.message, "error"); }
      return;
    }
    if (event.target.closest("[data-clear-selected-mod]")) {
      if (!selectedPlayer?.uid || !confirm("Mod-Markierung dieses Spielers wirklich entfernen?")) return;
      try { await callFunction("staffAction", { action: "clearModMarker", targetUid: selectedPlayer.uid, slot: selectedPlayerSlot() }); toast("Mod-Markierung wurde entfernt."); await selectPlayer(selectedPlayer.uid, selectedPlayerSlot(), true); }
      catch (error) { toast(error.message, "error"); }
      return;
    }
    if (event.target.closest("[data-reset-selected-player]")) {
      if (!selectedPlayer?.uid || !confirm("Spielstand dieses Spielers wirklich zurücksetzen?")) return;
      return runCommand({ kind: "resetPlayer" });
    }
  }

  function handleInput(event) {
    if (event.target.matches("[data-player-change-reason]")) playerActionReason = event.target.value;
    if (event.target.matches("[data-player-search]")) { playerSearch = event.target.value; renderPlayerList(); }
    if (event.target.matches("[data-player-item-search]")) { playerItemSearch = event.target.value; const list = content().querySelector("[data-player-item-list]"); if (list) list.innerHTML = renderPlayerItemRows(); }
    if (event.target.matches("[data-id-search]")) { idSearch = event.target.value; renderIdRows(); }
    if (event.target.matches("[data-ticket-search]")) { ticketSearch = event.target.value; renderTicketList(); }
    if (event.target.matches("[data-event-item-search]")) { eventItemSearch = event.target.value; const list = content().querySelector("[data-event-item-list]"); if (list) list.innerHTML = renderEventItemRows(); }
    if (event.target.matches("[data-current-inventory-search]")) {
      const needle = event.target.value.toLowerCase().trim();
      content().querySelectorAll("[data-current-item-list] > button").forEach((row) => row.hidden = !!needle && !row.textContent.toLowerCase().includes(needle));
    }
  }

  function handleChange(event) {
    if (event.target.matches("[data-player-sort]")) { playerSort = event.target.value; renderPlayerList(); }
    if (event.target.matches("[data-player-item-category]")) { playerItemCategory = event.target.value; const list = content().querySelector("[data-player-item-list]"); if (list) list.innerHTML = renderPlayerItemRows(); }
    if (event.target.matches("[data-id-category-select]")) { idCategory = event.target.value; renderIdRows(); }
    if (event.target.matches("[data-ticket-status]")) { ticketStatus = event.target.value; renderTicketList(); }
  }

  async function runTicketAction(action, extra = {}) {
    const message = content().querySelector("[data-ticket-message]");
    try {
      await callFunction("ticketAction", { ticketId: selectedTicket.id, action, ...extra });
      if (message) { message.textContent = "Ticket aktualisiert."; message.classList.remove("error"); }
      toast("Ticket wurde aktualisiert.");
      selectedTicket = null;
      await loadTickets(ticketArchive);
    } catch (error) {
      if (message) { message.textContent = error.message; message.classList.add("error"); }
      toast(error.message, "error");
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
      const reasonInput = content().querySelector("[data-player-change-reason]");
      playerActionReason = String(reasonInput?.value || playerActionReason || "").trim();
      if (playerActionReason.length < 4) {
        reasonInput?.focus();
        throw new Error("Bitte zuerst einen Grund oder Supportfall für die Änderung eintragen.");
      }
      const response = await queueCommand(command, playerActionReason);
      const text = response.appliedToCloud
        ? "Änderung wurde direkt im Cloud-Spielstand gespeichert."
        : "Befehl wurde gespeichert und wird beim nächsten Online-Kontakt angewendet.";
      if (message) { message.textContent = text; message.classList.remove("error"); }
      toast(text);
      if (selectedPlayer?.trust && response.characterStatus) selectedPlayer.trust.status = response.characterStatus;
      if (selectedPlayer?.uid) {
        const uid = selectedPlayer.uid;
        setTimeout(() => { if (selectedPlayer?.uid === uid && activePanel === "players") selectPlayer(uid, selectedPlayerSlot(), true).catch(() => {}); }, response.appliedToCloud ? 650 : 1200);
      }
    } catch (error) {
      if (message) { message.textContent = error.message; message.classList.add("error"); }
      toast(error.message, "error");
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const submitter = clickedSubmitter(event);

    if (form.matches("[data-mod-session-form]")) {
      const pin = new FormData(form).get("pin");
      try {
        const response = await callFunction("openStaffSession", { pin });
        roleData = { ...roleData, ...response, active: true };
        saveBrowserSession(); updateSettingsEntry(); activePanel = "home"; renderPanel(); toast("Einstellungs-Sitzung geöffnet.");
      } catch (error) { renderSessionLogin(error.message); }
      return;
    }
    if (form.matches("[data-command-form]")) {
      const command = convertCommandValues({ kind: form.dataset.commandForm, ...formDataObject(form) });
      return runCommand(command);
    }
    if (form.matches("[data-item-command]")) {
      const data = formDataObject(form);
      const row = itemRows.find((item) => item.id === data.itemId);
      if (!row) return toast("Bitte zuerst ein Item auswählen.", "error");
      return runCommand({
        kind: submitter?.value || "giveItem",
        itemId: row.id,
        itemName: row.name,
        itemSource: row.source,
        itemCategory: row.category,
        itemMeta: row.meta,
        amount: Math.max(1, Math.min(99, Math.round(num(data.amount, 1))))
      });
    }
    if (form.matches("[data-money-command]")) {
      const data = formDataObject(form);
      return runCommand({ kind: submitter?.value || "addMoney", target: data.target, value: Math.max(0, Math.round(num(data.value))) });
    }
    if (form.matches("[data-moderation-form]")) {
      const message = content().querySelector("[data-player-action-message]");
      try {
        await callFunction("staffAction", { action: "moderate", targetUid: selectedPlayer.uid, mode: submitter?.value, reason: form.elements.reason.value, minutes: num(form.elements.minutes.value, 60) });
        if (message) { message.textContent = "Moderationsaktion durchgeführt."; message.classList.remove("error"); }
        toast("Moderationsaktion durchgeführt.");
      } catch (error) { if (message) { message.textContent = error.message; message.classList.add("error"); } toast(error.message, "error"); }
      return;
    }
    if (form.matches("[data-ticket-reply-form]")) {
      const text = String(new FormData(form).get("text") || "").trim();
      if (text) await runTicketAction("reply", { text });
      return;
    }
    if (form.matches("[data-event-form]")) {
      const action = submitter?.value || "save";
      const data = formDataObject(form);
      const message = form.querySelector("[data-event-message]");
      try {
        const criterionType = data.criterionType || "manual"; const criterionTarget = String(data.criterionTarget || "").trim(); const criterionRow = itemRows.find((row) => row.id === criterionTarget); const payload = { title: data.title, description: data.description, task: data.task, proofHint: data.proofHint, startsAtMs: data.startsAt ? new Date(data.startsAt).getTime() : 0, endsAtMs: data.endsAt ? new Date(data.endsAt).getTime() : 0, rewardMoney: num(data.rewardMoney), maxWinners: num(data.maxWinners, 1), rewardItems: parseRewardItems(data.rewardItems), criterion: { type: criterionType, itemId: criterionType === "item" ? criterionTarget : "", achievementId: criterionType === "achievement" ? criterionTarget : "", label: criterionRow?.name || criterionTarget, amount: criterionType === "item" ? Math.max(1, num(data.criterionValue, 1)) : 1, value: ["level", "money"].includes(criterionType) ? Math.max(1, num(data.criterionValue, 1)) : 0 } };
        await callFunction("eventAction", { action, event: payload });
        message.textContent = "Event aktualisiert."; message.classList.remove("error"); toast("Event aktualisiert.");
      } catch (error) { message.textContent = error.message; message.classList.add("error"); toast(error.message, "error"); }
      return;
    }
    if (form.matches("[data-staff-member]")) {
      const data = formDataObject(form);
      try { await callFunction("manageStaffMember", { targetUid: form.dataset.staffMember, role: data.role, active: data.active === true || data.active === "on" }); toast("Teammitglied aktualisiert."); await renderStaffPanel(); }
      catch (error) { toast(error.message, "error"); }
      return;
    }
    if (form.matches("[data-create-invite]")) {
      const data = formDataObject(form);
      const message = form.querySelector("[data-invite-message]");
      const box = form.querySelector("[data-created-code]");
      try {
        const response = await callFunction("createStaffInvite", { role: data.role, validHours: num(data.validHours, 168), note: data.note });
        box.hidden = false; box.innerHTML = `<small>Einmaliger Code</small><code>${esc(response.code)}</code><button type="button" data-copy-id="${esc(response.code)}">Code kopieren</button>`;
        message.textContent = "Code erstellt. Er ist nur einmal verwendbar."; message.classList.remove("error"); toast("Rollencode erstellt."); await loadInvites();
      } catch (error) { message.textContent = error.message; message.classList.add("error"); toast(error.message, "error"); }
    }
  }

  async function refreshRoleContext(force = false) {
    if (!currentUser) return;
    try {
      const response = await callFunction("getStaffContext", { force });
      roleData = response.role || roleData;
      saveBrowserSession(); updateSettingsEntry();
      if (overlay?.classList.contains("show")) {
        overlay.querySelector("[data-mod-role-line]").textContent = `${roleLabel()} · ${currentUser.email || currentUser.uid}`;
        sessionActive() ? renderPanel() : renderSessionLogin();
      }
      toast("Rolle und Sitzung neu geladen.");
    } catch (error) { console.warn("Staff-Kontext", error); toast(error.message, "error"); }
  }

  async function listenRole(user) {
    roleUnsubscribe?.(); roleUnsubscribe = null; roleData = null; selectedPlayer = null; selectedPlayerUid = ""; selectedPlayerSlotIndex = 0; sessionStorage.removeItem(SESSION_KEY); updateSettingsEntry();
    if (!user) return;
    const fb = await runtime();
    roleUnsubscribe = fb.onSnapshot(fb.doc(fb.db, "staffRoles", user.uid), (snapshot) => {
      roleData = snapshot.exists() ? { uid: user.uid, ...snapshot.data() } : null;
      if (roleData?.active) { roleData.permissions ||= ROLE_PERMISSIONS[roleData.role] || []; roleData.roleLabel ||= ROLE_LABELS[roleData.role] || roleData.role; }
      saveBrowserSession(); updateSettingsEntry();
      if (!roleData?.active && overlay?.classList.contains("show")) closeModMenu();
    }, (error) => console.warn("Team-Rolle konnte nicht geladen werden", error));
  }

  async function initialize() {
    window.addEventListener("online", () => { firebaseOnline = true; updateConnectionStatus(); if (activePanel === "home" && overlay?.classList.contains("show")) renderHomePanel(); });
    window.addEventListener("offline", () => { firebaseOnline = false; updateConnectionStatus(); if (activePanel === "home" && overlay?.classList.contains("show")) renderHomePanel(); });
    try {
      if (sessionStorage.getItem(ITEM_ID_DISPLAY_KEY) === "on") document.body.classList.add("mod-item-ids-visible");
      const fb = await runtime();
      fb.onAuthStateChanged(fb.auth, (user) => { currentUser = user; listenRole(user).catch((error) => console.warn(error)); });
    } catch (error) { console.warn("Online-Einstellungsmenü konnte Firebase nicht laden", error); }
  }

  window.LifeBuilderSettingsMenu = { open: openModMenu, close: closeModMenu, getRole: () => roleData, hasPermission: has, refresh: refreshRoleContext, version: VERSION };
  window.LifeBuilderOnlineMod = window.LifeBuilderSettingsMenu;
  initialize();
})();
