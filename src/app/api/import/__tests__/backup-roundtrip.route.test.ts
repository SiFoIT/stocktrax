// Export (GET /api/export) and restore (POST /api/import) end to end.
import { beforeEach, describe, expect, it } from "vitest";
import {
  apiRequest,
  db,
  readJson,
  resetDatabase,
  schema,
  seedHolding,
  seedPortfolio,
  seedSummaryCache,
  seedWatchlist,
  seedWatchlistItem,
  summaryCached,
} from "@/test/route-helpers";
import { GET as exportGET } from "@/app/api/export/route";
import { POST as importPOST } from "../route";

const day = (d: string) => new Date(`${d}T12:00:00Z`);

function setSettingRow(key: string, value: unknown) {
  db.insert(schema.settings).values({ key, value: JSON.stringify(value) }).run();
}

/** A portfolio with everything a backup carries. Returns the ids it made. */
function seedEverything() {
  const portfolio = seedPortfolio({ name: "RRSP", currency: "CAD" });
  // Holding figures match the ledger, since a restore recomputes them.
  const aapl = seedHolding(portfolio.id, { symbol: "AAPL", shares: 6, avgCost: 100, currency: "USD" });
  const td = seedHolding(portfolio.id, { symbol: "TD.TO", shares: 20, avgCost: 80, currency: "CAD" });
  db.insert(schema.transactions)
    .values([
      { holdingId: aapl.id, type: "buy", shares: 10, price: 100, date: day("2026-01-05") },
      { holdingId: aapl.id, type: "sell", shares: 4, price: 120, date: day("2026-02-05") },
      { holdingId: aapl.id, type: "dividend", shares: 6, price: 0.25, date: day("2026-02-10") },
      { holdingId: td.id, type: "transfer_in", shares: 20, price: 80, date: day("2026-01-02") },
    ])
    .run();
  db.insert(schema.cashTransactions)
    .values([
      { portfolioId: portfolio.id, type: "contribution", description: "RRSP contribution", amount: 5000, currency: "CAD", date: day("2026-01-02") },
      { portfolioId: portfolio.id, type: "fx_conversion", description: "CAD to USD", amount: -1400, currency: "CAD", date: day("2026-01-04") },
    ])
    .run();
  db.insert(schema.portfolioSnapshots)
    .values({ portfolioId: portfolio.id, date: "2026-02-10", marketValue: 2400, costBasis: 2200, dayChange: 12, currency: "CAD" })
    .run();

  const watchlist = seedWatchlist("Tech");
  const nvda = seedWatchlistItem(watchlist.id, "NVDA");
  seedWatchlistItem(watchlist.id, "MSFT");

  const holdingRule = db
    .insert(schema.alertRules)
    .values({
      scope: "holding",
      holdingId: aapl.id,
      symbol: "AAPL",
      metric: "holding_gain_percent",
      operator: "gte",
      threshold: 25,
      resetStrategy: "recovery",
      needsRecovery: true,
      lastTriggeredAt: day("2026-02-01"),
    })
    .returning()
    .get();
  const watchRule = db
    .insert(schema.alertRules)
    .values({
      scope: "watchlist",
      watchlistItemId: nvda.id,
      symbol: "NVDA",
      metric: "price_vs_anchor",
      operator: "lte",
      threshold: -10,
      resetStrategy: "baseline",
      anchorValue: 140,
      baselineValue: 150,
      cooldownMinutes: 30,
    })
    .returning()
    .get();
  db.insert(schema.alerts)
    .values({
      ruleId: holdingRule.id,
      scope: "holding",
      symbol: "AAPL",
      message: "AAPL gain at 26%",
      metricValue: 26,
      price: 126,
      changePercent: 1.2,
      resetStrategy: "recovery",
      operator: "gte",
      threshold: 25,
      triggeredAt: day("2026-02-01"),
    })
    .run();

  db.insert(schema.screens)
    .values({
      name: "Cheap dividend payers",
      source: "watchlists",
      rules: JSON.stringify([{ metric: "dividendYield", operator: "gte", value: 3 }]),
      match: "all",
      lastRunAt: day("2026-02-01"),
      lastMatchCount: 4,
      lastTotalScanned: 40,
    })
    .run();
  db.insert(schema.screenPresets)
    .values({ name: "Value", rules: JSON.stringify([{ metric: "peRatio", operator: "lte", value: 15 }]), match: "any" })
    .run();

  setSettingRow("smtp.host", "smtp.example.test");
  setSettingRow("smtp.pass", "do-not-export");
  setSettingRow("digest.lastSent.daily", "2026-02-10");
  setSettingRow(`import.coveredThrough.${portfolio.id}`, "2026-02-28");

  return { portfolio, aapl, td, watchlist, nvda, holdingRule, watchRule };
}

