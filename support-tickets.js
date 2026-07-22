(() => {
  const VERSION = "2026-07-22-firestore-gamekl-1";
  const FIRESTORE_DATABASE_ID = "gamekl";
  let firebasePromise = null;
  let activeUser = null;
  let ticketRows = [];
  let selectedTicketId = "";

  const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  async function firebase() {
    if (firebasePromise) return firebasePromise;
    firebasePromise = (async () => {
      const [appMod, authMod, dbMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
      ]);
      const config = typeof firebasePhoneConfig !== "undefined" ? firebasePhoneConfig : {
        apiKey: "AIzaSyB0rCUbDhATvtTQNOvJDNZQxK0PChnDK60",
        authDomain: "life-kl.firebaseapp.com",
        projectId: "life-kl",
        storageBucket: "life-kl.firebasestorage.app",
        messagingSenderId: "592179528713",
        appId: "1:592179528713:web:ee9396e2695fcbe31124d8"
      };
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(config);
      return { ...authMod, ...dbMod, auth: authMod.getAuth(app), db: dbMod.getFirestore(app, FIRESTORE_DATABASE_ID) };
    })();
    return firebasePromise;
  }

  function settingsPanel() {
    return document.querySelector("#settingsView .settings-panel");
  }

  function ensureLauncher() {
    const panel = settingsPanel();
    if (!panel || panel.querySelector("[data-support-ticket-launch]")) return;
    const wrap = document.createElement("section");
    wrap.className = "settings-support-card";
    wrap.innerHTML = `
      <div><small>HILFE & SUPPORT</small><b>Support-Ticket</b><p>Fehler, verlorene Gegenstände oder Fragen direkt an das LifeBuilder-Team senden.</p></div>
      <button class="secondary-button" type="button" data-support-ticket-launch>Support-Ticket schreiben</button>`;
    panel.appendChild(wrap);
    wrap.querySelector("[data-support-ticket-launch]").addEventListener("click", openOverlay);
  }

  function ensureOverlay() {
    let overlay = document.querySelector("[data-support-ticket-overlay]");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "support-ticket-overlay";
    overlay.dataset.supportTicketOverlay = "1";
    overlay.innerHTML = `
      <section class="support-ticket-card" role="dialog" aria-modal="true" aria-labelledby="supportTicketTitle">
        <header><div><p class="eyebrow">LifeBuilder Support</p><h2 id="supportTicketTitle">Support-Tickets</h2></div><button class="icon-button" type="button" data-support-close>×</button></header>
        <div class="support-ticket-layout">
          <aside>
            <button class="primary-button" type="button" data-support-new>+ Neues Ticket</button>
            <div class="support-ticket-list" data-support-list><p>Noch keine Tickets geladen.</p></div>
          </aside>
          <main data-support-main>
            <div class="support-ticket-empty"><h3>Ticket auswählen</h3><p>Öffne ein vorhandenes Ticket oder erstelle ein neues.</p></div>
          </main>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-support-close]").addEventListener("click", () => overlay.classList.remove("show"));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.classList.remove("show"); });
    overlay.querySelector("[data-support-new]").addEventListener("click", renderNewTicket);
    return overlay;
  }

  async function requireUser() {
    const fb = await firebase();
    if (fb.auth.currentUser) {
      if (window.LifeBuilderOnline?.verifyDatabase) await window.LifeBuilderOnline.verifyDatabase();
      return fb.auth.currentUser;
    }
    if (window.LifeBuilderOnline?.showLogin) {
      window.LifeBuilderOnline.showLogin();
      throw new Error("Bitte zuerst im LifeBuilder-Account anmelden.");
    }
    throw new Error("Bitte zuerst im LifeBuilder-Account anmelden.");
  }

  async function openOverlay() {
    const overlay = ensureOverlay();
    overlay.classList.add("show");
    const main = overlay.querySelector("[data-support-main]");
    main.innerHTML = `<div class="support-ticket-empty"><h3>Tickets werden geladen …</h3></div>`;
    try {
      activeUser = await requireUser();
      await loadTickets();
      if (selectedTicketId && ticketRows.some((ticket) => ticket.id === selectedTicketId)) renderTicket(selectedTicketId);
      else renderNewTicket();
    } catch (error) {
      main.innerHTML = `<div class="support-ticket-empty"><h3>Anmeldung erforderlich</h3><p>${esc(error.message || error)}</p><button class="primary-button" data-support-login>Anmelden</button></div>`;
      main.querySelector("[data-support-login]")?.addEventListener("click", () => window.LifeBuilderOnline?.showLogin?.());
    }
  }

  async function loadTickets() {
    const fb = await firebase();
    activeUser ||= await requireUser();
    const queryRef = fb.query(fb.collection(fb.db, "supportTickets"), fb.where("ownerUid", "==", activeUser.uid));
    const snapshot = await fb.getDocs(queryRef);
    ticketRows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    ticketRows.sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
    renderList();
  }

  function statusLabel(status) {
    return ({ open: "Offen", assigned: "In Bearbeitung", waiting_player: "Antwort nötig", resolved: "Gelöst", closed: "Geschlossen" })[status] || "Offen";
  }

  function renderList() {
    const list = ensureOverlay().querySelector("[data-support-list]");
    list.innerHTML = ticketRows.length ? ticketRows.map((ticket) => `
      <button type="button" class="support-ticket-row ${ticket.id === selectedTicketId ? "active" : ""}" data-support-ticket-id="${esc(ticket.id)}">
        <span><b>${esc(ticket.subject || "Support-Ticket")}</b><small>${esc(ticket.category || "Allgemein")} · ${new Date(Number(ticket.updatedAtMs || ticket.createdAtMs || Date.now())).toLocaleString("de-DE")}</small></span>
        <em class="status-${esc(ticket.status || "open")}">${statusLabel(ticket.status)}</em>
      </button>`).join("") : `<p class="support-ticket-none">Du hast noch kein Support-Ticket erstellt.</p>`;
    list.querySelectorAll("[data-support-ticket-id]").forEach((button) => button.addEventListener("click", () => renderTicket(button.dataset.supportTicketId)));
  }

  function renderNewTicket() {
    selectedTicketId = "";
    renderList();
    const main = ensureOverlay().querySelector("[data-support-main]");
    main.innerHTML = `
      <form class="support-ticket-form" data-support-new-form>
        <div><p class="eyebrow">Neues Ticket</p><h3>Was ist passiert?</h3></div>
        <label>Bereich<select name="category"><option>Allgemein</option><option>Account</option><option>Inventar</option><option>Shop</option><option>Event</option><option>Smartphone</option><option>Arbeit & Games</option><option>Stadtkarte & Flughafen</option><option>Bug / Fehler</option></select></label>
        <label>Priorität<select name="priority"><option value="normal">Normal</option><option value="high">Wichtig</option><option value="urgent">Dringend</option></select></label>
        <label>Betreff<input name="subject" maxlength="100" required placeholder="Kurzer Titel"></label>
        <label>Beschreibung<textarea name="body" maxlength="2000" required placeholder="Beschreibe möglichst genau, was passiert ist und was du davor gemacht hast."></textarea></label>
        <button class="primary-button" type="submit">Ticket absenden</button>
        <p data-support-form-message></p>
      </form>`;
    main.querySelector("[data-support-new-form]").addEventListener("submit", createTicket);
  }

  async function createTicket(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector("[data-support-form-message]");
    const data = new FormData(form);
    const subject = String(data.get("subject") || "").trim();
    const body = String(data.get("body") || "").trim();
    if (!subject || !body) return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    message.textContent = "Ticket wird gespeichert …";
    try {
      const fb = await firebase();
      const user = await requireUser();
      const now = Date.now();
      const ref = await fb.addDoc(fb.collection(fb.db, "supportTickets"), {
        ownerUid: user.uid,
        ownerName: user.displayName || user.email || "Spieler",
        ownerEmail: user.email || "",
        category: String(data.get("category") || "Allgemein").slice(0, 60),
        priority: ["normal", "high", "urgent"].includes(String(data.get("priority"))) ? String(data.get("priority")) : "normal",
        subject: subject.slice(0, 100),
        status: "open",
        assignedToUid: "",
        assignedToName: "",
        messages: [{ senderUid: user.uid, senderName: user.displayName || user.email || "Spieler", senderRole: "player", text: body.slice(0, 2000), createdAtMs: now }],
        createdAtMs: now,
        updatedAtMs: now,
        version: VERSION,
        deleted: false
      });
      selectedTicketId = ref.id;
      await loadTickets();
      renderTicket(ref.id);
    } catch (error) {
      const raw = String(error?.message || error || "");
      message.textContent = /database.*does not exist/i.test(raw)
        ? `Ticket nicht gespeichert: Die Firestore-Datenbank ${FIRESTORE_DATABASE_ID} fehlt oder ist nicht erreichbar.`
        : raw.includes("permission-denied")
          ? "Ticket nicht gespeichert: Die Firestore-Regeln erlauben den Zugriff noch nicht."
          : `Ticket nicht gespeichert: ${raw}`;
    } finally {
      button.disabled = false;
    }
  }

  function renderTicket(ticketId) {
    const ticket = ticketRows.find((entry) => entry.id === ticketId);
    if (!ticket) return renderNewTicket();
    selectedTicketId = ticketId;
    renderList();
    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    const canReply = !["closed"].includes(ticket.status);
    const main = ensureOverlay().querySelector("[data-support-main]");
    main.innerHTML = `
      <section class="support-ticket-detail">
        <header><div><p class="eyebrow">${esc(ticket.category || "Allgemein")}</p><h3>${esc(ticket.subject || "Support-Ticket")}</h3><small>Ticket ${esc(ticket.id.slice(0, 8))} · ${statusLabel(ticket.status)}</small></div><span class="support-priority ${esc(ticket.priority || "normal")}">${esc(ticket.priority || "normal")}</span></header>
        <div class="support-ticket-thread">${messages.map((entry) => `<article class="${entry.senderRole === "player" ? "player" : "staff"}"><b>${esc(entry.senderName || (entry.senderRole === "player" ? "Spieler" : "Support"))}</b><p>${esc(entry.text || "")}</p><small>${new Date(Number(entry.createdAtMs || Date.now())).toLocaleString("de-DE")}</small></article>`).join("")}</div>
        ${canReply ? `<form data-support-reply-form><textarea maxlength="2000" required placeholder="Antwort an den Support …"></textarea><button class="primary-button" type="submit">Antwort senden</button><p data-support-reply-message></p></form>` : `<p class="support-ticket-closed">Dieses Ticket ist geschlossen.</p>`}
      </section>`;
    main.querySelector("[data-support-reply-form]")?.addEventListener("submit", (event) => replyTicket(event, ticket));
    const thread = main.querySelector(".support-ticket-thread");
    if (thread) requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
  }

  async function replyTicket(event, ticket) {
    event.preventDefault();
    const form = event.currentTarget;
    const textarea = form.querySelector("textarea");
    const text = textarea.value.trim();
    if (!text) return;
    const message = form.querySelector("[data-support-reply-message]");
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const fb = await firebase();
      const user = await requireUser();
      const now = Date.now();
      await fb.updateDoc(fb.doc(fb.db, "supportTickets", ticket.id), {
        messages: fb.arrayUnion({ senderUid: user.uid, senderName: user.displayName || user.email || "Spieler", senderRole: "player", text: text.slice(0, 2000), createdAtMs: now }),
        status: "open",
        updatedAtMs: now
      });
      textarea.value = "";
      await loadTickets();
      renderTicket(ticket.id);
    } catch (error) {
      message.textContent = error.message || String(error);
    } finally {
      button.disabled = false;
    }
  }

  const css = document.createElement("style");
  css.textContent = `
    .settings-support-card{display:grid;grid-template-columns:1fr auto;align-items:center;gap:14px;padding:16px;border:1px solid rgba(126,245,198,.22);border-radius:16px;background:linear-gradient(135deg,rgba(126,245,198,.08),rgba(255,232,121,.05))}.settings-support-card small{display:block;color:#7ef5c6;font-weight:900;letter-spacing:.08em}.settings-support-card b{display:block;font-size:1.08rem}.settings-support-card p{margin:.3rem 0 0;color:rgba(255,255,255,.66)}
    .support-ticket-overlay{position:fixed;inset:0;z-index:100020;display:none;place-items:center;padding:16px;background:rgba(0,8,5,.82);backdrop-filter:blur(8px)}.support-ticket-overlay.show{display:grid}.support-ticket-card{width:min(1020px,100%);max-height:min(860px,94dvh);overflow:hidden;border:1px solid rgba(126,245,198,.2);border-radius:22px;background:#10231b;color:#f4fff8;box-shadow:0 30px 90px rgba(0,0,0,.55)}.support-ticket-card>header{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08)}.support-ticket-card>header .icon-button{margin-left:auto}.support-ticket-card h2,.support-ticket-card h3{margin:.1rem 0}.support-ticket-layout{display:grid;grid-template-columns:300px minmax(0,1fr);height:min(700px,calc(94dvh - 92px))}.support-ticket-layout>aside{display:flex;flex-direction:column;gap:12px;padding:16px;border-right:1px solid rgba(255,255,255,.08);overflow:hidden}.support-ticket-list{display:grid;gap:8px;overflow:auto}.support-ticket-row{display:flex;align-items:center;gap:10px;width:100%;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.035);color:inherit;text-align:left}.support-ticket-row.active{border-color:#7ef5c6;background:rgba(126,245,198,.09)}.support-ticket-row span{min-width:0}.support-ticket-row b,.support-ticket-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.support-ticket-row small{margin-top:3px;color:rgba(255,255,255,.55);font-size:.7rem}.support-ticket-row em{margin-left:auto;padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.08);font-size:.65rem;font-style:normal;white-space:nowrap}.support-ticket-layout>main{overflow:auto;padding:20px}.support-ticket-form,.support-ticket-detail{display:grid;gap:14px}.support-ticket-form label{display:grid;gap:6px;font-weight:800}.support-ticket-form input,.support-ticket-form select,.support-ticket-form textarea,.support-ticket-detail textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#091610;color:#fff;font:inherit}.support-ticket-form textarea,.support-ticket-detail textarea{min-height:160px;resize:vertical}.support-ticket-detail>header{display:flex;gap:12px;align-items:flex-start}.support-ticket-detail>header>div{min-width:0}.support-ticket-detail>header small{color:rgba(255,255,255,.58)}.support-priority{margin-left:auto;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-size:.72rem;text-transform:uppercase}.support-priority.high{background:rgba(255,210,91,.16);color:#ffe079}.support-priority.urgent{background:rgba(255,105,97,.17);color:#ff8b84}.support-ticket-thread{display:grid;gap:10px;max-height:420px;overflow:auto;padding-right:4px}.support-ticket-thread article{max-width:84%;padding:12px 14px;border-radius:15px;background:rgba(255,255,255,.06)}.support-ticket-thread article.player{margin-left:auto;background:rgba(126,245,198,.11)}.support-ticket-thread b,.support-ticket-thread small{display:block}.support-ticket-thread p{white-space:pre-wrap}.support-ticket-thread small{color:rgba(255,255,255,.5);font-size:.68rem}.support-ticket-empty{display:grid;place-items:center;min-height:300px;text-align:center;color:rgba(255,255,255,.7)}.support-ticket-none{color:rgba(255,255,255,.55)}
    @media(max-width:720px){.settings-support-card{grid-template-columns:1fr}.support-ticket-layout{grid-template-columns:1fr;height:min(760px,calc(94dvh - 92px))}.support-ticket-layout>aside{max-height:230px;border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}.support-ticket-layout>main{padding:14px}.support-ticket-thread article{max-width:94%}}
  `;
  document.head.appendChild(css);

  window.LifeBuilderSupport = { open: openOverlay };

  document.addEventListener("DOMContentLoaded", () => {
    ensureLauncher();
    firebase().then((fb) => fb.onAuthStateChanged(fb.auth, (user) => { activeUser = user; })).catch(() => {});
  });
})();
