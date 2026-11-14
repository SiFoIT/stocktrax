/**
 * Dividend income calendar: what was received over the past 12 months and
 * what the current positions are expected to pay over the next 12.
 *
 * Pure — the route gathers holdings, transactions, history and FX and hands
 * them in; everything here is plain date-string arithmetic so it tests
 * without a clock or a network.
 *
 * Window: 24 calendar months. The 12 months *before* the current month are
 * "past"; the current month and the 11 after it are "upcoming". The current
 * month therefore carries both what has already been received in it and what
 * is still expected from today on, and `next12Expected` only sums payments
 * dated today or later (it does not include what this month already paid).
 *
 * Projection: each dividend event in the symbol's history is assumed to recur
 * one year later at the same per-share amount, paid on the current share
 * count. When Yahoo has an upcoming payment (pay date — or ex-date when no
 * pay date — on/after today) it replaces the projection whose shifted ex-date
 * is nearest, within MATCH_WINDOW_DAYS, at the latest per-share amount.
 *
 * Month basis: received payments sit in the month of the transaction (the
 * day the cash arrived). Expected payments sit in the month of their pay date
 * when one is known or can be estimated from the symbol's ex→pay lag, else
 * their ex-date; each payment says which in `monthBasis`.
 */

export type PaymentStatus = "received" | "announced" | "projected";
export type MonthBasis = "pay" | "ex";

export interface CalendarPayment {
  symbol: string;
  /** Ex-dividend day; null for received payments (transactions carry only the pay day). */
  exDate: string | null;
  payDate?: string;
  /** True when payDate was estimated from the symbol's usual ex→pay lag. */
  payDateEstimated?: boolean;
  /** Per-share amount in `currency`. Negative for a reversal. */
  perShare: number;
  shares: number;
  currency: string;
  amountCad: number;
  status: PaymentStatus;
  monthBasis: MonthBasis;
}

export interface CalendarMonth {
  /** "YYYY-MM" */
  month: string;
  /** True for the current month and later. */
  upcoming: boolean;
  received: number;
  expected: number;
  payments: CalendarPayment[];
}

export interface DividendCalendar {
  /** Today, "YYYY-MM-DD", as the calendar was computed. */
  today: string;
  currentMonth: string;
  usdCadRate: number;
  fxStale: boolean;
  months: CalendarMonth[];
  totals: {
    /** Received in the 12 months before the current month. */
    last12Received: number;
    /** Received so far in the current month (not included in either total above/below). */
    receivedThisMonth: number;
    /** Expected from today through the end of the window (current month + 11). */
    next12Expected: number;
  };
  /** Held symbols whose dividend history could not be fetched. */
  missing: string[];
}

/** A received dividend transaction, already joined to its holding. */
export interface ReceivedInput {
  symbol: string;
  /** Calendar day of the transaction, "YYYY-MM-DD". */
  day: string;
  shares: number;
  price: number;
  currency: string;
}

/** A currently held position (shares > 0), merged across portfolios by symbol. */
export interface PositionInput {
  symbol: string;
  shares: number;
  /** Currency the dividend is paid in (the quote's currency). */
  currency: string;
  /** Dividend history (ex-day, per-share) or null if it couldn't be fetched. */
  history: { day: string; amount: number }[] | null;
  /** From getDividendInfo: the latest/next ex-date and pay date, when known. */
  exDividendDate?: string;
  dividendDate?: string;
}

export interface CalendarInput {
  today: string;
  usdCadRate: number;
  fxStale?: boolean;
  received: ReceivedInput[];
  positions: PositionInput[];
}

/** Projections this close (in days) to an announced ex-date are the same payment. */
export const MATCH_WINDOW_DAYS = 20;
/** An ex→pay lag beyond this is treated as bad data rather than a schedule. */
const MAX_PAY_LAG_DAYS = 90;
/** How far back history is read: a year, plus room for a payment whose ex-date
 *  passed but whose pay date is still ahead. */
const LOOKBACK_DAYS = 365 + MAX_PAY_LAG_DAYS;

// ─── Date-string helpers (UTC arithmetic on calendar days) ───

