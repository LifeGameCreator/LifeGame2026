(() => {
  "use strict";

  const BH_VERSION = "2026-07-24-responsive-arena-v5";
  const BH_DATABASE_ID = "gamekl";
  const BH_COLLECTION = "lifeBuilderBattleGames";
  const BH_TICK_MS = 320;
  const BH_COLORS = ["#ff4f6d", "#4aa8ff", "#ffd84c", "#49dc91"];
  const BH_COLOR_NAMES = ["Rot", "Blau", "Gelb", "Grün"];
  const BH_CITIES = ["Berlin", "Hamburg", "München", "Köln"];
  const BH_GAMES = {
    territory: {
      title: "Grundstück-Kampf",
      short: "Gebiete erobern",
      icon: "▦",
      accent: "#45e6b0",
      description: "Laufe über das Raster, erobere Felder und setze starke Gegenstände taktisch ein. Nach Ablauf der Zeit gewinnt das größte Gebiet."
    },
    packages: {
      title: "Paket-Chaos",
      short: "Logistik unter Druck",
      icon: "▣",
      accent: "#ffbf4b",
      description: "Sortiere farbige, zerbrechliche und Express-Pakete in die richtigen Städte. Fehler kosten Punkte, Sonderkarten stören deine Gegner."
    },
    reaction: {
      title: "Reaktions-Battle",
      short: "Schnell denken",
      icon: "⚡",
      accent: "#b876ff",
      description: "Reagiere auf wechselnde Aufgaben, wische, halte, vergleiche und finde das andere Symbol. Wer zuletzt Leben hat, gewinnt."
    }
  };
  const TERRITORY_POWER_META = {
    shield: { icon: "⬡", label: "Gebietsschutz", text: "Eigene Felder sind 10 Sekunden geschützt." },
    freeze: { icon: "❄", label: "Einfrieren", text: "Der stärkste Gegner steht 4 Sekunden still." },
    double: { icon: "×2", label: "Doppelte Eroberung", text: "8 Sekunden werden zusätzliche Felder erobert." },
    bomb: { icon: "✹", label: "Feld sprengen", text: "Wähle ein gegnerisches Feld und neutralisiere es." },
    random: { icon: "✦", label: "Zufallsgebiet", text: "Übernimm sofort fünf freie oder gegnerische Felder." }
  };
  const PACKAGE_CARD_META = {
    speed: { icon: "»", label: "Turbo-Band", text: "Beim Gegner stapeln sich 8 Sekunden lang Pakete." },
    swap: { icon: "⇄", label: "Ziele tauschen", text: "Zwei Farbrouten werden beim Gegner 6 Sekunden vertauscht." },
    blind: { icon: "◉", label: "Sicht blockieren", text: "Verdeckt dem Gegner 3 Sekunden die Sortierfläche." },
    stack: { icon: "+3", label: "Paketstapel", text: "Legt sofort drei zusätzliche Pakete aufs Band." }
  };

  const rt = {
    gameType: "territory",
    view: "launcher",
    standalone: false,
    overlay: null,
    local: null,
    room: null,
    roomId: "",
    roomUnsub: null,
    publicUnsub: null,
    publicRooms: [],
    firebasePromise: null,
    fb: null,
    ticker: null,
    toastTimer: null,
    pendingPower: "",
    pendingCard: "",
    careful: false,
    holdTimer: null,
    pointerStart: null,
    rewardKeys: new Set(),
    uiTicker: null,
    packageCardsOpen: false,
    territoryPowerOpen: false,
    territoryPointer: null,
    territoryHoldTimer: null,
    territoryHoldDelay: null
  };

  const clone = (value) => typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
  const escapeHtml = (value) => typeof window.escapeHtml === "function"
    ? window.escapeHtml(value)
    : String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  const clampNumber = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
  const shuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const nowMs = () => Date.now();

  function gameMeta(type = rt.gameType) {
    return BH_GAMES[type] || BH_GAMES.territory;
  }

  function playerName() {
    const fallback = `${state?.firstName || ""} ${state?.lastName || ""}`.trim() || "Spieler";
    try { return rt.fb?.auth?.currentUser?.displayName || fallback; }
    catch { return fallback; }
  }

  function userUid() {
    try { return rt.fb?.auth?.currentUser?.uid || ""; }
    catch { return ""; }
  }

  function ownPlayerIndex(game = currentGame()) {
    if (!game) return -1;
    if (!game.online) return 0;
    const uid = userUid() || rt.room?.viewerUid || "";
    return game.players.findIndex((player) => player.uid === uid);
  }

  function isHost() {
    const uid = userUid();
    return !!uid && rt.room?.hostUid === uid;
  }

  function currentGame() {
    return rt.room?.gameState || rt.local;
  }

  function newCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
  }

  async function firebaseRuntime() {
    if (rt.firebasePromise) return rt.firebasePromise;
    rt.firebasePromise = (async () => {
      const [appMod, authMod, dbMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
      ]);
      const config = firebasePhoneConfig;
      if (!config) throw new Error("Firebase-Konfiguration fehlt.");
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(config);
      const auth = authMod.getAuth(app);
      const db = dbMod.getFirestore(app, BH_DATABASE_ID);
      rt.fb = { ...authMod, ...dbMod, auth, db };
      return rt.fb;
    })().catch((error) => {
      rt.firebasePromise = null;
      throw error;
    });
    return rt.firebasePromise;
  }

  function requireUser(fb = rt.fb) {
    const user = fb?.auth?.currentUser;
    if (!user) throw new Error("Bitte zuerst mit deinem LifeBuilder-Firebase-Account anmelden.");
    return user;
  }

  function makePlayers(total, online = false, humans = []) {
    const players = [];
    if (online) {
      humans.slice(0, total).forEach((human, index) => players.push({
        id: human.uid,
        uid: human.uid,
        name: String(human.name || `Spieler ${index + 1}`).slice(0, 30),
        isBot: false,
        color: BH_COLORS[index],
        wins: Number(human.wins || 0),
        lastActionAtMs: 0
      }));
    } else {
      players.push({
        id: "local-human",
        uid: "local-human",
        name: state?.firstName || "Du",
        isBot: false,
        color: BH_COLORS[0],
        wins: 0,
        lastActionAtMs: 0
      });
    }
    const botNames = ["Nova Bot", "Mara Bot", "Kian Bot", "Rico Bot", "Lina Bot", "Tarek Bot"];
    while (players.length < total) {
      const index = players.length;
      players.push({
        id: `bot-${index}-${nowMs()}`,
        uid: `bot-${index}`,
        name: botNames[(index - 1 + botNames.length) % botNames.length],
        isBot: true,
        color: BH_COLORS[index],
        wins: 0,
        lastActionAtMs: 0,
        botSkill: 0.78 + Math.random() * 0.18
      });
    }
    return players;
  }

  function commonGame(type, players, settings = {}, online = false, round = 1) {
    const bestOf = [1, 3, 5].includes(Number(settings.bestOf)) ? Number(settings.bestOf) : 1;
    return {
      version: BH_VERSION,
      type,
      online,
      status: "playing",
      round,
      bestOf,
      targetWins: Math.ceil(bestOf / 2),
      players: players.map((player, index) => ({
        ...player,
        color: player.color || BH_COLORS[index],
        wins: Number(player.wins || 0),
        score: 0
      })),
      winnerId: "",
      winnerName: "",
      roundWinnerId: "",
      roundWinnerName: "",
      createdAtMs: nowMs(),
      updatedAtMs: nowMs(),
      log: []
    };
  }

  function initialTerritory(type, players, settings, online, round) {
    const game = commonGame(type, players, settings, online, round);
    // Das neue Hochformat-Raster nutzt auf Handys fast die komplette Bildschirmfläche.
    // Canvas statt hunderter DOM-Buttons hält die Darstellung auch auf schwächeren Geräten flüssig.
    const cols = 18;
    const rows = 24;
    const positions = [
      cols + 1,
      cols + (cols - 2),
      (rows - 2) * cols + 1,
      (rows - 2) * cols + (cols - 2)
    ];
    const owners = Array(cols * rows).fill(-1);
    game.cols = cols;
    game.rows = rows;
    game.durationSec = [120, 180].includes(Number(settings.durationSec)) ? Number(settings.durationSec) : 120;
    game.endsAtMs = nowMs() + game.durationSec * 1000;
    game.positions = {};
    game.inventory = {};
    game.effects = {};
    game.lastPowerSpawnAtMs = nowMs();
    game.powerups = [];
    game.owners = owners;
    game.botCursor = 0;
    game.players.forEach((player, index) => {
      game.positions[player.id] = positions[index];
      game.inventory[player.id] = { shield: 0, freeze: 0, double: 0, bomb: 0, random: 0 };
      game.effects[player.id] = { shieldUntilMs: 0, frozenUntilMs: 0, doubleUntilMs: 0 };
      const start = positions[index];
      const x = start % cols;
      const y = Math.floor(start / cols);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) owners[ny * cols + nx] = index;
        }
      }
    });
    spawnTerritoryPowerups(game, 12);
    game.log = ["Arena gestartet: Wischen, Steuerkreuz oder WASD benutzen."];
    return game;
  }

  function randomPackage(game, playerId) {
    const id = `${playerId}-${nowMs()}-${Math.random().toString(36).slice(2, 7)}`;
    const colorIndex = Math.floor(Math.random() * 4);
    const fragile = Math.random() < 0.28;
    const express = Math.random() < 0.25;
    const createdAtMs = nowMs();
    return {
      id,
      colorIndex,
      fragile,
      express,
      createdAtMs,
      expressUntilMs: express ? createdAtMs + 6500 : 0
    };
  }

  function initialPackages(type, players, settings, online, round) {
    const game = commonGame(type, players, settings, online, round);
    game.durationSec = [90, 120].includes(Number(settings.durationSec)) ? Number(settings.durationSec) : 90;
    game.endsAtMs = nowMs() + game.durationSec * 1000;
    game.mapping = shuffle(BH_CITIES);
    game.queues = {};
    game.cards = {};
    game.effects = {};
    game.correctCount = {};
    game.errors = {};
    game.combo = {};
    game.lastFeedback = {};
    game.botCursor = 0;
    game.players.forEach((player) => {
      game.queues[player.id] = Array.from({ length: 3 }, () => randomPackage(game, player.id));
      game.cards[player.id] = { speed: 0, swap: 0, blind: 0, stack: 0 };
      game.effects[player.id] = { speedUntilMs: 0, blindUntilMs: 0, swapUntilMs: 0, swapA: -1, swapB: -1, lastSpeedStackAtMs: 0 };
      game.correctCount[player.id] = 0;
      game.errors[player.id] = 0;
      game.combo[player.id] = 0;
      game.lastFeedback[player.id] = null;
    });
    game.log = ["Sortierstation bereit: Paket prüfen und auf das richtige Ziel tippen."];
    return game;
  }

  function makeReactionChallenge(index = 1) {
    const type = randomItem(["color", "not-red", "swipe-left", "hold", "larger", "odd"]);
    const createdAtMs = nowMs();
    const base = { id: `r-${createdAtMs}-${index}`, index, type, createdAtMs, deadlineMs: createdAtMs + 4200 };
    if (type === "color") {
      const target = Math.floor(Math.random() * 4);
      return { ...base, prompt: `Tippe auf ${BH_COLOR_NAMES[target]}`, options: [0, 1, 2, 3], correct: String(target) };
    }
    if (type === "not-red") return { ...base, prompt: "Tippe NICHT auf Rot", options: [0, 1, 2, 3], correct: "not-0" };
    if (type === "swipe-left") return { ...base, prompt: "Wische nach links", correct: "left" };
    if (type === "hold") return { ...base, prompt: "Halte den Knopf 0,8 Sekunden", correct: "hold" };
    if (type === "larger") {
      const a = 10 + Math.floor(Math.random() * 89);
      let b = 10 + Math.floor(Math.random() * 89);
      if (b === a) b += 1;
      return { ...base, prompt: "Drücke die größere Zahl", options: [a, b], correct: String(Math.max(a, b)) };
    }
    const symbols = ["◆", "◆", "◆", "◆"];
    const oddIndex = Math.floor(Math.random() * 4);
    symbols[oddIndex] = randomItem(["●", "▲", "■", "✦"]);
    return { ...base, prompt: "Finde das andere Symbol", options: symbols, correct: String(oddIndex) };
  }

  function initialReaction(type, players, settings, online, round) {
    const game = commonGame(type, players, settings, online, round);
    game.startLives = [3, 5, 7].includes(Number(settings.lives)) ? Number(settings.lives) : 5;
    game.challengeNo = 1;
    game.challenge = makeReactionChallenge(1);
    game.responses = {};
    game.lives = {};
    game.points = {};
    game.nextChallengeAtMs = 0;
    game.players.forEach((player) => {
      game.lives[player.id] = game.startLives;
      game.points[player.id] = 0;
    });
    game.log = ["Reagiere richtig, bevor die Zeit abläuft."];
    return game;
  }

  function createGame(type, players, settings = {}, online = false, round = 1) {
    if (type === "packages") return initialPackages(type, players, settings, online, round);
    if (type === "reaction") return initialReaction(type, players, settings, online, round);
    return initialTerritory("territory", players, settings, online, round);
  }

  function settingsFromGame(game) {
    if (game.type === "reaction") return { bestOf: game.bestOf, lives: game.startLives };
    return { bestOf: game.bestOf, durationSec: game.durationSec };
  }

  function scoreTerritory(game) {
    return game.players.map((player, index) => ({ player, score: game.owners.filter((owner) => owner === index).length }));
  }

  function leaderIndex(game) {
    if (game.type === "territory") {
      const scores = scoreTerritory(game);
      return scores.sort((a, b) => b.score - a.score)[0] ? game.players.indexOf(scores.sort((a, b) => b.score - a.score)[0].player) : 0;
    }
    return game.players.reduce((best, player, index) => Number(player.score || 0) > Number(game.players[best]?.score || 0) ? index : best, 0);
  }

  function finishRound(game, winnerIndex, reason = "") {
    if (game.status !== "playing") return false;
    const winner = game.players[winnerIndex] || game.players[0];
    winner.wins = Number(winner.wins || 0) + 1;
    game.roundWinnerId = winner.id;
    game.roundWinnerName = winner.name;
    game.log = [`${winner.name} gewinnt Runde ${game.round}.${reason ? ` ${reason}` : ""}`, ...(game.log || [])].slice(0, 14);
    if (winner.wins >= Number(game.targetWins || 1)) {
      game.status = "seriesOver";
      game.winnerId = winner.id;
      game.winnerName = winner.name;
    } else {
      game.status = "roundOver";
    }
    game.updatedAtMs = nowMs();
    return true;
  }

  function tieBreakWinner(game, scores) {
    const sorted = scores.map((score, index) => ({ score: Number(score || 0), index }))
      .sort((a, b) => b.score - a.score || Number(game.players[b.index]?.wins || 0) - Number(game.players[a.index]?.wins || 0) || a.index - b.index);
    return sorted[0]?.index || 0;
  }

  function finalizeTimedGame(game) {
    if (game.type === "territory") {
      const scores = scoreTerritory(game).map((entry) => entry.score);
      return finishRound(game, tieBreakWinner(game, scores), `Größtes Gebiet: ${Math.max(...scores)} Felder.`);
    }
    if (game.type === "packages") {
      const scores = game.players.map((player) => Number(player.score || 0));
      return finishRound(game, tieBreakWinner(game, scores), `Beste Logistikleistung: ${Math.max(...scores)} Punkte.`);
    }
    return false;
  }

  function nextRoundGame(game) {
    const players = game.players.map((player) => ({ ...player, score: 0, lastActionAtMs: 0 }));
    return createGame(game.type, players, settingsFromGame(game), !!game.online, Number(game.round || 1) + 1);
  }

  function adjacentCells(game, cell) {
    const x = cell % game.cols;
    const y = Math.floor(cell / game.cols);
    const result = [];
    if (x > 0) result.push(cell - 1);
    if (x < game.cols - 1) result.push(cell + 1);
    if (y > 0) result.push(cell - game.cols);
    if (y < game.rows - 1) result.push(cell + game.cols);
    return result;
  }

  function spawnTerritoryPowerups(game, count = 1) {
    const types = Object.keys(TERRITORY_POWER_META);
    game.powerups ||= [];
    const occupied = new Set(game.powerups.map((entry) => entry.cell));
    for (let i = 0; i < count; i += 1) {
      let cell = Math.floor(Math.random() * game.owners.length);
      let guard = 0;
      while ((occupied.has(cell) || Object.values(game.positions).includes(cell)) && guard < 50) {
        cell = Math.floor(Math.random() * game.owners.length);
        guard += 1;
      }
      occupied.add(cell);
      game.powerups.push({ cell, type: randomItem(types), id: `${nowMs()}-${i}-${Math.random()}` });
    }
  }

  function claimTerritoryCell(game, playerIndex, cell, allowProtected = false) {
    const owner = Number(game.owners[cell]);
    if (owner >= 0 && owner !== playerIndex && !allowProtected) {
      const ownerPlayer = game.players[owner];
      if (Number(game.effects?.[ownerPlayer.id]?.shieldUntilMs || 0) > nowMs()) return false;
    }
    game.owners[cell] = playerIndex;
    return true;
  }

  function collectPower(game, playerIndex, cell) {
    const pickupIndex = game.powerups.findIndex((entry) => entry.cell === cell);
    if (pickupIndex < 0) return;
    const pickup = game.powerups.splice(pickupIndex, 1)[0];
    const player = game.players[playerIndex];
    game.inventory[player.id][pickup.type] = Number(game.inventory[player.id][pickup.type] || 0) + 1;
    game.log = [`${player.name} sammelt ${TERRITORY_POWER_META[pickup.type].label}.`, ...(game.log || [])].slice(0, 14);
  }

  function territoryMove(game, playerIndex, targetCell, ignoreCooldown = false) {
    if (game.status !== "playing") return false;
    const player = game.players[playerIndex];
    if (!player) return false;
    const now = nowMs();
    const effect = game.effects[player.id] || {};
    if (Number(effect.frozenUntilMs || 0) > now) return false;
    const cooldown = game.online ? 380 : 95;
    if (!ignoreCooldown && now - Number(player.lastActionAtMs || 0) < cooldown) return false;
    const current = Number(game.positions[player.id]);
    if (!adjacentCells(game, current).includes(Number(targetCell))) return false;
    if (!claimTerritoryCell(game, playerIndex, Number(targetCell))) return false;
    game.positions[player.id] = Number(targetCell);
    player.lastActionAtMs = now;
    collectPower(game, playerIndex, Number(targetCell));
    if (Number(effect.doubleUntilMs || 0) > now) {
      const extras = shuffle(adjacentCells(game, Number(targetCell))).filter((cell) => game.owners[cell] !== playerIndex);
      extras.slice(0, 2).forEach((cell) => claimTerritoryCell(game, playerIndex, cell));
    }
    game.updatedAtMs = now;
    return true;
  }

  function territoryTargetForDirection(game, current, direction) {
    const x = current % game.cols;
    const y = Math.floor(current / game.cols);
    if (direction === "left" && x > 0) return current - 1;
    if (direction === "right" && x < game.cols - 1) return current + 1;
    if (direction === "up" && y > 0) return current - game.cols;
    if (direction === "down" && y < game.rows - 1) return current + game.cols;
    return current;
  }

  function territoryMoveDirection(game, playerIndex, direction, steps = 1) {
    let changed = false;
    const amount = Math.max(1, Math.min(3, Number(steps || 1)));
    for (let step = 0; step < amount; step += 1) {
      const player = game.players[playerIndex];
      if (!player) break;
      const current = Number(game.positions[player.id]);
      const target = territoryTargetForDirection(game, current, direction);
      if (target === current || !territoryMove(game, playerIndex, target, step > 0)) break;
      changed = true;
    }
    return changed;
  }

  function strongestOpponentIndex(game, playerIndex) {
    const scores = game.type === "territory"
      ? scoreTerritory(game).map((entry) => entry.score)
      : game.players.map((player) => Number(player.score || 0));
    const candidates = scores.map((score, index) => ({ score, index })).filter((entry) => entry.index !== playerIndex);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.index ?? ((playerIndex + 1) % game.players.length);
  }

  function useTerritoryPower(game, playerIndex, type, payload = {}) {
    const player = game.players[playerIndex];
    const inventory = game.inventory?.[player.id];
    if (!inventory || Number(inventory[type] || 0) < 1 || game.status !== "playing") return false;
    const now = nowMs();
    if (type === "shield") game.effects[player.id].shieldUntilMs = now + 10000;
    else if (type === "freeze") {
      const target = strongestOpponentIndex(game, playerIndex);
      game.effects[game.players[target].id].frozenUntilMs = now + 4000;
    } else if (type === "double") game.effects[player.id].doubleUntilMs = now + 8000;
    else if (type === "random") {
      const cells = shuffle(game.owners.map((owner, cell) => ({ owner, cell })))
        .filter((entry) => entry.owner !== playerIndex)
        .map((entry) => entry.cell);
      let claimed = 0;
      for (const cell of cells) {
        if (claimTerritoryCell(game, playerIndex, cell) && ++claimed >= 5) break;
      }
    } else if (type === "bomb") {
      const cell = Number(payload.cell);
      const owner = Number(game.owners[cell]);
      if (!Number.isInteger(cell) || cell < 0 || cell >= game.owners.length || owner < 0 || owner === playerIndex) return false;
      const ownerPlayer = game.players[owner];
      if (Number(game.effects[ownerPlayer.id]?.shieldUntilMs || 0) > now) return false;
      game.owners[cell] = -1;
    } else return false;
    inventory[type] -= 1;
    game.log = [`${player.name} nutzt ${TERRITORY_POWER_META[type].label}.`, ...(game.log || [])].slice(0, 14);
    game.updatedAtMs = now;
    return true;
  }

  function territoryBotAction(game, playerIndex) {
    const player = game.players[playerIndex];
    const now = nowMs();
    if (Number(game.effects[player.id]?.frozenUntilMs || 0) > now || now - Number(player.lastActionAtMs || 0) < 360) return false;
    const inventory = game.inventory[player.id];
    const territoryScores = scoreTerritory(game);
    const ownScore = territoryScores[playerIndex].score;
    const leader = Math.max(...territoryScores.map((entry) => entry.score));
    if (inventory.shield && Math.random() < 0.055) return useTerritoryPower(game, playerIndex, "shield");
    if (inventory.freeze && leader > ownScore + 10 && Math.random() < 0.1) return useTerritoryPower(game, playerIndex, "freeze");
    if (inventory.double && Math.random() < 0.085) return useTerritoryPower(game, playerIndex, "double");
    if (inventory.random && Math.random() < 0.065) return useTerritoryPower(game, playerIndex, "random");
    if (inventory.bomb && Math.random() < 0.065) {
      const enemyCells = game.owners.map((owner, cell) => ({ owner, cell })).filter((entry) => entry.owner >= 0 && entry.owner !== playerIndex);
      if (enemyCells.length) return useTerritoryPower(game, playerIndex, "bomb", { cell: randomItem(enemyCells).cell });
    }
    const current = Number(game.positions[player.id]);
    const options = adjacentCells(game, current).map((cell) => {
      const owner = Number(game.owners[cell]);
      const pickup = game.powerups.some((entry) => entry.cell === cell);
      let value = owner === -1 ? 9 : owner === playerIndex ? 1 : 15;
      if (pickup) value += 26;
      value += adjacentCells(game, cell).filter((next) => game.owners[next] !== playerIndex).length * 2 + Math.random() * 5;
      return { cell, value };
    }).sort((a, b) => b.value - a.value);
    const best = options.find((option) => {
      const owner = Number(game.owners[option.cell]);
      if (owner < 0 || owner === playerIndex) return true;
      const ownerPlayer = game.players[owner];
      return Number(game.effects?.[ownerPlayer.id]?.shieldUntilMs || 0) <= now;
    });
    if (!best) { player.lastActionAtMs = now; return false; }
    const delta = best.cell - current;
    const direction = delta === -1 ? "left" : delta === 1 ? "right" : delta === -game.cols ? "up" : "down";
    return territoryMoveDirection(game, playerIndex, direction, 2);
  }

  function effectivePackageMapping(game, playerId) {
    const mapping = [...game.mapping];
    const effect = game.effects[playerId] || {};
    if (Number(effect.swapUntilMs || 0) > nowMs() && effect.swapA >= 0 && effect.swapB >= 0) {
      [mapping[effect.swapA], mapping[effect.swapB]] = [mapping[effect.swapB], mapping[effect.swapA]];
    }
    return mapping;
  }

  function packageProcess(game, playerIndex, city, careful = false, forceCorrect = null) {
    if (game.status !== "playing") return false;
    const player = game.players[playerIndex];
    const queue = game.queues[player.id] || [];
    const pack = queue[0];
    if (!pack) return false;
    const mapping = effectivePackageMapping(game, player.id);
    const expected = mapping[pack.colorIndex];
    const correct = forceCorrect == null ? (city === expected && (!pack.fragile || careful)) : !!forceCorrect;
    if (correct) {
      let gain = 12;
      if (pack.fragile) gain += 5;
      if (pack.express && nowMs() <= pack.expressUntilMs) gain += 8;
      game.combo[player.id] = Number(game.combo[player.id] || 0) + 1;
      gain += Math.min(10, Math.floor(game.combo[player.id] / 3) * 2);
      player.score = Number(player.score || 0) + gain;
      game.correctCount[player.id] = Number(game.correctCount[player.id] || 0) + 1;
      game.lastFeedback[player.id] = { kind: "correct", text: `+${gain} Punkte`, atMs: nowMs() };
      if (game.correctCount[player.id] % 4 === 0) {
        const card = randomItem(Object.keys(PACKAGE_CARD_META));
        game.cards[player.id][card] = Number(game.cards[player.id][card] || 0) + 1;
        game.log = [`${player.name} erhält ${PACKAGE_CARD_META[card].label}.`, ...(game.log || [])].slice(0, 14);
      }
    } else {
      player.score = Math.max(-75, Number(player.score || 0) - 7);
      game.combo[player.id] = 0;
      game.errors[player.id] = Number(game.errors[player.id] || 0) + 1;
      const cause = pack.fragile && !careful ? "Zerbrechlich nicht gesichert" : `Falsches Ziel – richtig wäre ${expected}`;
      game.lastFeedback[player.id] = { kind: "wrong", text: `−7 · ${cause}`, atMs: nowMs() };
    }
    queue.shift();
    queue.push(randomPackage(game, player.id));
    player.lastActionAtMs = nowMs();
    game.updatedAtMs = nowMs();
    return true;
  }

  function usePackageCard(game, playerIndex, card, targetIndex) {
    const player = game.players[playerIndex];
    const target = game.players[targetIndex];
    if (!player || !target || playerIndex === targetIndex || Number(game.cards[player.id]?.[card] || 0) < 1 || game.status !== "playing") return false;
    const now = nowMs();
    const effect = game.effects[target.id];
    if (card === "speed") {
      effect.speedUntilMs = now + 8000;
      effect.lastSpeedStackAtMs = 0;
    } else if (card === "swap") {
      const pair = shuffle([0, 1, 2, 3]).slice(0, 2);
      effect.swapA = pair[0];
      effect.swapB = pair[1];
      effect.swapUntilMs = now + 6000;
    } else if (card === "blind") effect.blindUntilMs = now + 3000;
    else if (card === "stack") {
      const queue = game.queues[target.id];
      for (let i = 0; i < 3; i += 1) queue.push(randomPackage(game, target.id));
    } else return false;
    game.cards[player.id][card] -= 1;
    game.log = [`${player.name} setzt ${PACKAGE_CARD_META[card].label} gegen ${target.name} ein.`, ...(game.log || [])].slice(0, 14);
    game.updatedAtMs = now;
    return true;
  }

  function packageBotAction(game, playerIndex) {
    const player = game.players[playerIndex];
    const now = nowMs();
    const queue = game.queues[player.id] || [];
    if (!queue.length || now - Number(player.lastActionAtMs || 0) < 680 + Math.random() * 650) return false;
    const cards = game.cards[player.id];
    const available = Object.keys(cards).filter((key) => Number(cards[key] || 0) > 0);
    if (available.length && Math.random() < 0.12) {
      const targetIndex = strongestOpponentIndex(game, playerIndex);
      if (usePackageCard(game, playerIndex, randomItem(available), targetIndex)) return true;
    }
    const pack = queue[0];
    const mapping = effectivePackageMapping(game, player.id);
    const accuracy = clampNumber(player.botSkill || 0.86, 0.72, 0.97);
    const routeCorrect = Math.random() < accuracy;
    const handledCarefully = !pack.fragile || Math.random() < accuracy;
    const finalCorrect = routeCorrect && handledCarefully;
    const city = routeCorrect ? mapping[pack.colorIndex] : randomItem(BH_CITIES.filter((entry) => entry !== mapping[pack.colorIndex]));
    return packageProcess(game, playerIndex, city, handledCarefully, finalCorrect);
  }

  function reactionAnswerCorrect(challenge, answer) {
    if (!challenge) return false;
    if (challenge.type === "not-red") return String(answer) !== "0" && ["1", "2", "3"].includes(String(answer));
    return String(answer) === String(challenge.correct);
  }

  function submitReaction(game, playerIndex, answer) {
    if (game.status !== "playing" || !game.challenge || nowMs() > Number(game.challenge.deadlineMs || 0)) return false;
    const player = game.players[playerIndex];
    if (!player || Number(game.lives[player.id] || 0) <= 0 || game.responses[player.id]) return false;
    const correct = reactionAnswerCorrect(game.challenge, answer);
    game.responses[player.id] = { answer: String(answer), correct, atMs: nowMs() };
    if (correct) game.points[player.id] = Number(game.points[player.id] || 0) + 1;
    player.lastActionAtMs = nowMs();
    game.updatedAtMs = nowMs();
    return true;
  }

  function resolveReactionChallenge(game) {
    if (game.status !== "playing" || !game.challenge) return false;
    const alive = game.players.filter((player) => Number(game.lives[player.id] || 0) > 0);
    const allAnswered = alive.every((player) => !!game.responses[player.id]);
    if (!allAnswered && nowMs() < Number(game.challenge.deadlineMs || 0)) return false;
    alive.forEach((player) => {
      const response = game.responses[player.id];
      if (!response?.correct) game.lives[player.id] = Math.max(0, Number(game.lives[player.id] || 0) - 1);
    });
    const survivors = game.players.filter((player) => Number(game.lives[player.id] || 0) > 0);
    if (survivors.length <= 1 || Number(game.challengeNo || 1) >= 25) {
      let winnerIndex = survivors.length === 1 ? game.players.indexOf(survivors[0]) : -1;
      if (winnerIndex < 0) {
        const values = game.players.map((player) => Number(game.lives[player.id] || 0) * 100 + Number(game.points[player.id] || 0));
        winnerIndex = tieBreakWinner(game, values);
      }
      return finishRound(game, winnerIndex, `Verbleibende Leben: ${game.lives[game.players[winnerIndex].id] || 0}.`);
    }
    game.challenge = null;
    game.nextChallengeAtMs = nowMs() + 1100;
    game.log = [`Aufgabe ${game.challengeNo} ausgewertet.`, ...(game.log || [])].slice(0, 14);
    game.updatedAtMs = nowMs();
    return true;
  }

  function reactionBotTick(game, playerIndex) {
    const player = game.players[playerIndex];
    const challenge = game.challenge;
    if (!challenge || game.responses[player.id] || Number(game.lives[player.id] || 0) <= 0) return false;
    const elapsed = nowMs() - Number(challenge.createdAtMs || 0);
    const delay = 520 + (1 - clampNumber(player.botSkill || 0.86, 0.7, 0.98)) * 1800 + Math.random() * 650;
    if (elapsed < delay) return false;
    const correct = Math.random() < clampNumber(player.botSkill || 0.86, 0.72, 0.96);
    let answer = challenge.correct;
    if (challenge.type === "not-red") answer = correct ? String(randomItem([1, 2, 3])) : "0";
    else if (!correct) {
      const options = Array.isArray(challenge.options) ? challenge.options.map((_, index) => String(challenge.type === "larger" ? challenge.options[index] : index)) : ["wrong"];
      answer = randomItem(options.filter((value) => String(value) !== String(challenge.correct))) || "wrong";
    }
    return submitReaction(game, playerIndex, answer);
  }

  function tickGame(game) {
    if (!game || game.status !== "playing") return false;
    const now = nowMs();
    let changed = false;
    if (game.type === "territory") {
      if (now >= Number(game.endsAtMs || 0)) return finalizeTimedGame(game);
      if (now - Number(game.lastPowerSpawnAtMs || 0) >= 9000 && game.powerups.length < 12) {
        spawnTerritoryPowerups(game, 2);
        game.lastPowerSpawnAtMs = now;
        changed = true;
      }
      const bots = game.players.map((player, index) => ({ player, index })).filter((entry) => entry.player.isBot);
      if (bots.length) {
        const cursor = Number(game.botCursor || 0) % bots.length;
        if (territoryBotAction(game, bots[cursor].index)) changed = true;
        game.botCursor = (cursor + 1) % bots.length;
      }
    } else if (game.type === "packages") {
      if (now >= Number(game.endsAtMs || 0)) return finalizeTimedGame(game);
      game.players.forEach((player) => {
        const effect = game.effects[player.id];
        if (Number(effect.speedUntilMs || 0) > now && now - Number(effect.lastSpeedStackAtMs || 0) >= 2300) {
          if ((game.queues[player.id] || []).length < 8) game.queues[player.id].push(randomPackage(game, player.id));
          effect.lastSpeedStackAtMs = now;
          changed = true;
        }
      });
      const bots = game.players.map((player, index) => ({ player, index })).filter((entry) => entry.player.isBot);
      if (bots.length) {
        const cursor = Number(game.botCursor || 0) % bots.length;
        if (packageBotAction(game, bots[cursor].index)) changed = true;
        game.botCursor = (cursor + 1) % bots.length;
      }
    } else if (game.type === "reaction") {
      if (game.challenge) {
        game.players.forEach((player, index) => { if (player.isBot && reactionBotTick(game, index)) changed = true; });
        if (resolveReactionChallenge(game)) changed = true;
      } else if (now >= Number(game.nextChallengeAtMs || 0)) {
        game.challengeNo = Number(game.challengeNo || 0) + 1;
        game.challenge = makeReactionChallenge(game.challengeNo);
        game.responses = {};
        game.nextChallengeAtMs = 0;
        changed = true;
      }
    }
    if (changed) game.updatedAtMs = now;
    return changed;
  }

  async function mutate(mutator) {
    if (rt.roomId) {
      const fb = await firebaseRuntime();
      requireUser(fb);
      const ref = fb.doc(fb.db, BH_COLLECTION, rt.roomId);
      let output = null;
      await fb.runTransaction(fb.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("Der Online-Raum wurde geschlossen.");
        const room = snapshot.data();
        if (!room.gameState) throw new Error("Das Spiel wurde noch nicht gestartet.");
        const game = clone(room.gameState);
        output = await mutator(game, room);
        if (output === false || output?.changed === false) return;
        game.updatedAtMs = nowMs();
        transaction.update(ref, { gameState: game, status: game.status === "seriesOver" ? "finished" : "playing", winnerName: game.winnerName || "", updatedAtMs: nowMs() });
      });
      return output;
    }
    if (!rt.local) return false;
    const game = clone(rt.local);
    const output = await mutator(game, null);
    if (output === false || output?.changed === false) return output;
    game.updatedAtMs = nowMs();
    rt.local = game;
    render();
    maybeAwardReward(game);
    return output;
  }

  function updateVisibleTimers() {
    rt.overlay?.querySelectorAll("[data-bh-timer]").forEach((node) => {
      const target = Number(node.dataset.bhTimer || 0);
      node.textContent = formatTime(target - nowMs());
    });
  }

  function startTicker() {
    stopTicker();
    rt.uiTicker = setInterval(updateVisibleTimers, 180);
    const game = currentGame();
    const interval = game?.online ? 760 : BH_TICK_MS;
    rt.ticker = setInterval(() => {
      const active = currentGame();
      if (!active || active.status !== "playing") return;
      if (active.online && !isHost()) return;
      mutate((next) => tickGame(next)).catch((error) => toast(error.message || error));
    }, interval);
  }

  function stopTicker() {
    clearInterval(rt.ticker);
    clearInterval(rt.uiTicker);
    rt.ticker = null;
    rt.uiTicker = null;
    clearInterval(rt.territoryHoldTimer);
    clearTimeout(rt.territoryHoldDelay);
    rt.territoryHoldTimer = null;
    rt.territoryHoldDelay = null;
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }

  function playersHtml(game) {
    return game.players.map((player, index) => {
      let score = Number(player.score || 0);
      if (game.type === "territory") score = game.owners.filter((owner) => owner === index).length;
      const detail = game.type === "reaction" ? `${game.lives[player.id] || 0} Leben` : `${score} Punkte`;
      return `<article class="bh-player ${index === ownPlayerIndex(game) ? "own" : ""}" style="--player:${player.color}"><span>${player.isBot ? "BOT" : index + 1}</span><div><b>${escapeHtml(player.name)}</b><small>${detail} · ${player.wins || 0}/${game.targetWins} Rundensiege</small></div></article>`;
    }).join("");
  }

  function territoryCellHtml() {
    return "";
  }

  function rgbaFromHex(hex, alpha = 1) {
    const clean = String(hex || "#ffffff").replace("#", "");
    const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const num = Number.parseInt(value, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawTerritoryCanvas(canvas, game) {
    if (!canvas || !game) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#071522");
    gradient.addColorStop(1, "#030914");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const pad = Math.max(7, Math.min(w, h) * 0.018);
    const cell = Math.min((w - pad * 2) / game.cols, (h - pad * 2) / game.rows);
    const boardW = cell * game.cols;
    const boardH = cell * game.rows;
    const ox = (w - boardW) / 2;
    const oy = (h - boardH) / 2;
    canvas.dataset.cellSize = String(cell);
    canvas.dataset.offsetX = String(ox);
    canvas.dataset.offsetY = String(oy);

    ctx.fillStyle = "rgba(255,255,255,.025)";
    ctx.fillRect(ox, oy, boardW, boardH);
    for (let index = 0; index < game.owners.length; index += 1) {
      const x = index % game.cols;
      const y = Math.floor(index / game.cols);
      const px = ox + x * cell;
      const py = oy + y * cell;
      const owner = Number(game.owners[index]);
      if (owner >= 0 && game.players[owner]) {
        ctx.fillStyle = rgbaFromHex(game.players[owner].color, .58);
        ctx.fillRect(px + .6, py + .6, cell - 1.2, cell - 1.2);
      }
    }
    ctx.strokeStyle = "rgba(170,218,255,.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= game.cols; x += 1) { ctx.moveTo(ox + x * cell, oy); ctx.lineTo(ox + x * cell, oy + boardH); }
    for (let y = 0; y <= game.rows; y += 1) { ctx.moveTo(ox, oy + y * cell); ctx.lineTo(ox + boardW, oy + y * cell); }
    ctx.stroke();

    const now = nowMs();
    game.powerups.forEach((pickup) => {
      const x = pickup.cell % game.cols;
      const y = Math.floor(pickup.cell / game.cols);
      const cx = ox + (x + .5) * cell;
      const cy = oy + (y + .5) * cell;
      ctx.save();
      ctx.shadowColor = "rgba(255,255,255,.8)";
      ctx.shadowBlur = cell * .7;
      ctx.fillStyle = "rgba(245,252,255,.96)";
      ctx.font = `900 ${Math.max(9, cell * .72)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(TERRITORY_POWER_META[pickup.type]?.icon || "✦", cx, cy);
      ctx.restore();
    });

    game.players.forEach((player, index) => {
      const pos = Number(game.positions[player.id]);
      const x = pos % game.cols;
      const y = Math.floor(pos / game.cols);
      const cx = ox + (x + .5) * cell;
      const cy = oy + (y + .5) * cell;
      const frozen = Number(game.effects[player.id]?.frozenUntilMs || 0) > now;
      ctx.save();
      ctx.shadowColor = player.color;
      ctx.shadowBlur = cell * 1.15;
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(5, cell * .43), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1.4, cell * .09);
      ctx.strokeStyle = index === ownPlayerIndex(game) ? "#ffffff" : "rgba(255,255,255,.78)";
      ctx.stroke();
      ctx.fillStyle = "#07111d";
      ctx.font = `1000 ${Math.max(8, cell * .58)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(frozen ? "❄" : String(index + 1), cx, cy + .3);
      ctx.restore();
    });

    if (rt.pendingPower === "bomb") {
      ctx.fillStyle = "rgba(255,79,109,.12)";
      ctx.fillRect(ox, oy, boardW, boardH);
      ctx.strokeStyle = "rgba(255,105,125,.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + 1, oy + 1, boardW - 2, boardH - 2);
    }
  }

  function territoryCanvasCell(canvas, event, game) {
    const rect = canvas.getBoundingClientRect();
    const cell = Number(canvas.dataset.cellSize || 0);
    const ox = Number(canvas.dataset.offsetX || 0);
    const oy = Number(canvas.dataset.offsetY || 0);
    if (!cell) return -1;
    const x = Math.floor((event.clientX - rect.left - ox) / cell);
    const y = Math.floor((event.clientY - rect.top - oy) / cell);
    if (x < 0 || y < 0 || x >= game.cols || y >= game.rows) return -1;
    return y * game.cols + x;
  }

  function territoryHtml(game) {
    const ownIndex = ownPlayerIndex(game);
    const ownPlayer = game.players[ownIndex];
    const inventory = ownPlayer ? game.inventory[ownPlayer.id] : {};
    const effects = ownPlayer ? game.effects[ownPlayer.id] : {};
    const powerCount = Object.values(inventory || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const status = Number(effects?.frozenUntilMs || 0) > nowMs()
      ? "❄ Eingefroren"
      : Number(effects?.doubleUntilMs || 0) > nowMs()
        ? "×2 Doppelte Eroberung"
        : Number(effects?.shieldUntilMs || 0) > nowMs()
          ? "⬡ Gebiet geschützt"
          : "Wischen oder Feld antippen";
    return `<div class="bh-game-main bh-territory-main bh-arena-v3">
      <section class="bh-territory-board-wrap">
        <div class="bh-board-status bh-arena-status"><b data-bh-timer="${Number(game.endsAtMs || 0)}">${formatTime(Number(game.endsAtMs || 0) - nowMs())}</b><span>${status}</span><button class="bh-mobile-boost-trigger" data-bh-toggle-powers>Boosts <strong>${powerCount}</strong></button></div>
        <div class="bh-territory-canvas-wrap"><canvas class="bh-territory-canvas" data-bh-territory-canvas aria-label="Grundstück-Kampf Arena"></canvas><div class="bh-canvas-tip">WISCHEN = 2 FELDER · TIPPEN = 1 FELD</div></div>
        <div class="bh-move-pad bh-move-pad-v2"><button data-bh-move="up" aria-label="Nach oben">▲</button><button data-bh-move="left" aria-label="Nach links">◀</button><button class="center" disabled>●</button><button data-bh-move="right" aria-label="Nach rechts">▶</button><button data-bh-move="down" aria-label="Nach unten">▼</button></div>
      </section>
      <section class="bh-power-panel bh-power-dock ${rt.territoryPowerOpen ? "open" : ""}"><header><div><h3>Power-Ups</h3><p>Auf der Arena einsammeln und mit einem Klick aktivieren.</p></div><div class="bh-power-head-actions"><small>${game.owners.filter((owner) => owner === ownIndex).length} Felder</small><button data-bh-toggle-powers>${rt.territoryPowerOpen ? "Schließen" : "Boosts öffnen"}</button></div></header><div class="bh-boost-grid">${Object.entries(TERRITORY_POWER_META).map(([id, meta]) => `<button data-bh-territory-power="${id}" ${Number(inventory?.[id] || 0) > 0 ? "" : "disabled"} class="${rt.pendingPower === id ? "selected" : ""}" title="${meta.text}"><span>${meta.icon}</span><div><b>${meta.label}</b><small>${meta.text}</small></div><strong>${Number(inventory?.[id] || 0)}</strong></button>`).join("")}</div>${rt.pendingPower === "bomb" ? `<div class="bh-inline-hint">Tippe jetzt ein gegnerisches Feld auf der Arena. <button data-bh-cancel-power>Abbrechen</button></div>` : ""}</section>
    </div>`;
  }

  function packageCardVisual(pack, compact = false) {
    const color = BH_COLORS[pack.colorIndex];
    return `<div class="bh-package ${compact ? "compact" : "hero"}" style="--pack:${color}"><span class="tape"></span><div class="bh-package-mark">${pack.express ? "EXPRESS" : "SCANNER"}</div><small class="bh-package-kicker">FARBCODE</small><b>${BH_COLOR_NAMES[pack.colorIndex]}</b><div>${pack.fragile ? "⚠ ZERBRECHLICH" : "▰ STANDARDPAKET"}</div><small>${pack.express ? `<span data-bh-timer="${pack.expressUntilMs}">${formatTime(pack.expressUntilMs - nowMs())}</span> bis Ablauf` : "Route über die Farbe bestimmen"}</small></div>`;
  }

  function packageHtml(game) {
    const ownIndex = ownPlayerIndex(game);
    const player = game.players[ownIndex];
    if (!player) return `<p>Du bist nicht mehr Teil dieses Raums.</p>`;
    const queue = game.queues[player.id] || [];
    const current = queue[0];
    const mapping = effectivePackageMapping(game, player.id);
    const effect = game.effects[player.id] || {};
    const blind = Number(effect.blindUntilMs || 0) > nowMs();
    const cards = game.cards[player.id] || {};
    const cardCount = Object.values(cards).reduce((sum, value) => sum + Number(value || 0), 0);
    const feedback = game.lastFeedback?.[player.id];
    const freshFeedback = feedback && nowMs() - Number(feedback.atMs || 0) < 1600;
    return `<div class="bh-game-main bh-package-main bh-package-v3 ${blind ? "is-blind" : ""}">
      <section class="bh-logistics-floor bh-sort-station">
        <div class="bh-board-status bh-package-status"><b data-bh-timer="${Number(game.endsAtMs || 0)}">${formatTime(Number(game.endsAtMs || 0) - nowMs())}</b><span><strong>${Number(player.score || 0)}</strong> Punkte · Combo ${game.combo[player.id] || 0} · Fehler ${game.errors[player.id] || 0}</span><button class="bh-mobile-boost-trigger" data-bh-toggle-cards>Boosts <strong>${cardCount}</strong></button></div>
        <div class="bh-route-ribbon">${mapping.map((city, index) => `<span style="--route:${BH_COLORS[index]}"><i></i><b>${BH_COLOR_NAMES[index]}</b><small>${city}</small></span>`).join("")}</div>
        <div class="bh-package-stage ${freshFeedback ? feedback.kind : ""}">
          <div class="bh-conveyor-label"><span>AKTUELLES PAKET</span><small>Farbe lesen → richtige Stadt wählen</small></div>
          <div class="bh-up-next"><small>Danach</small>${queue.slice(1, 3).map((pack) => packageCardVisual(pack, true)).join("")}</div>
          <div class="bh-package-scanner"><span class="bh-scan-line"></span>${current ? packageCardVisual(current, false) : `<div class="bh-package-loading">Förderband wird beladen …</div>`}</div>
          ${freshFeedback ? `<div class="bh-package-feedback ${feedback.kind}">${escapeHtml(feedback.text)}</div>` : ""}
        </div>
        ${current?.fragile ? `<button class="bh-fragile-hold ${rt.careful ? "armed" : ""}" data-bh-fragile-hold><span></span><b>${rt.careful ? "✓ Paket gesichert" : "Zerbrechlich: kurz gedrückt halten"}</b><small>${rt.careful ? "Jetzt die richtige Stadt wählen" : "0,45 Sekunden halten"}</small></button>` : `<div class="bh-standard-ready"><span>✓</span><div><b>Standardpaket bereit</b><small>Direkt die richtige Stadt antippen</small></div></div>`}
        <div class="bh-city-buttons bh-sort-bins">${BH_CITIES.map((city) => { const route = mapping.indexOf(city); return `<button data-bh-sort-city="${city}" style="--bin:${BH_COLORS[Math.max(0, route)]}"><span></span><small>ROUTE</small><b>${city}</b><em>${route >= 0 ? BH_COLOR_NAMES[route] : "?"}</em></button>`; }).join("")}</div>
        ${blind ? `<div class="bh-blind-cover"><span>◉</span><b>Sicht blockiert</b><small>Die Sortierstation wird gleich wieder sichtbar.</small></div>` : ""}
      </section>
      <section class="bh-power-panel bh-card-drawer ${rt.packageCardsOpen ? "open" : ""}"><header><div><h3>Sonderkarten</h3><p>Nach vier richtigen Paketen erhältst du eine Störkarte.</p></div><button data-bh-toggle-cards>${rt.packageCardsOpen ? "Schließen" : `Boosts öffnen (${cardCount})`}</button></header><div class="bh-boost-grid">${Object.entries(PACKAGE_CARD_META).map(([id, meta]) => `<button data-bh-package-card="${id}" ${Number(cards[id] || 0) > 0 ? "" : "disabled"} class="${rt.pendingCard === id ? "selected" : ""}"><span>${meta.icon}</span><div><b>${meta.label}</b><small>${meta.text}</small></div><strong>${Number(cards[id] || 0)}</strong></button>`).join("")}</div>${rt.pendingCard ? `<div class="bh-target-list"><b>Gegner auswählen</b>${game.players.map((target, index) => index === ownIndex ? "" : `<button data-bh-card-target="${index}">${escapeHtml(target.name)}</button>`).join("")}<button data-bh-cancel-card>Abbrechen</button></div>` : ""}</section>
    </div>`;
  }

  function reactionControls(challenge, answered) {
    if (!challenge) return `<div class="bh-reaction-wait"><span>✓</span><b>Aufgabe ausgewertet</b><small>Die nächste Aufgabe erscheint gleich.</small></div>`;
    if (challenge.type === "color" || challenge.type === "not-red") {
      return `<div class="bh-color-controls">${[0, 1, 2, 3].map((index) => `<button style="--choice:${BH_COLORS[index]}" data-bh-reaction-answer="${index}" ${answered ? "disabled" : ""}><span></span>${BH_COLOR_NAMES[index]}</button>`).join("")}</div>`;
    }
    if (challenge.type === "larger") return `<div class="bh-number-controls">${challenge.options.map((value) => `<button data-bh-reaction-answer="${value}" ${answered ? "disabled" : ""}>${value}</button>`).join("")}</div>`;
    if (challenge.type === "odd") return `<div class="bh-symbol-controls">${challenge.options.map((value, index) => `<button data-bh-reaction-answer="${index}" ${answered ? "disabled" : ""}>${value}</button>`).join("")}</div>`;
    if (challenge.type === "swipe-left") return `<div class="bh-swipe-zone" data-bh-swipe-zone><span>←</span><b>Hier nach links wischen</b><small>Am PC funktioniert auch der Button.</small><button data-bh-reaction-answer="left" ${answered ? "disabled" : ""}>Links ausführen</button></div>`;
    return `<button class="bh-hold-button" data-bh-hold ${answered ? "disabled" : ""}><span></span><b>Gedrückt halten</b><small>Erst nach 0,8 Sekunden loslassen</small></button>`;
  }

  function reactionHtml(game) {
    const ownIndex = ownPlayerIndex(game);
    const player = game.players[ownIndex];
    if (!player) return `<p>Du bist nicht mehr Teil dieses Raums.</p>`;
    const response = game.responses[player.id];
    const challenge = game.challenge;
    const time = challenge ? Math.max(0, Number(challenge.deadlineMs || 0) - nowMs()) : 0;
    return `<div class="bh-game-main bh-reaction-main">
      <section class="bh-reaction-arena ${response ? response.correct ? "answered-correct" : "answered-wrong" : ""}">
        <div class="bh-reaction-top"><span>Aufgabe ${game.challengeNo}</span><b data-bh-timer="${Number(challenge?.deadlineMs || 0)}">${formatTime(time)}</b></div>
        <div class="bh-life-row">${game.players.map((entry) => `<div style="--life:${entry.color}"><b>${escapeHtml(entry.name)}</b><span>${"♥".repeat(Number(game.lives[entry.id] || 0))}${"·".repeat(Math.max(0, game.startLives - Number(game.lives[entry.id] || 0)))}</span></div>`).join("")}</div>
        <div class="bh-prompt"><small>JETZT REAGIEREN</small><h2>${escapeHtml(challenge?.prompt || "Bereit machen …")}</h2>${response ? `<p>${response.correct ? "Richtig – du bist sicher." : "Falsch – bei der Auswertung verlierst du ein Leben."}</p>` : ""}</div>
        ${reactionControls(challenge, !!response)}
      </section>
    </div>`;
  }

  function roundEndHtml(game) {
    const seriesOver = game.status === "seriesOver";
    const canNext = !game.online || isHost();
    return `<div class="bh-result-overlay"><div><span>🏆</span><p>${seriesOver ? "MATCH GEWONNEN" : `RUNDE ${game.round} BEENDET`}</p><h2>${escapeHtml(seriesOver ? game.winnerName : game.roundWinnerName)}</h2><small>${seriesOver ? `Gewinnt Best-of-${game.bestOf}.` : `Der Spielstand lautet ${game.players.map((player) => `${player.name} ${player.wins}`).join(" · ")}.`}</small><section>${playersHtml(game)}</section><div class="bh-result-actions">${!seriesOver && canNext ? `<button data-bh-next-round>Nächste Runde</button>` : ""}${seriesOver && canNext ? `<button data-bh-rematch>Revanche</button>` : ""}<button data-bh-close-game>Zur Spieleauswahl</button></div></div></div>`;
  }

  function gameScreenHtml(game) {
    const meta = gameMeta(game.type);
    const mode = game.online ? `Online · Raum ${escapeHtml(rt.roomId)}` : "Bot-Partie";
    const compactScores = game.players.map((player, index) => {
      const score = game.type === "territory" ? game.owners.filter((owner) => owner === index).length : game.type === "reaction" ? Number(game.lives[player.id] || 0) : Number(player.score || 0);
      const suffix = game.type === "reaction" ? "♥" : "";
      return `<span style="--p:${player.color}" class="${index === ownPlayerIndex(game) ? "own" : ""}"><i></i><b>${escapeHtml(player.name)}</b><strong>${score}${suffix}</strong></span>`;
    }).join("");
    return `<section class="bh-shell bh-game-shell bh-game-${game.type}" style="--accent:${meta.accent}" data-bh-game-type="${game.type}">
      <header class="bh-header"><button data-bh-back-game>‹</button><div><p>${mode} · Best-of-${game.bestOf}</p><h2>${meta.title}</h2></div><div class="bh-round-badge">Runde ${game.round}</div></header>
      <div class="bh-mobile-score-strip" aria-label="Aktueller Spielstand">${compactScores}</div>
      <div class="bh-game-layout"><main>${game.type === "territory" ? territoryHtml(game) : game.type === "packages" ? packageHtml(game) : reactionHtml(game)}</main><aside><h3>Spielstand</h3><div class="bh-player-list">${playersHtml(game)}</div><section class="bh-log"><h4>Live-Verlauf</h4>${(game.log || []).slice(0, 8).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</section></aside></div>
      ${game.status !== "playing" ? roundEndHtml(game) : ""}<div class="bh-toast" data-bh-toast></div>
    </section>`;
  }

  function gameCard(type) {
    const meta = gameMeta(type);
    return `<article class="bh-launch-card" style="--accent:${meta.accent}"><span>${meta.icon}</span><div><p>${meta.short}</p><h3>${meta.title}</h3><small>${meta.description}</small></div><button data-bh-local-setup="${type}">Gegen Bots</button><button data-bh-online-menu="${type}">Online</button></article>`;
  }

  function launcherHtml() {
    const meta = gameMeta();
    return `<section class="bh-shell bh-launcher" style="--accent:${meta.accent}"><header class="bh-header"><button data-bh-close>×</button><div><p>LIFEBUILDER · BATTLE APPS</p><h2>Drei eigenständige Spiele</h2></div><div class="bh-live-pill">2–4 Spieler</div></header><div class="bh-launch-hero"><div><span>KL</span><p>BOT · ONLINE · PRIVATCODE</p><h1>LifeBuilder Battle</h1><small>Jedes Spiel kann im Life App Store einzeln installiert werden.</small></div></div><div class="bh-launch-grid">${gameCard("territory")}${gameCard("packages")}${gameCard("reaction")}</div><button class="bh-return-am" data-bh-close>Battle Hub schließen</button></section>`;
  }

  function singleLauncherHtml() {
    const meta = gameMeta(rt.gameType);
    return `<section class="bh-shell bh-launcher bh-single-launcher" style="--accent:${meta.accent}">
      <header class="bh-header"><button data-bh-close>×</button><div><p>EIGENSTÄNDIGE LIFE APP</p><h2>${meta.title}</h2></div><div class="bh-live-pill">2–4 Spieler</div></header>
      <div class="bh-single-hero"><span>${meta.icon}</span><div><p>${meta.short}</p><h1>${meta.title}</h1><small>${meta.description}</small></div></div>
      <div class="bh-single-actions">
        <button data-bh-local-setup="${rt.gameType}"><span>🤖</span><div><b>Gegen Bots</b><small>2, 3 oder 4 Spieler · Best-of-1/3/5</small></div><i>›</i></button>
        <button data-bh-online-menu="${rt.gameType}"><span>🌐</span><div><b>Online spielen</b><small>Öffentlich sichtbar oder privat mit Raumcode</small></div><i>›</i></button>
      </div>
      <div class="bh-single-tags"><span>Handy</span><span>PC</span><span>Touch</span><span>Tastatur</span></div>
    </section>`;
  }

  function defaultHomeView() {
    return rt.standalone ? "single" : "launcher";
  }

  function setupHtml(online = false) {
    const meta = gameMeta();
    const duration = rt.gameType === "territory"
      ? `<label>Rundenzeit<select data-bh-duration><option value="120">2 Minuten</option><option value="180">3 Minuten</option></select></label>`
      : rt.gameType === "packages"
        ? `<label>Rundenzeit<select data-bh-duration><option value="90">90 Sekunden</option><option value="120">2 Minuten</option></select></label>`
        : `<label>Leben pro Spieler<select data-bh-lives><option value="3">3 Leben</option><option value="5" selected>5 Leben</option><option value="7">7 Leben</option></select></label>`;
    return `<section class="bh-shell bh-setup" style="--accent:${meta.accent}"><header class="bh-header"><button data-bh-home>‹</button><div><p>${online ? "ONLINE-MODUS" : "BOT-MODUS"}</p><h2>${meta.title}</h2></div><span class="bh-game-icon">${meta.icon}</span></header><div class="bh-setup-grid"><section><h3>${online ? "Online-Lobby erstellen" : "Partie konfigurieren"}</h3><p>${meta.description}</p><label>Spieleranzahl<select data-bh-player-count><option value="2">1 vs 1</option><option value="3">1 vs 1 vs 1</option><option value="4" selected>1 vs 1 vs 1 vs 1</option></select></label><label>Matchformat<select data-bh-best-of><option value="1">Eine Runde</option><option value="3" selected>Best-of-3</option><option value="5">Best-of-5</option></select></label>${duration}${online ? `<label>Sichtbarkeit<select data-bh-visibility><option value="public">Öffentlich sichtbar</option><option value="private">Privat · nur mit Code</option></select></label><label class="bh-check"><input type="checkbox" data-bh-fill-bots checked><span>Freie Plätze beim Start mit Bots füllen</span></label><button class="bh-primary" data-bh-create-room>Online-Raum erstellen</button>` : `<button class="bh-primary" data-bh-start-local>Bot-Partie starten</button>`}</section>${online ? `<section class="bh-join-panel"><h3>Raum beitreten</h3><div><input data-bh-room-code maxlength="6" placeholder="ABC123"><button data-bh-join-code>Beitreten</button></div><h3>Öffentliche Räume</h3><div class="bh-public-rooms">${publicRoomsHtml()}</div><button class="bh-secondary" data-bh-refresh-rooms>Liste aktualisieren</button></section>` : `<section class="bh-bot-preview"><h3>Strategische Bots</h3><div>${[0, 1, 2, 3].map((index) => `<span style="--bot:${BH_COLORS[index]}">${index === 0 ? "DU" : `BOT ${index}`}</span>`).join("")}</div><p>Bots erkennen Gebietsvorteile, Paketregeln, Expressfristen, Leben, Reaktionszeit und sinnvolle Störkarten.</p></section>`}</div><div class="bh-toast" data-bh-toast></div></section>`;
  }

  function publicRoomsHtml() {
    const rooms = rt.publicRooms.filter((room) => room.gameType === rt.gameType && room.status === "lobby" && (room.players?.length || 0) < Number(room.maxPlayers || 4));
    if (!rooms.length) return `<p>Aktuell wartet kein öffentlicher Raum für ${gameMeta().title}.</p>`;
    return rooms.map((room) => `<article><span>${room.players?.length || 1}/${room.maxPlayers || 4}</span><div><b>${escapeHtml(room.hostName || "Spieler")}</b><small>Best-of-${room.settings?.bestOf || 1} · ${room.fillBots ? "Bots erlaubt" : "nur Online"}</small></div><button data-bh-join-room="${escapeHtml(room.gameId || room.id)}">Beitreten</button></article>`).join("");
  }

  function lobbyHtml() {
    const room = rt.room;
    const meta = gameMeta(room.gameType);
    const host = isHost();
    const players = room.players || [];
    return `<section class="bh-shell bh-lobby" style="--accent:${meta.accent}"><header class="bh-header"><button data-bh-leave-room>‹</button><div><p>${room.visibility === "private" ? "PRIVATER RAUM" : "ÖFFENTLICHER RAUM"}</p><h2>${meta.title}</h2></div><span class="bh-game-icon">${meta.icon}</span></header><div class="bh-lobby-grid"><section class="bh-code-card"><small>RAUMCODE</small><b>${escapeHtml(rt.roomId)}</b><button data-bh-copy-code>Kopieren</button><p>Andere Spieler sehen öffentliche Räume in ihrer App. Private Räume öffnen sich nur mit diesem Code.</p></section><section class="bh-seat-grid">${Array.from({ length: room.maxPlayers || 4 }, (_, index) => { const player = players[index]; return `<article style="--seat:${BH_COLORS[index]}"><span>${player ? player.isBot ? "BOT" : index + 1 : "+"}</span><div><b>${player ? escapeHtml(player.name) : "Freier Platz"}</b><small>${player ? player.uid === room.hostUid ? "Host" : player.isBot ? "Strategie-Bot" : "Online verbunden" : "Wartet auf Spieler"}</small></div></article>`; }).join("")}</section><section class="bh-lobby-controls">${host ? `<label class="bh-check"><input type="checkbox" data-bh-lobby-fill-bots ${room.fillBots ? "checked" : ""}><span>Freie Plätze mit Bots füllen</span></label><button class="bh-primary" data-bh-start-online ${(players.length >= 2 || room.fillBots) ? "" : "disabled"}>Match starten</button>` : `<div class="bh-wait"><span></span><b>Warte auf den Host</b><small>Das Spiel öffnet sich bei allen Teilnehmern automatisch.</small></div>`}<button class="bh-secondary" data-bh-leave-room>Raum verlassen</button></section></div><div class="bh-toast" data-bh-toast></div></section>`;
  }

  function render() {
    const overlay = ensureOverlay();
    const game = currentGame();
    if (game && overlay.classList.contains("show") && rt.view === "game") overlay.innerHTML = gameScreenHtml(game);
    else if (rt.view === "lobby" && rt.room) overlay.innerHTML = lobbyHtml();
    else if (rt.view === "local-setup") overlay.innerHTML = setupHtml(false);
    else if (rt.view === "online") overlay.innerHTML = setupHtml(true);
    else if (rt.view === "single") overlay.innerHTML = singleLauncherHtml();
    else overlay.innerHTML = launcherHtml();
    bindOverlay(overlay);
    if (game && rt.view === "game") requestAnimationFrame(() => afterGameRender(game));
    if (game?.status === "seriesOver") maybeAwardReward(game);
  }

  function afterGameRender(game) {
    if (game.type === "territory") drawTerritoryCanvas(rt.overlay?.querySelector("[data-bh-territory-canvas]"), game);
  }

  function ensureOverlay() {
    if (rt.overlay) return rt.overlay;
    const overlay = document.createElement("div");
    overlay.className = "bh-overlay";
    overlay.dataset.bhOverlay = "1";
    document.body.appendChild(overlay);
    rt.overlay = overlay;
    return overlay;
  }

  function open(type = "territory") {
    rt.gameType = BH_GAMES[type] ? type : "territory";
    rt.standalone = false;
    rt.view = "launcher";
    const overlay = ensureOverlay();
    overlay.classList.add("show");
    document.body.classList.add("bh-open");
    render();
  }

  function openSingle(type = "territory", target = "home") {
    rt.gameType = BH_GAMES[type] ? type : "territory";
    rt.standalone = true;
    rt.view = target === "local" ? "local-setup" : target === "online" ? "online" : "single";
    const overlay = ensureOverlay();
    overlay.classList.add("show");
    document.body.classList.add("bh-open");
    if (rt.view === "online") listenPublicRooms().catch((error) => toast(error.message || error));
    render();
  }

  function close() {
    rt.overlay?.classList.remove("show");
    document.body.classList.remove("bh-open");
    rt.pendingPower = "";
    rt.pendingCard = "";
    clearTimeout(rt.holdTimer);
  }

  function toast(message) {
    const node = rt.overlay?.querySelector("[data-bh-toast]");
    if (!node) {
      if (typeof addFeed === "function") addFeed(String(message));
      return;
    }
    node.textContent = String(message || "");
    node.classList.add("show");
    clearTimeout(rt.toastTimer);
    rt.toastTimer = setTimeout(() => node.classList.remove("show"), 2800);
  }

  function setupSettings(shell) {
    return {
      bestOf: Number(shell.querySelector("[data-bh-best-of]")?.value || 3),
      durationSec: Number(shell.querySelector("[data-bh-duration]")?.value || (rt.gameType === "territory" ? 120 : 90)),
      lives: Number(shell.querySelector("[data-bh-lives]")?.value || 5)
    };
  }

  function startLocal(shell) {
    const count = clampNumber(shell.querySelector("[data-bh-player-count]")?.value || 4, 2, 4);
    const players = makePlayers(count, false);
    rt.roomUnsub?.();
    rt.roomUnsub = null;
    rt.room = null;
    rt.roomId = "";
    rt.local = createGame(rt.gameType, players, setupSettings(shell), false, 1);
    rt.view = "game";
    render();
    startTicker();
  }

  async function listenPublicRooms() {
    const fb = await firebaseRuntime();
    requireUser(fb);
    rt.publicUnsub?.();
    const query = fb.query(fb.collection(fb.db, BH_COLLECTION), fb.where("visibility", "==", "public"), fb.limit(50));
    rt.publicUnsub = fb.onSnapshot(query, (snapshot) => {
      rt.publicRooms = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((room) => room.status === "lobby")
        .sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
      if (rt.view === "online") render();
    }, (error) => toast(`Raumliste: ${error.message || error}`));
  }

  async function createRoom(shell) {
    const fb = await firebaseRuntime();
    const user = requireUser(fb);
    const maxPlayers = clampNumber(shell.querySelector("[data-bh-player-count]")?.value || 4, 2, 4);
    const visibility = shell.querySelector("[data-bh-visibility]")?.value === "private" ? "private" : "public";
    const fillBots = !!shell.querySelector("[data-bh-fill-bots]")?.checked;
    let code = "";
    let ref = null;
    for (let i = 0; i < 8; i += 1) {
      code = newCode();
      ref = fb.doc(fb.db, BH_COLLECTION, code);
      if (!(await fb.getDoc(ref)).exists()) break;
    }
    const human = { uid: user.uid, name: user.displayName || playerName(), isBot: false };
    const room = {
      gameId: code,
      gameType: rt.gameType,
      hostUid: user.uid,
      hostName: human.name,
      visibility,
      maxPlayers,
      fillBots,
      status: "lobby",
      settings: setupSettings(shell),
      playerUids: [user.uid],
      players: [human],
      gameState: null,
      winnerName: "",
      createdAtMs: nowMs(),
      updatedAtMs: nowMs(),
      version: BH_VERSION
    };
    await fb.setDoc(ref, room);
    await watchRoom(code);
    rt.view = "lobby";
    render();
  }

  async function joinRoom(codeRaw) {
    const code = String(codeRaw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length !== 6) throw new Error("Der Raumcode muss sechs Zeichen haben.");
    const fb = await firebaseRuntime();
    const user = requireUser(fb);
    const ref = fb.doc(fb.db, BH_COLLECTION, code);
    await fb.runTransaction(fb.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Dieser Raum wurde nicht gefunden.");
      const room = snapshot.data();
      if (room.status !== "lobby") throw new Error("Das Match läuft bereits.");
      const players = Array.isArray(room.players) ? [...room.players] : [];
      if (players.some((player) => player.uid === user.uid)) return;
      if (players.length >= Number(room.maxPlayers || 4)) throw new Error("Der Raum ist voll.");
      players.push({ uid: user.uid, name: user.displayName || playerName(), isBot: false });
      transaction.update(ref, { players, playerUids: players.map((player) => player.uid), updatedAtMs: nowMs() });
    });
    await watchRoom(code);
    rt.gameType = rt.room?.gameType || rt.gameType;
    rt.view = "lobby";
    render();
  }

  async function watchRoom(code) {
    const fb = await firebaseRuntime();
    const user = requireUser(fb);
    rt.roomUnsub?.();
    rt.roomId = code;
    rt.local = null;
    const ref = fb.doc(fb.db, BH_COLLECTION, code);
    rt.roomUnsub = fb.onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) {
        toast("Der Online-Raum wurde geschlossen.");
        disconnectRoom(false);
        return;
      }
      const previous = rt.room?.status;
      rt.room = { id: snapshot.id, viewerUid: user.uid, ...snapshot.data() };
      rt.gameType = rt.room.gameType || rt.gameType;
      if (rt.room.gameState && ["playing", "finished"].includes(rt.room.status)) rt.view = "game";
      else rt.view = "lobby";
      render();
      if (previous !== "playing" && rt.room.status === "playing") startTicker();
      if (rt.room.gameState?.status === "seriesOver") maybeAwardReward(rt.room.gameState);
    }, (error) => toast(`Raumverbindung: ${error.message || error}`));
  }

  async function startOnline(shell) {
    if (!isHost()) throw new Error("Nur der Host kann starten.");
    const fb = await firebaseRuntime();
    const ref = fb.doc(fb.db, BH_COLLECTION, rt.roomId);
    await fb.runTransaction(fb.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error("Raum nicht gefunden.");
      const room = snapshot.data();
      const fillBots = !!shell.querySelector("[data-bh-lobby-fill-bots]")?.checked;
      const humans = (room.players || []).filter((player) => !player.isBot);
      if (humans.length < 2 && !fillBots) throw new Error("Mindestens zwei Online-Spieler werden benötigt.");
      const players = makePlayers(Number(room.maxPlayers || 4), true, humans);
      const gameState = createGame(room.gameType, players, room.settings || {}, true, 1);
      transaction.update(ref, {
        fillBots,
        players: players.map((player) => ({ uid: player.uid, name: player.name, isBot: player.isBot })),
        playerUids: humans.map((player) => player.uid),
        gameState,
        status: "playing",
        updatedAtMs: nowMs()
      });
    });
    rt.view = "game";
    render();
    startTicker();
  }

  async function leaveRoom() {
    if (!rt.roomId) return disconnectRoom();
    try {
      const fb = await firebaseRuntime();
      const user = requireUser(fb);
      const ref = fb.doc(fb.db, BH_COLLECTION, rt.roomId);
      await fb.runTransaction(fb.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return;
        const room = snapshot.data();
        if (room.status !== "lobby") return;
        if (room.hostUid === user.uid) transaction.delete(ref);
        else {
          const players = (room.players || []).filter((player) => player.uid !== user.uid);
          transaction.update(ref, { players, playerUids: players.map((player) => player.uid), updatedAtMs: nowMs() });
        }
      });
    } catch (error) { toast(error.message || error); }
    disconnectRoom();
  }

  function disconnectRoom(refresh = true) {
    rt.roomUnsub?.();
    rt.roomUnsub = null;
    rt.room = null;
    rt.roomId = "";
    rt.view = defaultHomeView();
    stopTicker();
    if (refresh) render();
  }

  async function nextRound() {
    await mutate((game) => {
      if (game.status !== "roundOver") return false;
      const replacement = nextRoundGame(game);
      Object.keys(game).forEach((key) => delete game[key]);
      Object.assign(game, replacement);
      return true;
    });
    startTicker();
  }

  async function rematch() {
    await mutate((game) => {
      if (game.status !== "seriesOver") return false;
      const players = game.players.map((player) => ({ ...player, wins: 0, score: 0 }));
      const replacement = createGame(game.type, players, settingsFromGame(game), !!game.online, 1);
      Object.keys(game).forEach((key) => delete game[key]);
      Object.assign(game, replacement);
      return true;
    });
    startTicker();
  }

  function moveByDirection(direction) {
    const game = currentGame();
    if (!game || game.type !== "territory") return;
    const ownIndex = ownPlayerIndex(game);
    if (ownIndex < 0) return;
    const steps = game.online ? 2 : 2;
    mutate((next) => territoryMoveDirection(next, ownIndex, direction, steps));
  }

  function startTerritoryHold(direction) {
    moveByDirection(direction);
    clearInterval(rt.territoryHoldTimer);
    clearTimeout(rt.territoryHoldDelay);
    rt.territoryHoldDelay = setTimeout(() => {
      rt.territoryHoldTimer = setInterval(() => moveByDirection(direction), currentGame()?.online ? 520 : 190);
    }, 320);
  }

  function stopTerritoryHold() {
    clearInterval(rt.territoryHoldTimer);
    clearTimeout(rt.territoryHoldDelay);
    rt.territoryHoldTimer = null;
    rt.territoryHoldDelay = null;
  }

  function maybeAwardReward(game) {
    if (!game || game.status !== "seriesOver") return;
    const ownIndex = ownPlayerIndex(game);
    const own = game.players[ownIndex];
    if (!own) return;
    const key = `${game.online ? rt.roomId : game.createdAtMs}:${game.type}:${game.winnerId}`;
    if (rt.rewardKeys.has(key)) return;
    rt.rewardKeys.add(key);
    state ||= {};
    state.battleKlRewards ||= { day: 0, paidWins: 0, seen: [] };
    const rewards = state.battleKlRewards;
    const day = Number(state.day || 1);
    if (Number(rewards.day || 0) !== day) { rewards.day = day; rewards.paidWins = 0; rewards.seen = []; }
    if (rewards.seen.includes(key)) return;
    rewards.seen.push(key);
    rewards.seen = rewards.seen.slice(-50);
    const winner = game.winnerId === own.id;
    const xp = winner ? 25 : 8;
    if (typeof awardGameXp === "function") awardGameXp(xp, gameMeta(game.type).title);
    else if (typeof addXp === "function") addXp(xp, gameMeta(game.type).title);
    if (winner && Number(rewards.paidWins || 0) < 3) {
      state.bank = Number(state.bank || 0) + 300;
      rewards.paidWins = Number(rewards.paidWins || 0) + 1;
      if (typeof improveMood === "function") improveMood(2, `${gameMeta(game.type).title} gewonnen`);
      if (typeof addFeed === "function") addFeed(`${gameMeta(game.type).title}: Siegprämie 300 € und ${xp} EP. Tageslimit ${rewards.paidWins}/3.`);
    } else if (typeof addFeed === "function") {
      addFeed(`${gameMeta(game.type).title}: ${xp} EP für das Match.`);
    }
    if (typeof save === "function") save();
  }

  function bindOverlay(shell) {
    shell.querySelectorAll("[data-bh-close]").forEach((button) => button.addEventListener("click", close));
    shell.querySelector("[data-bh-home]")?.addEventListener("click", () => { rt.view = defaultHomeView(); render(); });
    shell.querySelectorAll("[data-bh-local-setup]").forEach((button) => button.addEventListener("click", () => { rt.gameType = button.dataset.bhLocalSetup; rt.view = "local-setup"; render(); }));
    shell.querySelectorAll("[data-bh-online-menu]").forEach((button) => button.addEventListener("click", () => { rt.gameType = button.dataset.bhOnlineMenu; rt.view = "online"; listenPublicRooms().catch((error) => toast(error.message || error)); render(); }));
    shell.querySelector("[data-bh-start-local]")?.addEventListener("click", () => startLocal(shell));
    shell.querySelector("[data-bh-create-room]")?.addEventListener("click", () => createRoom(shell).catch((error) => toast(error.message || error)));
    shell.querySelector("[data-bh-join-code]")?.addEventListener("click", () => joinRoom(shell.querySelector("[data-bh-room-code]")?.value).catch((error) => toast(error.message || error)));
    shell.querySelectorAll("[data-bh-join-room]").forEach((button) => button.addEventListener("click", () => joinRoom(button.dataset.bhJoinRoom).catch((error) => toast(error.message || error))));
    shell.querySelector("[data-bh-refresh-rooms]")?.addEventListener("click", () => listenPublicRooms().catch((error) => toast(error.message || error)));
    shell.querySelector("[data-bh-start-online]")?.addEventListener("click", () => startOnline(shell).catch((error) => toast(error.message || error)));
    shell.querySelectorAll("[data-bh-leave-room]").forEach((button) => button.addEventListener("click", leaveRoom));
    shell.querySelector("[data-bh-copy-code]")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(rt.roomId); toast("Raumcode kopiert."); } catch { toast(`Raumcode: ${rt.roomId}`); } });
    shell.querySelector("[data-bh-back-game]")?.addEventListener("click", () => { rt.territoryPowerOpen = false; rt.packageCardsOpen = false; rt.pendingPower = ""; rt.pendingCard = ""; rt.view = rt.roomId ? "lobby" : defaultHomeView(); if (!rt.roomId) stopTicker(); render(); });
    shell.querySelector("[data-bh-close-game]")?.addEventListener("click", () => { if (rt.roomId) disconnectRoom(false); rt.local = null; rt.view = defaultHomeView(); stopTicker(); render(); });
    shell.querySelector("[data-bh-next-round]")?.addEventListener("click", () => nextRound().catch((error) => toast(error.message || error)));
    shell.querySelector("[data-bh-rematch]")?.addEventListener("click", () => rematch().catch((error) => toast(error.message || error)));

    shell.querySelectorAll("[data-bh-cell]").forEach((button) => button.addEventListener("click", () => {
      const game = currentGame();
      const ownIndex = ownPlayerIndex(game);
      const cell = Number(button.dataset.bhCell);
      if (rt.pendingPower === "bomb") {
        mutate((next) => useTerritoryPower(next, ownIndex, "bomb", { cell })).then((ok) => { if (ok !== false) { rt.pendingPower = ""; render(); } }).catch((error) => toast(error.message || error));
      } else mutate((next) => territoryMove(next, ownIndex, cell)).catch((error) => toast(error.message || error));
    }));
    shell.querySelectorAll("[data-bh-move]").forEach((button) => {
      const begin = (event) => { event.preventDefault(); startTerritoryHold(button.dataset.bhMove); };
      button.addEventListener("pointerdown", begin);
      button.addEventListener("pointerup", stopTerritoryHold);
      button.addEventListener("pointercancel", stopTerritoryHold);
      button.addEventListener("pointerleave", stopTerritoryHold);
    });
    const territoryCanvas = shell.querySelector("[data-bh-territory-canvas]");
    if (territoryCanvas) {
      territoryCanvas.addEventListener("pointerdown", (event) => {
        rt.territoryPointer = { x: event.clientX, y: event.clientY, at: nowMs() };
        territoryCanvas.setPointerCapture?.(event.pointerId);
      });
      territoryCanvas.addEventListener("pointerup", (event) => {
        const game = currentGame();
        const start = rt.territoryPointer;
        rt.territoryPointer = null;
        if (!game || !start) return;
        if (rt.pendingPower === "bomb") {
          const cell = territoryCanvasCell(territoryCanvas, event, game);
          if (cell >= 0) mutate((next) => useTerritoryPower(next, ownPlayerIndex(game), "bomb", { cell })).then((ok) => { if (ok !== false) { rt.pendingPower = ""; render(); } });
          return;
        }
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) moveByDirection(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down"));
        else {
          const ownIndex = ownPlayerIndex(game);
          const player = game.players[ownIndex];
          const tapped = territoryCanvasCell(territoryCanvas, event, game);
          const current = Number(game.positions[player?.id]);
          if (tapped >= 0 && player) {
            const tx = tapped % game.cols, ty = Math.floor(tapped / game.cols), cx = current % game.cols, cy = Math.floor(current / game.cols);
            const direction = Math.abs(tx - cx) > Math.abs(ty - cy) ? (tx < cx ? "left" : "right") : (ty < cy ? "up" : "down");
            moveByDirection(direction);
          }
        }
      });
    }
    shell.querySelectorAll("[data-bh-toggle-powers]").forEach((button) => button.addEventListener("click", () => { rt.territoryPowerOpen = !rt.territoryPowerOpen; render(); }));
    shell.querySelectorAll("[data-bh-territory-power]").forEach((button) => button.addEventListener("click", () => {
      const type = button.dataset.bhTerritoryPower;
      if (type === "bomb") { rt.pendingPower = rt.pendingPower === "bomb" ? "" : "bomb"; rt.territoryPowerOpen = false; render(); return; }
      const game = currentGame();
      mutate((next) => useTerritoryPower(next, ownPlayerIndex(game), type)).then(() => { rt.territoryPowerOpen = false; render(); }).catch((error) => toast(error.message || error));
    }));
    shell.querySelector("[data-bh-cancel-power]")?.addEventListener("click", () => { rt.pendingPower = ""; rt.territoryPowerOpen = false; render(); });

    shell.querySelectorAll("[data-bh-toggle-cards]").forEach((button) => button.addEventListener("click", () => { rt.packageCardsOpen = !rt.packageCardsOpen; render(); }));
    const fragileHold = shell.querySelector("[data-bh-fragile-hold]");
    if (fragileHold) {
      let armedTimer = null;
      const begin = (event) => {
        event.preventDefault();
        fragileHold.classList.add("holding");
        clearTimeout(armedTimer);
        armedTimer = setTimeout(() => { rt.careful = true; fragileHold.classList.remove("holding"); fragileHold.classList.add("armed"); fragileHold.querySelector("b").textContent = "✓ Paket gesichert"; fragileHold.querySelector("small").textContent = "Jetzt das richtige Ziel wählen"; }, 450);
      };
      const cancel = () => { clearTimeout(armedTimer); fragileHold.classList.remove("holding"); };
      fragileHold.addEventListener("pointerdown", begin);
      fragileHold.addEventListener("pointerup", cancel);
      fragileHold.addEventListener("pointercancel", cancel);
      fragileHold.addEventListener("pointerleave", cancel);
    }
    shell.querySelectorAll("[data-bh-sort-city]").forEach((button) => button.addEventListener("click", () => {
      const game = currentGame();
      const ownIndex = ownPlayerIndex(game);
      const careful = rt.careful;
      rt.careful = false;
      mutate((next) => packageProcess(next, ownIndex, button.dataset.bhSortCity, careful)).catch((error) => toast(error.message || error));
    }));
    shell.querySelectorAll("[data-bh-package-card]").forEach((button) => button.addEventListener("click", () => { rt.pendingCard = button.dataset.bhPackageCard; rt.packageCardsOpen = true; render(); }));
    shell.querySelectorAll("[data-bh-card-target]").forEach((button) => button.addEventListener("click", () => {
      const game = currentGame();
      const ownIndex = ownPlayerIndex(game);
      mutate((next) => usePackageCard(next, ownIndex, rt.pendingCard, Number(button.dataset.bhCardTarget))).then(() => { rt.pendingCard = ""; rt.packageCardsOpen = false; render(); }).catch((error) => toast(error.message || error));
    }));
    shell.querySelector("[data-bh-cancel-card]")?.addEventListener("click", () => { rt.pendingCard = ""; render(); });

    shell.querySelectorAll("[data-bh-reaction-answer]").forEach((button) => button.addEventListener("click", () => {
      const game = currentGame();
      mutate((next) => submitReaction(next, ownPlayerIndex(game), button.dataset.bhReactionAnswer)).catch((error) => toast(error.message || error));
    }));
    const hold = shell.querySelector("[data-bh-hold]");
    if (hold) {
      const begin = (event) => {
        event.preventDefault();
        hold.classList.add("holding");
        clearTimeout(rt.holdTimer);
        rt.holdTimer = setTimeout(() => {
          const game = currentGame();
          mutate((next) => submitReaction(next, ownPlayerIndex(game), "hold")).catch((error) => toast(error.message || error));
          hold.classList.remove("holding");
        }, 800);
      };
      const cancel = () => { clearTimeout(rt.holdTimer); hold.classList.remove("holding"); };
      hold.addEventListener("pointerdown", begin);
      hold.addEventListener("pointerup", cancel);
      hold.addEventListener("pointercancel", cancel);
      hold.addEventListener("pointerleave", cancel);
    }
    const swipe = shell.querySelector("[data-bh-swipe-zone]");
    if (swipe) {
      swipe.addEventListener("pointerdown", (event) => { rt.pointerStart = { x: event.clientX, y: event.clientY }; swipe.setPointerCapture?.(event.pointerId); });
      swipe.addEventListener("pointerup", (event) => {
        if (!rt.pointerStart) return;
        const dx = event.clientX - rt.pointerStart.x;
        const dy = Math.abs(event.clientY - rt.pointerStart.y);
        rt.pointerStart = null;
        if (dx < -55 && dy < 70) {
          const game = currentGame();
          mutate((next) => submitReaction(next, ownPlayerIndex(game), "left")).catch((error) => toast(error.message || error));
        }
      });
    }
  }

  document.addEventListener("keydown", (event) => {
    if (!rt.overlay?.classList.contains("show") || rt.view !== "game") return;
    const game = currentGame();
    if (!game || game.status !== "playing") return;
    const key = event.key.toLowerCase();
    if (game.type === "territory" && ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      const map = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
      moveByDirection(map[key]);
    }
    if (game.type === "reaction" && game.challenge?.type === "swipe-left" && key === "arrowleft") {
      event.preventDefault();
      mutate((next) => submitReaction(next, ownPlayerIndex(game), "left")).catch((error) => toast(error.message || error));
    }
  });

  window.LifeBuilderBattleHub = { open, openSingle, close, version: BH_VERSION };
  window.addEventListener("resize", () => { const game = currentGame(); if (game?.type === "territory") requestAnimationFrame(() => drawTerritoryCanvas(rt.overlay?.querySelector("[data-bh-territory-canvas]"), game)); });
  window.addEventListener("beforeunload", () => {
    rt.roomUnsub?.();
    rt.publicUnsub?.();
    stopTicker();
  });
})();
