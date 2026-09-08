import type {
  DailyDigestData,
  DigestData,
  DigestMarketTile,
  DigestMover,
  DigestPortfolioRow,
  DigestPortfolioSection,
  RenderOptions,
  WeeklyDigestData,
} from "@/lib/digest/types";

/**
 * HTML and plain-text renderers for the digest emails.
 *
 * Pure: everything comes from `DigestData` plus the render options. Layout is
 * tables and inline styles, so it reads the same everywhere; one `<style>`
 * block carries a single phone media query (honoured by Apple Mail and the
 * Gmail app) that reflows the widest pieces instead of letting the client
 * shrink the whole card to fit. The palette stays light because Gmail's dark
 * mode inverts colours unpredictably. `docs/mockups/digest-email.html` is the
 * visual reference.
 */

const C = {
  text: "#111827",
  muted: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  rowBorder: "#f3f4f6",
  tile: "#f9fafb",
  card: "#ffffff",
  page: "#e5e7eb",
  positive: "#15803d",
  negative: "#b91c1c",
  badgeBg: "#fef3c7",
  badgeText: "#92400e",
} as const;

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "Menlo,Consolas,'Courier New',monospace";

const LABEL = `font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;`;
const CELL = `padding:6px 0;border-top:1px solid ${C.border};`;

/**
 * Below 480px the market tiles go two-up, the weekly best/worst columns stack,
 * and the horizontal padding tightens. Without this the four nowrap tiles pin
 * the layout at ~570px and iOS Mail zooms the whole email out to fit.
 */
const PHONE_STYLES = `@media only screen and (max-width:480px){
.page{padding:12px 6px!important}
.pad{padding-left:16px!important;padding-right:16px!important}
.tile{display:inline-block!important;width:48%!important;box-sizing:border-box;vertical-align:top;margin-bottom:8px}
.tile-r{margin-left:3%}
.gap{display:none!important}
.col{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important;border-left:0!important}
.col-r{padding-top:16px!important}
.num{width:auto!important;padding-left:12px!important;padding-right:0!important}
}`;

// --- Formatting ---

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Unicode minus, which lines up with digits better than a hyphen. */
function signed(value: number, body: string): string {
  return `${value < 0 ? "−" : "+"}${body}`;
}

export function money0(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

export function money2(value: number): string {
  return `$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function signedMoney(value: number): string {
  return signed(value, money0(value));
}

/** An index level or FX rate: grouped, and never more precise than it needs. */
export function level(value: number, decimals: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function percent(value: number, digits = 1): string {
  return signed(value, `${Math.abs(value).toFixed(digits)}%`);
}

function colorOf(value: number): string {
  if (value > 0) return C.positive;
  if (value < 0) return C.negative;
  return C.muted;
}

/** Each portfolio, then the total when there is more than one to add up. */
function sectionRows(
  section: DigestPortfolioSection
): { row: DigestPortfolioRow; isTotal: boolean }[] {
  const rows = section.rows.map((row) => ({ row, isTotal: false }));
  return section.total ? [...rows, { row: section.total, isTotal: true }] : rows;
}

// --- HTML building blocks ---

function section(inner: string, padding = `0 24px 18px`): string {
  return `<tr><td class="pad" style="padding:${padding};">${inner}</td></tr>`;
}

function heading(text: string): string {
  return `<div style="${LABEL}margin-bottom:6px;">${escapeHtml(text)}</div>`;
}

function marketTiles(tiles: DigestMarketTile[], label: string): string {
  const cells = tiles
    .map((tile, index) => {
      // A five-digit index level and its change share ~108px of tile, so the
      // change runs smaller than the level rather than beneath it.
      const lvl = tile.value === null ? null : level(tile.value, tile.decimals);
      const change =
        tile.changePercent === null
          ? null
          : `<span style="font-size:12px;color:${colorOf(tile.changePercent)};">${percent(
              tile.changePercent
            )}</span>`;
      const value = lvl && change ? `${lvl} ${change}` : (lvl ?? change ?? "&mdash;");

      return `<td class="tile tile-${index % 2 === 0 ? "l" : "r"}" width="25%" style="padding:10px 12px;background:${C.tile};border-radius:6px;">
<div style="font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(
        tile.label
      )}</div>
