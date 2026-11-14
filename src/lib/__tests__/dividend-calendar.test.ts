import { describe, it, expect } from "vitest";
import {
  addOneYear,
  buildDividendCalendar,
  projectPosition,
  shiftMonth,
  type PositionInput,
} from "@/lib/dividend-calendar";

const TODAY = "2026-11-14";

function addDaysForTest(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monthly ex-dates on the given day of month, for the 12 months ending at `last`. */
function monthly(lastMonth: string, day: number, amount: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    day: `${shiftMonth(lastMonth, -i)}-${String(day).padStart(2, "0")}`,
    amount,
  })).reverse();
}

function calendar(positions: PositionInput[], received: Parameters<typeof buildDividendCalendar>[0]["received"] = [], usdCadRate = 1.4) {
  return buildDividendCalendar({ today: TODAY, usdCadRate, received, positions });
}

describe("date helpers", () => {
  it("shifts months across years", () => {
    expect(shiftMonth("2026-11", -12)).toBe("2025-11");
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
  });
  it("clamps Feb 29", () => {
    expect(addOneYear("2028-02-29")).toBe("2029-02-28");
  });
});

describe("window", () => {
  it("has 24 months: 12 past, current + 11 upcoming", () => {
    const cal = calendar([]);
    expect(cal.months).toHaveLength(24);
    expect(cal.months[0].month).toBe("2025-11");
    expect(cal.months[23].month).toBe("2027-10");
    expect(cal.months.filter((m) => m.upcoming)[0].month).toBe("2026-11");
    expect(cal.months.filter((m) => m.upcoming)).toHaveLength(12);
  });
});

