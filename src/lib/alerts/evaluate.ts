import { AlertRule } from "@/lib/db/schema";
import {
  AlertScope,
  AlertMetric,
  AlertOperator,
  AlertResetStrategy,
} from "@/lib/alerts/config";

export interface WatchlistAlertSource {
  id: number;
  watchlistId: number;
  symbol: string;
  price?: number | null;
  changePercent?: number | null;
  currency?: string | null;
}

export interface HoldingAlertSource {
  id: number;
  portfolioId: number;
  symbol: string;
  currentPrice?: number | null;
  gainLossPercent?: number | null;
  currency?: string | null;
}

export type AlertRunPayload =
  | { scope: "watchlist"; items: WatchlistAlertSource[] }
  | { scope: "holding"; holdings: HoldingAlertSource[] };

export interface TriggeredAlertEvent {
  rule: AlertRule;
  symbol: string;
  scope: AlertScope;
  metricValue: number;
  price?: number | null;
  changePercent?: number | null;
  message: string;
}

export interface RuleStateUpdate {
  id: number;
  needsRecovery?: boolean;
  isMuted?: boolean;
  cooldownUntil?: Date | null;
  baselineValue?: number | null;
  lastTriggeredAt?: Date | null;
}

interface EvaluationContext {
  rule: AlertRule;
  metricValue: number;
  now: Date;
  sourcePrice?: number | null;
  sourceChangePercent?: number | null;
}

export function evaluateAlerts(
  payload: AlertRunPayload,
  rules: AlertRule[],
  now = new Date()
): { triggered: TriggeredAlertEvent[]; updates: RuleStateUpdate[] } {
  const triggered: TriggeredAlertEvent[] = [];
  const updates: RuleStateUpdate[] = [];

  const scopeRules = rules.filter((rule) => rule.scope === payload.scope);

  for (const rule of scopeRules) {
    const source = getSourceForRule(payload, rule);
    if (!source) continue;

    const metricValue = getMetricValue(rule.metric as AlertMetric, source, rule);
    if (metricValue === undefined || metricValue === null || Number.isNaN(metricValue)) {
      continue;
    }

    const comparison = compare(metricValue, rule.operator as AlertOperator, rule.threshold ?? 0);
    const canTrigger = comparison && shouldTrigger(rule, metricValue, now, updates);

    if (!canTrigger) {
      continue;
    }

    triggered.push({
      rule,
      symbol: source.symbol,
      scope: rule.scope as AlertScope,
      metricValue,
      price: "price" in source ? source.price ?? source.currentPrice : source.currentPrice,
      changePercent: "changePercent" in source ? source.changePercent ?? null : source.gainLossPercent ?? null,
      message: buildMessage(rule, metricValue, source),
    });

    updates.push(applyReset(rule, metricValue, now, source));
  }

  return { triggered, updates };
}

function getSourceForRule(payload: AlertRunPayload, rule: AlertRule) {
  if (payload.scope === "watchlist") {
    const list = payload.items;
    if (rule.watchlistItemId) {
      return list.find((item) => item.id === rule.watchlistItemId);
    }
    return list.find((item) => item.symbol === rule.symbol);
  }

  const holdings = payload.holdings;
  if (rule.holdingId) {
    return holdings.find((holding) => holding.id === rule.holdingId);
  }
  return holdings.find((holding) => holding.symbol === rule.symbol);
}

function getMetricValue(
  metric: AlertMetric,
  source: WatchlistAlertSource | HoldingAlertSource,
  rule: AlertRule
): number | null | undefined {
  switch (metric) {
    case "daily_change_percent":
      return "changePercent" in source ? source.changePercent ?? null : null;
    case "last_price":
      return "price" in source ? source.price ?? null : source.currentPrice ?? null;
    case "price_vs_anchor": {
      const price = "price" in source ? source.price ?? null : source.currentPrice ?? null;
      const baseline = rule.baselineValue ?? rule.anchorValue ?? price;
      if (price === null || price === undefined || !baseline) return null;
      if (baseline === 0) return null;
      return ((price - baseline) / baseline) * 100;
    }
    case "holding_gain_percent":
      return "gainLossPercent" in source ? source.gainLossPercent ?? null : null;
    default:
      return null;
  }
}

function compare(value: number, operator: AlertOperator | null, threshold: number) {
  if (operator === "gte") {
    return value >= threshold;
  }
  return value <= threshold;
}

function shouldTrigger(
  rule: AlertRule,
  metricValue: number,
  now: Date,
  updates: RuleStateUpdate[]
): boolean {
  if (rule.isMuted && rule.resetStrategy === "manual") {
    return false;
  }

  if (rule.resetStrategy === "recovery") {
    if (rule.needsRecovery) {
      const recovered = hasRecovered(rule.operator as AlertOperator, metricValue, rule.threshold ?? 0);
      if (recovered) {
        updates.push({ id: rule.id, needsRecovery: false });
      } else {
        return false;
      }
    }
  }

  if (rule.resetStrategy === "cooldown") {
    if (rule.cooldownUntil && rule.cooldownUntil > now) {
      return false;
    }
  }

  if (rule.resetStrategy === "end_of_day" && rule.lastTriggeredAt) {
    if (isSameTradingDay(rule.lastTriggeredAt, now)) {
      return false;
    }
  }

  return true;
}

function applyReset(
  rule: AlertRule,
  metricValue: number,
  now: Date,
  source: WatchlistAlertSource | HoldingAlertSource
): RuleStateUpdate {
  const update: RuleStateUpdate = { id: rule.id, lastTriggeredAt: now };

  switch (rule.resetStrategy as AlertResetStrategy) {
    case "manual":
      update.isMuted = true;
      break;
    case "recovery":
      update.needsRecovery = true;
      break;
    case "cooldown": {
      const minutes = rule.cooldownMinutes ?? 60;
      update.cooldownUntil = new Date(now.getTime() + minutes * 60 * 1000);
      break;
    }
    case "baseline": {
      const nextBaseline = "price" in source ? source.price ?? null : source.currentPrice ?? null;
      if (nextBaseline !== null && nextBaseline !== undefined) {
        update.baselineValue = nextBaseline;
      }
      break;
    }
    case "end_of_day":
      // No-op besides lastTriggeredAt
      break;
  }

  return update;
}

function hasRecovered(operator: AlertOperator, metricValue: number, threshold: number) {
  if (operator === "gte") {
    return metricValue < threshold;
  }
  return metricValue > threshold;
}

function isSameTradingDay(prev: Date, current: Date) {
  return (
    prev.getFullYear() === current.getFullYear() &&
    prev.getMonth() === current.getMonth() &&
    prev.getDate() === current.getDate()
  );
}

function buildMessage(rule: AlertRule, metricValue: number, source: WatchlistAlertSource | HoldingAlertSource) {
  const symbol = source.symbol;
  switch (rule.metric) {
    case "daily_change_percent":
      return `${symbol} ${metricValue >= 0 ? "up" : "down"} ${metricValue.toFixed(2)}% today`;
    case "price_vs_anchor":
      return `${symbol} moved ${(metricValue).toFixed(2)}% vs baseline`;
    case "holding_gain_percent":
      return `${symbol} holding gain ${metricValue.toFixed(2)}%`;
    case "last_price":
    default: {
      const price = "price" in source ? source.price : source.currentPrice;
      return `${symbol} price ${price !== undefined && price !== null ? price.toFixed(2) : "updated"}`;
    }
  }
}
