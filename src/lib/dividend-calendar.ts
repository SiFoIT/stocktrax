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
 * is still expected, and `next12Expected` sums what is still to come: payments
 * dated today or later plus pending ones not yet in the ledger (it does not
 * include what this month already paid).
 *
 * History: the symbol's Yahoo dividend events (per share, exchange-local
 * ex-dates) from the last LOOKBACK_DAYS. Events within COLLAPSE_DAYS of each
 * other are one payment (a regular distribution plus a year-end extra), summed
 * and dated on the larger.
 *
 * Projection: each of those payments is assumed to recur one year later on the
 * current share count. The per-share amount depends on the quote type:
 *  - Funds (ETF, MUTUALFUND, anything not EQUITY) repeat each payment's own
 *    amount, so seasonal distributions (XEQT.TO's large June and December
 *    quarters) keep their shape.
 *  - Stocks (EQUITY) project every payment at the current rate: the latest
 *    payment, so a cut (T.TO, Sep 2026) or a raise carries forward — unless it
 *    is over twice the median of the last year's payments, a special
 *    dividend, in which case the median is used.
 * A projection is dropped when an actual event sits within the match window of
 * its ex-date: this year's occurrence already happened and is either received
 * or pending.
 *
 * Pending: an actual event whose ex-date passed within PENDING_DAYS, with no
 * dividend transaction for the symbol on or after it, is still to be paid. It
 * counts as expected at its own amount ("announced" when Yahoo's pay date
 * covers it, else "pending" with an estimated pay date). If that pay date has
 * slipped behind today it sits in the current month.
 *
 * Announced: when Yahoo's latest ex-date isn't in the history yet (and isn't
 * older than PENDING_DAYS or already received), it replaces the projection
 * whose ex-date is nearest within the match window, at the current rate for a
 * stock or that projection's amount for a fund.
 *
 * Pay dates: Yahoo's when it has one for the payment; otherwise ex-date plus
 * the symbol's ex→pay lag — Yahoo's latest pair, else the ledger's usual gap
 * between ex-date and receipt, else DEFAULT_PAY_LAG_DAYS — flagged estimated.
 *
 * Month basis: received payments sit in the month of the transaction (the
 * day the cash arrived); expected payments in the month of their (actual or
 * estimated) pay date. `monthBasis` says which; "ex" is no longer produced but
 * stays in the type for consumers.
 */

export type PaymentStatus = "received" | "pending" | "announced" | "projected";
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
    /** Expected from today through the end of the window (current month + 11),
     *  including pending payments not yet received. */
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
  /** The quote's type ("EQUITY", "ETF", "MUTUALFUND", ...). Only EQUITY
   *  projects at a current rate; anything else repeats each payment's amount. */
  quoteType?: string;
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

/** Ex-dates this close (in days) are the same payment: a projection near an
 *  announced or already-happened ex-date is that payment. */
export const MATCH_WINDOW_DAYS = 20;
/** Events this close together are one payment (a regular one plus an extra). */
export const COLLAPSE_DAYS = 10;
/** An ex-date this recent with nothing in the ledger since is still to be paid. */
export const PENDING_DAYS = 45;
/** Pending payments this long past their pay date are assumed paid. */
export const OVERDUE_GRACE_DAYS = 7;
/** Pay-date estimate when neither Yahoo nor the ledger gives an ex→pay lag. */
export const DEFAULT_PAY_LAG_DAYS = 21;
/** A ledger row this long after an ex-date is that payment's pay day. */
const LEDGER_LAG_MAX_DAYS = 45;
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

/** A dividend event as a single payment: same-period extras folded in. */
interface Payment {
  day: string;
  amount: number;
}

/** Ex→pay lag from Yahoo's latest pair, when it looks sane. */
function yahooPayLag(p: PositionInput): number | null {
  if (!p.exDividendDate || !p.dividendDate) return null;
  const lag = daysBetween(p.exDividendDate, p.dividendDate);
  return lag >= 0 && lag <= MAX_PAY_LAG_DAYS ? lag : null;
}