describe("projection", () => {
  it("projects a monthly payer one year forward", () => {
    // Ex-dates on the 25th, Nov 2025 .. Oct 2026; each recurs a year later.
    // With no known ex→pay lag, pay dates are estimated at ex + 21 days, so
    // October's (pending) payment lands in November and each projection in the
    // month after its ex-date: still one payment a month.
    const history = monthly("2026-10", 25, 0.1);
    const cal = calendar([{ symbol: "MO.TO", shares: 100, currency: "CAD", history }]);
    const upcoming = cal.months.filter((m) => m.upcoming);
    expect(upcoming.map((m) => m.expected)).toEqual(Array(12).fill(10));
    expect(cal.totals.next12Expected).toBe(120);
    expect(upcoming[0].payments[0]).toMatchObject({ exDate: "2026-10-25", status: "pending" });
    expect(upcoming[1].payments[0]).toMatchObject({
      symbol: "MO.TO",
      exDate: "2026-11-25",
      payDate: "2026-12-16",
      payDateEstimated: true,
      status: "projected",
      monthBasis: "pay",
      perShare: 0.1,
      shares: 100,
    });
  });

  it("projects a quarterly payer into its four months at its current rate", () => {
    const history = [
      { day: "2025-12-01", amount: 1 },
      { day: "2026-03-01", amount: 1 },
      { day: "2026-06-01", amount: 1.05 },
      { day: "2026-09-01", amount: 1.05 },
    ];
    const cal = calendar([{ symbol: "Q.TO", shares: 10, currency: "CAD", quoteType: "EQUITY", history }]);
    const byMonth = Object.fromEntries(cal.months.map((m) => [m.month, m.expected]));
    // Raised to 1.05 in June: every future quarter projects at 1.05.
    expect(byMonth["2026-12"]).toBe(10.5);
    expect(byMonth["2027-03"]).toBe(10.5);
    expect(byMonth["2027-06"]).toBe(10.5);
    expect(byMonth["2027-09"]).toBe(10.5);
    expect(cal.totals.next12Expected).toBe(42);
  });

  it("carries a dividend cut forward instead of last year's amount", () => {
    // T.TO-style: 0.418 a quarter, cut to 0.188 in September.
    const history = [
      { day: "2025-12-10", amount: 0.418 },
      { day: "2026-03-10", amount: 0.418 },
      { day: "2026-06-10", amount: 0.418 },
      { day: "2026-09-10", amount: 0.188 },
    ];
    const cal = calendar([{ symbol: "T.TO", shares: 100, currency: "CAD", quoteType: "EQUITY", history }]);
    expect(cal.totals.next12Expected).toBeCloseTo(4 * 18.8, 2);
  });

  it("does not take a one-off special dividend as the new rate", () => {
    const history = [
      { day: "2025-12-10", amount: 1 },
      { day: "2026-03-10", amount: 1 },
      { day: "2026-06-10", amount: 1 },
      { day: "2026-09-10", amount: 5 },
    ];
    const cal = calendar([{ symbol: "S.TO", shares: 10, currency: "CAD", quoteType: "EQUITY", history }]);
    expect(cal.totals.next12Expected).toBe(40);
  });

  it("uses the announced payment instead of its projected twin, with pay-date month basis", () => {
    const history = [
      { day: "2025-11-27", amount: 1 },
      { day: "2026-02-26", amount: 1 },
      { day: "2026-05-28", amount: 1 },
      { day: "2026-08-27", amount: 1.1 },
    ];
    const p: PositionInput = {
      symbol: "RY.TO",
      shares: 10,
      currency: "CAD",
      quoteType: "EQUITY",
      history,
      exDividendDate: "2026-11-26",
      dividendDate: "2026-12-24",
    };
    const pays = projectPosition(p, TODAY, "2027-10-31", 1.4);
    const announced = pays.filter((x) => x.status === "announced");
    expect(announced).toHaveLength(1);
    // At the latest rate (Aug's 1.1), not last November's 1.0.
    expect(announced[0]).toMatchObject({ exDate: "2026-11-26", payDate: "2026-12-24", monthBasis: "pay", perShare: 1.1 });
    expect(announced[0].payDateEstimated).toBeUndefined();
    // No projection left near Nov 26 2026.
    expect(pays.some((x) => x.status === "projected" && x.exDate === "2026-11-27")).toBe(false);
    // Projections borrow the 28-day ex→pay lag.
    const feb = pays.find((x) => x.exDate === "2027-02-26")!;
    expect(feb).toMatchObject({ payDate: "2027-03-26", payDateEstimated: true, monthBasis: "pay" });
    // Total: announced + 3 projections, no double count.
    expect(pays).toHaveLength(4);

    const cal = calendar([p]);
    const byMonth = Object.fromEntries(cal.months.map((m) => [m.month, m.expected]));
    expect(byMonth["2026-11"]).toBe(0);
    expect(byMonth["2026-12"]).toBe(11);
  });

  it("counts a payment whose ex-date passed but pay date is still ahead", () => {
    const p: PositionInput = {
      symbol: "BNS.TO",
      shares: 10,
      currency: "CAD",
      history: [
        { day: "2025-10-07", amount: 1 },
        { day: "2026-01-06", amount: 1 },
        { day: "2026-04-07", amount: 1 },
        { day: "2026-07-07", amount: 1 },
        { day: "2026-10-06", amount: 1.1 },
      ],
      exDividendDate: "2026-10-06",
      dividendDate: "2026-11-26",
    };
    const pays = projectPosition(p, TODAY, "2027-10-31", 1);
    const ann = pays.find((x) => x.status === "announced")!;
    // Amount is the actual event's, not last year's.
    expect(ann).toMatchObject({ exDate: "2026-10-06", payDate: "2026-11-26", perShare: 1.1, amountCad: 11 });
    // Last year's Oct 7 projection (-> Oct 7 2026, pay Nov 27) was the twin and is gone.
    expect(pays.filter((x) => x.payDate?.startsWith("2026-11"))).toHaveLength(1);
  });

  it("ignores a stale announcement that is already behind us", () => {
    const p: PositionInput = {
      symbol: "X.TO",
      shares: 1,
      currency: "CAD",
      history: [{ day: "2026-01-10", amount: 2 }],
      exDividendDate: "2026-01-10",
      dividendDate: "2026-01-30",
    };
    const pays = projectPosition(p, TODAY, "2027-10-31", 1);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ status: "projected", exDate: "2027-01-10", payDate: "2027-01-30" });
  });

  it("converts USD payers to CAD", () => {
    const cal = calendar(
      [{ symbol: "HISU-U.TO", shares: 10, currency: "USD", history: [{ day: "2026-01-05", amount: 0.5 }] }],
      [{ symbol: "HISU-U.TO", day: "2026-01-08", shares: 1, price: 5, currency: "USD" }],
      1.4
    );
    const byMonth = Object.fromEntries(cal.months.map((m) => [m.month, m]));
    expect(byMonth["2027-01"].expected).toBe(7);
    expect(byMonth["2026-01"].received).toBe(7);
    expect(byMonth["2027-01"].payments[0]).toMatchObject({ currency: "USD", perShare: 0.5, amountCad: 7 });
  });
});

