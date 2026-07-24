(() => {
  "use strict";

  const WK_APP_ID = "weed-kl";
  const WK_VERSION = "2026-07-24-weed-business-integration-v3";
  const WK_BACKUP_PREFIX = "lifebuilder-weedkl";
  const WK_BASE_CUSTOMERS = 4;
  const WK_MAX_CUSTOMERS = 7;
  const WK_MAX_PLANTS = 10;
  const WK_STAGE_WATER_NEEDS = [5, 6, 7, 8, 10];
  const WK_STAGE_THRESHOLDS = WK_STAGE_WATER_NEEDS.reduce((list, amount) => [...list, (list.at(-1) || 0) + amount], []);

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
    { id: "water", label: "Wasserkanister", icon: "◒", amount: 30, price: 15, text: "Enthält 30 Gießeinheiten." },
    { id: "water", label: "Großer Wassertank", icon: "◉", amount: 100, price: 38, text: "Enthält 100 Gießeinheiten und spart Geld." }
  ];

  const WK_UPGRADES = {
    slots: {
      label: "Pflanzenplätze", icon: "▦", max: 7,
      costs: [250, 450, 700, 1000, 1400, 1900, 2500],
      text: (level) => `${3 + level} von maximal ${WK_MAX_PLANTS} Plätzen freigeschaltet.`
    },
    watering: {
      label: "Schnellbewässerung", icon: "◒", max: 5,
      costs: [250, 500, 850, 1300, 1900],
      text: (level) => `${Math.max(5, 15 - level * 2)} Sekunden Wartezeit zwischen zwei Gießvorgängen.`
    },
    yield: {
      label: "Erntequalität", icon: "✦", max: 5,
      costs: [450, 850, 1400, 2150, 3200],
      text: (level) => `+${level * 5}% Ertrag bei jedem Schnitt.`
    },
    customers: {
      label: "Kundennetzwerk", icon: "●", max: 5,
      costs: [300, 650, 1100, 1750, 2600],
      text: (level) => `Neue Anfragen ungefähr alle ${Math.max(14, 36 - level * 4)} Sekunden.`
    },
    orders: {
      label: "Großbestellungen", icon: "▤", max: 3,
      costs: [550, 1100, 2000],
      text: (level) => `Kunden können bis zu ${Math.min(4, 1 + level)} Sorten gleichzeitig anfragen.`
    },
    market: {
      label: "Sortenmarkt", icon: "◇", max: 4,
      costs: [650, 1300, 2200, 3500],
      text: (level) => `${WK_STRAINS.filter((strain) => strain.tier <= level).length} Sorten im Shop freigeschaltet.`
    },
    discount: {
      label: "Einkaufsrabatt", icon: "%", max: 4,
      costs: [450, 900, 1650, 2750],
      text: (level) => `${level * 3}% Rabatt auf Shop-Einkäufe.`
    },
    autoWater: {
      label: "Gießanlage", icon: "⌁", max: 3,
      costs: [1200, 2400, 4200],
      text: (level) => level ? `Gießt automatisch alle ${[0, 30, 20, 12][level]} Sekunden eine bereite Pflanze.` : "Automatisches Gießen ist noch nicht aktiv."
    },
    reservoir: {
      label: "Wasserrecycling", icon: "♒", max: 4,
      costs: [400, 800, 1400, 2300],
      text: (level) => `${level * 8}% Chance, dass ein Gießvorgang kein Wasser verbraucht.`
    },
    recovery: {
      label: "Regeneration", icon: "↟", max: 3,
      costs: [700, 1350, 2400],
      text: (level) => `Pause zwischen Schnitten: ${[45, 30, 20, 12][level]} Sekunden.`
    },
    quality: {
      label: "Markenqualität", icon: "★", max: 4,
      costs: [750, 1450, 2450, 3800],
      text: (level) => `Kunden bieten bis zu ${level * 3}% mehr pro Gramm.`
    },
    soilSaver: {
      label: "Erde aufbereiten", icon: "♻", max: 3,
      costs: [500, 1000, 1800],
      text: (level) => `${level * 12}% Chance, dass beim Pflanzen keine Erde verbraucht wird.`
    },
    storage: {
      label: "Kundenlounge", icon: "◫", max: 3,
      costs: [600, 1200, 2100],
      text: (level) => `${WK_BASE_CUSTOMERS + level} gleichzeitige Kundenanfragen möglich.`
    },
    security: {
      label: "Kundenbindung", icon: "⌛", max: 3,
      costs: [700, 1400, 2500],
      text: (level) => `Kunden warten ${level * 15} Sekunden länger auf ihre Bestellung.`
    },
    safety: {
      label: "Sicherheitsnetz", icon: "⬡", max: 5,
      costs: [600, 1200, 2100, 3400, 5200],
      text: (level) => `Gefahr steigt bei Verkäufen ${level ? `${level * 10}% langsamer` : "noch ungebremst"}; Kontrollen werden unwahrscheinlicher.`
    },
    packaging: {
      label: "Diskrete Verpackung", icon: "▣", max: 4,
      costs: [450, 950, 1700, 2800],
      text: (level) => `+${level * 2}% Kundenangebot und -${level * 4}% zusätzliche Gefahr pro Verkauf.`
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
      capital: 0,
      danger: 5,
      supplies: { pot: 0, soil: 0, water: 0 },
      seeds: { basic: 0 },
      inventory: {},
      plants: [],
      customers: [],
      upgrades: { slots: 0, watering: 0, yield: 0, customers: 0, orders: 1, market: 0, discount: 0, autoWater: 0, reservoir: 0, recovery: 0, quality: 0, soilSaver: 0, storage: 0, security: 0, safety: 0, packaging: 0 },
      stats: { revenue: 0, gramsSold: 0, customersServed: 0, harvests: 0, waterings: 0, stageUps: 0, bestSale: 0, moneySpent: 0, deposits: 0, withdrawals: 0, raids: 0, dangerPaid: 0 },
      milestones: {},
      nextCustomerAt: now + 22000,
      nextAutoWaterAt: now + 30000,
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
      milestones: { ...base.milestones, ...(data.milestones || {}) },
      plants: Array.isArray(data.plants) ? data.plants.slice(0, WK_MAX_PLANTS) : [],
      customers: Array.isArray(data.customers) ? data.customers.slice(0, WK_MAX_CUSTOMERS) : []
    };
    const legacyCapital = data.capital !== undefined
      ? Number(data.capital || 0)
      : Math.max(0, Number(data.cash || 0) - 1000); // altes kostenloses Startgeld nicht übernehmen
    normalized.capital = Math.max(0, legacyCapital);
    normalized.danger = wkClamp(Number(data.danger ?? normalized.danger ?? 5), 0, 100);
    delete normalized.cash;
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
      thresholds: [...WK_STAGE_THRESHOLDS],
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
    normalized.nextAutoWaterAt = Number(normalized.nextAutoWaterAt || 0);
    if (!Number.isFinite(normalized.nextCustomerAt) || normalized.nextCustomerAt <= 0) normalized.nextCustomerAt = wkNow() + 22000;
    if (!Number.isFinite(normalized.nextAutoWaterAt) || normalized.nextAutoWaterAt <= 0) normalized.nextAutoWaterAt = wkNow() + 30000;
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
    return Math.max(5000, (15 - Number(data?.upgrades?.watering || 0) * 2) * 1000);
  }

  function wkCustomerIntervalMs(data = wkState()) {
    return Math.max(14000, (36 - Number(data?.upgrades?.customers || 0) * 4) * 1000);
  }

  function wkMaxCustomers(data = wkState()) {
    return Math.min(WK_MAX_CUSTOMERS, WK_BASE_CUSTOMERS + Number(data?.upgrades?.storage || 0));
  }

  function wkAutoWaterIntervalMs(data = wkState()) {
    return [0, 30000, 20000, 12000][Math.max(0, Math.min(3, Number(data?.upgrades?.autoWater || 0)))] || 0;
  }

  function wkTrimCooldownMs(data = wkState()) {
    return [45000, 30000, 20000, 12000][Math.max(0, Math.min(3, Number(data?.upgrades?.recovery || 0)))];
  }

  function wkWaterConsumesUnit(data = wkState()) {
    const chance = Math.min(0.32, Number(data?.upgrades?.reservoir || 0) * 0.08);
    return Math.random() >= chance;
  }

  function wkMaxOrderLines(data = wkState()) {
    return Math.min(4, 1 + Number(data?.upgrades?.orders || 0));
  }

  function wkDiscount(data = wkState()) {
    return Math.min(0.12, Number(data?.upgrades?.discount || 0) * 0.03);
  }

  function wkPlayerCash() {
    return Math.max(0, Number(state?.cash || 0));
  }

  function wkCapital(data = wkState()) {
    return Math.max(0, Number(data?.capital || 0));
  }

  function wkDeposit(amount) {
    const data = wkState();
    const requested = amount === "max" ? Math.floor(wkPlayerCash()) : Math.max(0, Math.floor(Number(amount || 0)));
    if (!data || requested < 1) return wkToast("Wähle einen Einzahlungsbetrag.");
    if (wkPlayerCash() < requested) return wkToast("Du hast nicht genug Bargeld. Geld auf dem Konto muss zuerst abgehoben werden.");
    state.cash -= requested;
    data.capital = wkCapital(data) + requested;
    data.stats.deposits = Number(data.stats.deposits || 0) + requested;
    wkPersist();
    wkRender();
    wkToast(`${wkEuro(requested)} Bargeld als Betriebskapital eingezahlt.`);
  }

  function wkWithdraw(amount) {
    const data = wkState();
    const requested = amount === "max" ? Math.floor(wkCapital(data)) : Math.max(0, Math.floor(Number(amount || 0)));
    if (!data || requested < 1) return wkToast("Wähle einen Auszahlungsbetrag.");
    if (wkCapital(data) < requested) return wkToast("So viel Betriebskapital ist nicht vorhanden.");
    data.capital -= requested;
    state.cash = wkPlayerCash() + requested;
    data.stats.withdrawals = Number(data.stats.withdrawals || 0) + requested;
    wkPersist();
    wkRender();
    wkToast(`${wkEuro(requested)} aus dem Betrieb zurück ins Bargeld gelegt.`);
  }

  function wkSpendCapital(amount, label = "Ausgabe", data = wkState()) {
    const cost = Math.max(0, Math.round(Number(amount || 0)));
    if (!data || wkCapital(data) < cost) {
      wkToast(`Nicht genug Betriebskapital für ${label}. Zahle zuerst Bargeld ein.`);
      return false;
    }
    data.capital -= cost;
    data.stats.moneySpent = Number(data.stats.moneySpent || 0) + cost;
    return true;
  }

  function wkDangerLabel(value = wkState()?.danger || 0) {
    const danger = Number(value || 0);
    if (danger < 20) return "Unauffällig";
    if (danger < 45) return "Beobachtet";
    if (danger < 70) return "Riskant";
    if (danger < 90) return "Kritisch";
    return "Razzia droht";
  }

  function wkDangerGain(total, grams, data = wkState()) {
    const safety = Number(data?.upgrades?.safety || 0);
    const packaging = Number(data?.upgrades?.packaging || 0);
    const raw = Math.max(1, Math.round(Number(grams || 0) / 7 + Number(total || 0) / 550));
    return Math.max(1, Math.round(raw * (1 - safety * .10) * (1 - packaging * .04)));
  }

  function wkRunDangerCheck(data = wkState()) {
    if (!data || Number(data.danger || 0) < 65) return false;
    const safety = Number(data.upgrades?.safety || 0);
    const chance = Math.min(.42, Math.max(.03, (Number(data.danger || 0) - 58) / 100 * (1 - safety * .08)));
    if (Math.random() >= chance) return false;
    const confiscated = {};
    WK_STRAINS.forEach((strain) => {
      const owned = Number(data.inventory[strain.id] || 0);
      const lost = Math.min(owned, Math.floor(owned * (0.15 + Math.random() * .20)));
      if (lost > 0) {
        data.inventory[strain.id] -= lost;
        confiscated[strain.id] = lost;
      }
    });
    const fine = Math.min(wkCapital(data), Math.max(100, Math.round(wkCapital(data) * (.12 + Math.random() * .13))));
    data.capital -= fine;
    data.danger = Math.max(10, Number(data.danger || 0) - wkRandomInt(28, 42));
    data.stats.raids = Number(data.stats.raids || 0) + 1;
    const grams = Object.values(confiscated).reduce((sum, value) => sum + value, 0);
    wkToast(`Kontrolle: ${grams} g beschlagnahmt, ${wkEuro(fine)} Kosten. Gefahr fällt auf ${Math.round(data.danger)}%.`);
    return true;
  }

  function wkReduceDanger(percent, cost) {
    const data = wkState();
    const reduction = Math.max(1, Math.floor(Number(percent || 0)));
    if (!data) return;
    if (!wkSpendCapital(cost, "Gefahr senken", data)) return;
    const before = Number(data.danger || 0);
    data.danger = Math.max(0, before - reduction);
    data.stats.dangerPaid = Number(data.stats.dangerPaid || 0) + Number(cost || 0);
    wkPersist();
    wkRender();
    wkToast(`Kontakte bezahlt: Gefahr ${Math.round(before)}% → ${Math.round(data.danger)}%.`);
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

  function wkPlantMature(plant) {
    return Number(plant?.waterings || 0) >= Number(plant?.thresholds?.[4] || WK_STAGE_THRESHOLDS[4]);
  }

  function wkStageLabel(stage, plant = null) {
    if (stage === 5) return wkPlantMature(plant) ? "Ausgewachsen" : "Blütephase";
    return ["", "Eingepflanzt", "Keimling", "Jungpflanze", "Große Pflanze"][stage] || "Pflanze";
  }

  function wkNextThreshold(plant) {
    const stage = wkPlantStage(plant);
    if (wkPlantMature(plant)) return Number(plant.thresholds[4]);
    return Number(plant.thresholds[Math.min(4, stage - 1)]);
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
    data.seeds[strain.id] -= 1;
    data.supplies.pot -= 1;
    const soilSaved = Math.random() < Math.min(0.36, Number(data.upgrades.soilSaver || 0) * 0.12);
    if (!soilSaved) data.supplies.soil -= 1;
    data.plants.push({
      id: wkId("plant"), strainId: strain.id, waterings: 0,
      thresholds: [...WK_STAGE_THRESHOLDS], trims: 0,
      nextWaterAt: 0, nextTrimAt: 0, plantedAtMs: wkNow()
    });
    wkRuntime.modal = "";
    wkPersist();
    wkRender();
    wkToast(`${strain.name} wurde eingepflanzt.${soilSaved ? " Aufbereitete Erde wurde wiederverwendet." : ""}`);
    wkAnimatePlant("planted");
  }

  function wkWaterPlant(plantId) {
    const data = wkState();
    const plant = data?.plants.find((entry) => entry.id === plantId);
    if (!plant) return;
    if (wkPlantMature(plant)) return wkToast("Diese Pflanze ist vollständig ausgewachsen und kann geschnitten werden.");
    if (wkNow() < Number(plant.nextWaterAt || 0)) return wkToast("Die Pflanze kann noch nicht wieder gegossen werden.");
    if (data.supplies.water < 1) return wkToast("Das Wasser ist leer. Kaufe Nachschub im Shop.");
    const oldStage = wkPlantStage(plant);
    const wasMature = wkPlantMature(plant);
    if (wkWaterConsumesUnit(data)) data.supplies.water -= 1;
    plant.waterings += 1;
    plant.nextWaterAt = wkNow() + wkWaterCooldownMs(data);
    data.stats.waterings += 1;
    const newStage = wkPlantStage(plant);
    const becameMature = !wasMature && wkPlantMature(plant);
    if (newStage > oldStage || becameMature) data.stats.stageUps = Number(data.stats.stageUps || 0) + 1;
    wkPersist();
    wkRender();
    wkAnimatePlant(newStage > oldStage || becameMature ? "stage-up" : "water", plant.id);
    wkToast(becameMature ? `${wkStrain(plant.strainId).name} ist vollständig ausgewachsen.` : newStage > oldStage ? `${wkStrain(plant.strainId).name} erreicht Stufe ${newStage}.` : "Pflanze gegossen.");
  }

  function wkWaterAll() {
    const data = wkState();
    if (!data) return;
    const ready = data.plants.filter((plant) => !wkPlantMature(plant) && wkNow() >= Number(plant.nextWaterAt || 0));
    if (!ready.length) return wkToast("Aktuell ist keine Pflanze bereit.");
    if (data.supplies.water < 1) return wkToast("Das Wasser ist leer.");
    let amount = 0;
    let usedWater = 0;
    let stageUps = 0;
    for (const plant of ready) {
      const consumes = wkWaterConsumesUnit(data);
      if (consumes && data.supplies.water - usedWater < 1) break;
      const before = wkPlantStage(plant);
      const matureBefore = wkPlantMature(plant);
      plant.waterings += 1;
      plant.nextWaterAt = wkNow() + wkWaterCooldownMs(data);
      amount += 1;
      if (consumes) usedWater += 1;
      if (wkPlantStage(plant) > before || (!matureBefore && wkPlantMature(plant))) stageUps += 1;
    }
    data.supplies.water -= usedWater;
    data.stats.waterings += amount;
    data.stats.stageUps = Number(data.stats.stageUps || 0) + stageUps;
    wkPersist();
    wkRender();
    wkAnimatePlant(stageUps ? "stage-up" : "water");
    wkToast(`${amount} Pflanze${amount === 1 ? "" : "n"} gegossen · ${usedWater} Wasser verbraucht${stageUps ? ` · ${stageUps} Stufenaufstieg` : ""}.`);
  }

  function wkTrimPlant(plantId) {
    const data = wkState();
    const plant = data?.plants.find((entry) => entry.id === plantId);
    if (!plant || !wkPlantMature(plant)) return wkToast("Die Pflanze ist noch nicht vollständig ausgewachsen.");
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
      plant.nextTrimAt = wkNow() + wkTrimCooldownMs(data);
      wkToast(`${grams} g ${strain.name} geerntet. Noch ${3 - plant.trims} Schnitt${3 - plant.trims === 1 ? "" : "e"}.`);
    }
    wkPersist();
    wkRender();
    wkAnimatePlant("harvest", plantId);
  }

  function wkShopPrice(basePrice, data = wkState()) {
    return Math.max(1, Math.round(Number(basePrice || 0) * (1 - wkDiscount(data))));
  }

  function wkBuySupply(id, amount, basePrice) {
    const data = wkState();
    const price = wkShopPrice(basePrice, data);
    if (!data || !wkSpendCapital(price, "Materialkauf", data)) return;
    data.supplies[id] = Number(data.supplies[id] || 0) + Number(amount || 1);
    wkPersist();
    wkRender();
    wkToast(`Einkauf abgeschlossen: ${wkEuro(price)} aus dem Betriebskapital.`);
  }

  function wkBuyStarterSet() {
    const data = wkState();
    const price = wkShopPrice(75, data);
    if (!data || !wkSpendCapital(price, "Starter-Set", data)) return;
    data.supplies.pot += 1;
    data.supplies.soil += 1;
    data.supplies.water += 50;
    data.seeds.basic = Number(data.seeds.basic || 0) + 2;
    wkPersist();
    wkRender();
    wkToast(`Starter-Set gekauft: Topf, Erde, 50 Wasser und 2 Basic-Samen.`);
  }

  function wkBuySeed(strainId) {
    const data = wkState();
    const strain = wkStrain(strainId);
    if (!data || strain.tier > Number(data.upgrades.market || 0)) return wkToast("Diese Sorte ist noch nicht freigeschaltet.");
    const price = wkShopPrice(strain.seedPrice, data);
    if (!wkSpendCapital(price, "Samenkauf", data)) return;
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
    if (!wkSpendCapital(cost, definition.label, data)) return;
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
      const qualityBonus = 1 + Number(data.upgrades.quality || 0) * 0.03 + Number(data.upgrades.packaging || 0) * 0.02;
      const unitPrice = Math.max(1, Math.round(strain.sellPrice * (0.92 + Math.random() * 0.28) * qualityBonus));
      return { strainId: strain.id, grams, unitPrice };
    });
    const moods = ["Direktanfrage", "Stammkunde", "Schnellkauf", "Qualitätskunde", "Großanfrage"];
    return {
      id: wkId("customer"),
      name: WK_CUSTOMER_NAMES[wkRandomInt(0, WK_CUSTOMER_NAMES.length - 1)],
      lines,
      expiresAtMs: wkNow() + (wkRandomInt(75, 125) + Number(data.upgrades.security || 0) * 15) * 1000,
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
    let gramsSold = 0;
    customer.lines.forEach((line) => {
      data.inventory[line.strainId] -= line.grams;
      data.stats.gramsSold += line.grams;
      gramsSold += Number(line.grams || 0);
    });
    const total = wkCustomerTotal(customer);
    data.capital = wkCapital(data) + total;
    data.stats.revenue += total;
    data.stats.customersServed += 1;
    data.stats.bestSale = Math.max(Number(data.stats.bestSale || 0), total);
    data.customers = data.customers.filter((entry) => entry.id !== customerId);
    const dangerGain = wkDangerGain(total, gramsSold, data);
    data.danger = wkClamp(Number(data.danger || 0) + dangerGain, 0, 100);
    const raid = wkRunDangerCheck(data);
    wkPersist();
    wkRender();
    if (!raid) wkToast(`${customer.name}: ${wkEuro(total)} Betriebskapital · Gefahr +${dangerGain}%`);
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
    const maxCustomers = wkMaxCustomers(data);
    while (now >= Number(data.nextCustomerAt || 0) && data.customers.length < maxCustomers && guard < 4) {
      data.customers.push(wkRandomCustomer(data));
      data.nextCustomerAt = Number(data.nextCustomerAt || now) + wkCustomerIntervalMs(data);
      guard += 1;
    }
    if (data.customers.length >= maxCustomers && now >= data.nextCustomerAt) {
      data.nextCustomerAt = now + wkCustomerIntervalMs(data);
    }
    let autoWatered = 0;
    const autoInterval = wkAutoWaterIntervalMs(data);
    if (autoInterval && now >= Number(data.nextAutoWaterAt || 0)) {
      const ready = data.plants.find((plant) => !wkPlantMature(plant) && now >= Number(plant.nextWaterAt || 0));
      if (ready && data.supplies.water > 0) {
        const before = wkPlantStage(ready);
        const matureBefore = wkPlantMature(ready);
        if (wkWaterConsumesUnit(data)) data.supplies.water -= 1;
        ready.waterings += 1;
        ready.nextWaterAt = now + wkWaterCooldownMs(data);
        data.stats.waterings += 1;
        if (wkPlantStage(ready) > before || (!matureBefore && wkPlantMature(ready))) data.stats.stageUps = Number(data.stats.stageUps || 0) + 1;
        autoWatered = 1;
      }
      data.nextAutoWaterAt = now + autoInterval;
    }
    const changed = previousCount !== data.customers.length || guard > 0 || autoWatered > 0;
    if (changed) wkPersist(false);
    return changed;
  }

  function wkPlantVisual(stage) {
    return `<div class="wk-plant-visual stage-${stage}" aria-label="Pflanzenstufe ${stage}">
      <span class="stem"></span><i class="leaf l1"></i><i class="leaf l2"></i><i class="leaf l3"></i><i class="leaf l4"></i><b>🌿</b>
    </div>`;
  }

  function wkAnimatePlant(kind = "water", plantId = "") {
    requestAnimationFrame(() => {
      const overlay = wkRuntime.overlay;
      if (!overlay) return;
      const card = plantId ? overlay.querySelector(`[data-wk-plant-card="${plantId}"]`) : overlay.querySelector(".wk-plant-card");
      if (card) {
        card.classList.remove("wk-anim-water", "wk-anim-stage-up", "wk-anim-harvest", "wk-anim-planted");
        void card.offsetWidth;
        card.classList.add(`wk-anim-${kind}`);
        setTimeout(() => card.classList.remove(`wk-anim-${kind}`), 1100);
      }
      const burst = document.createElement("div");
      burst.className = `wk-fx-burst ${kind}`;
      burst.innerHTML = Array.from({ length: 8 }, (_, index) => `<i style="--i:${index}"></i>`).join("");
      (card || overlay.querySelector(".wk-main"))?.appendChild(burst);
      setTimeout(() => burst.remove(), 1100);
    });
  }

  function wkHeaderHtml(data) {
    return `<header class="wk-header">
      <button class="wk-icon-button" data-wk-close aria-label="Schließen">×</button>
      <div class="wk-title"><small>BUSINESS-APP · ILLEGALES BUSINESS</small><h1>Weed Business</h1></div>
      <div class="wk-header-stats"><span><small>Betriebskapital</small><b>${wkEuro(wkCapital(data))}</b></span><span><small>Bargeld</small><b>${wkEuro(wkPlayerCash())}</b></span><span class="danger"><small>Gefahr</small><b>${Math.round(data.danger || 0)}%</b></span></div>
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
    const danger = Math.round(Number(data.danger || 0));
    return `<section class="wk-business-capital">
      <div class="wk-capital-copy"><small>BETRIEBSKAPITAL AUS DEINEM BARGELD</small><strong>${wkEuro(wkCapital(data))}</strong><p>Verfügbares Bargeld: <b>${wkEuro(wkPlayerCash())}</b>. Konto-Geld muss zuerst in der Bank-App abgehoben werden.</p></div>
      <div class="wk-capital-actions"><button data-wk-deposit="100">+100 €</button><button data-wk-deposit="500">+500 €</button><button data-wk-deposit="max">Alles einzahlen</button><button data-wk-withdraw="max">Alles auszahlen</button></div>
    </section>
    <section class="wk-danger-panel ${danger >= 70 ? "critical" : ""}">
      <div><small>GEFAHR · ${wkDangerLabel(danger)}</small><strong>${danger}%</strong><p>Gefahr steigt nur durch Verkäufe. Sie sinkt nicht automatisch. Bezahle Kontakte, bevor eine Kontrolle dein Lager trifft.</p></div>
      <div class="wk-danger-meter"><i style="width:${danger}%"></i></div>
      <div class="wk-danger-actions"><button data-wk-danger="10" data-wk-danger-cost="250">-10% · 250 €</button><button data-wk-danger="25" data-wk-danger-cost="700">-25% · 700 €</button><button data-wk-danger="50" data-wk-danger-cost="1400">-50% · 1.400 €</button></div>
    </section>
    <section class="wk-summary-grid">
      <article><small>Pflanzen</small><strong>${data.plants.length}/${wkUnlockedSlots(data)}</strong><span>maximal ${WK_MAX_PLANTS}</span></article>
      <article><small>Gesamtbestand</small><strong>${wkInventoryGrams(data)} g</strong><span>${Object.values(data.inventory).filter((value) => value > 0).length} Sorten</span></article>
      <article><small>Kunden</small><strong>${data.customers.length}/${wkMaxCustomers(data)}</strong><span>Nächste in <b data-wk-next-customer>${wkFormatTimer(data.nextCustomerAt - wkNow())}</b></span></article>
      <article><small>Umsatz</small><strong>${wkEuro(data.stats.revenue)}</strong><span>${data.stats.customersServed} Verkäufe</span></article>
    </section>`;
  }

  function wkPlantCardHtml(plant, data) {
    const strain = wkStrain(plant.strainId);
    const stage = wkPlantStage(plant);
    const mature = wkPlantMature(plant);
    const target = wkNextThreshold(plant);
    const previous = stage <= 1 ? 0 : Number(plant.thresholds[stage - 2] || 0);
    const segmentTotal = Math.max(1, target - previous);
    const segmentDone = Math.max(0, Number(plant.waterings || 0) - previous);
    const progress = mature ? 100 : Math.min(100, Math.round((segmentDone / segmentTotal) * 100));
    const waterReady = wkNow() >= Number(plant.nextWaterAt || 0);
    const trimReady = wkNow() >= Number(plant.nextTrimAt || 0);
    const remaining = Math.max(0, target - Number(plant.waterings || 0));
    return `<article class="wk-plant-card ${mature ? "mature" : "growing"}" data-wk-plant-card="${plant.id}" style="--wk-accent:${strain.accent}">
      <div class="wk-plant-top"><div><small>${strain.rarity}</small><h3>${wkEscape(strain.name)}</h3></div><span>Stufe ${stage}/5</span></div>
      ${wkPlantVisual(stage)}
      <div class="wk-stage-line"><b>${wkStageLabel(stage, plant)}</b><small>${mature ? `${plant.trims}/3 Schnitte` : `Noch ${remaining}× gießen · ${plant.waterings}/${target}`}</small></div>
      <div class="wk-progress"><i style="width:${progress}%"></i></div>
      <div class="wk-plant-actions">
        ${!mature ? `<button class="primary" data-wk-water="${plant.id}" ${waterReady && data.supplies.water > 0 ? "" : "disabled"}>${waterReady ? "Gießen" : `<span data-wk-water-timer="${plant.id}">${wkFormatTimer(plant.nextWaterAt - wkNow())}</span>`}</button>` : `<button class="harvest" data-wk-trim="${plant.id}" ${trimReady ? "" : "disabled"}>${trimReady ? `Schneiden ${plant.trims + 1}/3` : `<span data-wk-trim-timer="${plant.id}">${wkFormatTimer(plant.nextTrimAt - wkNow())}</span>`}</button>`}
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
      <section class="wk-page-head"><div><small>SHOP</small><h2>Material & Samen</h2><p>Betriebskapital: <b>${wkEuro(wkCapital(data))}</b> · Bargeld: <b>${wkEuro(wkPlayerCash())}</b> · Einkaufsrabatt ${Math.round(wkDiscount(data) * 100)}%</p></div></section>
      <section class="wk-starter-card"><span>🌱</span><div><small>START OHNE GRATISGELD</small><h3>Business-Starter-Set</h3><p>1 Topf, 1 Erde, 50 Wasser und 2 Basic-Samen. Bezahlt aus deinem eingezahlten Bargeld.</p></div><strong>${wkEuro(wkShopPrice(75, data))}</strong><button data-wk-buy-starter>Starter-Set kaufen</button></section>
      <section class="wk-shop-section"><header><h3>Verbrauchsmaterial</h3><small>Alles wird aus dem eingezahlten Betriebskapital bezahlt.</small></header><div class="wk-shop-grid">
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

  const WK_MILESTONES = [
    { id: "water-25", label: "25× gegossen", reward: 120, done: (data) => Number(data.stats.waterings || 0) >= 25 },
    { id: "harvest-3", label: "3 Ernten", reward: 180, done: (data) => Number(data.stats.harvests || 0) >= 3 },
    { id: "customers-5", label: "5 Kunden bedient", reward: 250, done: (data) => Number(data.stats.customersServed || 0) >= 5 },
    { id: "sold-100", label: "100 g verkauft", reward: 400, done: (data) => Number(data.stats.gramsSold || 0) >= 100 },
    { id: "revenue-5000", label: "5.000 € Umsatz", reward: 650, done: (data) => Number(data.stats.revenue || 0) >= 5000 }
  ];

  function wkClaimMilestone(id) {
    const data = wkState();
    const milestone = WK_MILESTONES.find((entry) => entry.id === id);
    if (!data || !milestone || data.milestones[id]) return;
    if (!milestone.done(data)) return wkToast("Dieses Ziel ist noch nicht erreicht.");
    data.milestones[id] = true;
    data.capital = wkCapital(data) + milestone.reward;
    wkPersist();
    wkRender();
    wkToast(`Meilenstein erreicht · +${wkEuro(milestone.reward)}.`);
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
      <section class="wk-milestones"><header><div><small>BONI</small><h3>Meilensteine</h3></div><span>Einmalige Business-Belohnungen</span></header><div>${WK_MILESTONES.map((milestone) => { const claimed = !!data.milestones[milestone.id]; const ready = milestone.done(data); return `<article class="${claimed ? "claimed" : ready ? "ready" : ""}"><div><b>${milestone.label}</b><small>${wkEuro(milestone.reward)} Belohnung</small></div><button data-wk-claim="${milestone.id}" ${claimed || !ready ? "disabled" : ""}>${claimed ? "Abgeholt" : ready ? "Abholen" : "Offen"}</button></article>`; }).join("")}</div></section>
      <section class="wk-business-stats"><h3>Geschäftsstatistik</h3><div><span><small>Umsatz</small><b>${wkEuro(data.stats.revenue)}</b></span><span><small>Verkauft</small><b>${data.stats.gramsSold} g</b></span><span><small>Kunden</small><b>${data.stats.customersServed}</b></span><span><small>Ernten</small><b>${data.stats.harvests}</b></span><span><small>Beste Bestellung</small><b>${wkEuro(data.stats.bestSale)}</b></span><span><small>Investiert</small><b>${wkEuro(data.stats.moneySpent)}</b></span><span><small>Kontrollen</small><b>${Number(data.stats.raids || 0)}</b></span><span><small>Gefahr bezahlt</small><b>${wkEuro(data.stats.dangerPaid || 0)}</b></span></div></section>
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
    if (target.matches("[data-wk-deposit]")) return wkDeposit(target.dataset.wkDeposit);
    if (target.matches("[data-wk-withdraw]")) return wkWithdraw(target.dataset.wkWithdraw);
    if (target.matches("[data-wk-danger]")) return wkReduceDanger(Number(target.dataset.wkDanger), Number(target.dataset.wkDangerCost));
    if (target.matches("[data-wk-buy-starter]")) return wkBuyStarterSet();
    if (target.matches("[data-wk-buy-supply]")) return wkBuySupply(target.dataset.wkBuySupply, Number(target.dataset.wkAmount), Number(target.dataset.wkPrice));
    if (target.matches("[data-wk-buy-seed]")) return wkBuySeed(target.dataset.wkBuySeed);
    if (target.matches("[data-wk-upgrade]")) return wkUpgrade(target.dataset.wkUpgrade);
    if (target.matches("[data-wk-claim]")) return wkClaimMilestone(target.dataset.wkClaim);
    if (target.matches("[data-wk-serve]")) return wkServeCustomer(target.dataset.wkServe);
    if (target.matches("[data-wk-reject]")) return wkRejectCustomer(target.dataset.wkReject);
  }

  window.WeedKL = {
    open: wkOpen,
    close: wkClose,
    version: WK_VERSION,
    summary: () => {
      const data = wkState();
      return data ? { capital: wkCapital(data), danger: Number(data.danger || 0), plants: data.plants.length, slots: wkUnlockedSlots(data), grams: wkInventoryGrams(data) } : null;
    },
    debug: {
      getState: () => wkState(),
      deposit: wkDeposit,
      plant: wkCreatePlant,
      water: wkWaterPlant,
      trim: wkTrimPlant,
      spawnCustomer: () => {
        const data = wkState();
        if (data && data.customers.length < wkMaxCustomers(data)) {
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
