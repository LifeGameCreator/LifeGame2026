(() => {
  "use strict";

  const AM_APP_ID = "aergermensch-kl";
  const AM_VERSION = "2026-07-23-aergermensch-kl-1";
  const AM_DATABASE_ID = "gamekl";
  const AM_COLLECTION = "angerMenschGames";
  const AM_MAX_LOG = 18;
  const AM_BOT_DELAY = 760;

  const AM_COLORS = [
    { id: "rot", label: "Rot", hex: "#ff4d5f", dark: "#7d1724", start: 0, base: [20, 20] },
    { id: "blau", label: "Blau", hex: "#4da3ff", dark: "#164c83", start: 10, base: [80, 20] },
    { id: "gelb", label: "Gelb", hex: "#ffd84d", dark: "#826b13", start: 20, base: [80, 80] },
    { id: "gruen", label: "Grün", hex: "#45d58a", dark: "#17643f", start: 30, base: [20, 80] }
  ];

  const AM_EXTRAS = [
    { id: "shield", cost: 1, icon: "◈", label: "Schutzschild", text: "Schützt eine eigene Figur bis zu deinem nächsten Zug vor Rauswurf und Extras.", target: "ownPawn" },
    { id: "reroll", cost: 2, icon: "↻", label: "Nochmal würfeln", text: "Verwirf den aktuellen Wurf und würfle sofort neu.", target: "instant" },
    { id: "turbo", cost: 3, icon: "+2", label: "Turbo-Schritt", text: "Erhöht deinen aktuellen Wurf um 2, höchstens auf 6.", target: "instant" },
    { id: "skip", cost: 4, icon: "Ⅱ", label: "Runde aussetzen", text: "Ein ausgewählter Gegner muss seinen nächsten Zug aussetzen.", target: "player" },
    { id: "reverse", cost: 5, icon: "⇤", label: "Rückwärtsgang", text: "Schiebt eine gegnerische Figur vier Felder zurück.", target: "enemyPawn" },
    { id: "swap", cost: 6, icon: "⇄", label: "Platztausch", text: "Tausche eine eigene Figur auf der Strecke mit einer gegnerischen Figur.", target: "swap" },
    { id: "sendhome", cost: 8, icon: "⌂", label: "Zurück ins Haus", text: "Schiebt eine gegnerische Figur direkt zurück in den Startbereich.", target: "enemyPawn" },
    { id: "wish", cost: 10, icon: "✦", label: "Wunschwurf", text: "Wähle deinen nächsten Würfelwert selbst. Eine gewählte 6 gibt keinen Point.", target: "die" }
  ];

  const AM_BOT_NAMES = ["Mara Bot", "Kian Bot", "Nova Bot", "Rico Bot", "Lina Bot", "Tarek Bot"];

  const amRuntime = {
    view: "home",
    onlineDoc: null,
    onlineId: "",
    onlineUnsub: null,
    publicUnsub: null,
    publicRooms: [],
    firebasePromise: null,
    fb: null,
    overlay: null,
    pendingExtra: "",
    swapOwn: null,
    botTimer: null,
    busy: false,
    toastTimer: null
  };

  const amClone = (value) => typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

  const amEscape = (value) => typeof escapeHtml === "function"
    ? escapeHtml(value)
    : String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

  function amRootSave() {
    state.angerMensch ||= {};
    state.angerMensch.version = AM_VERSION;
    if (typeof save === "function") save();
  }

  function amLocalGame() {
    state.angerMensch ||= {};
    return state.angerMensch.localGame || null;
  }

  function amSetLocalGame(game) {
    state.angerMensch ||= {};
    state.angerMensch.localGame = game;
    amRootSave();
  }

  function amCurrentGame() {
    if (amRuntime.onlineDoc?.gameState) return amRuntime.onlineDoc.gameState;
    return amLocalGame();
  }

  function amCurrentPlayers() {
    return amCurrentGame()?.players || [];
  }

  function amOwnUid() {
    try {
      return amRuntime.fb?.auth?.currentUser?.uid || amRuntime.onlineDoc?.viewerUid || "";
    } catch {
      return amRuntime.onlineDoc?.viewerUid || "";
    }
  }

  function amOwnPlayerIndex(game = amCurrentGame()) {
    if (!game) return -1;
    if (!game.online) return 0;
    const uid = amRuntime.onlineDoc?.viewerUid || amOwnUid();
    return game.players.findIndex((player) => player.uid === uid);
  }

  function amIsHost() {
    const uid = amOwnUid();
    return !!uid && amRuntime.onlineDoc?.hostUid === uid;
  }

  function amPlayerColor(index) {
    return AM_COLORS[index % AM_COLORS.length];
  }

  function amNewCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i += 1) result += alphabet[Math.floor(Math.random() * alphabet.length)];
    return result;
  }

  function amPlayerDisplayName() {
    const fallback = `${state?.firstName || ""} ${state?.lastName || ""}`.trim() || "Spieler";
    try {
      return amRuntime.fb?.auth?.currentUser?.displayName || fallback;
    } catch {
      return fallback;
    }
  }

  function amCreatePlayers(total, online = false, humans = []) {
    const players = [];
    if (online) {
      humans.slice(0, total).forEach((human, index) => {
        players.push({
          id: human.uid,
          uid: human.uid,
          name: String(human.name || `Spieler ${index + 1}`).slice(0, 30),
          color: amPlayerColor(index).id,
          isBot: false,
          points: 0,
          skipTurns: 0
        });
      });
    } else {
      players.push({
        id: "local-human",
        uid: "local-human",
        name: `${state?.firstName || "Du"}`.trim() || "Du",
        color: AM_COLORS[0].id,
        isBot: false,
        points: 0,
        skipTurns: 0
      });
    }
    while (players.length < total) {
      const index = players.length;
      players.push({
        id: `bot-${Date.now()}-${index}`,
        uid: `bot-${index}`,
        name: AM_BOT_NAMES[(index - (online ? humans.length : 1) + AM_BOT_NAMES.length) % AM_BOT_NAMES.length],
        color: amPlayerColor(index).id,
        isBot: true,
        points: 0,
        skipTurns: 0
      });
    }
    return players;
  }

  function amCreateGame(players, online = false) {
    const pawns = {};
    players.forEach((player) => { pawns[player.id] = [-1, -1, -1, -1]; });
    return {
      version: AM_VERSION,
      online,
      status: "playing",
      players,
      pawns,
      turnIndex: 0,
      turnCounter: 1,
      phase: "roll",
      die: 0,
      naturalSix: false,
      usedExtraThisTurn: false,
      shields: {},
      winnerId: "",
      winnerName: "",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      log: [`${players[0]?.name || "Spieler"} beginnt.`]
    };
  }

  function amLog(game, text) {
    game.log = [String(text), ...(game.log || [])].slice(0, AM_MAX_LOG);
    game.updatedAtMs = Date.now();
  }

  function amPawnKey(playerIndex, pawnIndex) {
    return `${playerIndex}:${pawnIndex}`;
  }

  function amGlobalTrackIndex(playerIndex, progress) {
    return (amPlayerColor(playerIndex).start + progress) % 40;
  }

  function amShieldActive(game, playerIndex, pawnIndex) {
    const until = Number(game.shields?.[amPawnKey(playerIndex, pawnIndex)] || 0);
    return until > Number(game.turnCounter || 0);
  }

  function amCleanupEffects(game) {
    game.shields ||= {};
    Object.keys(game.shields).forEach((key) => {
      if (Number(game.shields[key] || 0) <= Number(game.turnCounter || 0)) delete game.shields[key];
    });
  }

  function amTrackOccupant(game, globalIndex, exclude = null) {
    for (let p = 0; p < game.players.length; p += 1) {
      const list = game.pawns[game.players[p].id] || [];
      for (let i = 0; i < list.length; i += 1) {
        if (exclude && exclude[0] === p && exclude[1] === i) continue;
        const progress = Number(list[i]);
        if (progress >= 0 && progress < 40 && amGlobalTrackIndex(p, progress) === globalIndex) {
          return { playerIndex: p, pawnIndex: i, progress };
        }
      }
    }
    return null;
  }

  function amOwnPawnAtProgress(game, playerIndex, progress, excludePawn = -1) {
    const list = game.pawns[game.players[playerIndex].id] || [];
    return list.findIndex((value, index) => index !== excludePawn && Number(value) === Number(progress));
  }

  function amCanMovePawn(game, playerIndex, pawnIndex, dieValue = game.die) {
    const player = game.players[playerIndex];
    if (!player || dieValue < 1 || dieValue > 6) return false;
    const pawns = game.pawns[player.id] || [];
    const progress = Number(pawns[pawnIndex]);

    if (progress < 0) {
      if (dieValue !== 6) return false;
      if (amOwnPawnAtProgress(game, playerIndex, 0) >= 0) return false;
      const occupant = amTrackOccupant(game, amGlobalTrackIndex(playerIndex, 0));
      if (occupant && occupant.playerIndex !== playerIndex && amShieldActive(game, occupant.playerIndex, occupant.pawnIndex)) return false;
      return true;
    }

    const target = progress + dieValue;
    if (target > 43) return false;
    if (amOwnPawnAtProgress(game, playerIndex, target, pawnIndex) >= 0) return false;

    if (target >= 40) {
      for (let step = Math.max(40, progress + 1); step <= target; step += 1) {
        if (amOwnPawnAtProgress(game, playerIndex, step, pawnIndex) >= 0) return false;
      }
      return true;
    }

    const targetGlobal = amGlobalTrackIndex(playerIndex, target);
    const occupant = amTrackOccupant(game, targetGlobal, [playerIndex, pawnIndex]);
    if (occupant?.playerIndex === playerIndex) return false;
    if (occupant && amShieldActive(game, occupant.playerIndex, occupant.pawnIndex)) return false;
    return true;
  }

  function amLegalMoves(game, playerIndex = game.turnIndex, dieValue = game.die) {
    const player = game.players[playerIndex];
    if (!player) return [];
    const pawns = game.pawns[player.id] || [];
    let legal = pawns.map((_, pawnIndex) => pawnIndex).filter((pawnIndex) => amCanMovePawn(game, playerIndex, pawnIndex, dieValue));

    if (dieValue === 6) {
      const basePawns = pawns.map((progress, index) => ({ progress, index })).filter((entry) => Number(entry.progress) < 0);
      if (basePawns.length) {
        const startPawn = pawns.findIndex((progress) => Number(progress) === 0);
        const baseLegal = basePawns.map((entry) => entry.index).filter((pawnIndex) => legal.includes(pawnIndex));
        if (baseLegal.length) return baseLegal;
        if (startPawn >= 0 && legal.includes(startPawn)) return [startPawn];
      }
    }
    return legal;
  }

  function amCaptureAt(game, movingPlayerIndex, pawnIndex, targetProgress) {
    if (targetProgress < 0 || targetProgress >= 40) return null;
    const global = amGlobalTrackIndex(movingPlayerIndex, targetProgress);
    const occupant = amTrackOccupant(game, global, [movingPlayerIndex, pawnIndex]);
    if (!occupant || occupant.playerIndex === movingPlayerIndex) return null;
    if (amShieldActive(game, occupant.playerIndex, occupant.pawnIndex)) return null;
    const enemy = game.players[occupant.playerIndex];
    game.pawns[enemy.id][occupant.pawnIndex] = -1;
    delete game.shields[amPawnKey(occupant.playerIndex, occupant.pawnIndex)];
    return enemy;
  }

  function amHasWon(game, playerIndex) {
    const player = game.players[playerIndex];
    return (game.pawns[player.id] || []).every((progress) => Number(progress) >= 40);
  }

  function amAdvanceTurn(game) {
    game.die = 0;
    game.naturalSix = false;
    game.phase = "roll";
    game.usedExtraThisTurn = false;
    game.turnCounter = Number(game.turnCounter || 0) + 1;
    let guard = 0;
    do {
      game.turnIndex = (Number(game.turnIndex || 0) + 1) % game.players.length;
      const next = game.players[game.turnIndex];
      if (Number(next.skipTurns || 0) > 0) {
        next.skipTurns -= 1;
        amLog(game, `${next.name} setzt eine Runde aus.`);
        game.turnCounter += 1;
      } else {
        break;
      }
      guard += 1;
    } while (guard < game.players.length * 2);
    amCleanupEffects(game);
  }

  function amRollMutation(game, forcedRoll = null, isWish = false) {
    if (game.status !== "playing" || game.phase !== "roll") return { ok: false, message: "Jetzt kann nicht gewürfelt werden." };
    const player = game.players[game.turnIndex];
    const die = Math.max(1, Math.min(6, Number(forcedRoll || Math.floor(Math.random() * 6) + 1)));
    game.die = die;
    game.phase = "move";
    game.naturalSix = die === 6 && !isWish;
    if (game.naturalSix) {
      player.points = Math.min(99, Number(player.points || 0) + 1);
      amLog(game, `${player.name} würfelt eine 6 und erhält 1 Point.`);
    } else {
      amLog(game, `${player.name} würfelt eine ${die}.`);
    }
    return { ok: true, die };
  }

  function amMoveMutation(game, pawnIndex) {
    if (game.status !== "playing" || game.phase !== "move") return { ok: false, message: "Würfle zuerst." };
    const playerIndex = game.turnIndex;
    const player = game.players[playerIndex];
    if (!amLegalMoves(game, playerIndex).includes(Number(pawnIndex))) return { ok: false, message: "Diese Figur kann mit dem aktuellen Wurf nicht ziehen." };
    const list = game.pawns[player.id];
    const before = Number(list[pawnIndex]);
    const target = before < 0 ? 0 : before + Number(game.die || 0);
    const captured = amCaptureAt(game, playerIndex, Number(pawnIndex), target);
    list[pawnIndex] = target;
    delete game.shields[amPawnKey(playerIndex, Number(pawnIndex))];

    if (captured) amLog(game, `${player.name} wirft ${captured.name} raus.`);
    if (target >= 40) amLog(game, `${player.name} bringt eine Figur ins Ziel.`);
    else if (!captured) amLog(game, `${player.name} zieht ${game.die} Felder.`);

    if (amHasWon(game, playerIndex)) {
      game.status = "finished";
      game.winnerId = player.id;
      game.winnerName = player.name;
      game.phase = "finished";
      game.die = 0;
      amLog(game, `${player.name} gewinnt ÄrgerMensch.KL!`);
      return { ok: true, won: true };
    }

    if (game.naturalSix) {
      game.phase = "roll";
      game.die = 0;
      game.naturalSix = false;
      amLog(game, `${player.name} darf wegen der 6 noch einmal würfeln.`);
      amCleanupEffects(game);
    } else {
      amAdvanceTurn(game);
    }
    return { ok: true };
  }

  function amEndTurnMutation(game) {
    if (game.status !== "playing" || game.phase !== "move") return { ok: false };
    const player = game.players[game.turnIndex];
    if (amLegalMoves(game).length) return { ok: false, message: "Du hast noch einen gültigen Zug." };
    amLog(game, `${player.name} kann nicht ziehen.`);
    if (game.naturalSix) {
      game.phase = "roll";
      game.die = 0;
      game.naturalSix = false;
      amLog(game, `${player.name} darf wegen der 6 erneut würfeln.`);
    } else {
      amAdvanceTurn(game);
    }
    return { ok: true };
  }

  function amExtraById(extraId) {
    return AM_EXTRAS.find((entry) => entry.id === extraId) || null;
  }

  function amCanUseExtra(game, extraId) {
    const extra = amExtraById(extraId);
    const player = game.players[game.turnIndex];
    if (!extra || !player || game.status !== "playing" || game.usedExtraThisTurn) return false;
    if (Number(player.points || 0) < extra.cost) return false;
    if (extraId === "reroll") return game.phase === "move" && game.die > 0;
    if (extraId === "turbo") return game.phase === "move" && game.die > 0 && game.die < 6;
    if (extraId === "wish") return game.phase === "roll";
    return game.phase === "roll" || game.phase === "move";
  }

  function amChargeExtra(game, extraId) {
    const extra = amExtraById(extraId);
    const player = game.players[game.turnIndex];
    if (!amCanUseExtra(game, extraId)) return false;
    player.points -= extra.cost;
    game.usedExtraThisTurn = true;
    return true;
  }

  function amExtraMutation(game, extraId, payload = {}) {
    const extra = amExtraById(extraId);
    const actorIndex = game.turnIndex;
    const actor = game.players[actorIndex];
    if (!extra || !amCanUseExtra(game, extraId)) return { ok: false, message: "Dieses Extra ist gerade nicht verfügbar." };

    if (extraId === "reroll") {
      if (!amChargeExtra(game, extraId)) return { ok: false };
      game.phase = "roll";
      game.die = 0;
      game.naturalSix = false;
      amLog(game, `${actor.name} kauft „Nochmal würfeln“.`);
      return { ok: true };
    }

    if (extraId === "turbo") {
      const boosted = Math.min(6, Number(game.die || 0) + 2);
      if (!amLegalMoves(game, actorIndex, boosted).length) return { ok: false, message: "Mit +2 wäre kein gültiger Zug möglich." };
      if (!amChargeExtra(game, extraId)) return { ok: false };
      game.die = boosted;
      game.naturalSix = false;
      amLog(game, `${actor.name} aktiviert Turbo und zieht mit ${boosted}.`);
      return { ok: true };
    }

    if (extraId === "wish") {
      const value = Math.max(1, Math.min(6, Number(payload.value || 0)));
      if (!value) return { ok: false };
      if (!amChargeExtra(game, extraId)) return { ok: false };
      game.die = value;
      game.phase = "move";
      game.naturalSix = false;
      amLog(game, `${actor.name} wählt mit dem Wunschwurf eine ${value}.`);
      return { ok: true };
    }

    if (extraId === "skip") {
      const targetIndex = Number(payload.playerIndex);
      const target = game.players[targetIndex];
      if (!target || targetIndex === actorIndex) return { ok: false, message: "Wähle einen Gegner." };
      if (!amChargeExtra(game, extraId)) return { ok: false };
      target.skipTurns = Math.min(2, Number(target.skipTurns || 0) + 1);
      amLog(game, `${actor.name} lässt ${target.name} eine Runde aussetzen.`);
      return { ok: true };
    }

    if (["shield", "reverse", "sendhome"].includes(extraId)) {
      const targetPlayerIndex = Number(payload.playerIndex);
      const pawnIndex = Number(payload.pawnIndex);
      const targetPlayer = game.players[targetPlayerIndex];
      const progress = Number(game.pawns[targetPlayer?.id]?.[pawnIndex]);
      if (!targetPlayer || !Number.isInteger(pawnIndex)) return { ok: false };

      if (extraId === "shield") {
        if (targetPlayerIndex !== actorIndex || progress < 0 || progress >= 40) return { ok: false, message: "Wähle eine eigene Figur auf der Strecke." };
        if (!amChargeExtra(game, extraId)) return { ok: false };
        game.shields[amPawnKey(targetPlayerIndex, pawnIndex)] = Number(game.turnCounter || 0) + game.players.length;
        amLog(game, `${actor.name} schützt eine Figur bis zum nächsten Zug.`);
        return { ok: true };
      }

      if (targetPlayerIndex === actorIndex || progress < 0 || progress >= 40) return { ok: false, message: "Wähle eine gegnerische Figur auf der Strecke." };
      if (amShieldActive(game, targetPlayerIndex, pawnIndex)) return { ok: false, message: "Diese Figur ist geschützt." };

      if (extraId === "reverse") {
        const targetProgress = progress - 4;
        if (targetProgress >= 0 && amOwnPawnAtProgress(game, targetPlayerIndex, targetProgress, pawnIndex) >= 0) return { ok: false, message: "Das Zielfeld ist durch eine eigene Figur blockiert." };
        if (targetProgress >= 0) {
          const occupied = amTrackOccupant(game, amGlobalTrackIndex(targetPlayerIndex, targetProgress), [targetPlayerIndex, pawnIndex]);
          if (occupied) return { ok: false, message: "Das Zielfeld ist bereits besetzt." };
        }
        if (!amChargeExtra(game, extraId)) return { ok: false };
        game.pawns[targetPlayer.id][pawnIndex] = targetProgress < 0 ? -1 : targetProgress;
        delete game.shields[amPawnKey(targetPlayerIndex, pawnIndex)];
        amLog(game, `${actor.name} schiebt ${targetPlayer.name} vier Felder zurück.`);
        return { ok: true };
      }

      if (extraId === "sendhome") {
        if (!amChargeExtra(game, extraId)) return { ok: false };
        game.pawns[targetPlayer.id][pawnIndex] = -1;
        delete game.shields[amPawnKey(targetPlayerIndex, pawnIndex)];
        amLog(game, `${actor.name} schiebt eine Figur von ${targetPlayer.name} zurück ins Haus.`);
        return { ok: true };
      }
    }

    if (extraId === "swap") {
      const ownPawnIndex = Number(payload.ownPawnIndex);
      const enemyPlayerIndex = Number(payload.enemyPlayerIndex);
      const enemyPawnIndex = Number(payload.enemyPawnIndex);
      const ownProgress = Number(game.pawns[actor.id]?.[ownPawnIndex]);
      const enemy = game.players[enemyPlayerIndex];
      const enemyProgress = Number(game.pawns[enemy?.id]?.[enemyPawnIndex]);
      if (!enemy || enemyPlayerIndex === actorIndex || ownProgress < 0 || ownProgress >= 40 || enemyProgress < 0 || enemyProgress >= 40) return { ok: false, message: "Für den Tausch müssen beide Figuren auf der Strecke stehen." };
      if (amShieldActive(game, enemyPlayerIndex, enemyPawnIndex)) return { ok: false, message: "Die gegnerische Figur ist geschützt." };
      const ownGlobal = amGlobalTrackIndex(actorIndex, ownProgress);
      const enemyGlobal = amGlobalTrackIndex(enemyPlayerIndex, enemyProgress);
      const newOwnProgress = (enemyGlobal - amPlayerColor(actorIndex).start + 40) % 40;
      const newEnemyProgress = (ownGlobal - amPlayerColor(enemyPlayerIndex).start + 40) % 40;
      if (newOwnProgress >= 40 || newEnemyProgress >= 40) return { ok: false };
      if (!amChargeExtra(game, extraId)) return { ok: false };
      game.pawns[actor.id][ownPawnIndex] = newOwnProgress;
      game.pawns[enemy.id][enemyPawnIndex] = newEnemyProgress;
      delete game.shields[amPawnKey(actorIndex, ownPawnIndex)];
      delete game.shields[amPawnKey(enemyPlayerIndex, enemyPawnIndex)];
      amLog(game, `${actor.name} tauscht den Platz mit ${enemy.name}.`);
      return { ok: true };
    }

    return { ok: false };
  }

  async function amFirebase() {
    if (amRuntime.firebasePromise) return amRuntime.firebasePromise;
    amRuntime.firebasePromise = (async () => {
      const [appMod, authMod, dbMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
      ]);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebasePhoneConfig);
      const auth = authMod.getAuth(app);
      const db = dbMod.getFirestore(app, AM_DATABASE_ID);
      const runtime = { ...authMod, ...dbMod, auth, db };
      amRuntime.fb = runtime;
      return runtime;
    })().catch((error) => {
      amRuntime.firebasePromise = null;
      throw error;
    });
    return amRuntime.firebasePromise;
  }

  function amRequireOnlineUser(fb) {
    const user = fb.auth.currentUser;
    if (!user) throw new Error("Bitte melde dich zuerst mit deinem LifeBuilder-Account an.");
    return user;
  }

  async function amMutate(mutator) {
    if (amRuntime.busy) return { ok: false, message: "Aktion läuft bereits." };
    amRuntime.busy = true;
    try {
      if (!amRuntime.onlineId) {
        const current = amLocalGame();
        if (!current) return { ok: false, message: "Kein Spiel aktiv." };
        const next = amClone(current);
        const result = mutator(next) || { ok: true };
        if (result.ok !== false) {
          next.updatedAtMs = Date.now();
          amSetLocalGame(next);
          amRenderAll();
          amScheduleBot();
        }
        if (result.message) amToast(result.message);
        return result;
      }

      const fb = await amFirebase();
      const user = amRequireOnlineUser(fb);
      const ref = fb.doc(fb.db, AM_COLLECTION, amRuntime.onlineId);
      let mutationResult = { ok: false };
      await fb.runTransaction(fb.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("Der Raum existiert nicht mehr.");
        const data = snapshot.data();
        const game = amClone(data.gameState);
        const current = game.players[game.turnIndex];
        const mayAct = current?.uid === user.uid || (current?.isBot && data.hostUid === user.uid);
        if (!mayAct) throw new Error("Du bist gerade nicht am Zug.");
        mutationResult = mutator(game) || { ok: true };
        if (mutationResult.ok === false) return;
        game.updatedAtMs = Date.now();
        transaction.update(ref, {
          gameState: game,
          status: game.status,
          winnerName: game.winnerName || "",
          updatedAtMs: Date.now()
        });
      });
      if (mutationResult.message) amToast(mutationResult.message);
      return mutationResult;
    } catch (error) {
      const message = String(error?.message || error || "Online-Aktion fehlgeschlagen.");
      amToast(message);
      return { ok: false, message };
    } finally {
      amRuntime.busy = false;
    }
  }

  function amCurrentCanAct(game = amCurrentGame()) {
    if (!game || game.status !== "playing") return false;
    const current = game.players[game.turnIndex];
    if (!game.online) return !current?.isBot;
    return current?.uid === amOwnUid();
  }

  function amMoveScore(game, playerIndex, pawnIndex, dieValue = game.die) {
    const player = game.players[playerIndex];
    const progress = Number(game.pawns[player.id][pawnIndex]);
    const target = progress < 0 ? 0 : progress + dieValue;
    let score = target * 1.5;
    if (progress < 0) score += 34;
    if (target >= 40) score += 68 + target * 2;
    if (target >= 0 && target < 40) {
      const occupant = amTrackOccupant(game, amGlobalTrackIndex(playerIndex, target), [playerIndex, pawnIndex]);
      if (occupant && occupant.playerIndex !== playerIndex) score += 110 + Number(game.pawns[game.players[occupant.playerIndex].id][occupant.pawnIndex] || 0);
      if ([0, 10, 20, 30].includes(amGlobalTrackIndex(playerIndex, target))) score += 9;
      const threatened = game.players.some((enemy, enemyIndex) => {
        if (enemyIndex === playerIndex) return false;
        return (game.pawns[enemy.id] || []).some((enemyProgress) => {
          if (enemyProgress < 0 || enemyProgress >= 40) return false;
          const distance = (amGlobalTrackIndex(playerIndex, target) - amGlobalTrackIndex(enemyIndex, enemyProgress) + 40) % 40;
          return distance >= 1 && distance <= 6;
        });
      });
      if (threatened) score -= 14;
    }
    return score + Math.random() * 3;
  }

  function amBestMove(game, playerIndex = game.turnIndex, dieValue = game.die) {
    const legal = amLegalMoves(game, playerIndex, dieValue);
    if (!legal.length) return -1;
    return legal.map((pawnIndex) => ({ pawnIndex, score: amMoveScore(game, playerIndex, pawnIndex, dieValue) }))
      .sort((a, b) => b.score - a.score)[0].pawnIndex;
  }

  function amLeadingEnemyIndex(game, botIndex) {
    return game.players.map((player, index) => ({
      index,
      score: index === botIndex ? -1 : (game.pawns[player.id] || []).reduce((sum, progress) => sum + Math.max(0, Number(progress)), 0)
    })).sort((a, b) => b.score - a.score)[0]?.index ?? -1;
  }

  function amAdvancedEnemyPawn(game, botIndex) {
    let best = null;
    game.players.forEach((player, playerIndex) => {
      if (playerIndex === botIndex) return;
      (game.pawns[player.id] || []).forEach((progress, pawnIndex) => {
        if (progress >= 0 && progress < 40 && !amShieldActive(game, playerIndex, pawnIndex)) {
          if (!best || progress > best.progress) best = { playerIndex, pawnIndex, progress };
        }
      });
    });
    return best;
  }


  function amBestWishChoice(game, playerIndex) {
    let best = null;
    for (let die = 1; die <= 6; die += 1) {
      const pawnIndex = amBestMove(game, playerIndex, die);
      if (pawnIndex < 0) continue;
      const player = game.players[playerIndex];
      const before = Number(game.pawns[player.id][pawnIndex]);
      const target = before < 0 ? 0 : before + die;
      const score = amMoveScore(game, playerIndex, pawnIndex, die) + (target >= 40 ? 80 : 0);
      if (!best || score > best.score) best = { die, pawnIndex, score, target };
    }
    return best;
  }

  function amBestSwapChoice(game, playerIndex) {
    const player = game.players[playerIndex];
    let best = null;
    (game.pawns[player.id] || []).forEach((ownProgress, ownPawnIndex) => {
      if (ownProgress < 0 || ownProgress >= 40) return;
      const ownGlobal = amGlobalTrackIndex(playerIndex, ownProgress);
      game.players.forEach((enemy, enemyPlayerIndex) => {
        if (enemyPlayerIndex === playerIndex) return;
        (game.pawns[enemy.id] || []).forEach((enemyProgress, enemyPawnIndex) => {
          if (enemyProgress < 0 || enemyProgress >= 40 || amShieldActive(game, enemyPlayerIndex, enemyPawnIndex)) return;
          const enemyGlobal = amGlobalTrackIndex(enemyPlayerIndex, enemyProgress);
          const newOwnProgress = (enemyGlobal - amPlayerColor(playerIndex).start + 40) % 40;
          const newEnemyProgress = (ownGlobal - amPlayerColor(enemyPlayerIndex).start + 40) % 40;
          const gain = newOwnProgress - ownProgress;
          const enemyLoss = enemyProgress - newEnemyProgress;
          const score = gain * 2 + enemyLoss + (newOwnProgress >= 34 ? 35 : 0);
          if (gain >= 8 && (!best || score > best.score)) best = { ownPawnIndex, enemyPlayerIndex, enemyPawnIndex, score };
        });
      });
    });
    return best;
  }

  async function amBotStep() {
    const game = amCurrentGame();
    if (!game || game.status !== "playing") return;
    const bot = game.players[game.turnIndex];
    if (!bot?.isBot) return;
    if (game.online && !amIsHost()) return;

    const botIndex = game.turnIndex;
    const points = Number(bot.points || 0);

    if (!game.usedExtraThisTurn && game.phase === "roll") {
      const enemyIndex = amLeadingEnemyIndex(game, botIndex);
      const enemy = game.players[enemyIndex];
      const enemyHomeCount = enemy ? (game.pawns[enemy.id] || []).filter((p) => p >= 40).length : 0;
      const ownHomeCount = (game.pawns[bot.id] || []).filter((p) => p >= 40).length;

      // 10-Point-Wunschwurf nur für entscheidende Ziel- oder Rauswurfzüge.
      if (points >= 10) {
        const wish = amBestWishChoice(game, botIndex);
        if (wish && (ownHomeCount >= 3 && wish.target >= 40 || wish.score >= 175)) {
          await amMutate((next) => amExtraMutation(next, "wish", { value: wish.die }));
          return;
        }
      }

      if (points >= 4 && enemyIndex >= 0 && enemyHomeCount >= 3) {
        await amMutate((next) => amExtraMutation(next, "skip", { playerIndex: enemyIndex }));
        return;
      }

      const advanced = amAdvancedEnemyPawn(game, botIndex);
      if (points >= 8 && advanced?.progress >= 35) {
        await amMutate((next) => amExtraMutation(next, "sendhome", advanced));
        return;
      }
      if (points >= 6) {
        const swap = amBestSwapChoice(game, botIndex);
        if (swap?.score >= 28) {
          await amMutate((next) => amExtraMutation(next, "swap", swap));
          return;
        }
      }
      if (points >= 5 && advanced?.progress >= 29) {
        await amMutate((next) => amExtraMutation(next, "reverse", advanced));
        return;
      }
    }

    if (game.phase === "roll") {
      await amMutate((next) => amRollMutation(next, Math.floor(Math.random() * 6) + 1));
      return;
    }

    if (game.phase === "move") {
      const legal = amLegalMoves(game);
      if (!game.usedExtraThisTurn && !legal.length && points >= 2) {
        await amMutate((next) => amExtraMutation(next, "reroll"));
        return;
      }
      if (!game.usedExtraThisTurn && game.die < 6 && points >= 3) {
        const currentBest = amBestMove(game, botIndex, game.die);
        const boostedDie = Math.min(6, game.die + 2);
        const boostedBest = amBestMove(game, botIndex, boostedDie);
        if (boostedBest >= 0 && (currentBest < 0 || amMoveScore(game, botIndex, boostedBest, boostedDie) > amMoveScore(game, botIndex, currentBest, game.die) + 28)) {
          await amMutate((next) => amExtraMutation(next, "turbo"));
          return;
        }
      }
      if (!game.usedExtraThisTurn && points >= 1) {
        const own = (game.pawns[bot.id] || []).map((progress, pawnIndex) => ({ progress, pawnIndex }))
          .filter((entry) => entry.progress >= 24 && entry.progress < 40 && !amShieldActive(game, botIndex, entry.pawnIndex))
          .sort((a, b) => b.progress - a.progress)[0];
        if (own && Math.random() < 0.35) {
          await amMutate((next) => amExtraMutation(next, "shield", { playerIndex: botIndex, pawnIndex: own.pawnIndex }));
          return;
        }
      }
      const move = amBestMove(game);
      if (move >= 0) await amMutate((next) => amMoveMutation(next, move));
      else await amMutate((next) => amEndTurnMutation(next));
    }
  }

  function amScheduleBot() {
    clearTimeout(amRuntime.botTimer);
    amRuntime.botTimer = null;
    const game = amCurrentGame();
    if (!game || game.status !== "playing") return;
    const current = game.players[game.turnIndex];
    if (!current?.isBot) return;
    if (game.online && !amIsHost()) return;
    amRuntime.botTimer = setTimeout(() => amBotStep().catch((error) => amToast(error.message || error)), AM_BOT_DELAY);
  }

  function amRingPoint(index) {
    const angle = (-90 + index * 9) * Math.PI / 180;
    return { x: 50 + Math.cos(angle) * 36.5, y: 50 + Math.sin(angle) * 36.5 };
  }

  function amHomePoint(playerIndex, homeIndex) {
    const start = amRingPoint(amPlayerColor(playerIndex).start);
    const t = (homeIndex + 1) / 5;
    return { x: start.x + (50 - start.x) * t, y: start.y + (50 - start.y) * t };
  }

  function amBasePoint(playerIndex, pawnIndex) {
    const [cx, cy] = amPlayerColor(playerIndex).base;
    const offsets = [[-4.3, -4.3], [4.3, -4.3], [-4.3, 4.3], [4.3, 4.3]];
    return { x: cx + offsets[pawnIndex][0], y: cy + offsets[pawnIndex][1] };
  }

  function amPawnPosition(game, playerIndex, pawnIndex) {
    const player = game.players[playerIndex];
    const progress = Number(game.pawns[player.id][pawnIndex]);
    if (progress < 0) return amBasePoint(playerIndex, pawnIndex);
    if (progress < 40) return amRingPoint(amGlobalTrackIndex(playerIndex, progress));
    return amHomePoint(playerIndex, progress - 40);
  }

  function amBoardSvg(game) {
    const ring = Array.from({ length: 40 }, (_, index) => {
      const point = amRingPoint(index);
      const startPlayer = AM_COLORS.findIndex((color) => color.start === index);
      const fill = startPlayer >= 0 ? amPlayerColor(startPlayer).hex : "rgba(244,248,255,.14)";
      return `<circle class="am-path-cell ${startPlayer >= 0 ? "start" : ""}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.28" fill="${fill}" data-cell="${index}"/>`;
    }).join("");

    const bases = game.players.map((player, playerIndex) => {
      const color = amPlayerColor(playerIndex);
      const [cx, cy] = color.base;
      const slots = Array.from({ length: 4 }, (_, pawnIndex) => {
        const point = amBasePoint(playerIndex, pawnIndex);
        return `<circle cx="${point.x}" cy="${point.y}" r="3.25" fill="rgba(5,9,18,.68)" stroke="${color.hex}" stroke-width=".55"/>`;
      }).join("");
      return `<g class="am-base"><rect x="${cx - 10}" y="${cy - 10}" width="20" height="20" rx="6" fill="${color.hex}1f" stroke="${color.hex}" stroke-width=".8"/>${slots}<text x="${cx}" y="${cy + 0.9}" text-anchor="middle" class="am-base-label" fill="${color.hex}">${playerIndex + 1}</text></g>`;
    }).join("");

    const homes = game.players.map((_, playerIndex) => {
      const color = amPlayerColor(playerIndex);
      return Array.from({ length: 4 }, (_, homeIndex) => {
        const point = amHomePoint(playerIndex, homeIndex);
        return `<circle class="am-home-cell" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.45" fill="${color.hex}55" stroke="${color.hex}" stroke-width=".6"/>`;
      }).join("");
    }).join("");

    const legal = new Set(amCurrentCanAct(game) && game.phase === "move" ? amLegalMoves(game).map((index) => `${game.turnIndex}:${index}`) : []);
    const pawns = game.players.map((player, playerIndex) => (game.pawns[player.id] || []).map((_, pawnIndex) => {
      const point = amPawnPosition(game, playerIndex, pawnIndex);
      const color = amPlayerColor(playerIndex);
      const key = `${playerIndex}:${pawnIndex}`;
      const shield = amShieldActive(game, playerIndex, pawnIndex);
      const targetable = amPawnTargetable(game, playerIndex, pawnIndex);
      return `<g class="am-pawn ${legal.has(key) ? "legal" : ""} ${targetable ? "targetable" : ""} ${shield ? "shielded" : ""}" data-am-pawn="${key}" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})">
        ${shield ? `<circle r="4.15" class="am-shield-ring" fill="none" stroke="${color.hex}"/>` : ""}
        <circle r="3.05" fill="${color.hex}" stroke="rgba(255,255,255,.92)" stroke-width=".65"/>
        <circle r="1.45" fill="${color.dark}" opacity=".9"/>
        <text y=".75" text-anchor="middle" fill="#fff" font-size="2.2" font-weight="900">${pawnIndex + 1}</text>
      </g>`;
    }).join("")).join("");

    return `<svg class="am-board-svg" viewBox="0 0 100 100" role="img" aria-label="ÄrgerMensch.KL Spielfeld">
      <defs>
        <radialGradient id="amBg" cx="50%" cy="42%" r="65%"><stop offset="0" stop-color="#223954"/><stop offset=".58" stop-color="#101c2d"/><stop offset="1" stop-color="#07101c"/></radialGradient>
        <filter id="amGlow"><feGaussianBlur stdDeviation=".45" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect x="1" y="1" width="98" height="98" rx="14" fill="url(#amBg)" stroke="rgba(255,255,255,.16)"/>
      <circle cx="50" cy="50" r="41.5" fill="none" stroke="rgba(102,211,255,.12)" stroke-width="1.1"/>
      ${bases}
      ${ring}
      ${homes}
      <g class="am-center"><circle cx="50" cy="50" r="8.2" fill="#07111f" stroke="#8ee8ff" stroke-width=".7"/><text x="50" y="48.5" text-anchor="middle">ÄM</text><text x="50" y="53" text-anchor="middle" class="small">.KL</text></g>
      <g filter="url(#amGlow)">${pawns}</g>
    </svg>`;
  }

  function amPawnTargetable(game, playerIndex, pawnIndex) {
    const extraId = amRuntime.pendingExtra;
    if (!extraId) return false;
    const progress = Number(game.pawns[game.players[playerIndex].id]?.[pawnIndex]);
    if (extraId === "shield") return playerIndex === game.turnIndex && progress >= 0 && progress < 40;
    if (["reverse", "sendhome"].includes(extraId)) return playerIndex !== game.turnIndex && progress >= 0 && progress < 40 && !amShieldActive(game, playerIndex, pawnIndex);
    if (extraId === "swap") {
      if (!amRuntime.swapOwn) return playerIndex === game.turnIndex && progress >= 0 && progress < 40;
      return playerIndex !== game.turnIndex && progress >= 0 && progress < 40 && !amShieldActive(game, playerIndex, pawnIndex);
    }
    return false;
  }

  function amPlayerCards(game) {
    return game.players.map((player, index) => {
      const color = amPlayerColor(index);
      const isTurn = game.status === "playing" && game.turnIndex === index;
      const home = (game.pawns[player.id] || []).filter((p) => p >= 40).length;
      return `<article class="am-player-card ${isTurn ? "turn" : ""}" style="--am-player:${color.hex}">
        <span class="am-player-dot"></span>
        <div><b>${amEscape(player.name)}</b><small>${player.isBot ? "Strategie-Bot" : game.online ? "Online-Spieler" : "Du"} · ${home}/4 im Ziel</small></div>
        <strong>${Number(player.points || 0)} <i>Points</i></strong>
        ${Number(player.skipTurns || 0) ? `<em>Pause ×${player.skipTurns}</em>` : ""}
      </article>`;
    }).join("");
  }

  function amExtraShop(game) {
    const player = game.players[game.turnIndex];
    const canAct = amCurrentCanAct(game);
    return `<div class="am-extra-grid">
      ${AM_EXTRAS.map((extra) => {
        const enabled = canAct && amCanUseExtra(game, extra.id);
        return `<button class="am-extra-card ${amRuntime.pendingExtra === extra.id ? "selected" : ""}" data-am-extra="${extra.id}" ${enabled ? "" : "disabled"}>
          <span>${extra.icon}</span><div><b>${extra.label}</b><small>${extra.text}</small></div><strong>${extra.cost}</strong>
        </button>`;
      }).join("")}
      <p class="am-extra-hint">${game.usedExtraThisTurn ? "Für diesen Zug wurde bereits ein Extra benutzt." : `${amEscape(player?.name || "Spieler")} hat ${Number(player?.points || 0)} Points.`}</p>
    </div>`;
  }

  function amTargetControls(game) {
    const extra = amExtraById(amRuntime.pendingExtra);
    if (!extra) return "";
    if (extra.target === "player") {
      return `<div class="am-target-panel"><b>Welcher Gegner soll aussetzen?</b><div>${game.players.map((player, index) => index === game.turnIndex ? "" : `<button data-am-target-player="${index}">${amEscape(player.name)}</button>`).join("")}</div><button class="ghost" data-am-cancel-extra>Abbrechen</button></div>`;
    }
    if (extra.target === "die") {
      return `<div class="am-target-panel"><b>Wunschwurf auswählen</b><div class="dice-pick">${[1,2,3,4,5,6].map((value) => `<button data-am-wish="${value}">${value}</button>`).join("")}</div><button class="ghost" data-am-cancel-extra>Abbrechen</button></div>`;
    }
    const prompt = extra.id === "swap" && amRuntime.swapOwn
      ? "Jetzt eine gegnerische Figur auf der Strecke wählen."
      : extra.id === "swap"
        ? "Zuerst eine eigene Figur auf der Strecke wählen."
        : extra.target === "ownPawn"
          ? "Wähle eine eigene Figur auf dem Spielfeld."
          : "Wähle eine gegnerische Figur auf dem Spielfeld.";
    return `<div class="am-target-panel"><b>${prompt}</b><button class="ghost" data-am-cancel-extra>Abbrechen</button></div>`;
  }

  function amDiceFace(value) {
    const dots = {
      1: "●", 2: "●  ●", 3: "●  ●  ●", 4: "● ●\n● ●", 5: "● ●\n ● \n● ●", 6: "● ●\n● ●\n● ●"
    };
    return dots[value] || "?";
  }

  function amGameOverlayHtml(game) {
    const current = game.players[game.turnIndex];
    const canAct = amCurrentCanAct(game);
    const legal = game.phase === "move" ? amLegalMoves(game) : [];
    const roomLabel = game.online ? `Online-Raum ${amEscape(amRuntime.onlineId)}` : "Bot-Spiel";
    const statusText = game.status === "finished"
      ? `${amEscape(game.winnerName)} gewinnt!`
      : `${amEscape(current?.name || "Spieler")} ist am Zug`;
    const actionText = game.status === "finished"
      ? "Partie beendet"
      : !canAct
        ? current?.isBot ? "Bot denkt nach …" : "Warte auf den anderen Spieler …"
        : game.phase === "roll"
          ? "Würfeln"
          : legal.length
            ? "Eine leuchtende Figur wählen"
            : "Kein Zug möglich";

    return `<section class="am-game-shell">
      <header class="am-game-head">
        <div><p>ÄrgerMensch.KL · ${roomLabel}</p><h2>${statusText}</h2><small>${actionText}</small></div>
        <div class="am-head-actions"><button data-am-minimize>Minimieren</button>${game.online ? `<button data-am-copy-code>Code kopieren</button>` : ""}</div>
      </header>
      <div class="am-game-layout">
        <main class="am-board-panel">
          ${amBoardSvg(game)}
          ${amTargetControls(game)}
          <div class="am-main-controls">
            <div class="am-dice ${game.die ? "rolled" : ""}"><span>${amDiceFace(game.die)}</span><b>${game.die || "–"}</b></div>
            <div>
              <button class="am-roll-button" data-am-roll ${canAct && game.phase === "roll" && game.status === "playing" ? "" : "disabled"}>Würfeln</button>
              <button class="am-pass-button" data-am-pass ${canAct && game.phase === "move" && !legal.length ? "" : "disabled"}>Zug beenden</button>
            </div>
          </div>
        </main>
        <aside class="am-side-panel">
          <div class="am-player-list">${amPlayerCards(game)}</div>
          <section class="am-shop-panel"><h3>Point-Shop</h3><p>Jede natürlich gewürfelte 6 bringt genau 1 Point.</p>${amExtraShop(game)}</section>
          <section class="am-log-panel"><h3>Spielverlauf</h3>${(game.log || []).map((entry) => `<p>${amEscape(entry)}</p>`).join("")}</section>
        </aside>
      </div>
      ${game.status === "finished" ? `<div class="am-winner-panel"><span>🏆</span><h2>${amEscape(game.winnerName)} gewinnt ÄrgerMensch.KL</h2><p>Alle vier Figuren sind im Ziel.</p><div>${game.online && amIsHost() ? `<button data-am-rematch>Revanche starten</button>` : !game.online ? `<button data-am-local-rematch>Noch eine Runde</button>` : ""}<button data-am-minimize>Zur App</button></div></div>` : ""}
      <div class="am-toast" data-am-toast></div>
    </section>`;
  }

  function amEnsureOverlay() {
    if (amRuntime.overlay) return amRuntime.overlay;
    const overlay = document.createElement("div");
    overlay.className = "am-overlay";
    overlay.dataset.amOverlay = "1";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", amOverlayClick);
    amRuntime.overlay = overlay;
    return overlay;
  }

  function amOpenBoard() {
    const game = amCurrentGame();
    if (!game) return amToast("Es ist noch kein Spiel aktiv.");
    const overlay = amEnsureOverlay();
    overlay.innerHTML = amGameOverlayHtml(game);
    overlay.classList.add("show");
    document.body.classList.add("am-game-open");
    amScheduleBot();
  }

  function amCloseBoard() {
    amRuntime.overlay?.classList.remove("show");
    document.body.classList.remove("am-game-open");
    amRuntime.pendingExtra = "";
    amRuntime.swapOwn = null;
    amRefreshApp();
  }

  function amRenderOverlay() {
    const game = amCurrentGame();
    if (!amRuntime.overlay?.classList.contains("show") || !game) return;
    amRuntime.overlay.innerHTML = amGameOverlayHtml(game);
  }

  function amRenderAll() {
    amRenderOverlay();
    amRefreshApp();
  }

  function amToast(message) {
    const text = String(message || "").trim();
    if (!text) return;
    const overlay = amRuntime.overlay;
    const toast = overlay?.querySelector("[data-am-toast]");
    if (toast) {
      toast.textContent = text;
      toast.classList.add("show");
      clearTimeout(amRuntime.toastTimer);
      amRuntime.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    } else if (typeof addFeed === "function") {
      addFeed(text);
    }
  }

  async function amOverlayClick(event) {
    const button = event.target.closest("button, [data-am-pawn]");
    if (!button) return;
    const game = amCurrentGame();
    if (!game) return;

    if (button.matches("[data-am-minimize]")) return amCloseBoard();
    if (button.matches("[data-am-copy-code]")) {
      try { await navigator.clipboard.writeText(amRuntime.onlineId); amToast("Raumcode kopiert."); }
      catch { amToast(`Raumcode: ${amRuntime.onlineId}`); }
      return;
    }
    if (button.matches("[data-am-roll]")) {
      if (!amCurrentCanAct(game)) return;
      await amMutate((next) => amRollMutation(next, Math.floor(Math.random() * 6) + 1));
      return;
    }
    if (button.matches("[data-am-pass]")) {
      await amMutate((next) => amEndTurnMutation(next));
      return;
    }
    if (button.matches("[data-am-cancel-extra]")) {
      amRuntime.pendingExtra = "";
      amRuntime.swapOwn = null;
      amRenderOverlay();
      return;
    }
    if (button.matches("[data-am-extra]")) {
      const extraId = button.dataset.amExtra;
      const extra = amExtraById(extraId);
      if (!extra || !amCanUseExtra(game, extraId)) return;
      if (["reroll", "turbo"].includes(extraId)) {
        await amMutate((next) => amExtraMutation(next, extraId));
      } else {
        amRuntime.pendingExtra = extraId;
        amRuntime.swapOwn = null;
        amRenderOverlay();
      }
      return;
    }
    if (button.matches("[data-am-target-player]")) {
      const extraId = amRuntime.pendingExtra;
      const playerIndex = Number(button.dataset.amTargetPlayer);
      const result = await amMutate((next) => amExtraMutation(next, extraId, { playerIndex }));
      if (result.ok) { amRuntime.pendingExtra = ""; amRuntime.swapOwn = null; }
      amRenderOverlay();
      return;
    }
    if (button.matches("[data-am-wish]")) {
      const value = Number(button.dataset.amWish);
      const result = await amMutate((next) => amExtraMutation(next, "wish", { value }));
      if (result.ok) amRuntime.pendingExtra = "";
      amRenderOverlay();
      return;
    }
    if (button.matches("[data-am-pawn]")) {
      const [playerIndex, pawnIndex] = button.dataset.amPawn.split(":").map(Number);
      if (amRuntime.pendingExtra) {
        const extraId = amRuntime.pendingExtra;
        if (extraId === "swap") {
          if (!amRuntime.swapOwn) {
            if (playerIndex !== game.turnIndex || !amPawnTargetable(game, playerIndex, pawnIndex)) return amToast("Wähle zuerst eine eigene Figur auf der Strecke.");
            amRuntime.swapOwn = { playerIndex, pawnIndex };
            amRenderOverlay();
            return;
          }
          const result = await amMutate((next) => amExtraMutation(next, "swap", {
            ownPawnIndex: amRuntime.swapOwn.pawnIndex,
            enemyPlayerIndex: playerIndex,
            enemyPawnIndex: pawnIndex
          }));
          if (result.ok) { amRuntime.pendingExtra = ""; amRuntime.swapOwn = null; }
          amRenderOverlay();
          return;
        }
        const result = await amMutate((next) => amExtraMutation(next, extraId, { playerIndex, pawnIndex }));
        if (result.ok) { amRuntime.pendingExtra = ""; amRuntime.swapOwn = null; }
        amRenderOverlay();
        return;
      }
      if (playerIndex === game.turnIndex && amCurrentCanAct(game)) await amMutate((next) => amMoveMutation(next, pawnIndex));
      return;
    }
    if (button.matches("[data-am-local-rematch]")) {
      const players = amClone(game.players).map((player) => ({ ...player, points: 0, skipTurns: 0 }));
      amSetLocalGame(amCreateGame(players, false));
      amRenderAll();
      amScheduleBot();
      return;
    }
    if (button.matches("[data-am-rematch]")) {
      await amOnlineRematch();
    }
  }

  function amHomeHtml() {
    const local = amLocalGame();
    const online = amRuntime.onlineDoc?.gameState;
    const active = online || local;
    return `<div class="am-app-home">
      <section class="am-app-hero"><span>ÄM</span><div><p>KLASSIK · TAKTIK · POINTS</p><h4>ÄrgerMensch.KL</h4><small>Das moderne Brettspiel für 2, 3 oder 4 Spieler.</small></div></section>
      ${active ? `<button class="am-resume-card" data-am-app="resume"><span>▶</span><div><b>${active.online ? `Online-Raum ${amEscape(amRuntime.onlineId)}` : "Bot-Partie fortsetzen"}</b><small>${active.status === "finished" ? `${amEscape(active.winnerName)} hat gewonnen.` : `${amEscape(active.players[active.turnIndex]?.name)} ist am Zug.`}</small></div></button>` : ""}
      <div class="am-mode-grid">
        <button data-am-app="local-setup"><span>🤖</span><b>Gegen Bots</b><small>1 gegen 1 bis vier Spieler. Strategische Bots nutzen Regeln und Extras.</small></button>
        <button data-am-app="online"><span>🌐</span><b>Online spielen</b><small>Öffentliche Räume, private Räume und Beitritt mit sechsstelligen Codes.</small></button>
        <button data-am-app="rules"><span>?</span><b>Regeln & Points</b><small>Klassische Laufregeln plus taktischer Point-Shop.</small></button>
      </div>
      <div class="am-feature-strip"><span>2–4 Spieler</span><span>4 Figuren</span><span>8 Extras</span><span>Live-Lobbys</span></div>
    </div>`;
  }

  function amLocalSetupHtml() {
    return `<div class="am-app-page"><button class="am-app-back" data-am-app="home">← Zurück</button><h4>Bot-Spiel erstellen</h4><p>Du spielst Rot. Die übrigen Plätze werden mit taktischen Bots besetzt.</p>
      <label>Spieleranzahl<select data-am-local-count><option value="2">1 vs 1</option><option value="3">1 vs 1 vs 1</option><option value="4" selected>1 vs 1 vs 1 vs 1</option></select></label>
      <div class="am-setup-preview">${AM_COLORS.map((color, index) => `<span style="--c:${color.hex}">${index === 0 ? "Du" : `Bot ${index}`}</span>`).join("")}</div>
      <button class="am-primary" data-am-start-local>Partie starten</button>
      <small class="am-note">Die Bots priorisieren Rauswürfe, Zielzüge, sichere Felder, Pflichtauszüge und setzen Points taktisch ein.</small>
    </div>`;
  }

  function amRulesHtml() {
    return `<div class="am-app-page"><button class="am-app-back" data-am-app="home">← Zurück</button><h4>Regeln & Point-Shop</h4>
      <div class="am-rule-list"><p><b>1.</b> Eine Figur verlässt das Haus nur mit einer 6. Wenn möglich, muss bei einer 6 zuerst eine Figur herausgesetzt werden.</p><p><b>2.</b> Eigene Figuren dürfen nicht auf demselben Feld stehen. Für den Zieleinlauf brauchst du die passende Augenzahl.</p><p><b>3.</b> Landest du auf einer ungeschützten gegnerischen Figur, wird sie zurück ins Haus geschickt.</p><p><b>4.</b> Nach einer natürlich gewürfelten 6 erhältst du 1 Point und würfelst nach deinem Zug erneut.</p><p><b>5.</b> Pro eigenem Zug darf höchstens ein Extra gekauft werden.</p></div>
      <div class="am-rules-extras">${AM_EXTRAS.map((extra) => `<article><span>${extra.icon}</span><div><b>${extra.label}</b><small>${extra.text}</small></div><strong>${extra.cost}</strong></article>`).join("")}</div>
    </div>`;
  }

  function amOnlineHtml() {
    const connected = !!amRuntime.onlineDoc;
    if (connected && amRuntime.onlineDoc.status === "lobby") return amLobbyHtml();
    if (connected && amRuntime.onlineDoc.gameState) return `<div class="am-app-page"><button class="am-app-back" data-am-leave-view>← Menü</button><h4>Online-Partie</h4><div class="am-room-code"><small>Raumcode</small><b>${amEscape(amRuntime.onlineId)}</b></div><button class="am-primary" data-am-app="resume">Spielbrett öffnen</button><button class="am-danger" data-am-online-disconnect>Raum verlassen</button></div>`;
    return `<div class="am-app-page am-online-page"><button class="am-app-back" data-am-app="home">← Zurück</button><h4>Online spielen</h4>
      <section class="am-online-create"><h5>Neuen Raum erstellen</h5><label>Spieleranzahl<select data-am-online-count><option value="2">2 Spieler</option><option value="3">3 Spieler</option><option value="4" selected>4 Spieler</option></select></label><label>Sichtbarkeit<select data-am-online-visibility><option value="public">Öffentlich sichtbar</option><option value="private">Privat · nur mit Code</option></select></label><label class="am-check"><input type="checkbox" data-am-fill-bots checked> Freie Plätze beim Start mit Bots auffüllen</label><button class="am-primary" data-am-create-room>Raum erstellen</button></section>
      <section class="am-code-join"><h5>Mit Code beitreten</h5><div><input data-am-room-code maxlength="6" placeholder="ABC123"><button data-am-join-code>Beitreten</button></div></section>
      <section class="am-public-rooms"><div><h5>Öffentliche Räume</h5><button data-am-refresh-rooms>Aktualisieren</button></div>${amPublicRoomsHtml()}</section>
    </div>`;
  }

  function amPublicRoomsHtml() {
    if (!amRuntime.publicRooms.length) return `<p class="am-empty">Aktuell wartet kein öffentlicher Raum. Erstelle den ersten.</p>`;
    return amRuntime.publicRooms.map((room) => `<article><span>${room.players?.length || 1}/${room.maxPlayers || 4}</span><div><b>${amEscape(room.hostName || "Spieler")}</b><small>Raum ${amEscape(room.gameId || room.id)} · ${room.fillBots ? "Bots erlaubt" : "nur Online-Spieler"}</small></div><button data-am-join-room="${amEscape(room.gameId || room.id)}">Beitreten</button></article>`).join("");
  }

  function amLobbyHtml() {
    const room = amRuntime.onlineDoc;
    const players = room.players || [];
    const host = amIsHost();
    return `<div class="am-app-page am-lobby-page"><button class="am-app-back" data-am-leave-room>← Raum verlassen</button><h4>Warteraum</h4>
      <div class="am-room-code"><small>${room.visibility === "private" ? "Privater Raumcode" : "Raumcode"}</small><b>${amEscape(amRuntime.onlineId)}</b><button data-am-copy-room-code>Kopieren</button></div>
      <div class="am-lobby-status"><span class="pulse"></span><b>Spiel startet gleich</b><small>Andere Spieler sehen öffentliche Räume direkt in ihrer App.</small></div>
      <div class="am-lobby-players">${Array.from({ length: room.maxPlayers || 4 }, (_, index) => {
        const player = players[index];
        const color = amPlayerColor(index);
        return `<article style="--c:${color.hex}"><span>${player ? player.isBot ? "BOT" : index + 1 : "+"}</span><div><b>${player ? amEscape(player.name) : "Freier Platz"}</b><small>${player ? player.uid === room.hostUid ? "Host" : player.isBot ? "Strategie-Bot" : "Online verbunden" : "Wartet auf Spieler"}</small></div></article>`;
      }).join("")}</div>
      ${host ? `<label class="am-check"><input type="checkbox" data-am-lobby-fill-bots ${room.fillBots ? "checked" : ""}> Beim Start freie Plätze mit Bots füllen</label><button class="am-primary" data-am-start-online ${players.length >= 2 || room.fillBots ? "" : "disabled"}>Spiel starten</button>` : `<p class="am-wait-host">Der Host startet die Partie, sobald genug Spieler da sind.</p>`}
    </div>`;
  }

  function amAppHtml() {
    if (amRuntime.view === "local-setup") return amLocalSetupHtml();
    if (amRuntime.view === "rules") return amRulesHtml();
    if (amRuntime.view === "online") return amOnlineHtml();
    return amHomeHtml();
  }

  function amRefreshApp() {
    const shell = document.querySelector("#detailDialog .device-shell");
    if (!shell?.classList.contains(`device-active-${AM_APP_ID}`)) return;
    const phone = typeof ownedPhoneItem === "function" ? ownedPhoneItem() : "";
    if (phone && typeof openDeviceInterface === "function") {
      const scroll = shell.querySelector(".device-screen")?.scrollTop || 0;
      openDeviceInterface(phone, AM_APP_ID, false);
      requestAnimationFrame(() => {
        const next = document.querySelector("#detailDialog .device-shell .device-screen");
        if (next) next.scrollTop = scroll;
      });
    }
  }

  async function amStartLocal(shell) {
    const total = Math.max(2, Math.min(4, Number(shell.querySelector("[data-am-local-count]")?.value || 4)));
    const players = amCreatePlayers(total, false);
    amRuntime.onlineId = "";
    amRuntime.onlineDoc = null;
    amSetLocalGame(amCreateGame(players, false));
    amRuntime.view = "home";
    amOpenBoard();
  }

  async function amCreateRoom(shell) {
    const fb = await amFirebase();
    const user = amRequireOnlineUser(fb);
    const maxPlayers = Math.max(2, Math.min(4, Number(shell.querySelector("[data-am-online-count]")?.value || 4)));
    const visibility = shell.querySelector("[data-am-online-visibility]")?.value === "private" ? "private" : "public";
    const fillBots = !!shell.querySelector("[data-am-fill-bots]")?.checked;
    let code = "";
    let ref = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      code = amNewCode();
      ref = fb.doc(fb.db, AM_COLLECTION, code);
      if (!(await fb.getDoc(ref)).exists()) break;
    }
    const player = { uid: user.uid, name: user.displayName || amPlayerDisplayName(), isBot: false };
    const room = {
      gameId: code,
      hostUid: user.uid,
      hostName: player.name,
      visibility,
      maxPlayers,
      fillBots,
      status: "lobby",
      playerUids: [user.uid],
      players: [player],
      gameState: null,
      winnerName: "",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      version: AM_VERSION
    };
    await fb.setDoc(ref, room);
    await amWatchRoom(code);
    amRuntime.view = "online";
    amRefreshApp();
  }

  async function amJoinRoom(codeRaw) {
    const code = String(codeRaw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length !== 6) throw new Error("Der Raumcode muss sechs Zeichen haben.");
    const fb = await amFirebase();
    const user = amRequireOnlineUser(fb);
    const ref = fb.doc(fb.db, AM_COLLECTION, code);
    await fb.runTransaction(fb.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Dieser Raum wurde nicht gefunden.");
      const room = snapshot.data();
      if (room.status !== "lobby") throw new Error("Diese Partie läuft bereits.");
      const players = Array.isArray(room.players) ? [...room.players] : [];
      if (players.some((entry) => entry.uid === user.uid)) return;
      if (players.length >= Number(room.maxPlayers || 4)) throw new Error("Der Raum ist bereits voll.");
      players.push({ uid: user.uid, name: user.displayName || amPlayerDisplayName(), isBot: false });
      transaction.update(ref, { players, playerUids: players.map((entry) => entry.uid), updatedAtMs: Date.now() });
    });
    await amWatchRoom(code);
    amRuntime.view = "online";
    amRefreshApp();
  }

  async function amWatchRoom(code) {
    const fb = await amFirebase();
    const user = amRequireOnlineUser(fb);
    amRuntime.onlineUnsub?.();
    amRuntime.onlineId = code;
    const ref = fb.doc(fb.db, AM_COLLECTION, code);
    amRuntime.onlineUnsub = fb.onSnapshot(ref, (snapshot) => {
      const previousStatus = amRuntime.onlineDoc?.status || "";
      if (!snapshot.exists()) {
        amToast("Der Online-Raum wurde geschlossen.");
        amDisconnectRoom(false);
        return;
      }
      amRuntime.onlineDoc = { id: snapshot.id, viewerUid: user.uid, ...snapshot.data() };
      if (previousStatus === "lobby" && amRuntime.onlineDoc.status === "playing") {
        // Der Host kann starten, während Gäste noch im Warteraum sind.
        // Das Spielbrett öffnet sich für alle Teilnehmer automatisch.
        amOpenBoard();
      }
      amRenderAll();
      amScheduleBot();
    }, (error) => amToast(`Raumverbindung: ${error.message || error}`));
  }

  async function amStartOnline(shell) {
    const fb = await amFirebase();
    const user = amRequireOnlineUser(fb);
    const ref = fb.doc(fb.db, AM_COLLECTION, amRuntime.onlineId);
    await fb.runTransaction(fb.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Raum nicht gefunden.");
      const room = snapshot.data();
      if (room.hostUid !== user.uid) throw new Error("Nur der Host kann starten.");
      if (room.status !== "lobby") return;
      const fillBots = !!shell.querySelector("[data-am-lobby-fill-bots]")?.checked;
      const humans = (room.players || []).filter((entry) => !entry.isBot);
      if (humans.length < 2 && !fillBots) throw new Error("Mindestens zwei Online-Spieler werden benötigt.");
      const players = amCreatePlayers(Number(room.maxPlayers || 4), true, humans);
      const gameState = amCreateGame(players, true);
      transaction.update(ref, {
        fillBots,
        players: players.map((player) => ({ uid: player.uid, name: player.name, isBot: player.isBot })),
        playerUids: humans.map((entry) => entry.uid),
        gameState,
        status: "playing",
        updatedAtMs: Date.now()
      });
    });
    amOpenBoard();
  }

  async function amOnlineRematch() {
    if (!amRuntime.onlineId || !amIsHost()) return;
    const fb = await amFirebase();
    const ref = fb.doc(fb.db, AM_COLLECTION, amRuntime.onlineId);
    await fb.runTransaction(fb.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Raum nicht gefunden.");
      const room = snapshot.data();
      const players = amClone(room.gameState?.players || []).map((player) => ({ ...player, points: 0, skipTurns: 0 }));
      transaction.update(ref, { gameState: amCreateGame(players, true), status: "playing", winnerName: "", updatedAtMs: Date.now() });
    });
  }

  async function amLeaveRoom() {
    if (!amRuntime.onlineId) return;
    try {
      const fb = await amFirebase();
      const user = amRequireOnlineUser(fb);
      const ref = fb.doc(fb.db, AM_COLLECTION, amRuntime.onlineId);
      await fb.runTransaction(fb.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return;
        const room = snapshot.data();
        if (room.status !== "lobby") return;
        if (room.hostUid === user.uid) {
          transaction.delete(ref);
          return;
        }
        const players = (room.players || []).filter((entry) => entry.uid !== user.uid);
        transaction.update(ref, { players, playerUids: players.map((entry) => entry.uid), updatedAtMs: Date.now() });
      });
    } catch (error) {
      amToast(error.message || error);
    }
    amDisconnectRoom(false);
  }

  function amDisconnectRoom(refresh = true) {
    amRuntime.onlineUnsub?.();
    amRuntime.onlineUnsub = null;
    amRuntime.onlineDoc = null;
    amRuntime.onlineId = "";
    amRuntime.view = "online";
    amCloseBoard();
    if (refresh) amRefreshApp();
  }

  async function amListenPublicRooms() {
    const fb = await amFirebase();
    amRequireOnlineUser(fb);
    amRuntime.publicUnsub?.();
    const query = fb.query(fb.collection(fb.db, AM_COLLECTION), fb.where("visibility", "==", "public"), fb.where("status", "==", "lobby"), fb.limit(30));
    amRuntime.publicUnsub = fb.onSnapshot(query, (snapshot) => {
      amRuntime.publicRooms = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((room) => room.status === "lobby" && room.visibility === "public" && (room.players?.length || 0) < Number(room.maxPlayers || 4))
        .sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
      if (amRuntime.view === "online") amRefreshApp();
    }, (error) => amToast(`Lobby-Liste: ${error.message || error}`));
  }

  function amBindApp(shell) {
    if (!shell) return;
    shell.querySelectorAll("[data-am-app]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.amApp;
      if (action === "resume") return amOpenBoard();
      amRuntime.view = action;
      if (action === "online") amListenPublicRooms().catch((error) => amToast(error.message || error));
      amRefreshApp();
    }));
    shell.querySelector("[data-am-start-local]")?.addEventListener("click", () => amStartLocal(shell));
    shell.querySelector("[data-am-create-room]")?.addEventListener("click", () => amCreateRoom(shell).catch((error) => amToast(error.message || error)));
    shell.querySelector("[data-am-join-code]")?.addEventListener("click", () => amJoinRoom(shell.querySelector("[data-am-room-code]")?.value).catch((error) => amToast(error.message || error)));
    shell.querySelectorAll("[data-am-join-room]").forEach((button) => button.addEventListener("click", () => amJoinRoom(button.dataset.amJoinRoom).catch((error) => amToast(error.message || error))));
    shell.querySelector("[data-am-refresh-rooms]")?.addEventListener("click", () => amListenPublicRooms().catch((error) => amToast(error.message || error)));
    shell.querySelector("[data-am-start-online]")?.addEventListener("click", () => amStartOnline(shell).catch((error) => amToast(error.message || error)));
    shell.querySelector("[data-am-leave-room]")?.addEventListener("click", () => amLeaveRoom());
    shell.querySelector("[data-am-online-disconnect]")?.addEventListener("click", () => amDisconnectRoom());
    shell.querySelector("[data-am-leave-view]")?.addEventListener("click", () => { amRuntime.view = "home"; amRefreshApp(); });
    shell.querySelector("[data-am-copy-room-code]")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(amRuntime.onlineId); amToast("Raumcode kopiert."); }
      catch { amToast(`Raumcode: ${amRuntime.onlineId}`); }
    });
  }

  // App in den LifeBuilder-App-Store einfügen.
  if (!phoneAppStoreCatalog.some((app) => app.id === AM_APP_ID)) {
    phoneAppStoreCatalog.push({
      id: AM_APP_ID,
      label: "ÄrgerMensch.KL",
      icon: "ÄM",
      minTier: 1,
      status: "available",
      description: "Modernes Mensch-ärgere-dich-nicht mit 2–4 Spielern, Strategie-Bots, Online-Lobbys, Raumcodes und Point-Shop."
    });
  }

  const amBasePhoneAppStoreHtml = phoneAppStoreHtml;
  phoneAppStoreHtml = function amPhoneAppStoreHtml(item) {
    return amBasePhoneAppStoreHtml(item).replace(
      /<p class="device-hint">[\s\S]*?<\/p>\s*<\/div>\s*$/,
      `<p class="device-hint">Heruntergeladene Apps wie ÄrgerMensch.KL erscheinen direkt hinter dem App Store. Online-Partien benötigen eine aktive Firebase-Anmeldung und eine SIM-Karte.</p></div>`
    );
  };

  const amBaseDeviceAppsFor = deviceAppsFor;
  deviceAppsFor = function amDeviceAppsFor(item) {
    const apps = amBaseDeviceAppsFor(item);
    if (!phoneItems().includes(item) || !isPhoneAppInstalled(AM_APP_ID) || apps.some((app) => app.id === AM_APP_ID)) return apps;
    const tier = deviceTier(item);
    const missingTier = tier < 1;
    const missingSim = !hasPhoneSim();
    apps.push({
      id: AM_APP_ID,
      min: 1,
      data: true,
      label: "ÄrgerMensch.KL",
      icon: "ÄM",
      text: "Klassisches Laufspiel im modernen Neon-Board. Spiele gegen strategische Bots oder online in öffentlichen und privaten Räumen.",
      layoutClass: "device-downloaded-app am-app-icon",
      locked: missingTier,
      lockText: missingTier ? "Benötigt mindestens ein Einsteiger-Smartphone." : missingSim ? "Bot-Spiele funktionieren ohne SIM. Für Online-Lobbys wird eine SIM-Karte benötigt." : ""
    });
    return apps;
  };

  const amBaseDeviceAppActions = deviceAppActions;
  deviceAppActions = function amDeviceAppActions(appId, item) {
    if (appId === AM_APP_ID) return amAppHtml();
    return amBaseDeviceAppActions(appId, item);
  };

  const amBaseOpenDeviceAppDirect = openDeviceAppDirect;
  openDeviceAppDirect = function amOpenDeviceAppDirect(item, appId) {
    if (appId === AM_APP_ID) return openDeviceInterface(item, AM_APP_ID, false);
    return amBaseOpenDeviceAppDirect(item, appId);
  };

  const amBaseOpenDeviceInterface = openDeviceInterface;
  openDeviceInterface = function amOpenDeviceInterface(item, activeApp = "home", activeUse = true) {
    const result = amBaseOpenDeviceInterface(item, activeApp, activeUse);
    if (activeApp === AM_APP_ID) {
      const shell = document.querySelector("#detailDialog .device-shell:last-of-type") || document.querySelector("#detailDialog .device-shell");
      amBindApp(shell);
    }
    return result;
  };

  window.addEventListener("beforeunload", () => {
    amRuntime.onlineUnsub?.();
    amRuntime.publicUnsub?.();
  });
})();