describe("fund vs stock amounts", () => {
  // XEQT.TO's real quarterly distributions: seasonal, not a fixed rate.
  const xeqt = [
    { day: "2025-12-30", amount: 0.205 },
    { day: "2026-03-26", amount: 0.091 },
    { day: "2026-06-25", amount: 0.322 },
    { day: "2026-09-24", amount: 0.102 },
  ];

  it("projects each ETF distribution at its own amount", () => {
    const cal = calendar([{ symbol: "XEQT.TO", shares: 1000, currency: "CAD", quoteType: "ETF", history: xeqt }]);
    const byMonth = Object.fromEntries(cal.months.map((m) => [m.month, m.expected]));
    // ex + 21 days estimated pay dates.
    expect(byMonth["2027-01"]).toBe(205);
    expect(byMonth["2027-04"]).toBe(91);
    expect(byMonth["2027-07"]).toBe(322);
    expect(byMonth["2027-10"]).toBe(102);
    expect(cal.totals.next12Expected).toBe(720);
  });

  it("treats an unknown quote type like a fund", () => {
    const cal = calendar([{ symbol: "XEQT.TO", shares: 1000, currency: "CAD", history: xeqt }]);
    expect(cal.totals.next12Expected).toBe(720);
  });

  it("projects the same history at the latest rate for a stock", () => {
    const cal = calendar([{ symbol: "S.TO", shares: 1000, currency: "CAD", quoteType: "EQUITY", history: xeqt }]);
    // Latest 0.102 is not over 2× the median (0.1535), so it is the rate.
    expect(cal.totals.next12Expected).toBe(408);
  });
});

describe("collapsing extras", () => {
  it("folds a year-end extra into the regular payment (HISU-U.TO)", () => {
    const history = monthly("2026-10", 28, 0.3).map((e) => (e.day === "2025-12-28" ? { day: "2025-12-30", amount: 0.336 } : e));
    history.push({ day: "2025-12-31", amount: 0.019 });
    const p: PositionInput = { symbol: "HISU-U.TO", shares: 100, currency: "USD", quoteType: "ETF", history };
    const pays = projectPosition(p, TODAY, "2027-10-31", 1);
    // October's pending payment + 11 projections: 12, not 13.
    expect(pays).toHaveLength(12);
    expect(pays.filter((x) => x.status === "pending")).toHaveLength(1);
    const dec = pays.find((x) => x.exDate === "2026-12-30")!;
    expect(dec.perShare).toBeCloseTo(0.355, 6);
    expect(pays.some((x) => x.perShare === 0.019)).toBe(false);
  });

  it("uses collapsed payments for a stock's current rate", () => {
    // A regular 1.0 plus a 0.05 top-up three days later is a 1.05 payment, not a cut to 0.05.
    const history = [
      { day: "2025-12-10", amount: 1 },
      { day: "2026-03-10", amount: 1 },
      { day: "2026-06-10", amount: 1 },
      { day: "2026-09-10", amount: 1 },
      { day: "2026-09-13", amount: 0.05 },
    ];
    const cal = calendar([{ symbol: "E.TO", shares: 10, currency: "CAD", quoteType: "EQUITY", history }]);
    expect(cal.totals.next12Expected).toBe(42);
  });
});

