(() => {
  "use strict";

  const FC_VERSION = "2026-07-24-financial-housing-v2";
  const FC_OVERDRAFT_LIMIT = -10000;
  const FC_PROTECTED_INCOME_RATE = 0.30;
  const FC_STARTER_RENT = 65;
  const FC_STARTER_GRACE_DAYS = 3;
  const FC_EVICTION_MISSES = 4;
  const FC_SHELTER_FREE_NIGHTS = 5;
  const FC_SHELTER_PAID_COST = 12;
  const FC_HOSTEL_COST = 35;
  const FC_CAR_COST = 5;

  const original = {
    createState,
    migrateState,
    save,
    render,
    canAfford,
    canAffordWithMethod,
    debitPlayer,
    payoutFromTreasury,
    settleTenantRentAfterSleep,
    settleDailyTaxesAfterSleep,
    settleDailyDebtCostsAfterSleep,
    nextDay,
    sleepAndAdvanceDay,
    availableHomeProperties,
    currentAccessibleHomeProperty,
    hasAccessibleHome,
    usesEmergencyShelter,
    isAtOwnHome,
    isHomeDashboardAvailable,
    isDailyDashboardAvailable,
    emergencyShelterDaysUsed,
    emergencyShelterDaysLeft,
    isEmergencyShelterAvailable,
    openHomePropertyDialog,
    openEmergencyShelterDialog,
    startTenantLease,
    renderBank,
    openPlayerBankDialog,
    renderDailyActions,
    updateHomeShortcut,
    canWorkAtCurrentPlace,
    canSleepAtCurrentPlace
  };

  function fcNum(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function fcDay(save = state) {
    return Math.max(1, Math.floor(fcNum(save?.day, 1)));
  }

  function fcMoney(value) {
    return Math.round(fcNum(value, 0) * 100) / 100;
  }

  function fcEffectiveOverdraftLimit(save = state) {
    const financial = save?.financialCrisis;
    if (financial?.insolvencyUntilDay && fcDay(save) <= financial.insolvencyUntilDay) return 0;
    return FC_OVERDRAFT_LIMIT;
  }

  function fcDefaultFinancial(save) {
    return {
      version: FC_VERSION,
      overdraftLimit: FC_OVERDRAFT_LIMIT,
      protectedIncomeRate: FC_PROTECTED_INCOME_RATE,
      warningStage: 0,
      lastWarningDay: 0,
      limitReachedDays: 0,
      emergencyGrantClaimed: false,
      counselingAvailableDay: 1,
      interestFreezeUntilDay: 0,
      insolvencyUntilDay: 0,
      repaymentPlan: null,
      aid: {
        foodDay: 0,
        showerDay: 0,
        dayWorkDay: 0,
        bottleDay: 0,
        busTicketDay: 0,
        phoneClaimed: false,
        clothingClaimed: false
      },
      stats: {
        protectedCash: 0,
        overdraftRepaid: 0,
        crisisIncome: 0,
        counselingSavings: 0
      }
    };
  }

  function fcDefaultHousing(save) {
    const day = fcDay(save);
    return {
      version: FC_VERSION,
      homeless: false,
      homelessSinceDay: 0,
      sleepMode: "shelter",
      lastSleepMode: "home",
      shelterNightsUsed: 0,
      storageUntilDay: 0,
      storageFees: 0,
      rentArrears: 0,
      missedRentPayments: 0,
      evictionWarning: 0,
      evictionDay: 0,
      lastHousingAidDay: 0,
      friendStays: 0,
      carStays: 0,
      benchStays: 0,
      hostelStays: 0,
      shelterStays: 0,
      starterGraceUntilDay: day + FC_STARTER_GRACE_DAYS,
      history: []
    };
  }

  function fcStarterHome(save = state) {
    if (!save?.starterHome) return null;
    return {
      id: "starter-home-rental",
      name: save.starterHome.type || "Einraumwohnung",
      city: save.starterHome.city || save.homeCity || "Essen",
      district: "Startviertel",
      rooms: 1,
      roomNames: Array.isArray(save.starterHome.rooms) ? save.starterHome.rooms : ["Wohn-/Schlafraum", "Küche", "Bad"],
      sqm: 31,
      floors: 1,
      storageType: "Kellerbox",
      dailyRent: Math.max(0, fcNum(save.starterHome.dailyRent, FC_STARTER_RENT)),
      isTenantRental: true,
      isStarterHome: true,
      rentalTier: "small",
      eur: 95000
    };
  }

  function fcNormalizeSave(save) {
    if (!save || typeof save !== "object") return save;

    save.cash = Math.max(0, fcMoney(save.cash));
    save.bank = Math.max(FC_OVERDRAFT_LIMIT, fcMoney(save.bank));
    save.debt = Math.max(0, fcMoney(save.debt));

    const defaultFinancial = fcDefaultFinancial(save);
    save.financialCrisis = {
      ...defaultFinancial,
      ...(save.financialCrisis || {}),
      aid: { ...defaultFinancial.aid, ...(save.financialCrisis?.aid || {}) },
      stats: { ...defaultFinancial.stats, ...(save.financialCrisis?.stats || {}) }
    };
    save.financialCrisis.version = FC_VERSION;
    save.financialCrisis.overdraftLimit = FC_OVERDRAFT_LIMIT;
    save.financialCrisis.protectedIncomeRate = FC_PROTECTED_INCOME_RATE;
    save.financialCrisis.warningStage = Math.max(0, Math.min(3, Math.floor(fcNum(save.financialCrisis.warningStage))));
    save.financialCrisis.limitReachedDays = Math.max(0, Math.floor(fcNum(save.financialCrisis.limitReachedDays)));
    save.financialCrisis.repaymentPlan = save.financialCrisis.repaymentPlan && typeof save.financialCrisis.repaymentPlan === "object"
      ? {
          active: Boolean(save.financialCrisis.repaymentPlan.active),
          originalAmount: Math.max(0, fcMoney(save.financialCrisis.repaymentPlan.originalAmount)),
          remaining: Math.max(0, fcMoney(save.financialCrisis.repaymentPlan.remaining)),
          installment: Math.max(25, fcMoney(save.financialCrisis.repaymentPlan.installment || 50)),
          startedDay: Math.max(1, Math.floor(fcNum(save.financialCrisis.repaymentPlan.startedDay, fcDay(save)))),
          lastPaidDay: Math.max(0, Math.floor(fcNum(save.financialCrisis.repaymentPlan.lastPaidDay))),
          paid: Math.max(0, fcMoney(save.financialCrisis.repaymentPlan.paid))
        }
      : null;

    const defaultHousing = fcDefaultHousing(save);
    save.housingCrisis = {
      ...defaultHousing,
      ...(save.housingCrisis || {}),
      history: Array.isArray(save.housingCrisis?.history) ? save.housingCrisis.history.slice(-40) : []
    };
    save.housingCrisis.version = FC_VERSION;
    save.housingCrisis.shelterNightsUsed = Math.max(0, Math.floor(fcNum(save.housingCrisis.shelterNightsUsed)));
    save.housingCrisis.rentArrears = Math.max(0, fcMoney(save.housingCrisis.rentArrears));
    save.housingCrisis.storageFees = Math.max(0, fcMoney(save.housingCrisis.storageFees));
    save.housingCrisis.storageUntilDay = Math.max(0, Math.floor(fcNum(save.housingCrisis.storageUntilDay)));
    save.housingCrisis.missedRentPayments = Math.max(0, Math.floor(fcNum(save.housingCrisis.missedRentPayments)));
    save.housingCrisis.evictionWarning = Math.max(0, Math.min(4, Math.floor(fcNum(save.housingCrisis.evictionWarning))));
    save.housingCrisis.sleepMode = ["shelter", "hostel", "friend", "car", "bench"].includes(save.housingCrisis.sleepMode)
      ? save.housingCrisis.sleepMode
      : "shelter";

    save.starterHome ||= {
      city: save.homeCity || "Essen",
      type: "Einraumwohnung",
      rooms: ["Eingang", "Wohn-/Schlafraum", "Küche", "Bad"],
      rentable: false
    };
    save.starterHome.active = save.starterHome.active !== false;
    save.starterHome.dailyRent = Math.max(0, Math.round(fcNum(save.starterHome.dailyRent, FC_STARTER_RENT)));
    save.starterHome.lastPaidDay = Math.max(0, Math.floor(fcNum(save.starterHome.lastPaidDay, fcDay(save))));
    save.starterHome.paidDays = Math.max(0, Math.floor(fcNum(save.starterHome.paidDays, 1)));
    save.starterHome.totalPaid = Math.max(0, fcMoney(save.starterHome.totalPaid));

    if (save.tenantLease && save.tenantLease.active !== false) save.starterHome.active = false;

    const originalOwned = Array.isArray(save.properties) && save.properties.some((id) => !save.rentedProperties?.[id]);
    const tenantActive = !!save.tenantLease && save.tenantLease.active !== false;
    const starterActive = !!save.starterHome.active;
    if (originalOwned || tenantActive || starterActive) {
      save.housingCrisis.homeless = false;
      save.housingCrisis.homelessSinceDay = 0;
    } else {
      save.housingCrisis.homeless = true;
      save.housingCrisis.homelessSinceDay ||= fcDay(save);
    }

    return save;
  }

  function fcNormalizeAll() {
    if (Array.isArray(saveSlots)) {
      saveSlots = saveSlots.map((slot) => fcNormalizeSave(slot));
      if (Number.isInteger(selectedSlot) && saveSlots[selectedSlot]) state = saveSlots[selectedSlot];
    }
    if (state) fcNormalizeSave(state);
  }

  createState = function fcCreateState(formData) {
    const save = original.createState(formData);
    save.starterHome.active = true;
    save.starterHome.dailyRent = FC_STARTER_RENT;
    save.starterHome.lastPaidDay = save.day;
    save.financialCrisis = fcDefaultFinancial(save);
    save.housingCrisis = fcDefaultHousing(save);
    return fcNormalizeSave(save);
  };

  migrateState = function fcMigrateState(save) {
    return fcNormalizeSave(original.migrateState(save));
  };

  save = function fcSave() {
    if (state) fcNormalizeSave(state);
    return original.save();
  };

  function fcPositiveBank(save = state) {
    return Math.max(0, fcMoney(save?.bank));
  }

  function fcBankHeadroom(save = state) {
    return Math.max(0, fcMoney(save?.bank) - fcEffectiveOverdraftLimit(save));
  }

  canAffordWithMethod = function fcCanAffordWithMethod(price, method = "auto") {
    const amount = Math.max(0, fcMoney(price));
    if (!state) return false;
    if (method === "cash") return state.cash >= amount;
    if (method === "card") return state.bank - amount >= fcEffectiveOverdraftLimit(state);
    return state.cash + fcBankHeadroom() >= amount;
  };

  canAfford = function fcCanAfford(price) {
    return canAffordWithMethod(price, "auto");
  };

  debitPlayer = function fcDebitPlayer(price, method = "auto") {
    let remaining = Math.max(0, fcMoney(price));
    if (!state || remaining <= 0) return 0;
    if (!canAffordWithMethod(remaining, method)) return 0;

    if (method === "cash") {
      state.cash = Math.max(0, fcMoney(state.cash - remaining));
      return remaining;
    }

    if (method === "card") {
      state.bank = Math.max(fcEffectiveOverdraftLimit(state), fcMoney(state.bank - remaining));
      return remaining;
    }

    const bankPositive = Math.min(remaining, fcPositiveBank());
    state.bank = fcMoney(state.bank - bankPositive);
    remaining -= bankPositive;

    const cashPart = Math.min(remaining, Math.max(0, state.cash));
    state.cash = fcMoney(state.cash - cashPart);
    remaining -= cashPart;

    if (remaining > 0) state.bank = Math.max(fcEffectiveOverdraftLimit(state), fcMoney(state.bank - remaining));
    return price;
  };

  function fcCreditIncome(amount, label = "Einnahme", options = {}) {
    const value = Math.max(0, fcMoney(amount));
    if (!state || value <= 0) return 0;
    fcNormalizeSave(state);
    const financial = state.financialCrisis;
    if (state.bank < 0 && options.protected !== false) {
      const protectedCash = Math.max(1, Math.round(value * financial.protectedIncomeRate * 100) / 100);
      const bankPart = Math.max(0, value - protectedCash);
      const previousBank = fcMoney(state.bank);
      const repaid = Math.min(Math.max(0, -previousBank), bankPart);
      state.bank = fcMoney(previousBank + bankPart);
      state.cash = fcMoney(state.cash + protectedCash);
      financial.stats.protectedCash = fcMoney(financial.stats.protectedCash + protectedCash);
      financial.stats.overdraftRepaid = fcMoney(financial.stats.overdraftRepaid + repaid);
      financial.stats.crisisIncome = fcMoney(financial.stats.crisisIncome + value);
      if (typeof addFeed === "function" && options.feed !== false) addFeed(`${label}: ${euro.format(value)} erhalten · 70% gegen das Minus, 30% als geschütztes Bargeld.`);
      return value;
    }
    state.bank = fcMoney(state.bank + value);
    if (typeof addFeed === "function" && options.feed === true) addFeed(`${label}: ${euro.format(value)} auf dem Konto.`);
    return value;
  }

  payoutFromTreasury = function fcPayoutFromTreasury(amount) {
    const value = Math.max(0, fcMoney(amount));
    state.publicTreasury = Math.max(0, fcMoney((state.publicTreasury || 0) - value));
    return fcCreditIncome(value, "Einnahme", { feed: false });
  };

  window.LifeBuilderFinance = {
    version: FC_VERSION,
    overdraftLimit: FC_OVERDRAFT_LIMIT,
    normalize: fcNormalizeSave,
    creditIncome: fcCreditIncome,
    openCrisisCenter: () => fcOpenCrisisCenter()
  };

  function fcFinancialStage(save = state) {
    const bank = fcMoney(save?.bank);
    if (bank <= FC_OVERDRAFT_LIMIT) return 3;
    if (bank <= -5000) return 2;
    if (bank <= -1000) return 1;
    return 0;
  }

  function fcStageLabel(stage = fcFinancialStage()) {
    return ["Stabil", "Geldprobleme", "Überschuldet", "Minusgrenze erreicht"][stage] || "Stabil";
  }

  function fcUpdateFinancialStage({ daily = false } = {}) {
    if (!state) return;
    fcNormalizeSave(state);
    const financial = state.financialCrisis;
    const stage = fcFinancialStage();
    if (daily && stage === 3) financial.limitReachedDays += 1;
    else if (stage < 3) financial.limitReachedDays = 0;

    if (stage > financial.warningStage || (daily && stage > 0 && financial.lastWarningDay !== fcDay())) {
      financial.warningStage = stage;
      financial.lastWarningDay = fcDay();
      const messages = {
        1: "Bank-Warnung: Dein Konto ist stärker im Minus. Prüfe günstige Ausgaben und den Krisenplan.",
        2: "Bank-Warnung: Überschuldung. Neue Kredite und Ratenkäufe sind stark eingeschränkt.",
        3: "Kontolimit erreicht: Keine weiteren Kartenkäufe. Nur Geldeingänge und Bargeld bleiben verfügbar."
      };
      if (messages[stage] && typeof addFeed === "function") addFeed(messages[stage]);
    }
    if (stage === 0) {
      financial.warningStage = 0;
      financial.lastWarningDay = 0;
    }
  }

  function fcPermanentHomes() {
    const homes = original.availableHomeProperties ? original.availableHomeProperties() : [];
    return Array.isArray(homes) ? homes : [];
  }

  availableHomeProperties = function fcAvailableHomeProperties() {
    const homes = fcPermanentHomes();
    if (state?.starterHome?.active && !state?.tenantLease?.active && !homes.some((home) => home?.id === "starter-home-rental")) {
      homes.unshift(fcStarterHome(state));
    }
    return homes.filter(Boolean);
  };

  currentAccessibleHomeProperty = function fcCurrentAccessibleHomeProperty() {
    const homes = availableHomeProperties();
    if (!homes.length) return null;
    const selected = homes.find((property) => property.id === state.activeHomePropertyId);
    return selected || homes.find((property) => property.city === (state.worldLocation || state.homeCity)) || homes[0];
  };

  function fcHasPermanentHome() {
    return availableHomeProperties().length > 0;
  }

  emergencyShelterDaysUsed = function fcEmergencyShelterDaysUsed() {
    return Math.max(0, Math.floor(fcNum(state?.housingCrisis?.shelterNightsUsed)));
  };

  emergencyShelterDaysLeft = function fcEmergencyShelterDaysLeft() {
    return fcShelterNightsLeft();
  };

  isEmergencyShelterAvailable = function fcIsEmergencyShelterAvailable() {
    return !!state && !fcHasPermanentHome();
  };

  hasAccessibleHome = function fcHasAccessibleHome() {
    return !!state && (fcHasPermanentHome() || state.housingCrisis?.homeless);
  };

  usesEmergencyShelter = function fcUsesEmergencyShelter() {
    return !!state?.housingCrisis?.homeless && state.housingCrisis.sleepMode === "shelter";
  };

  isAtOwnHome = function fcIsAtOwnHome() {
    return !!state && state.location === "home" && (state.worldLocation || state.homeCity) === state.homeCity && hasAccessibleHome();
  };

  isHomeDashboardAvailable = function fcIsHomeDashboardAvailable() {
    return !!state
      && isAtOwnHome()
      && state.homeDashboardActive !== false
      && !state.localTravel
      && !state.worldTravel
      && !state.quickHomeTravel;
  };

  isDailyDashboardAvailable = function fcIsDailyDashboardAvailable() {
    return isHomeDashboardAvailable() || (typeof isHotelDashboardAvailable === "function" && isHotelDashboardAvailable());
  };

  function fcShelterNightsLeft() {
    return Math.max(0, FC_SHELTER_FREE_NIGHTS - Math.max(0, fcNum(state?.housingCrisis?.shelterNightsUsed)));
  }

  function fcHasRelationshipHelp() {
    return Boolean(state?.finder?.relationshipId || (state?.finder?.matches || []).length >= 2);
  }

  function fcHasVehicle() {
    try { return typeof vehicleCount === "function" && vehicleCount() > 0; }
    catch { return false; }
  }

  function fcEnsureHomelessState(reason = "") {
    if (!state) return;
    fcNormalizeSave(state);
    if (fcHasPermanentHome()) {
      state.housingCrisis.homeless = false;
      state.housingCrisis.homelessSinceDay = 0;
      return;
    }
    if (!state.housingCrisis.homeless) {
      state.housingCrisis.homeless = true;
      state.housingCrisis.homelessSinceDay = fcDay();
      state.housingCrisis.storageUntilDay = fcDay() + 5;
      state.housingCrisis.sleepMode = fcShelterNightsLeft() > 0 ? "shelter" : "bench";
      state.mood = typeof clamp === "function" ? clamp(fcNum(state.mood, 75) - 10) : Math.max(0, fcNum(state.mood, 75) - 10);
      if (reason && typeof addFeed === "function") addFeed(reason);
    }
    state.location = "home";
    state.worldLocation = state.homeCity || state.worldLocation;
    state.homeDashboardActive = true;
  }

  function fcEvict(reason, source = "tenant") {
    const housing = state.housingCrisis;
    const homeName = source === "starter"
      ? (state.starterHome?.type || "Startwohnung")
      : (state.tenantLease?.property?.name || "Mietwohnung");
    if (source === "starter") state.starterHome.active = false;
    else state.tenantLease = null;
    state.activeHomePropertyId = "";
    housing.evictionDay = fcDay();
    housing.evictionWarning = 4;
    housing.history.push({ day: fcDay(), kind: "eviction", text: `${homeName}: ${reason}` });
    state.credit = typeof clamp === "function" ? clamp(fcNum(state.credit, 15) - 12) : Math.max(0, fcNum(state.credit, 15) - 12);
    fcEnsureHomelessState(`${homeName}: Räumung nach mehreren unbezahlten Mieten. Du hast jetzt Zugang zur Krisenhilfe und Notunterkunft.`);
  }

  function fcActiveRentSource() {
    if (state?.tenantLease?.active !== false && state?.tenantLease?.property) {
      return { source: "tenant", rent: Math.max(0, Math.round(fcNum(state.tenantLease.dailyRent))), lease: state.tenantLease, name: state.tenantLease.property.name || "Mietwohnung" };
    }
    if (state?.starterHome?.active) {
      return { source: "starter", rent: Math.max(0, Math.round(fcNum(state.starterHome.dailyRent, FC_STARTER_RENT))), lease: state.starterHome, name: state.starterHome.type || "Startwohnung" };
    }
    return null;
  }

  settleTenantRentAfterSleep = function fcSettleTenantRentAfterSleep() {
    fcNormalizeSave(state);
    const active = fcActiveRentSource();
    if (!active) {
      fcEnsureHomelessState();
      return;
    }
    const housing = state.housingCrisis;
    const day = fcDay();
    if (active.source === "starter" && day <= housing.starterGraceUntilDay) {
      active.lease.lastPaidDay = day;
      return;
    }
    if (fcNum(active.lease.lastPaidDay) >= day) return;
    if (active.rent <= 0) {
      active.lease.lastPaidDay = day;
      return;
    }

    if (canAffordWithMethod(active.rent, "auto")) {
      debitPlayer(active.rent, "auto");
      if (typeof allocateOutgoingPayment === "function") allocateOutgoingPayment(active.rent, "treasury", 0.19);
      active.lease.lastPaidDay = day;
      active.lease.paidDays = Math.max(1, Math.floor(fcNum(active.lease.paidDays, 1))) + 1;
      active.lease.totalPaid = fcMoney(fcNum(active.lease.totalPaid) + active.rent);
      if (housing.rentArrears <= 0) {
        housing.missedRentPayments = 0;
        housing.evictionWarning = 0;
      }
      if (typeof addFeed === "function") addFeed(`${active.name}: ${euro.format(active.rent)} Miete bezahlt.${housing.rentArrears > 0 ? ` Rückstand weiterhin ${euro.format(housing.rentArrears)}.` : ""}`);
      return;
    }

    housing.rentArrears = fcMoney(housing.rentArrears + active.rent);
    housing.missedRentPayments += 1;
    housing.evictionWarning = Math.min(4, housing.missedRentPayments);
    active.lease.lastPaidDay = day;
    const messages = [
      "",
      `Erste Mahnung: ${active.name} · ${euro.format(active.rent)} offen.`,
      `Zweite Mahnung: Mietrückstand ${euro.format(housing.rentArrears)}. Ratenzahlung oder Hilfe nutzen.`,
      `Letzte Zahlungsfrist: Beim nächsten Ausfall droht die Räumung. Rückstand ${euro.format(housing.rentArrears)}.`,
      `Räumung: Vier Mietzahlungen konnten nicht geleistet werden.`
    ];
    if (typeof addFeed === "function") addFeed(messages[housing.evictionWarning]);
    if (housing.missedRentPayments >= FC_EVICTION_MISSES) fcEvict("Mietgrenze überschritten", active.source);
  };

  startTenantLease = function fcStartTenantLease(offerId) {
    const before = state?.tenantLease;
    const result = original.startTenantLease(offerId);
    if (state?.tenantLease && state.tenantLease !== before) {
      state.starterHome.active = false;
      state.housingCrisis.homeless = false;
      state.housingCrisis.homelessSinceDay = 0;
      state.housingCrisis.missedRentPayments = 0;
      state.housingCrisis.evictionWarning = 0;
      state.housingCrisis.rentArrears = 0;
      save();
    }
    return result;
  };

  function fcUsePositiveFunds(amount) {
    let remaining = Math.max(0, fcMoney(amount));
    const cash = Math.min(remaining, Math.max(0, state.cash));
    state.cash = fcMoney(state.cash - cash);
    remaining -= cash;
    if (remaining > 0) {
      const bank = Math.min(remaining, Math.max(0, state.bank));
      state.bank = fcMoney(state.bank - bank);
      remaining -= bank;
    }
    return remaining <= 0;
  }

  function fcPayRentArrears() {
    const housing = state.housingCrisis;
    const amount = Math.max(0, fcMoney(housing.rentArrears));
    if (!amount) return addFeed("Es gibt aktuell keinen Mietrückstand.");
    if (!canAffordWithMethod(amount, "auto")) return addFeed(`Für den Mietrückstand brauchst du ${euro.format(amount)}. Das Kontolimit darf nicht überschritten werden.`);
    debitPlayer(amount, "auto");
    allocateOutgoingPayment(amount, "treasury", 0);
    housing.rentArrears = 0;
    housing.missedRentPayments = 0;
    housing.evictionWarning = 0;
    addFeed(`Mietrückstand vollständig bezahlt: ${euro.format(amount)}.`);
    save();
    fcOpenCrisisCenter("debt");
  }

  function fcPayStorageFees() {
    const housing = state.housingCrisis;
    const amount = Math.max(0, fcMoney(housing.storageFees));
    if (!amount) return addFeed("Es gibt aktuell keine offenen Lagergebühren.");
    if (state.cash + Math.max(0, state.bank) < amount) return addFeed(`Für die Lagergebühren brauchst du ${euro.format(amount)} aus Bargeld oder positivem Kontoguthaben.`);
    fcUsePositiveFunds(amount);
    if (typeof allocateOutgoingPayment === "function") allocateOutgoingPayment(amount, "treasury", 0);
    housing.storageFees = 0;
    addFeed(`Lagergebühren vollständig bezahlt: ${euro.format(amount)}.`);
    save();
    render();
    fcOpenCrisisCenter("debt");
  }

  function fcChargeSleepMode(mode) {
    const housing = state.housingCrisis;
    if (!housing.homeless) return true;
    const day = fcDay();
    if (mode === "shelter") {
      if (fcShelterNightsLeft() > 0) return true;
      if (state.cash < FC_SHELTER_PAID_COST) return false;
      state.cash = Math.max(0, fcMoney(state.cash - FC_SHELTER_PAID_COST));
      if (typeof allocateOutgoingPayment === "function") allocateOutgoingPayment(FC_SHELTER_PAID_COST, "treasury", 0.07);
      return true;
    }
    if (mode === "hostel") {
      if (state.cash < FC_HOSTEL_COST) return false;
      state.cash -= FC_HOSTEL_COST;
      return true;
    }
    if (mode === "car") {
      if (!fcHasVehicle() || state.cash < FC_CAR_COST) return false;
      state.cash -= FC_CAR_COST;
      return true;
    }
    if (mode === "friend") return fcHasRelationshipHelp();
    if (mode === "bench") return true;
    housing.sleepMode = fcShelterNightsLeft() > 0 ? "shelter" : "bench";
    return true;
  }

  sleepAndAdvanceDay = function fcSleepAndAdvanceDay(reason = "Du hast geschlafen und bist erholt.") {
    fcNormalizeSave(state);
    fcEnsureHomelessState();
    const housing = state.housingCrisis;
    if (housing.homeless) {
      const mode = housing.sleepMode || (fcShelterNightsLeft() > 0 ? "shelter" : "bench");
      if (!fcChargeSleepMode(mode)) {
        addFeed(mode === "hostel" ? "Für das Hostel fehlen 35 € Bargeld." : mode === "car" ? "Für Schlafen im Auto brauchst du ein Fahrzeug und 5 € Bargeld." : "Die kostenlose Notunterkunft ist aufgebraucht. Wähle eine andere Schlafmöglichkeit.");
        fcOpenCrisisCenter("shelter");
        return;
      }
      housing.lastSleepMode = mode;
      const labels = { shelter: "Notunterkunft", hostel: "Hostel", friend: "bei Freunden", car: "im Auto", bench: "auf einer Parkbank" };
      reason = `Du hast ${labels[mode] || "in einer Notunterkunft"} geschlafen.`;
    } else {
      housing.lastSleepMode = "home";
    }
    return original.sleepAndAdvanceDay(reason);
  };

  nextDay = function fcNextDay(reason, options = {}) {
    const beforeEnergy = fcNum(state?.energy, 50);
    const beforeMood = fcNum(state?.mood, 50);
    const mode = state?.housingCrisis?.lastSleepMode || "home";
    const result = original.nextDay(reason, options);
    if (!state) return result;
    fcNormalizeSave(state);
    const housing = state.housingCrisis;
    fcEnsureHomelessState();

    if (housing.homeless) {
      const effects = {
        shelter: { recovery: 24, mood: -2, health: 0 },
        hostel: { recovery: 38, mood: 2, health: 2 },
        friend: { recovery: 32, mood: 1, health: 1 },
        car: { recovery: 19, mood: -3, health: -1 },
        bench: { recovery: 10, mood: -8, health: -3 }
      }[mode] || { recovery: 18, mood: -3, health: -1 };
      state.energy = typeof clamp === "function" ? clamp(Math.min(fcNum(state.energy), beforeEnergy + effects.recovery)) : Math.max(0, Math.min(100, beforeEnergy + effects.recovery));
      state.mood = typeof clamp === "function" ? clamp(fcNum(state.mood, beforeMood) + effects.mood) : Math.max(0, Math.min(100, fcNum(state.mood, beforeMood) + effects.mood));
      state.health = typeof clamp === "function" ? clamp(fcNum(state.health, 100) + effects.health) : Math.max(0, Math.min(100, fcNum(state.health, 100) + effects.health));
      if (mode === "shelter") { housing.shelterNightsUsed += 1; housing.shelterStays += 1; state.phoneBattery = 100; }
      if (mode === "hostel") { housing.hostelStays += 1; state.phoneBattery = 100; }
      if (mode === "friend") housing.friendStays += 1;
      if (mode === "car") housing.carStays += 1;
      if (mode === "bench") {
        housing.benchStays += 1;
        if (state.cash > 0 && Math.random() < 0.12) {
          const loss = Math.min(state.cash, Math.max(2, Math.round(Math.random() * 18)));
          state.cash -= loss;
          addFeed(`Unsichere Nacht: ${euro.format(loss)} Bargeld verloren.`);
        }
      }
    }

    if (fcDay() > housing.storageUntilDay && housing.homeless) {
      const storageDaily = 20;
      if (state.cash + Math.max(0, state.bank) >= storageDaily) {
        fcUsePositiveFunds(storageDaily);
        if (typeof allocateOutgoingPayment === "function") allocateOutgoingPayment(storageDaily, "treasury", 0);
        addFeed("Lagergebühr für große Gegenstände bezahlt: 20 €. Wichtige Dokumente und Questgegenstände bleiben geschützt.");
      } else {
        housing.storageFees = fcMoney(housing.storageFees + storageDaily);
        addFeed(`Lagergebühr offen: ${euro.format(housing.storageFees)}. Dokumente und Questgegenstände bleiben geschützt.`);
      }
    }

    fcUpdateFinancialStage({ daily: true });
    save();
    render();
    return result;
  };

  settleDailyTaxesAfterSleep = function fcSettleDailyTaxesAfterSleep() {
    const amount = typeof dailyTaxCharge === "function" ? Math.max(0, dailyTaxCharge()) : 0;
    if (!amount) return;
    const payable = Math.min(amount, fcBankHeadroom());
    if (payable > 0) {
      state.bank = fcMoney(state.bank - payable);
      state.taxAccount = fcMoney((state.taxAccount || 0) + payable);
    }
    const missing = fcMoney(amount - payable);
    if (missing > 0) state.taxLiability = fcMoney((state.taxLiability || 0) + missing);
    addFeed(`Tagessteuern: ${euro.format(amount)}${missing > 0 ? ` · offen ${euro.format(missing)}` : ""}. Das Konto bleibt mindestens bei -10.000 €.`);
  };

  settleDailyDebtCostsAfterSleep = function fcSettleDailyDebtCostsAfterSleep() {
    fcNormalizeSave(state);
    const financial = state.financialCrisis;
    const day = fcDay();
    const freeze = day <= fcNum(financial.interestFreezeUntilDay);
    const debtInterest = freeze ? 0 : Math.round(Math.max(0, state.debt || 0) * 0.0006);
    const overdraftInterest = freeze || state.bank <= FC_OVERDRAFT_LIMIT ? 0 : Math.round(Math.max(0, -state.bank) * 0.0008);
    const propertyBills = Math.min(180, Math.max(0, (state.properties || []).length * 6));
    const amount = debtInterest + overdraftInterest + propertyBills;
    if (!amount) return;
    const payable = Math.min(amount, fcBankHeadroom());
    if (payable > 0) {
      state.bank = fcMoney(state.bank - payable);
      state.publicTreasury = fcMoney((state.publicTreasury || 0) + payable);
    }
    const missing = fcMoney(amount - payable);
    if (missing > 0 && state.bank > FC_OVERDRAFT_LIMIT) state.debt = fcMoney(state.debt + missing);
    addFeed(`Tageskosten: ${euro.format(amount)}${freeze ? " · Zinsstopp aktiv" : ""}${missing > 0 ? ` · ${euro.format(missing)} konnten nicht mehr belastet werden` : ""}.`);
  };

  function fcSelectedModeMeta() {
    const mode = state.housingCrisis.sleepMode;
    return {
      shelter: { label: "Notunterkunft", cost: fcShelterNightsLeft() > 0 ? "kostenlos" : `${FC_SHELTER_PAID_COST} €`, text: "Dusche, Handy laden und ordentliche Erholung.", available: true },
      hostel: { label: "Billighostel", cost: `${FC_HOSTEL_COST} €`, text: "Sicher, gute Erholung und Handyaufladung.", available: state.cash >= FC_HOSTEL_COST },
      friend: { label: "Freunde / Partner", cost: "kostenlos", text: "Gute Erholung, nur bei ausreichenden Kontakten.", available: fcHasRelationshipHelp() },
      car: { label: "Im Auto", cost: `${FC_CAR_COST} €`, text: "Etwas sicherer als die Straße, aber wenig Erholung.", available: fcHasVehicle() && state.cash >= FC_CAR_COST },
      bench: { label: "Straße / Parkbank", cost: "kostenlos", text: "Immer verfügbar, aber starke Nachteile und kleines Verlustrisiko.", available: true }
    }[mode] || { label: "Notunterkunft", cost: "kostenlos", text: "", available: true };
  }

  function fcSelectSleepMode(mode) {
    const valid = ["shelter", "hostel", "friend", "car", "bench"];
    if (!valid.includes(mode)) return;
    const previous = state.housingCrisis.sleepMode;
    state.housingCrisis.sleepMode = mode;
    const meta = fcSelectedModeMeta();
    if (!meta.available) {
      state.housingCrisis.sleepMode = previous;
      return addFeed(`${meta.label} ist aktuell nicht verfügbar.`);
    }
    state.location = "home";
    state.worldLocation = state.homeCity || state.worldLocation;
    state.homeDashboardActive = true;
    addFeed(`${meta.label} als Schlafplatz ausgewählt.`);
    save();
    render();
    fcOpenCrisisCenter("shelter");
  }

  function fcClaimAid(kind) {
    const data = state.financialCrisis;
    const aid = data.aid;
    const day = fcDay();
    if (kind === "food") {
      if (aid.foodDay === day) return addFeed("Die kostenlose Mahlzeit wurde heute schon abgeholt.");
      aid.foodDay = day;
      state.hunger = typeof clamp === "function" ? clamp(fcNum(state.hunger) + 38) : Math.min(100, fcNum(state.hunger) + 38);
      state.thirst = typeof clamp === "function" ? clamp(fcNum(state.thirst) + 30) : Math.min(100, fcNum(state.thirst) + 30);
      addFeed("Essensausgabe genutzt: Hunger und Durst verbessert.");
    }
    if (kind === "shower") {
      if (aid.showerDay === day) return addFeed("Die öffentliche Dusche wurde heute schon genutzt.");
      aid.showerDay = day;
      state.mood = typeof clamp === "function" ? clamp(fcNum(state.mood) + 4) : Math.min(100, fcNum(state.mood) + 4);
      state.health = typeof clamp === "function" ? clamp(fcNum(state.health) + 2) : Math.min(100, fcNum(state.health) + 2);
      state.phoneBattery = Math.max(fcNum(state.phoneBattery), 75);
      addFeed("Öffentliche Dusche und Ladestation genutzt.");
    }
    if (kind === "grant") {
      if (data.emergencyGrantClaimed) return addFeed("Die einmalige Notfallzahlung wurde bereits genutzt.");
      data.emergencyGrantClaimed = true;
      state.cash = fcMoney(state.cash + 180);
      addFeed("Einmalige Notfallzahlung: 180 € Bargeld erhalten.");
    }
    if (kind === "bus") {
      if (day - fcNum(aid.busTicketDay) < 3) return addFeed("Ein kostenloses Busticket gibt es höchstens alle drei Spieltage.");
      aid.busTicketDay = day;
      if (typeof addInventoryItem === "function") addInventoryItem("Sozialticket", 1);
      else state.items.push("Sozialticket");
      addFeed("Kostenloses Sozialticket erhalten.");
    }
    if (kind === "phone") {
      if (aid.phoneClaimed || (typeof ownedPhoneItem === "function" && ownedPhoneItem())) return addFeed("Du besitzt bereits ein Handy oder hast die Handyhilfe schon genutzt.");
      aid.phoneClaimed = true;
      state.items.push("Basic Phone KL-1");
      state.phoneSim ||= "Sim.KL Basis";
      state.phoneBattery = 100;
      addFeed("Hilfsstelle: Basishandy und einfache SIM erhalten.");
    }
    if (kind === "clothes") {
      if (aid.clothingClaimed) return addFeed("Arbeitskleidung wurde bereits ausgegeben.");
      aid.clothingClaimed = true;
      state.wardrobe ||= [];
      if (!state.wardrobe.includes("Arbeitskleidung Sozialstelle")) state.wardrobe.push("Arbeitskleidung Sozialstelle");
      addFeed("Saubere Arbeitskleidung erhalten.");
    }
    save();
    render();
    fcOpenCrisisCenter("aid");
  }

  function fcCrisisWork(kind) {
    const aid = state.financialCrisis.aid;
    const day = fcDay();
    if (state.energy < 12) return addFeed("Du brauchst mehr Energie für diese Arbeit.");
    if (kind === "daywork") {
      if (aid.dayWorkDay === day) return addFeed("Der Tagelöhnerjob wurde heute schon gemacht.");
      aid.dayWorkDay = day;
      const amount = 140 + Math.floor(Math.random() * 81);
      state.cash = fcMoney(state.cash + amount);
      state.energy = typeof clamp === "function" ? clamp(fcNum(state.energy) - 22) : Math.max(0, fcNum(state.energy) - 22);
      if (typeof recordIncome === "function") recordIncome("salary", amount);
      addFeed(`Tagelöhnerjob abgeschlossen: ${euro.format(amount)} Bargeld.`);
    } else {
      if (aid.bottleDay === day) return addFeed("Pfand wurde heute schon gesammelt.");
      aid.bottleDay = day;
      const amount = 25 + Math.floor(Math.random() * 41);
      state.cash = fcMoney(state.cash + amount);
      state.energy = typeof clamp === "function" ? clamp(fcNum(state.energy) - 10) : Math.max(0, fcNum(state.energy) - 10);
      if (typeof recordIncome === "function") recordIncome("survival", amount);
      addFeed(`Pfand gesammelt: ${euro.format(amount)} Bargeld.`);
    }
    save();
    render();
    fcOpenCrisisCenter("aid");
  }

  function fcStartRepaymentPlan() {
    const financial = state.financialCrisis;
    if (state.bank >= 0) return addFeed("Für eine Dispo-Umschuldung muss das Konto im Minus sein.");
    if (financial.repaymentPlan?.active) return addFeed("Es läuft bereits ein Rückzahlungsplan.");
    const amount = Math.max(0, -state.bank);
    state.bank = 0;
    state.debt = fcMoney(state.debt + amount);
    financial.repaymentPlan = {
      active: true,
      originalAmount: amount,
      remaining: amount,
      installment: Math.max(50, Math.ceil(amount / 20)),
      startedDay: fcDay(),
      lastPaidDay: 0,
      paid: 0
    };
    state.credit = typeof clamp === "function" ? clamp(fcNum(state.credit) - 8) : Math.max(0, fcNum(state.credit) - 8);
    addFeed(`Umschuldung abgeschlossen: ${euro.format(amount)} Dispo wurden in einen festen Ratenplan umgewandelt.`);
    save();
    render();
    fcOpenCrisisCenter("debt");
  }

  function fcPayInstallment() {
    const plan = state.financialCrisis.repaymentPlan;
    if (!plan?.active) return addFeed("Es läuft kein Rückzahlungsplan.");
    const amount = Math.min(plan.remaining, plan.installment);
    if (state.cash + Math.max(0, state.bank) < amount) return addFeed(`Für die Rate brauchst du ${euro.format(amount)} aus Bargeld oder positivem Kontoguthaben.`);
    fcUsePositiveFunds(amount);
    plan.remaining = fcMoney(plan.remaining - amount);
    plan.paid = fcMoney(plan.paid + amount);
    plan.lastPaidDay = fcDay();
    state.debt = Math.max(0, fcMoney(state.debt - amount));
    if (plan.remaining <= 0) {
      plan.active = false;
      state.credit = typeof clamp === "function" ? clamp(fcNum(state.credit) + 8) : Math.min(100, fcNum(state.credit) + 8);
      addFeed("Rückzahlungsplan vollständig abgeschlossen. Bonität verbessert.");
    } else addFeed(`Rate bezahlt: ${euro.format(amount)} · Rest ${euro.format(plan.remaining)}.`);
    save();
    render();
    fcOpenCrisisCenter("debt");
  }

  function fcCounseling() {
    const financial = state.financialCrisis;
    const day = fcDay();
    if (day < financial.counselingAvailableDay) return addFeed(`Schuldnerberatung wieder ab Spieltag ${financial.counselingAvailableDay}.`);
    const totalDebt = Math.max(0, state.debt) + Math.max(0, -state.bank) + Math.max(0, state.housingCrisis.rentArrears) + Math.max(0, state.housingCrisis.storageFees);
    if (!totalDebt) return addFeed("Aktuell gibt es keine Schulden für die Beratung.");
    const relief = Math.min(500, Math.max(50, Math.round(totalDebt * 0.05)));
    let remaining = relief;
    if (state.housingCrisis.rentArrears > 0) {
      const used = Math.min(remaining, state.housingCrisis.rentArrears);
      state.housingCrisis.rentArrears -= used;
      remaining -= used;
    }
    if (remaining > 0 && state.debt > 0) {
      const used = Math.min(remaining, state.debt);
      state.debt -= used;
      remaining -= used;
    }
    if (remaining > 0 && state.bank < 0) state.bank = Math.min(0, fcMoney(state.bank + remaining));
    financial.interestFreezeUntilDay = day + 3;
    financial.counselingAvailableDay = day + 7;
    financial.stats.counselingSavings = fcMoney(financial.stats.counselingSavings + relief);
    addFeed(`Schuldnerberatung: ${euro.format(relief)} Entlastung und drei Tage Zinsstopp.`);
    save();
    render();
    fcOpenCrisisCenter("debt");
  }

  function fcStartInsolvency() {
    const financial = state.financialCrisis;
    const totalDebt = Math.max(0, state.debt) + Math.max(0, -state.bank) + Math.max(0, state.housingCrisis.rentArrears) + Math.max(0, state.housingCrisis.storageFees);
    if (totalDebt < 15000 && financial.limitReachedDays < 5) return addFeed("Privatinsolvenz ist erst ab 15.000 € Gesamtschulden oder nach fünf Tagen an der Minusgrenze verfügbar.");
    if (!confirm("Privatinsolvenz starten? Das Konto wird auf 0 gesetzt, 70% der Schulden entfallen, aber Bonität und Kreditfunktionen bleiben 20 Spieltage stark eingeschränkt.")) return;
    const residual = Math.round(totalDebt * 0.30);
    state.bank = 0;
    state.debt = residual;
    state.housingCrisis.rentArrears = 0;
    state.housingCrisis.storageFees = 0;
    state.housingCrisis.missedRentPayments = 0;
    financial.repaymentPlan = null;
    financial.insolvencyUntilDay = fcDay() + 20;
    financial.interestFreezeUntilDay = fcDay() + 5;
    financial.limitReachedDays = 0;
    state.credit = 5;
    addFeed(`Privatinsolvenz gestartet: Restschuld ${euro.format(residual)} · Kreditfunktionen bis Tag ${financial.insolvencyUntilDay} eingeschränkt.`);
    save();
    render();
    fcOpenCrisisCenter("debt");
  }

  function fcHousingStatusLabel() {
    if (fcHasPermanentHome()) return currentAccessibleHomeProperty()?.name || "Eigene Unterkunft";
    const meta = fcSelectedModeMeta();
    return `Ohne festen Wohnsitz · ${meta.label}`;
  }

  function fcCrisisPanelHtml(activeSection = "overview") {
    fcNormalizeSave(state);
    fcEnsureHomelessState();
    const financial = state.financialCrisis;
    const housing = state.housingCrisis;
    const stage = fcFinancialStage();
    const limit = fcEffectiveOverdraftLimit();
    const used = Math.max(0, -state.bank);
    const limitPercent = Math.min(100, Math.round(used / Math.abs(FC_OVERDRAFT_LIMIT) * 100));
    const plan = financial.repaymentPlan;
    const modeMeta = fcSelectedModeMeta();
    const totalDebt = Math.max(0, state.debt) + Math.max(0, -state.bank) + Math.max(0, housing.rentArrears) + Math.max(0, housing.storageFees);
    const sections = [
      ["overview", "Übersicht"], ["aid", "Soforthilfe"], ["shelter", "Unterkunft"], ["debt", "Schulden"]
    ];

    const overview = `<section class="fc-grid two">
      <article class="fc-card status"><small>FINANZSTATUS</small><h3>${fcStageLabel(stage)}</h3><strong>${euro.format(state.bank)}</strong><p>Konto bis maximal ${euro.format(FC_OVERDRAFT_LIMIT)}. Bargeld kann nie negativ werden.</p><div class="fc-meter danger"><i style="width:${limitPercent}%"></i></div><span>${limitPercent}% des Dispos genutzt</span></article>
      <article class="fc-card housing"><small>WOHNSITUATION</small><h3>${fcHousingStatusLabel()}</h3><strong>${housing.homeless ? `seit Tag ${housing.homelessSinceDay}` : "gesichert"}</strong><p>${housing.homeless ? "Arbeit, Handy und Krisenhilfe bleiben verfügbar. Wähle einen Schlafplatz und arbeite dich zurück." : "Bei vier unbezahlten Miettagen droht die Räumung. Mahnungen erscheinen vorher."}</p></article>
      <article class="fc-card"><small>GESAMTSCHULDEN</small><h3>${euro.format(totalDebt)}</h3><p>Bankminus ${euro.format(Math.max(0, -state.bank))} · Kredite ${euro.format(state.debt)} · Miete ${euro.format(housing.rentArrears)} · Lager ${euro.format(housing.storageFees)}</p></article>
      <article class="fc-card"><small>GESCHÜTZTE EINNAHMEN</small><h3>30% Bargeld</h3><p>Solange das Konto im Minus ist, gehen 70% normaler Einnahmen gegen das Minus. 30% bleiben für Essen, Fahrt und Notfälle als Bargeld.</p></article>
    </section>`;

    const aid = `<section class="fc-grid two">
      <article class="fc-card action"><span>🍲</span><div><h3>Kostenlose Mahlzeit</h3><p>Einmal pro Spieltag. Hunger und Durst steigen.</p></div><button data-fc-aid="food" ${financial.aid.foodDay === fcDay() ? "disabled" : ""}>${financial.aid.foodDay === fcDay() ? "Heute genutzt" : "Abholen"}</button></article>
      <article class="fc-card action"><span>🚿</span><div><h3>Dusche & Ladestation</h3><p>Sauber werden, Stimmung verbessern und Handy laden.</p></div><button data-fc-aid="shower" ${financial.aid.showerDay === fcDay() ? "disabled" : ""}>${financial.aid.showerDay === fcDay() ? "Heute genutzt" : "Nutzen"}</button></article>
      <article class="fc-card action"><span>🧰</span><div><h3>Tagelöhnerjob</h3><p>Ohne Adresse möglich. 140–220 € Bargeld, kostet Energie.</p></div><button data-fc-work="daywork" ${financial.aid.dayWorkDay === fcDay() ? "disabled" : ""}>Arbeiten</button></article>
      <article class="fc-card action"><span>♻</span><div><h3>Pfand sammeln</h3><p>25–65 € Bargeld. Immer ohne Wohnung möglich.</p></div><button data-fc-work="bottles" ${financial.aid.bottleDay === fcDay() ? "disabled" : ""}>Sammeln</button></article>
      <article class="fc-card action"><span>💶</span><div><h3>Einmalige Notfallzahlung</h3><p>180 € Bargeld, damit der Spieler nie vollständig festhängt.</p></div><button data-fc-aid="grant" ${financial.emergencyGrantClaimed ? "disabled" : ""}>${financial.emergencyGrantClaimed ? "Bereits erhalten" : "Beantragen"}</button></article>
      <article class="fc-card action"><span>🚌</span><div><h3>Sozialticket</h3><p>Kostenloses Busticket höchstens alle drei Spieltage.</p></div><button data-fc-aid="bus">Abholen</button></article>
      <article class="fc-card action"><span>📱</span><div><h3>Basishandy & SIM</h3><p>Nur falls kein Handy vorhanden ist. Einmalige Hilfe.</p></div><button data-fc-aid="phone" ${financial.aid.phoneClaimed ? "disabled" : ""}>Ausgeben</button></article>
      <article class="fc-card action"><span>🦺</span><div><h3>Arbeitskleidung</h3><p>Saubere Kleidung für Bewerbungen und einfache Jobs.</p></div><button data-fc-aid="clothes" ${financial.aid.clothingClaimed ? "disabled" : ""}>Ausgeben</button></article>
    </section>`;

    const shelterOptions = [
      ["shelter", "Notunterkunft", fcShelterNightsLeft() > 0 ? `${fcShelterNightsLeft()} kostenlose Nächte` : `${FC_SHELTER_PAID_COST} € pro Nacht`, "Ordentliche Erholung, Dusche und Handyaufladung.", true],
      ["hostel", "Billighostel", `${FC_HOSTEL_COST} € Bargeld`, "Sehr gute Erholung, sicherer Schlaf und Handyaufladung.", state.cash >= FC_HOSTEL_COST],
      ["friend", "Freunde / Partner", "kostenlos", "Gute Erholung. Voraussetzung: Beziehung oder genügend Kontakte.", fcHasRelationshipHelp()],
      ["car", "Im Auto", `${FC_CAR_COST} € Bargeld`, "Mittlere Sicherheit, wenig Erholung. Fahrzeug erforderlich.", fcHasVehicle() && state.cash >= FC_CAR_COST],
      ["bench", "Straße / Parkbank", "kostenlos", "Immer verfügbar, aber schlechte Erholung und kleines Verlustrisiko.", true]
    ];
    const shelter = `<section class="fc-shelter-layout"><article class="fc-card selected-shelter"><small>HEUTE NACHT</small><h3>${modeMeta.label}</h3><strong>${modeMeta.cost}</strong><p>${modeMeta.text}</p><button class="primary" data-fc-sleep-now ${typeof isReady === "function" && !isReady("sleep") ? "disabled" : ""}>${typeof isReady === "function" && !isReady("sleep") ? `Warten ${waitText("sleep")}` : "Jetzt schlafen"}</button></article><div class="fc-grid two">${shelterOptions.map(([id, label, cost, text, available]) => `<article class="fc-card action ${housing.sleepMode === id ? "selected" : ""}"><span>${{ shelter: "⌂", hostel: "H", friend: "♥", car: "🚗", bench: "▰" }[id]}</span><div><h3>${label}</h3><strong>${cost}</strong><p>${text}</p></div><button data-fc-mode="${id}" ${available ? "" : "disabled"}>${housing.sleepMode === id ? "Ausgewählt" : available ? "Auswählen" : "Nicht verfügbar"}</button></article>`).join("")}</div></section>`;

    const debt = `<section class="fc-grid two">
      <article class="fc-card"><small>MIETRÜCKSTAND</small><h3>${euro.format(housing.rentArrears)}</h3><p>${housing.missedRentPayments}/4 Ausfälle · Mahnstufe ${housing.evictionWarning}. Vor einer Räumung erscheinen mehrere Warnungen.</p><button data-fc-pay-rent ${housing.rentArrears <= 0 ? "disabled" : ""}>Rückstand bezahlen</button></article>
      <article class="fc-card"><small>GEGENSTANDSLAGER</small><h3>${euro.format(housing.storageFees)}</h3><p>Nach der Räumung fünf Tage kostenlos, danach 20 € pro Spieltag. Ausweis, Führerschein, Reisepass und Questgegenstände bleiben geschützt.</p><button data-fc-pay-storage ${housing.storageFees <= 0 ? "disabled" : ""}>Lagergebühren bezahlen</button></article>
      <article class="fc-card"><small>DISPO-UMSCHULDUNG</small><h3>${state.bank < 0 ? euro.format(-state.bank) : "Kein Minus"}</h3><p>Wandelt das Bankminus in einen festen Ratenplan um. Das Konto startet danach wieder bei 0 €.</p><button data-fc-plan-start ${state.bank >= 0 || plan?.active ? "disabled" : ""}>Ratenplan starten</button></article>
      <article class="fc-card"><small>RÜCKZAHLUNGSPLAN</small><h3>${plan?.active ? `${euro.format(plan.remaining)} Rest` : "Nicht aktiv"}</h3><p>${plan?.active ? `Rate ${euro.format(plan.installment)} · bezahlt ${euro.format(plan.paid)}` : "Feste Rate statt unkontrolliertem Dispo."}</p><button data-fc-plan-pay ${!plan?.active ? "disabled" : ""}>Rate zahlen</button></article>
      <article class="fc-card"><small>SCHULDNERBERATUNG</small><h3>Zinsstopp & Entlastung</h3><p>Bis zu 500 € Entlastung und drei Spieltage Zinsstopp. Wieder ab Tag ${financial.counselingAvailableDay}.</p><button data-fc-counsel ${fcDay() < financial.counselingAvailableDay ? "disabled" : ""}>Beratung nutzen</button></article>
      <article class="fc-card danger-card"><small>LETZTER AUSWEG</small><h3>Privatinsolvenz</h3><p>Ab 15.000 € Gesamtschulden oder fünf Tagen an der Minusgrenze. 70% Schuldennachlass, aber 20 Tage starke Kreditsperre.</p><button data-fc-insolvency>Prüfen</button></article>
      <article class="fc-card"><small>WOHNUNGSSUCHE</small><h3>Zurück in eine Wohnung</h3><p>Neue Mietwohnung suchen. Die erste Miete darf das Konto nicht unter -10.000 € drücken.</p><button data-fc-rental-market>Mietangebote öffnen</button></article>
    </section>`;

    const content = { overview, aid, shelter, debt }[activeSection] || overview;
    return `<div class="fc-center" data-fc-section="${activeSection}"><nav class="fc-tabs">${sections.map(([id, label]) => `<button class="${activeSection === id ? "active" : ""}" data-fc-section-open="${id}">${label}</button>`).join("")}</nav>${content}<p class="fc-note">Wichtig: Bargeld bleibt immer mindestens 0 €. Das Bankkonto stoppt bei -10.000 €. Der Spieler kann jederzeit über Soforthilfe, Arbeit und Unterkunft weiterspielen.</p></div>`;
  }

  function fcBindDialog() {
    const root = els.dialog.querySelector(".fc-center");
    if (!root) return;
    root.querySelectorAll("[data-fc-section-open]").forEach((button) => button.addEventListener("click", () => fcOpenCrisisCenter(button.dataset.fcSectionOpen)));
    root.querySelectorAll("[data-fc-aid]").forEach((button) => button.addEventListener("click", () => fcClaimAid(button.dataset.fcAid)));
    root.querySelectorAll("[data-fc-work]").forEach((button) => button.addEventListener("click", () => fcCrisisWork(button.dataset.fcWork)));
    root.querySelectorAll("[data-fc-mode]").forEach((button) => button.addEventListener("click", () => fcSelectSleepMode(button.dataset.fcMode)));
    root.querySelector("[data-fc-sleep-now]")?.addEventListener("click", () => {
      if (typeof isReady === "function" && !isReady("sleep")) return addFeed(`Schlafen ist erst in ${waitText("sleep")} wieder möglich.`);
      els.dialog.close();
      sleepAndAdvanceDay();
    });
    root.querySelector("[data-fc-pay-rent]")?.addEventListener("click", fcPayRentArrears);
    root.querySelector("[data-fc-pay-storage]")?.addEventListener("click", fcPayStorageFees);
    root.querySelector("[data-fc-plan-start]")?.addEventListener("click", fcStartRepaymentPlan);
    root.querySelector("[data-fc-plan-pay]")?.addEventListener("click", fcPayInstallment);
    root.querySelector("[data-fc-counsel]")?.addEventListener("click", fcCounseling);
    root.querySelector("[data-fc-insolvency]")?.addEventListener("click", fcStartInsolvency);
    root.querySelector("[data-fc-rental-market]")?.addEventListener("click", () => {
      els.dialog.close();
      if (typeof openTenantRentalMarket === "function") openTenantRentalMarket();
    });
  }

  function fcOpenCrisisCenter(section = "overview") {
    if (!state) return;
    fcNormalizeSave(state);
    fcEnsureHomelessState();
    if (typeof clearDialogDynamic === "function") clearDialogDynamic();
    els.dialog.classList.add("financial-crisis-dialog");
    els.dialogTitle.textContent = "Finanzen & Wohnhilfe";
    els.dialogText.textContent = "Kontolimit, Schuldenabbau, Mietmahnungen, Notunterkunft und Wege zurück in eine Wohnung.";
    const holder = document.createElement("div");
    holder.innerHTML = fcCrisisPanelHtml(section);
    els.dialog.append(...holder.childNodes);
    fcBindDialog();
    if (!els.dialog.open) els.dialog.showModal();
  }

  function fcAppendBankPanel() {
    if (!els.bankActions || els.bankActions.querySelector("[data-fc-bank-panel]")) return;
    const stage = fcFinancialStage();
    const housing = state.housingCrisis;
    const panel = document.createElement("section");
    panel.className = "shop-section fc-bank-panel";
    panel.dataset.fcBankPanel = "1";
    panel.innerHTML = `<h3>Finanzen & Wohnhilfe</h3><p class="muted">Kontolimit ${euro.format(FC_OVERDRAFT_LIMIT)} · Status ${fcStageLabel(stage)} · ${housing.homeless ? "ohne festen Wohnsitz" : "Unterkunft gesichert"}.</p><div class="fc-bank-summary"><span><small>Konto</small><b>${euro.format(state.bank)}</b></span><span><small>Bargeld</small><b>${euro.format(state.cash)}</b></span><span><small>Mietrückstand</small><b>${euro.format(housing.rentArrears)}</b></span></div><button class="primary-button" data-fc-open-center>Finanz- und Wohnhilfe öffnen</button>`;
    els.bankActions.prepend(panel);
    panel.querySelector("[data-fc-open-center]").addEventListener("click", () => fcOpenCrisisCenter());
  }

  renderBank = function fcRenderBank() {
    const result = original.renderBank();
    fcAppendBankPanel();
    return result;
  };

  openPlayerBankDialog = function fcOpenPlayerBankDialog() {
    const result = original.openPlayerBankDialog();
    const button = document.createElement("button");
    button.className = "mini-button gold";
    button.textContent = "Finanz- und Wohnhilfe";
    button.onclick = () => fcOpenCrisisCenter();
    els.dialog.append(button);
    return result;
  };

  renderDailyActions = function fcRenderDailyActions() {
    const result = original.renderDailyActions();
    if (!els.dailyActions || els.dailyActions.querySelector("[data-fc-daily]")) return result;
    const stage = fcFinancialStage();
    const shouldShow = stage > 0 || state.housingCrisis.homeless || state.housingCrisis.rentArrears > 0;
    if (!shouldShow) return result;
    const card = document.createElement("article");
    card.className = "item-card fc-daily-card";
    card.dataset.fcDaily = "1";
    card.innerHTML = `<div><small>KRISENHILFE</small><h3>${state.housingCrisis.homeless ? "Ohne festen Wohnsitz" : fcStageLabel(stage)}</h3><p>${state.housingCrisis.homeless ? "Unterkunft, Essen, Tagelöhnerjob und Schuldnerberatung sind verfügbar." : `Konto ${euro.format(state.bank)} · Mietrückstand ${euro.format(state.housingCrisis.rentArrears)}.`}</p></div><button class="mini-button gold">Öffnen</button>`;
    card.querySelector("button").addEventListener("click", () => fcOpenCrisisCenter());
    els.dailyActions.prepend(card);
    return result;
  };

  updateHomeShortcut = function fcUpdateHomeShortcut() {
    const result = original.updateHomeShortcut();
    const shortcut = document.querySelector("[data-home-shortcut]");
    if (!shortcut || !state?.housingCrisis?.homeless) return result;
    const meta = fcSelectedModeMeta();
    shortcut.disabled = false;
    shortcut.innerHTML = `<span class="home-shortcut-label"><span class="desktop-label">${meta.label}</span><span class="mobile-label">Hilfe</span></span><b>⌂</b>`;
    shortcut.title = "Unterkunft und Krisenhilfe öffnen";
    return result;
  };

  canWorkAtCurrentPlace = function fcCanWorkAtCurrentPlace() {
    if (state?.housingCrisis?.homeless && state.location === "home") return true;
    return original.canWorkAtCurrentPlace();
  };

  canSleepAtCurrentPlace = function fcCanSleepAtCurrentPlace() {
    if (state?.housingCrisis?.homeless && state.location === "home") return true;
    return original.canSleepAtCurrentPlace();
  };

  openHomePropertyDialog = function fcOpenHomePropertyDialog() {
    fcNormalizeSave(state);
    fcEnsureHomelessState();
    if (state.housingCrisis.homeless && !fcHasPermanentHome()) return fcOpenCrisisCenter("shelter");
    return original.openHomePropertyDialog();
  };

  openEmergencyShelterDialog = function fcOpenEmergencyShelterDialog() {
    fcNormalizeSave(state);
    fcEnsureHomelessState("Du nutzt vorübergehend die Wohn- und Krisenhilfe.");
    return fcOpenCrisisCenter("shelter");
  };

  function fcUpdateGlobalBanner() {
    if (!state) return;
    fcNormalizeSave(state);
    fcUpdateFinancialStage();
    fcEnsureHomelessState();
    const dashboard = document.querySelector(".dashboard");
    if (!dashboard) return;
    let banner = dashboard.querySelector("[data-fc-banner]");
    const stage = fcFinancialStage();
    const visible = stage > 0 || state.housingCrisis.homeless || state.housingCrisis.rentArrears > 0;
    if (!visible) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("button");
      banner.type = "button";
      banner.className = "fc-global-banner";
      banner.dataset.fcBanner = "1";
      banner.addEventListener("click", () => fcOpenCrisisCenter());
      const statusPanel = dashboard.querySelector(".status-panel");
      statusPanel?.insertAdjacentElement("afterend", banner);
    }
    const title = state.housingCrisis.homeless ? "Ohne festen Wohnsitz" : fcStageLabel(stage);
    const text = state.housingCrisis.homeless
      ? `${fcSelectedModeMeta().label} · Krisenhilfe, Essen und Arbeit verfügbar`
      : `Konto ${euro.format(state.bank)} · Grenze ${euro.format(FC_OVERDRAFT_LIMIT)}${state.housingCrisis.rentArrears ? ` · Miete offen ${euro.format(state.housingCrisis.rentArrears)}` : ""}`;
    banner.innerHTML = `<span>${state.housingCrisis.homeless ? "⌂" : "€"}</span><div><b>${title}</b><small>${text}</small></div><i>Hilfe öffnen ›</i>`;
    document.body.classList.toggle("fc-homeless", state.housingCrisis.homeless);
    document.body.classList.toggle("fc-bank-negative", state.bank < 0);
  }

  render = function fcRender() {
    if (state) fcNormalizeSave(state);
    const result = original.render();
    fcUpdateGlobalBanner();
    return result;
  };

  document.addEventListener("click", (event) => {
    const home = event.target.closest?.("[data-home-shortcut]");
    if (home && state?.housingCrisis?.homeless) {
      event.preventDefault();
      event.stopImmediatePropagation();
      fcOpenCrisisCenter("shelter");
    }
  }, true);

  fcNormalizeAll();
  if (state) {
    fcUpdateFinancialStage();
    fcEnsureHomelessState();
    original.save();
    setTimeout(() => {
      try { render(); } catch (error) { console.warn("Finanz- und Wohnsystem konnte die Ansicht nicht sofort aktualisieren", error); }
    }, 0);
  }
})();