function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: string, days: number): string {
  return new Date(toUtc(day) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Same month/day one year later; Feb 29 becomes Feb 28. */
export function addOneYear(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const year = y + 1;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function toCad(amount: number, currency: string, usdCadRate: number): number {
  return currency === "USD" ? amount * usdCadRate : amount;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Projection ───

/** The symbol's ex→pay lag in days from Yahoo's latest pair, when it looks sane. */
function payLag(p: PositionInput): number | null {
  if (!p.exDividendDate || !p.dividendDate) return null;
  const lag = daysBetween(p.exDividendDate, p.dividendDate);
  return lag >= 0 && lag <= MAX_PAY_LAG_DAYS ? lag : null;
}

/**
 * The expected payments for one position whose month-basis date falls in
 * [today, windowEnd]. Announced payments replace their projected twin.
 */
export function projectPosition(
  p: PositionInput,
  today: string,
  windowEnd: string,
  usdCadRate: number
): CalendarPayment[] {
  if (!p.history || p.shares <= 0) return [];
  const lag = payLag(p);
  const lookbackStart = addDays(today, -LOOKBACK_DAYS);

  const history = p.history
    .filter((e) => e.amount > 0 && e.day > lookbackStart && e.day <= today)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const make = (
    exDate: string,
    payDate: string | undefined,
    estimated: boolean,
    perShare: number,
    status: PaymentStatus
  ): CalendarPayment => ({
    symbol: p.symbol,
    exDate,
    ...(payDate ? { payDate } : {}),
    ...(payDate && estimated ? { payDateEstimated: true } : {}),
    perShare,
    shares: p.shares,
    currency: p.currency,
    amountCad: round2(toCad(perShare * p.shares, p.currency, usdCadRate)),
    status,
    monthBasis: payDate ? "pay" : "ex",
  });

  // Last year's dates, at the current rate: the most recent payment's amount,
  // so a cut (T.TO, Sep 2026) or a raise carries forward instead of repeating
  // last year's amount. A one-off special dividend (over twice the typical
  // payment) isn't taken as the new rate.
  const amounts = history.map((e) => e.amount).sort((a, b) => a - b);
  const typical = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const latest = history[history.length - 1]?.amount ?? 0;
  const currentRate = latest > typical * 2 ? typical : latest;
  let projected = history.map((e) => {
    const ex = addOneYear(e.day);
    const pay = lag != null ? addDays(ex, lag) : undefined;
    return make(ex, pay, true, currentRate, "projected");
  });

  const out: CalendarPayment[] = [];

  // Yahoo's upcoming payment, if it is still ahead of us.
  const annEx = p.exDividendDate;
  const annPay = lag != null ? p.dividendDate : undefined;
  if (annEx && (annPay ?? annEx) >= today) {
    // The nearest projection is the same payment: drop it. The amount is the
    // actual event's when its ex-date has passed (it is in the history), else
    // the latest payment's — the current rate, which reflects a raise or cut
    // better than last year's same-period amount.
    let nearest = -1;
    let best = Infinity;
    projected.forEach((pr, i) => {
      const d = Math.abs(daysBetween(pr.exDate!, annEx));
      if (d <= MATCH_WINDOW_DAYS && d < best) {
        best = d;
        nearest = i;
      }
    });
    const actual = history.find((e) => Math.abs(daysBetween(e.day, annEx)) <= 3);
    const amount = actual?.amount ?? history[history.length - 1]?.amount;
    if (nearest >= 0) projected = projected.filter((_, i) => i !== nearest);
    if (amount != null) out.push(make(annEx, annPay, false, amount, "announced"));
  }

  out.push(...projected);
  return out.filter((pay) => {
    const basis = pay.payDate ?? pay.exDate!;
    return basis >= today && basis <= windowEnd;
  });
}

// ─── Assembly ───

export function buildDividendCalendar(input: CalendarInput): DividendCalendar {
  const { today, usdCadRate } = input;
  const currentMonth = today.slice(0, 7);
  const firstMonth = shiftMonth(currentMonth, -12);
  const lastMonth = shiftMonth(currentMonth, 11);
  const windowEnd = lastDayOfMonth(lastMonth);

  const months: CalendarMonth[] = [];
  const byMonth = new Map<string, CalendarMonth>();
  for (let i = 0; i < 24; i++) {
    const month = shiftMonth(firstMonth, i);
    const entry: CalendarMonth = { month, upcoming: month >= currentMonth, received: 0, expected: 0, payments: [] };
    months.push(entry);
    byMonth.set(month, entry);
  }

  for (const r of input.received) {
    const entry = byMonth.get(r.day.slice(0, 7));
    if (!entry || r.day > today) continue;
    const amountCad = toCad(r.shares * r.price, r.currency, usdCadRate);
    entry.received += amountCad;
    entry.payments.push({
      symbol: r.symbol,
      exDate: null,
      payDate: r.day,
      perShare: r.price,
      shares: r.shares,
      currency: r.currency,
      amountCad: round2(amountCad),
      status: "received",
      monthBasis: "pay",
    });
  }

  const missing: string[] = [];
  for (const p of input.positions) {
    if (p.shares <= 0) continue;
    if (!p.history) {
      missing.push(p.symbol);
      continue;
    }
    for (const pay of projectPosition(p, today, windowEnd, usdCadRate)) {
      const entry = byMonth.get((pay.payDate ?? pay.exDate!).slice(0, 7));
      if (!entry) continue;
      entry.expected += pay.amountCad;
      entry.payments.push(pay);
    }
  }

  const sortKey = (p: CalendarPayment) => p.payDate ?? p.exDate ?? "";
  for (const m of months) {
    m.received = round2(m.received);
    m.expected = round2(m.expected);
    m.payments.sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.symbol.localeCompare(b.symbol));
  }

  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
  return {
    today,
    currentMonth,
    usdCadRate,
    fxStale: input.fxStale ?? false,
    months,
    totals: {
      last12Received: sum(months.filter((m) => !m.upcoming).map((m) => m.received)),
      receivedThisMonth: byMonth.get(currentMonth)!.received,
      next12Expected: sum(months.filter((m) => m.upcoming).map((m) => m.expected)),
    },
    missing: missing.sort(),
  };
}