<div style="font-family:${MONO};font-size:15px;margin-top:2px;white-space:nowrap;">${value}</div></td>`;
    })
    .join(`<td class="gap" width="8"></td>`);

  return `<div style="${LABEL}margin-bottom:8px;">${escapeHtml(label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

/** One portfolio's row. The total is the same row, ruled off and set bold. */
function portfolioRow(
  row: DigestPortfolioRow,
  options: RenderOptions,
  digits: number,
  isTotal: boolean
): string {
  const color = colorOf(row.change);
  const cell = `padding:6px 0;border-top:1px solid ${isTotal ? C.borderStrong : C.border};`;
  const weight = isTotal ? "font-weight:600;" : "";
  const estimated = row.estimated
    ? ` <span style="font-size:12px;color:${C.faint};">est.</span>`
    : "";

  const cells = options.showDollars
    ? `<td align="right" style="${cell}${weight}font-family:${MONO};">${money0(row.value)}</td>
<td class="num" align="right" width="110" style="padding:6px 14px 6px 28px;border-top:1px solid ${
        isTotal ? C.borderStrong : C.border
      };${weight}font-family:${MONO};color:${color};">${signedMoney(row.change)}</td>
<td class="num" align="right" width="96" style="${cell}${weight}font-family:${MONO};color:${color};white-space:nowrap;">${percent(
        row.changePercent,
        digits
      )}${estimated}</td>`
    : `<td align="right" colspan="3" style="${cell}${weight}font-family:${MONO};color:${color};">${percent(
        row.changePercent,
        digits
      )}${estimated}</td>`;

  return `<tr><td style="${cell}${weight}">${escapeHtml(row.name)}</td>${cells}</tr>`;
}

function portfolioLine(
  data: DigestData,
  label: string,
  options: RenderOptions,
  extraRow = "",
  digits = 1
): string {
  if (!data.portfolio) return "";
  const rows = sectionRows(data.portfolio)
    .map(({ row, isTotal }) => portfolioRow(row, options, digits, isTotal))
    .join("");

  return `${heading(label)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
${rows}${extraRow}</table>`;
}

/** Symbol, optional name, closing price, then %. Same shape as a watchlist row. */
function moverRows(movers: DigestMover[], withName: boolean): string {
  return movers
    .map((mover) => {
      const color = colorOf(mover.changePercent);
      const nameCell = withName
        ? `<td style="padding:5px 0;color:${C.muted};">${escapeHtml(mover.name)}</td>`
        : "";
      return `<tr><td style="padding:5px 0;font-weight:600;white-space:nowrap;">${escapeHtml(
        mover.symbol
      )}</td>${nameCell}<td align="right" style="font-family:${MONO};padding:5px 0 5px 12px;white-space:nowrap;">${money2(
        mover.price
      )}</td><td class="num" align="right" width="80" style="font-family:${MONO};padding:5px 0 5px 12px;color:${color};white-space:nowrap;">${percent(
        mover.changePercent
      )}</td></tr>`;
    })
    .join("");
}

function shell(headerRight: string, body: string, appUrl: string): string {
  const links = appUrl
    ? ` &middot; <a href="${escapeHtml(appUrl)}" style="color:${C.muted};">Open StockTrax</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>StockTrax ${escapeHtml(headerRight)}</title>
<style>${PHONE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${C.page};margin:0;padding:24px 12px;font-family:${SANS};color:${C.text};">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background:${C.card};border:1px solid ${C.borderStrong};border-radius:8px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td class="pad" style="padding:18px 24px 14px;border-bottom:1px solid ${C.border};">
<table role="presentation" width="100%"><tr>
<td style="font-size:13px;font-weight:600;letter-spacing:.04em;color:${C.text};">STOCKTRAX</td>
<td align="right" style="font-size:13px;color:${C.muted};">${escapeHtml(headerRight)}</td>
</tr></table>
</td></tr>
${body}
<tr><td class="pad" style="padding:12px 24px;background:${C.tile};border-top:1px solid ${C.border};font-size:12px;color:${C.muted};">
Closing prices &middot; Values in CAD${links}
</td></tr>
</table>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

// --- Daily ---

function renderDailyHtml(data: DailyDigestData, options: RenderOptions): string {
  const parts: string[] = [];

  parts.push(section(marketTiles(data.markets, "Markets · today"), "20px 24px 6px"));

  const portfolio = portfolioLine(data, "Portfolio · today", options, "", 2);
  if (portfolio) parts.push(section(portfolio, "14px 24px 18px"));

  if (data.movers.length > 0) {
    parts.push(
      section(
        `${heading("Movers")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${moverRows(data.movers, true)}</table>`
      )
    );
  }

  if (data.watchlist.length > 0) {
    const rows = data.watchlist
      .map((row) => {
        const color = colorOf(row.changePercent);
        return `<tr><td style="padding:5px 0;font-weight:600;white-space:nowrap;">${escapeHtml(
          row.symbol
        )}</td><td style="padding:5px 0;color:${C.muted};">${escapeHtml(
          row.name
        )}</td><td align="right" style="font-family:${MONO};padding:5px 0 5px 12px;white-space:nowrap;">${money2(
          row.price
        )}</td><td class="num" align="right" width="80" style="font-family:${MONO};padding:5px 0 5px 12px;color:${color};white-space:nowrap;">${percent(
          row.changePercent
        )}</td></tr>`;
      })
      .join("");
    parts.push(
      section(
        `${heading(
          `Watchlist · moves over ${data.watchlistThreshold}%`
        )}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${rows}</table>`
      )
    );
  }

  if (data.alerts.length > 0) {
    const rows = data.alerts
      .map(
        (alert) =>
          `<span style="display:inline-block;background:${C.badgeBg};color:${C.badgeText};border-radius:4px;padding:1px 6px;font-size:12px;font-weight:600;">${escapeHtml(
            alert.symbol
          )}</span> ${escapeHtml(alert.message)}`
      )
      .join("<br>");
    parts.push(
      section(`${heading("Alerts fired")}<div style="font-size:14px;line-height:1.6;">${rows}</div>`)
    );
  }

  if (data.dividends.length > 0) {
    const symbols = data.dividends.map((d) => d.symbol).join(", ");
    const total = data.dividends.reduce((sum, d) => sum + d.amount, 0);
    const body = options.showDollars
      ? `Received <span style="font-family:${MONO};">${money2(total)}</span> from ${escapeHtml(
          symbols
        )}`
      : `Received from ${escapeHtml(symbols)}`;
    parts.push(
      section(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
<tr><td width="90" style="${CELL}color:${C.muted};">Dividends</td><td style="${CELL}">${body}</td></tr></table>`,
        "0 24px 20px"
      )
    );
  }

  return shell(`Daily · ${data.dateLabel}`, parts.join("\n"), data.appUrl);
}