describe("pending payments", () => {
  // BCE.TO-style: quarterly, no Yahoo pay date, latest ex-date 12 days ago.
  const history = [
    { day: "2025-11-03", amount: 0.438 },
    { day: "2026-02-02", amount: 0.438 },
    { day: "2026-05-04", amount: 0.438 },
    { day: "2026-08-03", amount: 0.438 },
    { day: "2026-11-02", amount: 0.438 },
  ];
  const p: PositionInput = { symbol: "BCE.TO", shares: 100, currency: "CAD", quoteType: "EQUITY", history };

  it("counts a payment between ex-date and pay date once, with an estimated pay date", () => {
    const pays = projectPosition(p, TODAY, "2027-10-31", 1);
    const nov = pays.filter((x) => x.exDate! >= "2026-10-01" && x.exDate! <= "2026-11-30");
    // The real Nov 2 event, not also last year's Nov 3 projected to Nov 3 2026.
    expect(nov).toHaveLength(1);
    expect(nov[0]).toMatchObject({
      exDate: "2026-11-02",
      payDate: "2026-11-23",
      payDateEstimated: true,
      status: "pending",
      perShare: 0.438,
    });
    const cal = calendar([p]);
    expect(cal.months.find((m) => m.month === "2026-11")!.expected).toBeCloseTo(43.8, 2);
    expect(cal.totals.next12Expected).toBeCloseTo(4 * 43.8, 2);
  });

  it("is not pending once a dividend transaction lands on or after the ex-date", () => {
    const cal = calendar([p], [{ symbol: "BCE.TO", day: "2026-11-10", shares: 1, price: 43.8, currency: "CAD" }]);
    expect(cal.months.find((m) => m.month === "2026-11")!.expected).toBe(0);
    expect(cal.totals.receivedThisMonth).toBe(43.8);
    expect(cal.totals.next12Expected).toBeCloseTo(3 * 43.8, 2);
  });

  it("does not double count when this year's occurrence already happened (EMA.TO)", () => {
    const ema: PositionInput = {
      symbol: "EMA.TO",
      shares: 100,
      currency: "CAD",
      quoteType: "EQUITY",
      history: [
        { day: "2025-08-01", amount: 0.725 },
        { day: "2025-10-31", amount: 0.733 },
        { day: "2026-01-30", amount: 0.733 },
        { day: "2026-05-01", amount: 0.733 },
        { day: "2026-07-31", amount: 0.733 },
        { day: "2026-10-30", amount: 0.74 },
      ],
      exDividendDate: "2026-10-30",
      dividendDate: "2026-11-13",
    };
    const pays = projectPosition(ema, TODAY, "2027-10-31", 1);
    // Oct 30 2026 (paid yesterday, not yet in the ledger) once; last year's
    // Oct 31 is not projected to Oct 31 2026 on top of it.
    expect(pays.filter((x) => x.exDate!.startsWith("2026-10"))).toHaveLength(1);
    expect(pays[0]).toMatchObject({ exDate: "2026-10-30", payDate: "2026-11-13", status: "announced", perShare: 0.74 });
    expect(pays).toHaveLength(4);

    const cal = calendar([ema]);
    // The overdue payment sits in the current month.
    expect(cal.months.find((m) => m.month === "2026-11")!.expected).toBe(74);
    expect(cal.totals.next12Expected).toBe(296);

    // Once received, only the next three remain.
    const after = calendar([ema], [{ symbol: "EMA.TO", day: "2026-11-13", shares: 1, price: 74, currency: "CAD" }]);
    expect(after.totals.next12Expected).toBe(222);
  });
});

