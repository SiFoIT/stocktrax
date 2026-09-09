import { describe, it, expect } from "vitest";
import {
  DEFAULT_SECTIONS,
  HEADLINE_SYMBOLS,
  MarketSections,
  marketSectionsSchema,
  resolveSections,
  sectionSymbols,
} from "../symbols";
import { CATALOG, CURRENCY_NAMES, HEADLINE_ENTRIES, SECTION_CAP, pairEntry } from "../catalog";

function sections(overrides: Partial<MarketSections>): MarketSections {
  return { ...DEFAULT_SECTIONS, ...overrides };
}

describe("marketSectionsSchema", () => {
  it("accepts the defaults", () => {
    expect(marketSectionsSchema.safeParse(DEFAULT_SECTIONS).success).toBe(true);
  });

  it("rejects a ninth item in a section", () => {
    const nine = CATALOG.markets.slice(0, SECTION_CAP + 1).map((e) => e.symbol);
    expect(nine).toHaveLength(9);
    expect(marketSectionsSchema.safeParse(sections({ markets: nine })).success).toBe(false);
  });

  it("accepts exactly eight", () => {
    const eight = CATALOG.markets.slice(0, SECTION_CAP).map((e) => e.symbol);
    expect(marketSectionsSchema.safeParse(sections({ markets: eight })).success).toBe(true);
  });

  it("rejects an unknown symbol", () => {
    expect(marketSectionsSchema.safeParse(sections({ markets: ["NOPE"] })).success).toBe(false);
  });

  it("rejects a headline index, which is a card and not a row", () => {
    expect(marketSectionsSchema.safeParse(sections({ markets: ["^GSPC"] })).success).toBe(false);
  });

  it("rejects a symbol from the wrong section", () => {
    expect(marketSectionsSchema.safeParse(sections({ crypto: ["GC=F"] })).success).toBe(false);
  });

  it("rejects a pair that is not in the catalog", () => {
    const parsed = marketSectionsSchema.safeParse(
      sections({ currency: [{ base: "ZAR", quote: "TRY" }] })
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts a catalog pair in either orientation", () => {
    for (const currency of [[{ base: "USD", quote: "CAD" }], [{ base: "CAD", quote: "USD" }]]) {
      expect(marketSectionsSchema.safeParse(sections({ currency })).success).toBe(true);
    }
  });

  it("rejects the same pair in both orientations", () => {
    const parsed = marketSectionsSchema.safeParse(
      sections({
        currency: [
          { base: "USD", quote: "CAD" },
          { base: "CAD", quote: "USD" },
        ],
      })
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a duplicate symbol", () => {
    expect(marketSectionsSchema.safeParse(sections({ crypto: ["BTC-USD", "BTC-USD"] })).success).toBe(
      false
    );
  });

  it("accepts the dollar index, which is a currency row but not a pair", () => {
    const parsed = marketSectionsSchema.safeParse(sections({ currency: [{ symbol: "DX-Y.NYB" }] }));
    expect(parsed.success).toBe(true);
  });

  it("accepts empty sections", () => {
    const empty: MarketSections = { markets: [], commodities: [], currency: [], crypto: [] };
    expect(marketSectionsSchema.safeParse(empty).success).toBe(true);
  });
});

describe("resolveSections", () => {
  it("puts the four headline indices first in markets", () => {
    const resolved = resolveSections(DEFAULT_SECTIONS);
    expect(resolved.markets.slice(0, 4).map((s) => s.symbol)).toEqual([...HEADLINE_SYMBOLS]);
  });

  it("keeps the futures contracts on the headline indices", () => {
    const resolved = resolveSections(DEFAULT_SECTIONS);
    const sp500 = resolved.markets.find((s) => s.symbol === "^GSPC");
    expect(sp500?.futures).toEqual({ symbol: "ES=F", label: "Futures" });
  });

  it("matches the shipped rows, with AUD/USD in place of CAD/USD", () => {
    const symbols = sectionSymbols(DEFAULT_SECTIONS);
    expect(symbols).toContain("AUDUSD=X");
    expect(symbols).not.toContain("CADUSD=X");
    // The old CAD=X was Yahoo's alias for the same quote as USDCAD=X.
    expect(symbols).toContain("USDCAD=X");
    for (const legacy of ["^VIX", "^FTSE", "^GDAXI", "^FCHI", "^N225", "^HSI", "000001.SS", "GC=F", "SI=F", "CL=F", "EURCAD=X", "EURUSD=X", "GBPUSD=X", "USDJPY=X", "BTC-USD", "ETH-USD", "SOL-USD"]) {
      expect(symbols).toContain(legacy);
    }
  });

  it("carries short and description onto every resolved row", () => {
    const resolved = resolveSections(DEFAULT_SECTIONS);
    for (const category of ["markets", "commodities", "currency", "crypto"] as const) {
      for (const entry of resolved[category]) {
        expect(entry.short, entry.symbol).toBeTruthy();
        expect(entry.description, entry.symbol).toBeTruthy();
      }
    }
  });

  it("renders a flipped pair under its flipped code and prose", () => {
    const resolved = resolveSections(sections({ currency: [{ base: "CAD", quote: "USD" }] }));
    expect(resolved.currency[0]).toMatchObject({
      symbol: "CADUSD=X",
      name: "CAD/USD",
      short: "USD per CAD",
      description: "US dollars per Canadian dollar",
    });
  });
});

describe("pairEntry", () => {
  it("derives code, name and prose from the orientation", () => {
    expect(pairEntry("USD", "CAD")).toMatchObject({
      symbol: "USDCAD=X",
      name: "USD/CAD",
      short: "CAD per USD",
      description: "Canadian dollars per US dollar",
    });
  });

  it("reverses the sentence when the pair is flipped", () => {
    expect(pairEntry("CAD", "USD")).toMatchObject({
      symbol: "CADUSD=X",
      name: "CAD/USD",
      description: "US dollars per Canadian dollar",
    });
  });

  it("leaves invariant plurals alone", () => {
    expect(pairEntry("USD", "JPY").description).toBe("Japanese yen per US dollar");
    expect(pairEntry("USD", "CNY").description).toBe("Chinese yuan per US dollar");
  });
});

describe("catalog", () => {
  const allEntries = [
    ...CATALOG.markets,
    ...CATALOG.commodities,
    ...CATALOG.crypto,
    ...CATALOG.currencyFixed,
    ...HEADLINE_ENTRIES,
  ];

  it("has no duplicate symbols", () => {
    const symbols = allEntries.map((e) => e.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("gives every entry a short label and a description", () => {
    for (const entry of allEntries) {
      expect(entry.short, entry.symbol).not.toBe("");
      expect(entry.description, entry.symbol).not.toBe("");
    }
  });

  it("keeps short labels inside the sub-line's width", () => {
    for (const entry of allEntries) {
      expect(entry.short.length, `${entry.symbol}: ${entry.short}`).toBeLessThanOrEqual(24);
    }
    for (const pair of CATALOG.currency) {
      for (const entry of [pairEntry(pair.base, pair.quote), pairEntry(pair.quote, pair.base)]) {
        expect(entry.short.length, entry.symbol).toBeLessThanOrEqual(24);
      }
    }
  });

  it("names both currencies of every catalog pair", () => {
    for (const pair of CATALOG.currency) {
      expect(CURRENCY_NAMES[pair.base], pair.base).toBeDefined();
      expect(CURRENCY_NAMES[pair.quote], pair.quote).toBeDefined();
    }
  });

  it("keeps the Canadian dollar the best-served group", () => {
    const canadian = CATALOG.currency.filter((p) => p.group === "Canadian dollar");
    expect(canadian.length).toBeGreaterThanOrEqual(12);
    // Every one of them is a CAD pair, whichever way it is written.
    for (const pair of canadian) {
      expect([pair.base, pair.quote], `${pair.base}/${pair.quote}`).toContain("CAD");
    }
  });

  it("names every currency in both directions, including irregular plurals", () => {
    expect(pairEntry("NOK", "CAD").description).toBe("Canadian dollars per Norwegian krone");
    expect(pairEntry("CAD", "NOK").description).toBe("Norwegian kroner per Canadian dollar");
    expect(pairEntry("CAD", "KRW").description).toBe("South Korean won per Canadian dollar");
    expect(pairEntry("CAD", "INR").description).toBe("Indian rupees per Canadian dollar");
  });

  it("lists no pair twice, in either direction", () => {
    const keys = CATALOG.currency.map((p) => [p.base, p.quote].sort().join(""));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("offers more than a section can hold, so the cap can bind", () => {
    expect(CATALOG.markets.length).toBeGreaterThan(SECTION_CAP);
    expect(CATALOG.commodities.length).toBeGreaterThan(SECTION_CAP);
    expect(CATALOG.currency.length).toBeGreaterThan(SECTION_CAP);
    expect(CATALOG.crypto.length).toBeGreaterThan(SECTION_CAP);
  });
});