// --- Weekly ---

function renderWeeklyHtml(data: WeeklyDigestData, options: RenderOptions): string {
  const parts: string[] = [];

  parts.push(section(marketTiles(data.markets, "Markets · this week"), "20px 24px 6px"));

  let allTimeRow = "";
  if (data.allTime) {
    const { amount, percent: pct, sinceLabel, cagr, years } = data.allTime;
    const gain = options.showDollars
      ? `${signedMoney(amount)} (${percent(pct)})`
      : percent(pct);
    allTimeRow = `<tr><td colspan="4" style="padding:8px 0 0;border-top:1px solid ${C.border};font-size:13px;color:${C.muted};">All time <span style="font-family:${MONO};color:${colorOf(
      amount
    )};">${gain}</span> since ${escapeHtml(
      sinceLabel
    )} &nbsp;·&nbsp; CAGR <span style="font-family:${MONO};">${cagr.toFixed(
      1
    )}%</span> per year over ${years.toFixed(1)} yrs</td></tr>`;
  }

  const portfolio = portfolioLine(data, "Portfolio · this week", options, allTimeRow);
  if (portfolio) parts.push(section(portfolio, "14px 24px 18px"));

  if (data.best.length > 0 || data.worst.length > 0) {
    const column = (title: string, movers: DigestMover[], left: boolean) =>
      `<td class="col col-${left ? "l" : "r"}" width="50%" valign="top" style="${
        left ? "padding-right:12px;" : `padding-left:12px;border-left:1px solid ${C.border};`
      }">${
        movers.length > 0
          ? `${heading(title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${moverRows(movers, false)}</table>`
          : ""
      }</td>`;

    parts.push(
      section(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${column(
          "Best this week",
          data.best,
          true
        )}${column("Worst this week", data.worst, false)}</tr></table>`
      )
    );
  }

  const factRows: string[] = [];
  const fact = (label: string, body: string) =>
    `<tr><td width="90" style="${CELL}color:${C.muted};vertical-align:top;">${label}</td><td style="${CELL}">${body}</td></tr>`;

  if (data.facts.fiftyTwoWeek.length > 0) {
    factRows.push(
      fact(
        "52-week",
        data.facts.fiftyTwoWeek
          .map((n) => `<b>${escapeHtml(n.symbol)}</b> new ${n.kind}`)
          .join(" &middot; ")
      )
    );
  }

  if (data.facts.dividends) {
    const { total, symbols, ytd } = data.facts.dividends;
    factRows.push(
      fact(
        "Dividends",
        options.showDollars
          ? `<span style="font-family:${MONO};">${money0(total)}</span> received (${escapeHtml(
              symbols.join(", ")
            )}) &middot; <span style="font-family:${MONO};">${money0(ytd)}</span> year to date`
          : `Received from ${escapeHtml(symbols.join(", "))}`
      )
    );
  }

  if (data.facts.nextWeekExDiv.length > 0) {
    factRows.push(
      fact(
        "Next week",
        `Ex-dividend: ${data.facts.nextWeekExDiv
          .map((d) => `<b>${escapeHtml(d.symbol)}</b> ${d.weekday}`)
          .join(" &middot; ")}`
      )
    );
  }

  if (data.facts.activity) {
    const { buys, sells, netCash } = data.facts.activity;
    const pieces = [`${buys} ${buys === 1 ? "buy" : "buys"}`, `${sells} ${sells === 1 ? "sell" : "sells"}`];
    if (netCash !== 0) {
      pieces.push(
        options.showDollars
          ? `<span style="font-family:${MONO};">${money0(netCash)}</span> ${
              netCash > 0 ? "deposited" : "withdrawn"
            }`
          : netCash > 0
            ? "cash deposited"
            : "cash withdrawn"
      );
    }
    factRows.push(fact("Activity", pieces.join(" &middot; ")));
  }

  if (data.facts.alerts) {
    const { count, topSymbol, topCount } = data.facts.alerts;
    const detail = topSymbol && topCount > 1 ? ` &middot; ${topCount} on ${escapeHtml(topSymbol)}` : "";
    factRows.push(fact("Alerts", `${count} fired${detail}`));
  }

  if (data.facts.topHolding) {
    factRows.push(
      fact(
        "Top holding",
        `<b>${escapeHtml(data.facts.topHolding.symbol)}</b> is ${data.facts.topHolding.percent.toFixed(
          0
        )}% of the portfolio`
      )
    );
  }

  if (factRows.length > 0) {
    parts.push(
      section(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${factRows.join(
          ""
        )}</table>`,
        "0 24px 20px"
      )
    );
  }

  if (data.holdings.length > 0) {
    const th = (text: string, right = true) =>
      `<td${right ? ' align="right"' : ""} style="padding:4px 0;border-bottom:1px solid ${
        C.borderStrong
      };">${text}</td>`;
    const headerCells = options.showDollars
      ? `${th("Symbol", false)}${th("Price")}${th("Week")}${th("Value")}${th("Wk $")}`
      : `${th("Symbol", false)}${th("Price")}${th("Week")}`;

    const rows = data.holdings
      .map((row) => {
        const color = colorOf(row.weekPercent);
        const cell = (body: string, extra = "") =>
          `<td align="right" style="font-family:${MONO};padding:4px 0;border-bottom:1px solid ${C.rowBorder};${extra}">${body}</td>`;
        const money = options.showDollars
          ? `${cell(money0(row.value))}${cell(signedMoney(row.weekAmount), `color:${color};`)}`
          : "";
        return `<tr><td style="padding:4px 0;border-bottom:1px solid ${
          C.rowBorder
        };font-weight:600;white-space:nowrap;">${escapeHtml(row.symbol)}</td>${cell(money2(row.price))}${cell(
          percent(row.weekPercent),
          `color:${color};`
        )}${money}</tr>`;
      })
      .join("");

    parts.push(
      section(
        `${heading(
          "All holdings · by week change"
        )}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
<tr style="color:${C.muted};font-size:11px;text-transform:uppercase;letter-spacing:.04em;">${headerCells}</tr>${rows}</table>`,
        "0 24px 8px"
      )
    );
  }

  for (const group of data.watchlists) {
    const rows = group.rows
      .map((row) => {
        const color = colorOf(row.changePercent);
        const cell = (body: string, extra = "") =>
          `<td align="right" style="font-family:${MONO};padding:4px 0;border-bottom:1px solid ${C.rowBorder};${extra}">${body}</td>`;
        return `<tr><td style="padding:4px 0;border-bottom:1px solid ${
          C.rowBorder
        };font-weight:600;white-space:nowrap;">${escapeHtml(row.symbol)}</td>${cell(money2(row.price))}${cell(
          percent(row.changePercent),
          `color:${color};`
        )}${cell(escapeHtml(row.rangeNote ?? ""), `color:${C.muted};`)}</tr>`;
      })
      .join("");

    parts.push(
      section(
        `${heading(`Watchlist · ${group.name}`)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
<tr style="color:${C.muted};font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
<td style="padding:4px 0;border-bottom:1px solid ${C.borderStrong};">Symbol</td>
<td align="right" style="padding:4px 0;border-bottom:1px solid ${C.borderStrong};">Price</td>
<td align="right" style="padding:4px 0;border-bottom:1px solid ${C.borderStrong};">Week</td>
<td align="right" style="padding:4px 0;border-bottom:1px solid ${C.borderStrong};">52-wk range</td>
</tr>${rows}</table>`,
        "10px 24px 20px"
      )
    );
  }

  return shell(`Weekly · ${data.rangeLabel}`, parts.join("\n"), data.appUrl);
}

export function renderHtml(data: DigestData, options: RenderOptions): string {
  return data.kind === "daily"
    ? renderDailyHtml(data, options)
    : renderWeeklyHtml(data, options);
}

// --- Plain text ---

function textMarketTiles(tiles: DigestMarketTile[], heading: string): string[] {
  const lines = tiles.map((tile) => {
    const lvl = tile.value === null ? "—" : level(tile.value, tile.decimals);
    const change = tile.changePercent === null ? "—" : percent(tile.changePercent);
    return `  ${tile.label.padEnd(10)} ${lvl.padStart(9)} ${change.padStart(6)}`;
  });
  return [heading, ...lines, ""];
}

function textPortfolio(
  data: DigestData,
  label: string,
  options: RenderOptions,
  digits = 1
): string[] {
  if (!data.portfolio) return [];
  const rows = sectionRows(data.portfolio);
  const width = Math.max(...rows.map(({ row }) => row.name.length));

  const lines = rows.map(({ row }) => {
    const estimated = row.estimated ? " est." : "";
    const body = options.showDollars
      ? `${money0(row.value).padStart(10)}  ${signedMoney(row.change).padStart(9)}  ${percent(
          row.changePercent,
          digits
        ).padStart(7)}`
      : percent(row.changePercent, digits).padStart(7);
    return `  ${row.name.padEnd(width)}  ${body}${estimated}`;
  });

  return [label.toUpperCase(), ...lines, ""];
}

function textMovers(movers: DigestMover[]): string[] {
  return movers.map(
    (mover) =>
      `  ${mover.symbol.padEnd(10)} ${money2(mover.price).padStart(10)} ${percent(
        mover.changePercent
      ).padStart(7)}`
  );
}

function renderDailyText(data: DailyDigestData, options: RenderOptions): string {
  const lines: string[] = [`StockTrax daily · ${data.dateLabel}`, ""];

  lines.push(...textMarketTiles(data.markets, "MARKETS · TODAY"));

  lines.push(...textPortfolio(data, "Portfolio · today", options, 2));

  if (data.movers.length > 0) {
    lines.push("MOVERS", ...textMovers(data.movers), "");
  }

  if (data.watchlist.length > 0) {
    lines.push(`WATCHLIST · MOVES OVER ${data.watchlistThreshold}%`);
    for (const row of data.watchlist) {
      lines.push(
        `  ${row.symbol.padEnd(10)} ${money2(row.price).padStart(10)} ${percent(
          row.changePercent
        ).padStart(7)}`
      );
    }
    lines.push("");
  }

  if (data.alerts.length > 0) {
    lines.push("ALERTS FIRED");
    for (const alert of data.alerts) lines.push(`  ${alert.symbol}: ${alert.message}`);
    lines.push("");
  }

  if (data.dividends.length > 0) {
    const symbols = data.dividends.map((d) => d.symbol).join(", ");
    const total = data.dividends.reduce((sum, d) => sum + d.amount, 0);
    lines.push(
      "DIVIDENDS",
      options.showDollars
        ? `  Received ${money2(total)} from ${symbols}`
        : `  Received from ${symbols}`,
      ""
    );
  }

  lines.push("Closing prices · Values in CAD");
  if (data.appUrl) lines.push(data.appUrl);
  return lines.join("\n");
}

function renderWeeklyText(data: WeeklyDigestData, options: RenderOptions): string {
  const lines: string[] = [`StockTrax weekly · ${data.rangeLabel}`, ""];

  lines.push(...textMarketTiles(data.markets, "MARKETS · THIS WEEK"));

  lines.push(...textPortfolio(data, "Portfolio · this week", options));

  if (data.allTime) {
    const gain = options.showDollars
      ? `${signedMoney(data.allTime.amount)} (${percent(data.allTime.percent)})`
      : percent(data.allTime.percent);
    lines.push(
      `  All time ${gain} since ${data.allTime.sinceLabel} · CAGR ${data.allTime.cagr.toFixed(
        1
      )}% per year over ${data.allTime.years.toFixed(1)} yrs`,
      ""
    );
  }

  if (data.best.length > 0) lines.push("BEST THIS WEEK", ...textMovers(data.best), "");
  if (data.worst.length > 0) lines.push("WORST THIS WEEK", ...textMovers(data.worst), "");

  const facts: string[] = [];
  if (data.facts.fiftyTwoWeek.length > 0) {
    facts.push(
      `  52-week    ${data.facts.fiftyTwoWeek.map((n) => `${n.symbol} new ${n.kind}`).join(" · ")}`
    );
  }
  if (data.facts.dividends) {
    const { total, symbols, ytd } = data.facts.dividends;
    facts.push(
      options.showDollars
        ? `  Dividends  ${money0(total)} received (${symbols.join(", ")}) · ${money0(ytd)} year to date`
        : `  Dividends  Received from ${symbols.join(", ")}`
    );
  }
  if (data.facts.nextWeekExDiv.length > 0) {
    facts.push(
      `  Next week  Ex-dividend: ${data.facts.nextWeekExDiv
        .map((d) => `${d.symbol} ${d.weekday}`)
        .join(" · ")}`
    );
  }
  if (data.facts.activity) {
    const { buys, sells, netCash } = data.facts.activity;
    const pieces = [`${buys} buys`, `${sells} sells`];
    if (netCash !== 0) {
      pieces.push(
        options.showDollars
          ? `${money0(netCash)} ${netCash > 0 ? "deposited" : "withdrawn"}`
          : netCash > 0
            ? "cash deposited"
            : "cash withdrawn"
      );
    }
    facts.push(`  Activity   ${pieces.join(" · ")}`);
  }
  if (data.facts.alerts) {
    const { count, topSymbol, topCount } = data.facts.alerts;
    facts.push(
      `  Alerts     ${count} fired${topSymbol && topCount > 1 ? ` · ${topCount} on ${topSymbol}` : ""}`
    );
  }
  if (data.facts.topHolding) {
    facts.push(
      `  Top holding ${data.facts.topHolding.symbol} is ${data.facts.topHolding.percent.toFixed(
        0
      )}% of the portfolio`
    );
  }
  if (facts.length > 0) lines.push(...facts, "");

  if (data.holdings.length > 0) {
    lines.push("ALL HOLDINGS · BY WEEK CHANGE");
    for (const row of data.holdings) {
      const money = options.showDollars
        ? `  ${money0(row.value).padStart(10)} ${signedMoney(row.weekAmount).padStart(9)}`
        : "";
      lines.push(
        `  ${row.symbol.padEnd(10)} ${money2(row.price).padStart(10)} ${percent(
          row.weekPercent
        ).padStart(7)}${money}`
      );
    }
    lines.push("");
  }

  for (const group of data.watchlists) {
    lines.push(`WATCHLIST · ${group.name.toUpperCase()}`);
    for (const row of group.rows) {
      const note = row.rangeNote ? `  ${row.rangeNote}` : "";
      lines.push(
        `  ${row.symbol.padEnd(10)} ${money2(row.price).padStart(10)} ${percent(
          row.changePercent
        ).padStart(7)}${note}`
      );
    }
    lines.push("");
  }

  lines.push("Closing prices · Values in CAD");
  if (data.appUrl) lines.push(data.appUrl);
  return lines.join("\n");
}

export function renderText(data: DigestData, options: RenderOptions): string {
  return data.kind === "daily"
    ? renderDailyText(data, options)
    : renderWeeklyText(data, options);
}

/** "StockTrax daily · Mon Sep 8" — the year is dropped from the subject. */
export function digestSubject(data: DigestData): string {
  if (data.kind === "daily") {
    return `StockTrax daily · ${data.dateLabel.replace(/,\s*\d{4}$/, "")}`;
  }
  return `StockTrax weekly · ${data.rangeLabel.replace(/,\s*\d{4}$/, "")}`;
}