describe("received", () => {
  it("counts a sold position's dividends as received but projects nothing", () => {
    const cal = calendar(
      [{ symbol: "SOLD.TO", shares: 0, currency: "CAD", history: [{ day: "2026-03-01", amount: 1 }] }],
      [{ symbol: "SOLD.TO", day: "2026-03-15", shares: 1, price: 25, currency: "CAD" }]
    );
    expect(cal.totals.last12Received).toBe(25);
    expect(cal.totals.next12Expected).toBe(0);
    expect(cal.missing).toEqual([]);
  });

  it("nets a reversal row against its payment", () => {
    const cal = calendar(
      [],
      [
        { symbol: "TD.TO", day: "2026-01-31", shares: 1, price: 100, currency: "CAD" },
        { symbol: "TD.TO", day: "2026-02-02", shares: 1, price: -100, currency: "CAD" },
        { symbol: "TD.TO", day: "2026-02-02", shares: 1, price: 102, currency: "CAD" },
      ]
    );
    const byMonth = Object.fromEntries(cal.months.map((m) => [m.month, m]));
    expect(byMonth["2026-01"].received).toBe(100);
    expect(byMonth["2026-02"].received).toBe(2);
    expect(byMonth["2026-02"].payments.map((p) => p.amountCad).sort()).toEqual([-100, 102]);
    expect(cal.totals.last12Received).toBe(102);
  });

  it("splits the current month into received-so-far and expected", () => {
    const cal = calendar(
      // Ex Nov 2 → pay ~Nov 23 (estimated): this month, still ahead.
      [{ symbol: "M.TO", shares: 10, currency: "CAD", history: [{ day: "2025-11-02", amount: 1 }] }],
      [{ symbol: "M.TO", day: "2026-11-03", shares: 1, price: 4, currency: "CAD" }]
    );
    const cur = cal.months.find((m) => m.month === "2026-11")!;
    expect(cur.received).toBe(4);
    expect(cur.expected).toBe(10);
    expect(cal.totals.receivedThisMonth).toBe(4);
    expect(cal.totals.last12Received).toBe(0);
    expect(cal.totals.next12Expected).toBe(10);
  });

  it("ignores transactions outside the window", () => {
    const cal = calendar([], [{ symbol: "A", day: "2024-01-01", shares: 1, price: 9, currency: "CAD" }]);
    expect(cal.totals.last12Received).toBe(0);
  });
});

describe("missing", () => {
  it("lists held symbols with no history", () => {
    const cal = calendar([
      { symbol: "B.TO", shares: 5, currency: "CAD", history: null },
      { symbol: "A.TO", shares: 5, currency: "CAD", history: null },
      { symbol: "Z.TO", shares: 0, currency: "CAD", history: null },
    ]);
    expect(cal.missing).toEqual(["A.TO", "B.TO"]);
  });
});

describe("overdue pending payments", () => {
  it("assumes a payment more than a week past its pay date was paid, not still expected", () => {
    // Ex 3 weeks ago, paid 2 weeks ago per Yahoo, nothing in the (stale) ledger.
    const p: PositionInput = {
      symbol: "TD.TO",
      shares: 100,
      currency: "CAD",
      quoteType: "EQUITY",
      history: [{ day: addDaysForTest(TODAY, -21), amount: 1 }],
      exDividendDate: addDaysForTest(TODAY, -21),
      dividendDate: addDaysForTest(TODAY, -14),
    };
    const cal = calendar([p]);
    const current = cal.months.find((m) => m.month === TODAY.slice(0, 7))!;
    expect(current.payments.filter((x) => x.symbol === "TD.TO" && x.status !== "projected")).toHaveLength(0);
  });
});