/** Median ex→pay lag seen in the ledger: each positive received row against
 *  the latest ex-date on or before it, when that is within LEDGER_LAG_MAX_DAYS. */
function ledgerPayLag(payments: Payment[], received: ReceivedInput[]): number | null {
  const lags: number[] = [];
  for (const r of received) {
    if (r.price <= 0) continue;
    let ex: string | undefined;
    for (const e of payments) if (e.day <= r.day) ex = e.day;
    if (!ex) continue;
    const lag = daysBetween(ex, r.day);
    if (lag <= LEDGER_LAG_MAX_DAYS) lags.push(lag);
  }
  return lags.length ? Math.round(median(lags)) : null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Fold events within COLLAPSE_DAYS of the previous one into a single payment:
 * amounts summed, dated on the larger event. HISU-U.TO's 0.019 year-end extra
 * a day after its regular distribution is one payment, not a 13th.
 */
export function collapseEvents(events: { day: string; amount: number }[]): Payment[] {
  const sorted = [...events].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const out: (Payment & { lastDay: string; largest: number })[] = [];
  for (const e of sorted) {
    const prev = out[out.length - 1];
    if (prev && daysBetween(prev.lastDay, e.day) <= COLLAPSE_DAYS) {
      prev.amount += e.amount;
      prev.lastDay = e.day;
      if (e.amount > prev.largest) {
        prev.largest = e.amount;
        prev.day = e.day;
      }
    } else {
      out.push({ day: e.day, amount: e.amount, lastDay: e.day, largest: e.amount });
    }
  }
  return out.map(({ day, amount }) => ({ day, amount }));
}

/**
 * Days within which two ex-dates are the same payment: MATCH_WINDOW_DAYS,
 * narrowed to under half the usual gap between payments so a monthly payer's
 * neighbouring months are never taken for one another.
 */
function matchWindow(payments: Payment[]): number {
  if (payments.length < 2) return MATCH_WINDOW_DAYS;
  const gaps = payments.slice(1).map((e, i) => daysBetween(payments[i].day, e.day));
  return Math.min(MATCH_WINDOW_DAYS, Math.floor(median(gaps) / 2) - 1);
}

/** Funds (ETF, MUTUALFUND, ...) and unknown types repeat each payment's own
 *  amount; only common stock projects at a single current rate. */
export function usesCurrentRate(quoteType: string | undefined): boolean {
  return quoteType === "EQUITY";
}

/**
 * A stock's current rate: its latest payment, unless that is more than twice
 * the median of the last year's payments, which makes it a special dividend
 * and the median is used instead. A lower latest payment is a cut and stands.
 */
export function currentRate(payments: Payment[], today: string): number {
  const latest = payments[payments.length - 1]?.amount ?? 0;
  const yearAgo = addDays(today, -365);
  const lastYear = payments.filter((e) => e.day > yearAgo).map((e) => e.amount);
  const typical = lastYear.length ? median(lastYear) : latest;
  return latest > typical * 2 ? typical : latest;
}

/**
 * The expected payments for one position: pending payments (ex-date passed
 * recently, not yet in the ledger), Yahoo's announced payment, and last year's
 * payments projected one year on — minus any projection whose occurrence this
 * year already happened or was announced. Upcoming payments must fall in
 * [today, windowEnd] by pay date; pending ones are kept even if their (often
 * estimated) pay date has slipped behind today.
 */
export function projectPosition(
  p: PositionInput,
  today: string,
  windowEnd: string,
  usdCadRate: number,
  received: ReceivedInput[] = []
): CalendarPayment[] {
  if (!p.history || p.shares <= 0) return [];
  const lookbackStart = addDays(today, -LOOKBACK_DAYS);
  const actuals = collapseEvents(p.history.filter((e) => e.amount > 0 && e.day > lookbackStart && e.day <= today));
  if (actuals.length === 0 && !p.exDividendDate) return [];

  const yahooLag = yahooPayLag(p);
  const lag = yahooLag ?? ledgerPayLag(actuals, received) ?? DEFAULT_PAY_LAG_DAYS;
  const matchDays = matchWindow(actuals);
  const equity = usesCurrentRate(p.quoteType);
  const rate = currentRate(actuals, today);
  const receivedSince = (ex: string) => received.some((r) => r.day >= ex);

  const make = (
    exDate: string,
    payDate: string,
    estimated: boolean,
    perShare: number,
    status: PaymentStatus
  ): CalendarPayment => ({
    symbol: p.symbol,
    exDate,
    payDate,
    ...(estimated ? { payDateEstimated: true } : {}),
    perShare,
    shares: p.shares,
    currency: p.currency,
    amountCad: round2(toCad(perShare * p.shares, p.currency, usdCadRate)),
    status,
    monthBasis: "pay",
  });

  const pending: CalendarPayment[] = [];
  const upcoming: CalendarPayment[] = [];

  // Yahoo's latest announcement, and the actual event it describes, if that
  // is already in the history.
  const annEx = p.exDividendDate;
  const annPay = yahooLag != null ? p.dividendDate : undefined;
  const annActual = annEx ? actuals.find((e) => Math.abs(daysBetween(e.day, annEx)) <= 3) : undefined;

  // Pending: this year's occurrence went ex recently and hasn't reached the
  // ledger. It is real, so it counts at its own amount whatever the type.
  const pendingStart = addDays(today, -PENDING_DAYS);
  for (const e of actuals) {
    if (e.day <= pendingStart || receivedSince(e.day)) continue;
    if (e === annActual && annPay) pending.push(make(e.day, annPay, false, e.amount, "announced"));
    else pending.push(make(e.day, addDays(e.day, lag), true, e.amount, "pending"));
  }

  // Last year's payments, one year on. A projection with an actual event
  // within the match window already happened this year (received or pending).
  let projected = actuals
    .map((e) => ({ ex: addOneYear(e.day), amount: equity ? rate : e.amount }))
    .filter(({ ex }) => !actuals.some((a) => Math.abs(daysBetween(a.day, ex)) <= matchDays))
    .map(({ ex, amount }) => make(ex, addDays(ex, lag), true, amount, "projected"));

  // An announcement not yet in the history: it replaces its nearest projection.
  if (annEx && !annActual && annEx > pendingStart && !receivedSince(annEx)) {
    let nearest = -1;
    let best = Infinity;
    projected.forEach((pr, i) => {
      const d = Math.abs(daysBetween(pr.exDate!, annEx));
      if (d <= matchDays && d < best) {
        best = d;
        nearest = i;
      }
    });
    const amount = equity
      ? rate
      : nearest >= 0
        ? projected[nearest].perShare
        : actuals[actuals.length - 1]?.amount;
    if (nearest >= 0) projected = projected.filter((_, i) => i !== nearest);
    if (amount) {
      const pay = annPay ?? addDays(annEx, lag);
      const ann = make(annEx, pay, !annPay, amount, "announced");
      if (annEx <= today) pending.push(ann);
      else upcoming.push(ann);
    }
  }

  upcoming.push(...projected);
  // A payment whose pay date is more than a week gone has almost certainly
  // been paid and is just not imported yet; counting it as expected would
  // inflate the next 12 months whenever the ledger runs behind.
  const stillPending = pending.filter((pay) => pay.payDate! >= addDays(today, -OVERDUE_GRACE_DAYS));
  return [
    ...stillPending,
    ...upcoming.filter((pay) => pay.payDate! >= today && pay.payDate! <= windowEnd),
  ];
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
    const ownReceived = input.received.filter((r) => r.symbol === p.symbol);
    for (const pay of projectPosition(p, today, windowEnd, usdCadRate, ownReceived)) {
      // A pending payment whose pay date has slipped past sits in the current month.
      const basis = pay.payDate ?? pay.exDate!;
      const entry = byMonth.get((basis < today ? today : basis).slice(0, 7));
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
