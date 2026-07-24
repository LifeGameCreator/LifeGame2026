(() => {
  "use strict";

  const WK_APP_ID = "weed-kl";
  const WK_VERSION = "2026-07-24-weed-kl-v1";
  const WK_BACKUP_PREFIX = "lifebuilder-weedkl";
  const WK_MAX_CUSTOMERS = 4;
  const WK_MAX_PLANTS = 10;

  // Seed prices are used as a broad catalogue reference. Gram sale prices are fictional game values.
  const WK_STRAINS = [
    { id: "basic", name: "Basic Weed", seedPrice: 2, sellPrice: 10, tier: 0, accent: "#7be39a", rarity: "Basis" },
    { id: "special-queen", name: "Special Queen #1", seedPrice: 4, sellPrice: 12, tier: 0, accent: "#86d96c", rarity: "Klassik" },
    { id: "northern-light", name: "Northern Light", seedPrice: 8, sellPrice: 14, tier: 0, accent: "#68d9bc", rarity: "Klassik" },
    { id: "white-widow", name: "White Widow", seedPrice: 8, sellPrice: 16, tier: 0, accent: "#c9e9dd", rarity: "Klassik" },
    { id: "blue-mystic", name: "Blue Mystic", seedPrice: 8, sellPrice: 17, tier: 1, accent: "#70a8ff", rarity: "Selten" },
    { id: "fruit-spirit", name: "Fruit Spirit", seedPrice: 8, sellPrice: 18, tier: 1, accent: "#ff9e72", rarity: "Selten" },
    { id: "power-flower", name: "Power Flower", seedPrice: 8, sellPrice: 19, tier: 1, accent: "#e2dd67", rarity: "Selten" },
    { id: "critical", name: "Critical", seedPrice: 9, sellPrice: 20, tier: 2, accent: "#f2c052", rarity: "Premium" },
    { id: "royal-moby", name: "Royal Moby", seedPrice: 9, sellPrice: 22, tier: 2, accent: "#af8cff", rarity: "Premium" },
    { id: "silver-haze", name: "Shining Silver Haze", seedPrice: 9, sellPrice: 23, tier: 3, accent: "#c4d9ff", rarity: "Elite" },
    { id: "amnesia-haze", name: "Amnesia Haze", seedPrice: 10, sellPrice: 25, tier: 3, accent: "#d69dff", rarity: "Elite" },
    { id: "special-kush", name: "Special Kush #1", seedPrice: 3, sellPrice: 15, tier: 4, accent: "#b87956", rarity: "Sammler" }
  ];

  const WK_SUPPLY_ITEMS = [
    { id: "pot", label: "Blumentopf", icon: "◉", amount: 1, price: 25, text: "Wird beim Pflanzen belegt und nach der letzten Ernte zurückgegeben." },
    { id: "soil", label: "Erde", icon: "▰", amount: 1, price: 12, text: "Eine Einheit wird für eine neue Pflanze verbraucht." },
    { id: "water", label: "Wasserkanister", icon: "◒", amount: 20, price: 15, text: "Enthält 20 Gießeinheiten." },
    { id: "water", label: "Großer Wassertank", icon: "◉", amount: 60, price: 38, text: "Enthält 60 Gießeinheiten und spart Geld." }
  ];

  const WK_UPGRADES = {
    slots: {
      label: "Pflanzenplätze", icon: "▦", max: 7,
      costs: [250, 450, 700, 1000, 1400, 1900, 2500],
      text: (level) => `${3 + level} von maximal ${WK_MAX_PLANTS} Plätzen freigeschaltet.`
    },
    watering: {
      label: "Bewässerung", icon: "◒", max: 5,
      costs: [300, 600, 1000, 1500, 2200],
      text: (level) => `${Math.max(10, 20 - level * 2)} Sekunden Wartezeit zwischen zwei Gießvorgängen.`
    },
    yield: {
      label: "Erntequalität", icon: "✦", max: 5,
      costs: [500, 900, 1500, 2300, 3400],
      text: (level) => `+${level * 5}% Ertrag bei jedem Schnitt.`
    },
    customers: {
      label: "Kundennetzwerk", icon: "●", max: 5,
      costs: [350, 700, 1200, 1900, 2800],
      text: (level) => `Neue Anfragen ungefähr alle ${Math.max(16, 40 - level * 5)} Sekunden.`
    },
    orders: {
      label: "Großbestellungen", icon: "▤", max: 3,
      costs: [600, 1200, 2200],
      text: (level) => `Kunden können bis zu ${Math.min(4, 1 + level)} Sorten gleichzeitig anfragen.`
    },
    market: {
      label: "Sortenmarkt", icon: "◇", max: 4,
      costs: [700, 1400, 2400, 3800],
      text: (level) => `${WK_STRAINS.filter((strain) => strain.tier <= level).length} Sorten im Shop freigeschaltet.`
    },
    discount: {
      label: "Einkaufsrabatt", icon: "%", max: 4,
      costs: [500, 1000, 1800, 3000],
      text: (level) => `${level * 3}% Rabatt auf Shop-Einkäufe.`
    }
  };

  const WK_CUSTOMER_NAMES = [
    "Mika", "Nora", "Alex", "Sam", "Leonie", "Jamal", "Toni", "Mara", "Ben", "Lina",
    "Noah", "Kim", "Elias", "Zoe", "Tarek", "Jule", "Rico", "Nina", "Kian", "Fiona"
  ];

  const wkRuntime = {
    overlay: null,
    view: "plants",
    modal: "",
    tickTimer: null,
    autosaveTimer: null,
    toastTimer: null,
    lastRenderedCustomerCount: -1
  };

  const wkEscape = (value) => typeof escapeHtml === "function"
    ? escapeHtml(value)
    : String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  const wkEuro = (value) => `${Math.round(Number(value || 0)).toLocaleString("de-DE")} €`;
  const wkClamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const wkRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const wkId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const wkNow = () => Date.now();
  const wkStrain = (id) => WK_STRAINS.find((entry) => entry.id === id) || WK_STRAINS[0];

  function wkSlotIndex() {
    return Math.max(0, Math.min(3, Number(typeof selectedSlot !== "undefined" ? selectedSlot : typeof activeSlot !== "undefined" ? activeSlot : 0)));
  }

  function wkBackupKey() {
    return `${WK_BACKUP_PREFIX}:${wkSlotIndex()}`;
  }

  function wkDefaultState() {
    const now = wkNow();
    return {
      version: WK_VERSION,
      cash: 1000,
      supplies: { pot: 1, soil: 1, water: 20 },
      seeds: { basic: 2 },
      inventory: {},
      plants: [],
      customers: [],
      upgrades: { slots: 0, watering: 0, yield: 0, customers: 0, orders: 1, market: 0, discount: 0 },
      stats: { revenue: 0, gramsSold: 0, customersServed: 0, harvests: 0, waterings: 0 },
      nextCustomerAt: now + 25000,
      createdAtMs: now,
      updatedAtMs: now
    };
  }

  function wkNormalize(raw) {
    const base = wkDefaultState();
    const data = raw && typeof raw === "object" ? raw : {};
    const normalized = {
      ...base,
      ...data,
      supplies: { ...base.supplies, ...(data.supplies || {}) },
      seeds: { ...base.seeds, ...(data.seeds || {}) },
      inventory: { ...(data.inventory || {}) },
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      stats: { ...base.stats, ...(data.stats || {}) },
      plants: Array.isArray(data.plants) ? data.plants.slice(0, WK_MAX_PLANTS) : [],
      customers: Array.isArray(data.customers) ? data.customers.slice(0, WK_MAX_CUSTOMERS) : []
    };
    normalized.cash = Math.max(0, Number(normalized.cash || 0));
    ["pot", "soil", "water"].forEach((key) => normalized.supplies[key] = Math.max(0, Math.floor(Number(normalized.supplies[key] || 0))));
    WK_STRAINS.forEach((strain) => {
      normalized.seeds[strain.id] = Math.max(0, Math.floor(Number(normalized.seeds[strain.id] || 0)));
      normalized.inventory[strain.id] = Math.max(0, Math.floor(Number(normalized.inventory[strain.id] || 0)));
    });
    Object.entries(WK_UPGRADES).forEach(([id, upgrade]) => {
      normalized.upgrades[id] = Math.max(0, Math.min(upgrade.max, Math.floor(Number(normalized.upgrades[id] || 0))));
    });
    normalized.plants = normalized.plants.map((plant) => ({
      id: String(plant.id || wkId("plant")),
      strainId: wkStrain(plant.strainId).id,
      waterings: Math.max(0, Math.floor(Number(plant.waterings || 0))),
      thresholds: Array.isArray(plant.thresholds) && plant.thresholds.length === 4
        ? plant.thresholds.map((value) => Math.max(1, Math.floor(Number(value || 1))))
        : [5, 18, 48, 65],
      trims: Math.max(0, Math.min(3, Math.floor(Number(plant.trims || 0)))),
      nextWaterAt: Math.max(0, Number(plant.nextWaterAt || 0)),
      nextTrimAt: Math.max(0, Number(plant.nextTrimAt || 0)),
      plantedAtMs: Math.max(0, Number(plant.plantedAtMs || wkNow()))
    }));
    normalized.customers = normalized.customers.map((customer) => ({
      id: String(customer.id || wkId("customer")),
      name: String(customer.name || "Kunde").slice(0, 30),
      lines: Array.isArray(customer.lines) ? customer.lines.slice(0, 4).map((line) => ({
        strainId: wkStrain(line.strainId).id,
        grams: Math.max(1, Math.floor(Number(line.grams || 1))),
        unitPrice: Math.max(1, Number(line.unitPrice || wkStrain(line.strainId).sellPrice))
      })) : [],
      expiresAtMs: Number(customer.expiresAtMs || wkNow() + 90000),
      createdAtMs: Math.max(0, Number(customer.createdAtMs || wkNow())),
      mood: String(customer.mood || "Direktanfrage")
    })).filter((customer) => customer.lines.length);
    normalized.version = WK_VERSION;
    normalized.updatedAtMs = Math.max(0, Number(normalized.updatedAtMs || 0));
    normalized.nextCustomerAt = Number(normalized.nextCustomerAt || 0);
    if (!Number.isFinite(normalized.nextCustomerAt) || normalized.nextCustomerAt <= 0) normalized.nextCustomerAt = wkNow() + 25000;
    return normalized;
  }

  function wkReadBackup() {
    try {
      const parsed = JSON.parse(localStorage.getItem(wkBackupKey()) || "null");
      return parsed ? wkNormalize(parsed) : null;
    } catch {
      return null;
    }
  }

  function wkState() {
    if (!state) return null;
    const saveState = wkNormalize(state.weedKL);
    const backup = wkReadBackup();
    const chosen = backup && Number(backup.updatedAtMs || 0) > Number(saveState.updatedAtMs || 0) ? backup : saveState;
    state.weedKL = chosen;
    return state.weedKL;
  }

  function wkPersist(forceSave = true) {
    const data = wkState();
    if (!data) return;
    data.version = WK_VERSION;
    data.updatedAtMs = wkNow();
    try { localStorage.setItem(wkBackupKey(), JSON.stringify(data)); } catch { /* save remains primary */ }
    if (forceSave && typeof save === "function") save();
  }

  function wkUnlockedSlots(data = wkState()) {
    return Math.min(WK_MAX_PLANTS, 3 + Number(data?.upgrades?.slots || 0));
  }

  function wkWaterCooldownMs(data = wkState()) {
    return Math.max(10000, (20 - Number(data?.upgrades?.watering || 0) * 2) * 1000);
  }

  function wkCustomerIntervalMs(data = wkState()) {
    return Math.max(16000, (40 - Number(data?.upgrades?.customers || 0) * 5) * 1000);
  }

  function wkMaxOrderLines(data = wkState()) {
    return Math.min(4, 1 + Number(data?.upgrades?.orders || 0));
  }

  function wkDiscount(data = wkState()) {
    return Math.min(0.12, Number(data?.upgrades?.discount || 0) * 0.03);
  }

  function wkBusinessLevel(data = wkState()) {
    return Math.max(1, Math.min(20, 1 + Math.floor(Number(data?.stats?.revenue || 0) / 1500)));
  }

  function wkInventoryGrams(data = wkState()) {
    return WK_STRAINS.reduce((sum, strain) => sum + Number(data?.inventory?.[strain.id] || 0), 0);
  }

  function wkPlantStage(plant) {
    const waterings = Number(plant.waterings || 0);
    if (waterings >= Number(plant.thresholds[3])) return 5;
    if (waterings >= Number(plant.thresholds[2])) return 4;
    if (waterings >= Number(plant.thresholds[1])) return 3;
    if (waterings >= Number(plant.thresholds[0])) return 2;
    return 1;
  }

  function wkStageLabel(stage) {
    return ["", "Eingepflanzt", "Keimling", "Jungpflanze", "Große Pflanze", "Ausgewachsen"][stage] || "Pflanze";
  }

  function wkNextThreshold(plant) {
    const stage = wkPlantStage(plant);
    return stage >= 5 ? Number(plant.thresholds[3]) : Number(plant.thresholds[stage - 1]);
  }

  function wkFormatTimer(ms) {
    const seconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
  }

  function wkCanPlant(data = wkState()) {
    return !!data && data.plants.length < wkUnlockedSlots(data) && data.supplies.pot > 0 && data.supplies.soil > 0
      && WK_STRAINS.some((strain) => Number(data.seeds[strain.id] || 0) > 0);
  }

  function wkCreatePlant(strainId) {
    const data = wkState();
    const strain = wkStrain(strainId);
    if (!data || data.plants.length >= wkUnlockedSlots(data)) return wkToast("Alle freigeschalteten Pflanzenplätze sind belegt.");
    if (Number(data.seeds[strain.id] || 0) < 1) return wkToast("Von dieser Sorte ist kein Samen im Inventar.");
    if (data.supplies.pot < 1 || data.supplies.soil < 1) return wkToast("Du brauchst einen Topf und eine Einheit Erde.");
    const stage2 = 5;
    const stage3 = stage2 + wkRandomInt(10, 15);
    const stage4 = stage3 + wkRandomInt(20, 40);
    const stage5 = stage4 + wkRandomInt(12, 20);
    data.seeds[strain.id] -= 1;
    data.supplies.pot -= 1;
    data.supplies.soil -= 1;
    data.plants.push({
      id: wkId("plant"), strainId: strain.id, waterings: 0,
      thresholds: [stage2, stage3, stage4, stage5], trims: 0,
      nextWaterAt: 0, nextTrimAt: 0, plantedAtMs: wkNow()
    });
    wkRuntime.modal = "";
    wkPersist();
    wkRender();
    wkToast(`${strain.name} wurde eingepflanzt.`);
  }

  function wkWaterPlant(plantId) {
    const data = wkState();
    const plant = data?.plants.find((entry) => entry.id === plantId);
    if (!plant) return;
    if (wkPlantStage(plant) >= 5) return wkToast("Diese Pflanze ist ausgewachsen und kann geschnitten werden.");
    if (wkNow() < Number(plant.nextWaterAt || 0)) return wkToast("Die Pflanze kann noch nicht wieder gegossen werden.");
    if (data.supplies.water < 1) return wkToast("Das Wasser ist leer. Kaufe Nachschub im Shop.");
    const oldStage = wkPlantStage(plant);
    data.supplies.water -= 1;
    plant.waterings += 1;
    plant.nextWaterAt = wkNow() + wkWaterCooldownMs(data);
    data.stats.waterings += 1;
    const newStage = wkPlantStage(plant);
    wkPersist();
    wkRender();
    wkToast(newStage > oldStage ? `${wkStrain(plant.strainId).name} erreicht Stufe ${newStage}.` : "Pflanze gegossen.");
  }

  function wkWaterAll() {
    const data = wkState();
    if (!data) return;
    const ready = data.plants.filter((plant) => wkPlantStage(plant) < 5 && wkNow() >= Number(plant.nextWaterAt || 0));
    if (!ready.length) return wkToast("Aktuell ist keine Pflanze bereit.");
    const amount = Math.min(ready.length, data.supplies.water);
    if (amount < 1) return wkToast("Das Wasser ist leer.");
    let stageUps = 0;
    ready.slice(0, amount).forEach((plant) => {
      const before = wkPlantStage(plant);
      plant.waterings += 1;
      plant.nextWaterAt = wkNow() + wkWaterCooldownMs(data);
      if (wkPlantStage(plant) > before) stageUps += 1;
    });
    data.supplies.water -= amount;
    data.stats.waterings += amount;
    wkPersist();
    wkRender();
    wkToast(`${amount} Pflanze${amount === 1 ? "" : "n"} gegossen${stageUps ? ` · ${stageUps} Stufenaufstieg` : ""}.`);
  }

  function wkTrimPlant(plantId) {
    const data = wkState();
    const plant = data?.plants.find((entry) => entry.id === plantId);
    if (!plant || wkPlantStage(plant) < 5) return wkToast("Die Pflanze ist noch nicht ausgewachsen.");
    if (wkNow() < Number(plant.nextTrimAt || 0)) return wkToast("Die Pflanze regeneriert sich noch.");
    const ranges = [[12, 18], [12, 24], [20, 30]];
    const trimIndex = Math.min(2, Number(plant.trims || 0));
    const baseYield = wkRandomInt(ranges[trimIndex][0], ranges[trimIndex][1]);
    const multiplier = 1 + Number(data.upgrades.yield || 0) * 0.05;
    const grams = Math.max(1, Math.round(baseYield * multiplier));
    data.inventory[plant.strainId] = Number(data.inventory[plant.strainId] || 0) + grams;
    data.stats.harvests += 1;
    plant.trims += 1;
    const strain = wkStrain(plant.strainId);
    if (plant.trims >= 3) {
      data.plants = data.plants.filter((entry) => entry.id !== plant.id);
      data.supplies.pot += 1;
      wkToast(`${grams} g ${strain.name} geerntet. Die Pflanze ist verbraucht; der Topf ist wieder frei.`);
    } else {
      plant.nextTrimAt = wkNow() + 45000;
      wkToast(`${grams} g ${strain.name} geerntet. Noch ${3 - plant.trims} Schnitt${3 - plant.trims === 1 ? "" : "e"}.`);
    }
    wkPersist();
    wkRender();
  }

  function wkShopPrice(basePrice, data = wkState()) {
    return Math.max(1, Math.round(Number(basePrice || 0) * (1 - wkDiscount(data))));
  }

  function wkBuySupply(id, amount, basePrice) {
    const data = wkState();
    const price = wkShopPrice(basePrice, data);
    if (!data || data.cash < price) return wkToast("Nicht genug Business-Geld.");
    data.cash -= price;
    data.supplies[id] = Number(data.supplies[id] || 0) + Number(amount || 1);
    wkPersist();
    wkRender();
    wkToast(`Einkauf abgeschlossen: ${wkEuro(price)}.`);
  }

  function wkBuySeed(strainId) {
    const data = wkState();
    const strain = wkStrain(strainId);
    if (!data || strain.tier > Number(data.upgrades.market || 0)) return wkToast("Diese Sorte ist noch nicht freigeschaltet.");
    const price = wkShopPrice(strain.seedPrice, data);
    if (data.cash < price) return wkToast("Nicht genug Business-Geld.");
    data.cash -= price;
    data.seeds[strain.id] = Number(data.seeds[strain.id] || 0) + 1;
    wkPersist();
    wkRender();
    wkToast(`${strain.name}: 1 Samen gekauft.`);
  }

  function wkUpgrade(id) {
    const data = wkState();
    const definition = WK_UPGRADES[id];
    if (!data || !definition) return;
    const level = Number(data.upgrades[id] || 0);
    if (level >= definition.max) return wkToast("Diese Verbesserung ist bereits maximal.");
    const cost = definition.costs[level];
    if (data.cash < cost) return wkToast("Nicht genug Business-Geld.");
    data.cash -= cost;
    data.upgrades[id] = level + 1;
    wkPersist();
    wkRender();
    wkToast(`${definition.label} auf Stufe ${level + 1} verbessert.`);
  }

  function wkRandomCustomer(data = wkState()) {
    const unlocked = WK_STRAINS.filter((strain) => strain.tier <= Number(data.upgrades.market || 0));
    const maxLines = Math.min(wkMaxOrderLines(data), unlocked.length);
    const lineCount = wkRandomInt(1, Math.max(1, maxLines));
    const shuffled = [...unlocked].sort(() => Math.random() - 0.5).slice(0, lineCount);
    const demandBoost = 1 + Math.min(0.35, wkBusinessLevel(data) * 0.015);
    const lines = shuffled.map((strain) => {
      const grams = wkRandomInt(2, Math.max(4, Math.round(7 * demandBoost)));
      const unitPrice = Math.max(1, Math.round(strain.sellPrice * (0.92 + Math.random() * 0.28)));
      return { strainId: strain.id, grams, unitPrice };
    });
    const moods = ["Direktanfrage", "Stammkunde", "Schnellkauf", "Qualitätskunde", "Großanfrage"];
    return {
      id: wkId("customer"),
      name: WK_CUSTOMER_NAMES[wkRandomInt(0, WK_CUSTOMER_NAMES.length - 1)],
      lines,
      expiresAtMs: wkNow() + wkRandomInt(75, 125) * 1000,
      createdAtMs: wkNow(),
      mood: moods[wkRandomInt(0, moods.length - 1)]
    };
  }

  function wkCustomerTotal(customer) {
    return customer.lines.reduce((sum, line) => sum + Number(line.grams || 0) * Number(line.unitPrice || 0), 0);
  }

  function wkCanServe(customer, data = wkState()) {
    return customer.lines.every((line) => Number(data?.inventory?.[line.strainId] || 0) >= Number(line.grams || 0));
  }

  function wkServeCustomer(customerId) {
    const data = wkState();
    const customer = data?.customers.find((entry) => entry.id === customerId);
    if (!customer) return;
    if (!wkCanServe(customer, data)) return wkToast("Für diese Anfrage fehlt Ware im Inventar.");
    customer.lines.forEach((line) => {
      data.inventory[line.strainId] -= line.grams;
      data.stats.gramsSold += line.grams;
    });
    const total = wkCustomerTotal(customer);
    data.cash += total;
    data.stats.revenue += total;
    data.stats.customersServed += 1;
    data.customers = data.customers.filter((entry) => entry.id !== customerId);
    wkPersist();
    wkRender();
    wkToast(`${customer.name}: Verkauf abgeschlossen · ${wkEuro(total)}.`);
  }

  function wkRejectCustomer(customerId) {
    const data = wkState();
    if (!data) return;
    data.customers = data.customers.filter((entry) => entry.id !== customerId);
    wkPersist();
    wkRender();
    wkToast("Anfrage abgelehnt.");
  }

  function wkProcessTime() {
    const data = wkState();
    if (!data) return false;
    const now = wkNow();
    const previousCount = data.customers.length;
    data.customers = data.customers.filter((customer) => Number(customer.expiresAtMs || 0) > now);
    let guard = 0;
    while (now >= Number(data.nextCustomerAt || 0) && data.customers.length < WK_MAX_CUSTOMERS && guard < 4) {
      data.customers.push(wkRandomCustomer(data));
      data.nextCustomerAt = Number(data.nextCustomerAt || now) + wkCustomerIntervalMs(data);
      guard += 1;
    }
    if (data.customers.length >= WK_MAX_CUSTOMERS && now >= data.nextCustomerAt) {
      data.nextCustomerAt = now + wkCustomerIntervalMs(data);
    }
    const changed = previousCount !== data.customers.length || guard > 0;
    if (changed) wkPersist(false);
    return changed;
  }

  function wkPlantVisual(stage) {
    return `<div class="wk-plant-visual stage-${stage}" aria-label="Pflanzenstufe ${stage}">
      <span class="stem"></span><i class="leaf l1"></i><i class="leaf l2"></i><i class="leaf l3"></i><i class="leaf l4"></i><b>🌿</b>
    </div>`;
  }

  function wkHeaderHtml(data) {
    return `<header class="wk-header">
      <button class="wk-icon-button" data-wk-close aria-label="Schließen">×</button>
      <div class="wk-title"><small>BUSINESS-SIMULATION</small><h1>Weed.KL</h1></div>
      <div class="wk-header-stats"><span><small>Business-Geld</small><b>${wkEuro(data.cash)}</b></span><span><small>Level</small><b>${wkBusinessLevel(data)}</b></span></div>
    </header>`;
  }

  function wkNavHtml(data) {
    const items = [
      ["plants", "🌱", "Pflanzen"], ["inventory", "▤", "Inventar"], ["customers", "●", "Kunden"],
      ["shop", "▣", "Shop"], ["upgrades", "↑", "Upgrades"]
    ];
    return `<nav class="wk-nav">${items.map(([id, icon, label]) => `<button class="${wkRuntime.view === id ? "active" : ""}" data-wk-view="${id}"><span>${icon}</span><b>${label}</b>${id === "customers" && data.customers.length ? `<i>${data.customers.length}</i>` : ""}</button>`).join("")}</nav>`;
  }

  function wkSummaryHtml(data) {
    return `<section class="wk-summary-grid">
      <article><small>Pflanzen</small><strong>${data.plants.length}/${wkUnlockedSlots(data)}</strong><span>maximal ${WK_MAX_PLANTS}</span></article>
      <article><small>Gesamtbestand</small><strong>${wkInventoryGrams(data)} g</strong><span>${Object.values(data.inventory).filter((value) => value > 0).length} Sorten</span></article>
      <article><small>Kunden</small><strong>${data.customers.length}/${WK_MAX_CUSTOMERS}</strong><span>Nächste in <b data-wk-next-customer>${wkFormatTimer(data.nextCustomerAt - wkNow())}</b></span></article>
      <article><small>Umsatz</small><strong>${wkEuro(data.stats.revenue)}</strong><span>${data.stats.customersServed} Verkäufe</span></article>
    </section>`;
  }

  function wkPlantCardHtml(plant, data) {
    const strain = wkStrain(plant.strainId);
    const stage = wkPlantStage(plant);
    const target = wkNextThreshold(plant);
    const progress = stage >= 5 ? 100 : Math.min(100, Math.round((plant.waterings / target) * 100));
    const waterReady = wkNow() >= Number(plant.nextWaterAt || 0);
    const trimReady = wkNow() >= Number(plant.nextTrimAt || 0);
    return `<article class="wk-plant-card" style="--wk-accent:${strain.accent}">
      <div class="wk-plant-top"><div><small>${strain.rarity}</small><h3>${wkEscape(strain.name)}</h3></div><span>Stufe ${stage}/5</span></div>
      ${wkPlantVisual(stage)}
      <div class="wk-stage-line"><b>${wkStageLabel(stage)}</b><small>${stage >= 5 ? `${plant.trims}/3 Schnitte` : `${plant.waterings}/${target} Gießen`}</small></div>
      <div class="wk-progress"><i style="width:${progress}%"></i></div>
      <div class="wk-plant-actions">
        ${stage < 5 ? `<button class="primary" data-wk-water="${plant.id}" ${waterReady && data.supplies.water > 0 ? "" : "disabled"}>${waterReady ? "Gießen" : `<span data-wk-water-timer="${plant.id}">${wkFormatTimer(plant.nextWaterAt - wkNow())}</span>`}</button>` : `<button class="harvest" data-wk-trim="${plant.id}" ${trimReady ? "" : "disabled"}>${trimReady ? `Schneiden ${plant.trims + 1}/3` : `<span data-wk-trim-timer="${plant.id}">${wkFormatTimer(plant.nextTrimAt - wkNow())}</span>`}</button>`}
        <span>Wasser ${data.supplies.water}</span>
      </div>
    </article>`;
  }

  function wkPlantsHtml(data) {
    return `<div class="wk-page wk-plants-page">
      ${wkSummaryHtml(data)}
      <section class="wk-page-head"><div><small>GROW ROOM</small><h2>Deine Pflanzen</h2><p>Jede Pflanze besitzt fünf Stufen und kann nach dem Auswachsen dreimal geschnitten werden.</p></div><div class="wk-page-actions"><button data-wk-water-all>Alle bereit gießen</button><button class="primary" data-wk-open-plant ${wkCanPlant(data) ? "" : "disabled"}>Neue Pflanze</button></div></section>
      <div class="wk-plant-grid">${data.plants.length ? data.plants.map((plant) => wkPlantCardHtml(plant, data)).join("") : `<div class="wk-empty"><span>🌱</span><h3>Noch keine Pflanze</h3><p>Du besitzt bereits Startmaterial. Lege deine erste Sorte in einen Topf.</p><button class="primary" data-wk-open-plant>Erste Pflanze setzen</button></div>`}</div>
    </div>`;
  }

  function wkInventoryHtml(data) {
    return `<div class="wk-page">
      ${wkSummaryHtml(data)}
      <section class="wk-page-head"><div><small>LAGER</small><h2>Inventar</h2><p>Samen, Verbrauchsmaterial und geerntete Ware bleiben im Weed.KL-Business getrennt vom LifeBuilder-Geld.</p></div></section>
      <div class="wk-supply-grid">
        <article><span>◉</span><div><small>Freie Töpfe</small><strong>${data.supplies.pot}</strong></div></article>
        <article><span>▰</span><div><small>Erde</small><strong>${data.supplies.soil}</strong></div></article>
        <article><span>◒</span><div><small>Wasser</small><strong>${data.supplies.water}</strong></div></article>
        <article><span>◇</span><div><small>Samen</small><strong>${Object.values(data.seeds).reduce((sum, value) => sum + Number(value || 0), 0)}</strong></div></article>
      </div>
      <section class="wk-inventory-list"><header><h3>Geerntete Sorten</h3><b>${wkInventoryGrams(data)} g gesamt</b></header>
        ${WK_STRAINS.map((strain) => `<article style="--wk-accent:${strain.accent}"><span></span><div><b>${wkEscape(strain.name)}</b><small>Spielwert ${wkEuro(strain.sellPrice)} pro Gramm</small></div><strong>${Number(data.inventory[strain.id] || 0)} g</strong></article>`).join("")}
      </section>
    </div>`;
  }

  function wkCustomerHtml(customer, data) {
    const canServe = wkCanServe(customer, data);
    const total = wkCustomerTotal(customer);
    return `<article class="wk-customer-card ${canServe ? "ready" : "missing"}">
      <header><span>${customer.name.slice(0, 1).toUpperCase()}</span><div><small>${wkEscape(customer.mood)}</small><h3>${wkEscape(customer.name)}</h3></div><b data-wk-customer-timer="${customer.id}">${wkFormatTimer(customer.expiresAtMs - wkNow())}</b></header>
      <div class="wk-order-lines">${customer.lines.map((line) => {
        const strain = wkStrain(line.strainId);
        const owned = Number(data.inventory[line.strainId] || 0);
        return `<div style="--wk-accent:${strain.accent}"><span></span><b>${wkEscape(strain.name)}</b><small>${line.grams} g · Lager ${owned} g</small><strong>${wkEuro(line.grams * line.unitPrice)}</strong></div>`;
      }).join("")}</div>
      <footer><div><small>Gesamtangebot</small><strong>${wkEuro(total)}</strong></div><button data-wk-reject="${customer.id}">Ablehnen</button><button class="primary" data-wk-serve="${customer.id}" ${canServe ? "" : "disabled"}>${canServe ? "Verkaufen" : "Ware fehlt"}</button></footer>
    </article>`;
  }

  function wkCustomersHtml(data) {
    return `<div class="wk-page">
      ${wkSummaryHtml(data)}
      <section class="wk-page-head"><div><small>MARKT</small><h2>Kundenanfragen</h2><p>Neue Kunden erscheinen automatisch. Prüfe Sorte, Menge, Lagerbestand und Gesamtangebot.</p></div></section>
      <div class="wk-customer-grid">${data.customers.length ? data.customers.map((customer) => wkCustomerHtml(customer, data)).join("") : `<div class="wk-empty"><span>●</span><h3>Aktuell keine Anfrage</h3><p>Die nächste Anfrage erscheint in <b data-wk-next-customer>${wkFormatTimer(data.nextCustomerAt - wkNow())}</b>.</p></div>`}</div>
    </div>`;
  }

  function wkShopHtml(data) {
    const marketLevel = Number(data.upgrades.market || 0);
    return `<div class="wk-page">
      <section class="wk-page-head"><div><small>SHOP</small><h2>Material & Samen</h2><p>Business-Geld: <b>${wkEuro(data.cash)}</b> · Einkaufsrabatt ${Math.round(wkDiscount(data) * 100)}%</p></div></section>
      <section class="wk-shop-section"><header><h3>Verbrauchsmaterial</h3><small>Alles, was du für neue Pflanzen und Bewässerung brauchst.</small></header><div class="wk-shop-grid">
        ${WK_SUPPLY_ITEMS.map((item) => `<article><span>${item.icon}</span><div><b>${item.label}</b><small>${item.text}</small></div><strong>${wkEuro(wkShopPrice(item.price, data))}</strong><button data-wk-buy-supply="${item.id}" data-wk-amount="${item.amount}" data-wk-price="${item.price}">Kaufen</button></article>`).join("")}
      </div></section>
      <section class="wk-shop-section"><header><h3>Samenkatalog</h3><small>Startsorten plus weitere Freischaltungen über den Sortenmarkt.</small></header><div class="wk-seed-grid">
        ${WK_STRAINS.map((strain) => {
          const unlocked = strain.tier <= marketLevel;
          return `<article class="${unlocked ? "" : "locked"}" style="--wk-accent:${strain.accent}"><span></span><div><small>${strain.rarity}</small><b>${wkEscape(strain.name)}</b><em>Besitz: ${Number(data.seeds[strain.id] || 0)} Samen</em><i>Spielwert ${wkEuro(strain.sellPrice)}/g</i></div><strong>${unlocked ? wkEuro(wkShopPrice(strain.seedPrice, data)) : `Markt ${strain.tier}`}</strong><button data-wk-buy-seed="${strain.id}" ${unlocked ? "" : "disabled"}>${unlocked ? "Samen kaufen" : "Gesperrt"}</button></article>`;
        }).join("")}
      </div></section>
      <p class="wk-disclaimer">Weed.KL ist eine fiktive Wirtschaftssimulation. Verkaufspreise, Erträge und Abläufe sind reine Spielwerte und keine reale Anleitung.</p>
    </div>`;
  }

  function wkUpgradesHtml(data) {
    return `<div class="wk-page">
      <section class="wk-page-head"><div><small>VERBESSERUNGEN</small><h2>Business ausbauen</h2><p>Investiere dein eigenes Weed.KL-Geld in Kapazität, Tempo, Ertrag und Kunden.</p></div></section>
      <div class="wk-upgrade-grid">${Object.entries(WK_UPGRADES).map(([id, definition]) => {
        const level = Number(data.upgrades[id] || 0);
        const maxed = level >= definition.max;
        const cost = maxed ? 0 : definition.costs[level];
        return `<article><span>${definition.icon}</span><div><small>STUFE ${level}/${definition.max}</small><h3>${definition.label}</h3><p>${definition.text(level)}</p></div><strong>${maxed ? "MAX" : wkEuro(cost)}</strong><button data-wk-upgrade="${id}" ${maxed ? "disabled" : ""}>${maxed ? "Maximal" : "Verbessern"}</button></article>`;
      }).join("")}</div>
      <section class="wk-business-stats"><h3>Geschäftsstatistik</h3><div><span><small>Umsatz</small><b>${wkEuro(data.stats.revenue)}</b></span><span><small>Verkauft</small><b>${data.stats.gramsSold} g</b></span><span><small>Kunden</small><b>${data.stats.customersServed}</b></span><span><small>Ernten</small><b>${data.stats.harvests}</b></span></div></section>
    </div>`;
  }

  function wkPlantModalHtml(data) {
    if (wkRuntime.modal !== "plant") return "";
    const available = WK_STRAINS.filter((strain) => Number(data.seeds[strain.id] || 0) > 0);
    return `<div class="wk-modal-backdrop" data-wk-modal-close><section class="wk-modal" role="dialog" aria-modal="true"><header><div><small>NEUE PFLANZE</small><h2>Sorte auswählen</h2></div><button data-wk-modal-close>×</button></header><p>Benötigt 1 Samen, 1 freien Topf und 1 Einheit Erde.</p><div class="wk-modal-seeds">${available.length ? available.map((strain) => `<button data-wk-plant="${strain.id}" style="--wk-accent:${strain.accent}"><span></span><div><b>${wkEscape(strain.name)}</b><small>${Number(data.seeds[strain.id] || 0)} Samen vorhanden</small></div><strong>Pflanzen</strong></button>`).join("") : `<div class="wk-empty"><span>◇</span><h3>Keine Samen</h3><p>Kaufe zuerst Samen im Shop.</p></div>`}</div></section></div>`;
  }

  function wkMainHtml(data) {
    if (wkRuntime.view === "inventory") return wkInventoryHtml(data);
    if (wkRuntime.view === "customers") return wkCustomersHtml(data);
    if (wkRuntime.view === "shop") return wkShopHtml(data);
    if (wkRuntime.view === "upgrades") return wkUpgradesHtml(data);
    return wkPlantsHtml(data);
  }

  function wkOverlayHtml(data) {
    return `<section class="wk-app-shell">
      ${wkHeaderHtml(data)}
      <main class="wk-main">${wkMainHtml(data)}</main>
      ${wkNavHtml(data)}
      ${wkPlantModalHtml(data)}
      <div class="wk-toast" data-wk-toast></div>
    </section>`;
  }

  function wkEnsureOverlay() {
    if (wkRuntime.overlay) return wkRuntime.overlay;
    const overlay = document.createElement("div");
    overlay.className = "wk-overlay";
    overlay.dataset.wkOverlay = "1";
    overlay.addEventListener("click", wkClick);
    document.body.appendChild(overlay);
    wkRuntime.overlay = overlay;
    return overlay;
  }

  function wkRender() {
    const data = wkState();
    if (!data || !wkRuntime.overlay?.classList.contains("show")) return;
    const main = wkRuntime.overlay.querySelector(".wk-main");
    const scrollTop = main?.scrollTop || 0;
    wkRuntime.overlay.innerHTML = wkOverlayHtml(data);
    requestAnimationFrame(() => {
      const nextMain = wkRuntime.overlay?.querySelector(".wk-main");
      if (nextMain) nextMain.scrollTop = scrollTop;
    });
  }

  function wkToast(message) {
    const text = String(message || "").trim();
    if (!text) return;
    const toast = wkRuntime.overlay?.querySelector("[data-wk-toast]");
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(wkRuntime.toastTimer);
    wkRuntime.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function wkUpdateTimers() {
    const data = wkState();
    const overlay = wkRuntime.overlay;
    if (!data || !overlay?.classList.contains("show")) return;
    overlay.querySelectorAll("[data-wk-next-customer]").forEach((node) => node.textContent = wkFormatTimer(data.nextCustomerAt - wkNow()));
    overlay.querySelectorAll("[data-wk-water-timer]").forEach((node) => {
      const plant = data.plants.find((entry) => entry.id === node.dataset.wkWaterTimer);
      if (plant) node.textContent = wkFormatTimer(plant.nextWaterAt - wkNow());
    });
    overlay.querySelectorAll("[data-wk-trim-timer]").forEach((node) => {
      const plant = data.plants.find((entry) => entry.id === node.dataset.wkTrimTimer);
      if (plant) node.textContent = wkFormatTimer(plant.nextTrimAt - wkNow());
    });
    overlay.querySelectorAll("[data-wk-customer-timer]").forEach((node) => {
      const customer = data.customers.find((entry) => entry.id === node.dataset.wkCustomerTimer);
      if (customer) node.textContent = wkFormatTimer(customer.expiresAtMs - wkNow());
    });
  }

  function wkTick() {
    const changed = wkProcessTime();
    if (changed && wkRuntime.overlay?.classList.contains("show")) wkRender();
    else wkUpdateTimers();
  }

  function wkStartTimers() {
    clearInterval(wkRuntime.tickTimer);
    clearInterval(wkRuntime.autosaveTimer);
    wkRuntime.tickTimer = setInterval(wkTick, 1000);
    wkRuntime.autosaveTimer = setInterval(() => wkPersist(false), 10000);
  }

  function wkStopTimers() {
    clearInterval(wkRuntime.tickTimer);
    clearInterval(wkRuntime.autosaveTimer);
    wkRuntime.tickTimer = null;
    wkRuntime.autosaveTimer = null;
  }

  function wkOpen() {
    const data = wkState();
    if (!data) return typeof addFeed === "function" ? addFeed("Starte zuerst einen LifeBuilder-Spielstand.") : undefined;
    wkProcessTime();
    const overlay = wkEnsureOverlay();
    overlay.innerHTML = wkOverlayHtml(data);
    overlay.classList.add("show");
    document.body.classList.add("wk-open");
    wkStartTimers();
  }

  function wkClose() {
    wkPersist();
    wkRuntime.overlay?.classList.remove("show");
    document.body.classList.remove("wk-open");
    wkRuntime.modal = "";
    wkStopTimers();
  }

  async function wkClick(event) {
    const target = event.target.closest("button, [data-wk-modal-close]");
    if (!target) return;
    if (target.matches("[data-wk-close]")) return wkClose();
    if (target.matches("[data-wk-view]")) {
      wkRuntime.view = target.dataset.wkView;
      wkRuntime.modal = "";
      return wkRender();
    }
    if (target.matches("[data-wk-open-plant]")) {
      wkRuntime.modal = "plant";
      return wkRender();
    }
    if (target.matches("[data-wk-modal-close]")) {
      if (target.classList.contains("wk-modal-backdrop") && event.target !== target) return;
      wkRuntime.modal = "";
      return wkRender();
    }
    if (target.matches("[data-wk-plant]")) return wkCreatePlant(target.dataset.wkPlant);
    if (target.matches("[data-wk-water]")) return wkWaterPlant(target.dataset.wkWater);
    if (target.matches("[data-wk-water-all]")) return wkWaterAll();
    if (target.matches("[data-wk-trim]")) return wkTrimPlant(target.dataset.wkTrim);
    if (target.matches("[data-wk-buy-supply]")) return wkBuySupply(target.dataset.wkBuySupply, Number(target.dataset.wkAmount), Number(target.dataset.wkPrice));
    if (target.matches("[data-wk-buy-seed]")) return wkBuySeed(target.dataset.wkBuySeed);
    if (target.matches("[data-wk-upgrade]")) return wkUpgrade(target.dataset.wkUpgrade);
    if (target.matches("[data-wk-serve]")) return wkServeCustomer(target.dataset.wkServe);
    if (target.matches("[data-wk-reject]")) return wkRejectCustomer(target.dataset.wkReject);
  }

  function wkPhoneHtml() {
    const data = wkState();
    if (!data) return `<p class="device-hint">Starte zuerst einen Spielstand.</p>`;
    return `<div class="wk-phone-launch">
      <section><span>WK</span><div><small>BUSINESS · PFLANZEN · MARKT</small><h4>Weed.KL</h4><p>Baue mit eigenem Startkapital ein vollständiges In-App-Business auf. Bis zu zehn Pflanzen, fünf Wachstumsstufen, Inventar, Shop, Upgrades und automatische Kunden.</p></div></section>
      <div class="wk-phone-stats"><span><small>Business-Geld</small><b>${wkEuro(data.cash)}</b></span><span><small>Pflanzen</small><b>${data.plants.length}/${wkUnlockedSlots(data)}</b></span><span><small>Bestand</small><b>${wkInventoryGrams(data)} g</b></span></div>
      <button class="primary-button" data-wk-phone-open>Weed.KL öffnen</button>
      <small class="wk-phone-note">Fiktive Spielwirtschaft. Die App-Installation wird dauerhaft im Spielstand und zusätzlich lokal gespeichert.</small>
    </div>`;
  }

  function wkBindPhone(shell) {
    shell?.querySelector("[data-wk-phone-open]")?.addEventListener("click", () => {
      document.querySelector("#detailDialog")?.close?.();
      wkOpen();
    });
  }

  // Register as a normal downloadable app. The existing Life App Store persistence layer
  // keeps the installation after reload and removes it only when the user uninstalls it.
  const wkStoreEntry = {
    id: WK_APP_ID,
    label: "Weed.KL",
    icon: "WK",
    minTier: 1,
    status: "available",
    description: "Eigenständige Business-Simulation mit bis zu zehn Pflanzen, fünf Wachstumsstufen, Shop, Inventar, Kunden und Verbesserungen."
  };
  const wkExistingStoreEntry = phoneAppStoreCatalog.find((entry) => entry.id === WK_APP_ID);
  if (wkExistingStoreEntry) Object.assign(wkExistingStoreEntry, wkStoreEntry);
  else phoneAppStoreCatalog.push(wkStoreEntry);

  const wkBaseAppStoreHtml = phoneAppStoreHtml;
  phoneAppStoreHtml = function wkPatchedAppStoreHtml(item) {
    return wkBaseAppStoreHtml(item).replace(
      /<p class="device-hint">[\s\S]*?<\/p>\s*<\/div>\s*$/,
      `<p class="device-hint">Alle heruntergeladenen Apps – einschließlich Weed.KL und der Multiplayer-Games – bleiben nach dem Neuladen installiert, bis du sie selbst deinstallierst.</p></div>`
    );
  };

  const wkBaseDeviceAppsFor = deviceAppsFor;
  deviceAppsFor = function wkDeviceAppsFor(item) {
    const apps = wkBaseDeviceAppsFor(item);
    if (!phoneItems().includes(item) || !isPhoneAppInstalled(WK_APP_ID) || apps.some((app) => app.id === WK_APP_ID)) return apps;
    const missingTier = deviceTier(item) < 1;
    const missingSim = !hasPhoneSim();
    apps.push({
      id: WK_APP_ID,
      min: 1,
      data: false,
      label: "Weed.KL",
      icon: "WK",
      text: "Eigenständiges In-App-Business mit Pflanzen, Shop, Inventar, Kunden und Verbesserungen.",
      layoutClass: "device-downloaded-app wk-app-icon",
      locked: missingTier,
      lockText: missingTier ? "Benötigt mindestens ein Einsteiger-Smartphone." : missingSim ? "Weed.KL funktioniert vollständig offline im Spiel; eine SIM ist nicht nötig." : ""
    });
    return apps;
  };

  const wkBaseDeviceAppActions = deviceAppActions;
  deviceAppActions = function wkDeviceAppActions(appId, item) {
    if (appId === WK_APP_ID) return wkPhoneHtml();
    return wkBaseDeviceAppActions(appId, item);
  };

  const wkBaseOpenDeviceAppDirect = openDeviceAppDirect;
  openDeviceAppDirect = function wkOpenDeviceAppDirect(item, appId) {
    if (appId === WK_APP_ID) {
      document.querySelector("#detailDialog")?.close?.();
      wkOpen();
      return;
    }
    return wkBaseOpenDeviceAppDirect(item, appId);
  };

  const wkBaseOpenDeviceInterface = openDeviceInterface;
  openDeviceInterface = function wkOpenDeviceInterface(item, activeApp = "home", activeUse = true) {
    const result = wkBaseOpenDeviceInterface(item, activeApp, activeUse);
    if (activeApp === WK_APP_ID) {
      const shell = document.querySelector("#detailDialog .device-shell:last-of-type") || document.querySelector("#detailDialog .device-shell");
      wkBindPhone(shell);
    }
    return result;
  };

  window.WeedKL = {
    open: wkOpen,
    close: wkClose,
    version: WK_VERSION,
    debug: {
      getState: () => wkState(),
      plant: wkCreatePlant,
      water: wkWaterPlant,
      trim: wkTrimPlant,
      spawnCustomer: () => {
        const data = wkState();
        if (data && data.customers.length < WK_MAX_CUSTOMERS) {
          data.customers.push(wkRandomCustomer(data));
          wkPersist();
          wkRender();
        }
      }
    }
  };

  window.addEventListener("beforeunload", () => {
    wkPersist(false);
    wkStopTimers();
  });
})();