/** Every user-data table, ordered by id, for before/after comparison. */
function dumpUserData() {
  return {
    portfolios: db.select().from(schema.portfolios).orderBy(schema.portfolios.id).all(),
    holdings: db.select().from(schema.holdings).orderBy(schema.holdings.id).all(),
    transactions: db.select().from(schema.transactions).orderBy(schema.transactions.id).all(),
    cashTransactions: db.select().from(schema.cashTransactions).orderBy(schema.cashTransactions.id).all(),
    portfolioSnapshots: db.select().from(schema.portfolioSnapshots).orderBy(schema.portfolioSnapshots.id).all(),
    watchlists: db.select().from(schema.watchlists).orderBy(schema.watchlists.id).all(),
    watchlistItems: db.select().from(schema.watchlistItems).orderBy(schema.watchlistItems.id).all(),
    alertRules: db.select().from(schema.alertRules).orderBy(schema.alertRules.id).all(),
    alerts: db.select().from(schema.alerts).orderBy(schema.alerts.id).all(),
    screens: db.select().from(schema.screens).orderBy(schema.screens.id).all(),
    screenPresets: db.select().from(schema.screenPresets).orderBy(schema.screenPresets.id).all(),
  };
}

function settingKeys() {
  return db.select().from(schema.settings).all().map((s) => s.key).sort();
}

async function exportBackup() {
  const res = await exportGET(apiRequest("GET", "/api/export"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toMatch(/stocktrax-backup-\d{4}-\d{2}-\d{2}\.json/);
  const text = await res.text();
  return { text, backup: JSON.parse(text) };
}

function restore(backup: unknown) {
  return importPOST(apiRequest("POST", "/api/import", backup));
}

beforeEach(() => {
  resetDatabase();
});

describe("GET /api/export", () => {
  it("exports every user table at version 1.1 without the SMTP password or run state", async () => {
    const ids = seedEverything();
    const { text, backup } = await exportBackup();

    expect(backup.version).toBe("1.1");
    expect(backup.data.alertRules.map((r: { id: number }) => r.id)).toEqual([ids.holdingRule.id, ids.watchRule.id]);
    expect(backup.data.alerts).toHaveLength(1);
    expect(backup.data.screens).toHaveLength(1);
    expect(backup.data.screenPresets).toHaveLength(1);

    const keys = backup.serverSettings.map((s: { key: string }) => s.key);
    expect(keys).toContain("smtp.host");
    expect(keys).not.toContain("smtp.pass");
    expect(keys).not.toContain("digest.lastSent.daily");
    expect(text).not.toContain("do-not-export");
  });
});

describe("POST /api/import (restore)", () => {
  it("round-trips everything with the same ids after the data is wiped", async () => {
    seedEverything();
    const before = dumpUserData();
    const { backup } = await exportBackup();

    // Wipe the user data but keep the server settings, as a fresh restore target would.
    db.delete(schema.alerts).run();
    db.delete(schema.alertRules).run();
    db.delete(schema.portfolios).run();
    db.delete(schema.watchlists).run();
    db.delete(schema.screens).run();
    db.delete(schema.screenPresets).run();
    expect(dumpUserData().alertRules).toHaveLength(0);

    seedSummaryCache();
    const res = await restore(backup);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toMatchObject({
      success: true,
      alertRulesDropped: 0,
      imported: { portfolios: 1, holdings: 2, transactions: 4, alertRules: 2, screens: 1, screenPresets: 1 },
    });

    expect(dumpUserData()).toEqual(before);
    expect(summaryCached()).toBe(false);
  });

  it("replaces altered and added rows with the backup's", async () => {
    const ids = seedEverything();
    const before = dumpUserData();
    const { backup } = await exportBackup();

    // Edits made after the backup, all of which the restore must undo.
    db.update(schema.portfolios).set({ name: "Renamed" }).run();
    db.delete(schema.transactions).run();
    db.update(schema.alertRules).set({ threshold: 99, baselineValue: null }).run();
    db.insert(schema.screens).values({ name: "Added later" }).run();
    seedPortfolio({ name: "Added later" });
    db.delete(schema.watchlistItems).run(); // cascades away the watchlist rule

    expect((await restore(backup)).status).toBe(200);
    const after = dumpUserData();
    expect(after).toEqual(before);
    expect(after.alertRules.find((r) => r.id === ids.watchRule.id)).toMatchObject({
      baselineValue: 150,
      anchorValue: 140,
      cooldownMinutes: 30,
    });
  });

  it("keeps the SMTP password and settings the backup does not carry", async () => {
    const ids = seedEverything();
    const { backup } = await exportBackup();
    setSettingRow("smtp.user", "added-after-backup");

    await restore(backup);

    const keys = settingKeys();
    expect(keys).toEqual(
      expect.arrayContaining(["smtp.host", "smtp.pass", "smtp.user", `import.coveredThrough.${ids.portfolio.id}`])
    );
  });

  it("restores a 1.0 backup and keeps the existing alert rules, history and screens", async () => {
    const ids = seedEverything();
    const { backup } = await exportBackup();
    const before = dumpUserData();

    // A backup taken before 1.1: none of the alert or screener tables.
    const old = structuredClone(backup);
    old.version = "1.0";
    delete old.data.alertRules;
    delete old.data.alerts;
    delete old.data.screens;
    delete old.data.screenPresets;

    const res = await restore(old);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.imported).toMatchObject({ alertRules: null, screens: null, screenPresets: null });

    const after = dumpUserData();
    // Deleting holdings and watchlist items cascades to their rules; the
    // route must put them back.
    expect(after.alertRules).toEqual(before.alertRules);
    expect(after.alerts).toEqual(before.alerts);
    expect(after.screens).toEqual(before.screens);
    expect(after.screenPresets).toEqual(before.screenPresets);
    expect(after.alertRules.map((r) => r.id)).toEqual([ids.holdingRule.id, ids.watchRule.id]);
  });

  it("drops a rule whose holding is not in the backup instead of failing", async () => {
    seedEverything();
    const { backup } = await exportBackup();
    const old = structuredClone(backup);
    old.version = "1.0";
    delete old.data.alertRules;
    delete old.data.alerts;
    // The backup's AAPL holding is gone, so the AAPL rule has nothing to attach to.
    const aapl = old.data.holdings.find((h: { symbol: string }) => h.symbol === "AAPL");
    old.data.holdings = old.data.holdings.filter((h: { id: number }) => h.id !== aapl.id);
    old.data.transactions = old.data.transactions.filter((t: { holdingId: number }) => t.holdingId !== aapl.id);

    const body = await readJson(await restore(old));
    expect(body.alertRulesDropped).toBe(1);
    expect(dumpUserData().alertRules.map((r) => r.symbol)).toEqual(["NVDA"]);
    expect(dumpUserData().alerts).toHaveLength(0);
  });

  it("rejects an invalid backup and an incompatible major version without touching data", async () => {
    seedEverything();
    const before = dumpUserData();
    const { backup } = await exportBackup();

    const invalid = await restore({ version: "1.1", data: {} });
    expect(invalid.status).toBe(400);
    expect((await readJson(invalid)).error).toBe("Invalid backup format");

    const future = await restore({ ...backup, version: "2.0" });
    expect(future.status).toBe(400);

    expect(dumpUserData()).toEqual(before);
  });

  it("rolls back the whole restore when an insert fails", async () => {
    seedEverything();
    const before = dumpUserData();
    const { backup } = await exportBackup();
    const broken = structuredClone(backup);
    // A transaction pointing at a holding that does not exist violates the FK.
    broken.data.transactions.push({ ...broken.data.transactions[0], id: 999, holdingId: 12345 });

    const res = await restore(broken);
    expect(res.status).toBe(500);
    expect(dumpUserData()).toEqual(before);
  });
});
