import { AlertHistoryEntry, AlertRuleDTO, AlertScope, TriggeredAlertSummary } from "@/types";
import { WatchlistItemWithQuote, HoldingWithQuote } from "@/types";

export async function triggerWatchlistAlerts(items: WatchlistItemWithQuote[]) {
  if (items.length === 0) return [] as TriggeredAlertSummary[];
  const payload = {
    scope: "watchlist" as AlertScope,
    items: items.map((item) => ({
      id: item.id,
      watchlistId: item.watchlistId,
      symbol: item.symbol,
      price: item.price ?? null,
      changePercent: item.changePercent ?? null,
      currency: item.currency ?? null,
    })),
  };
  const response = await fetch("/api/alerts/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.alerts ?? []) as TriggeredAlertSummary[];
}

export async function triggerHoldingAlerts(holdings: HoldingWithQuote[]) {
  if (holdings.length === 0) return [] as TriggeredAlertSummary[];
  const payload = {
    scope: "holding" as AlertScope,
    holdings: holdings.map((holding) => ({
      id: holding.id,
      portfolioId: holding.portfolioId,
      symbol: holding.symbol,
      currentPrice: holding.currentPrice ?? null,
      gainLossPercent: holding.gainLossPercent ?? null,
      currency: holding.currency ?? null,
    })),
  };
  const response = await fetch("/api/alerts/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.alerts ?? []) as TriggeredAlertSummary[];
}

export async function fetchAlertRules(scope: AlertScope) {
  const response = await fetch(`/api/alerts/rules?scope=${scope}`);
  if (!response.ok) return [];
  return (await response.json()) as AlertRuleDTO[];
}

export interface CreateAlertRuleInput {
  scope: AlertScope;
  symbol: string;
  watchlistItemId?: number;
  holdingId?: number;
  metric: AlertRuleDTO["metric"];
  operator: AlertRuleDTO["operator"];
  threshold: number;
  resetStrategy: AlertRuleDTO["resetStrategy"];
  anchorValue?: number | null;
  cooldownMinutes?: number;
}

export async function createAlertRule(input: CreateAlertRuleInput) {
  const response = await fetch(`/api/alerts/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    console.error("Create alert rule failed:", response.status, body);
    throw new Error(body?.error ?? "Failed to create alert rule");
  }
  return (await response.json()) as AlertRuleDTO;
}

export async function deleteAlertRule(id: number) {
  await fetch(`/api/alerts/rules/${id}`, { method: "DELETE" });
}

export async function updateAlertRule(id: number, updates: Partial<CreateAlertRuleInput>) {
  const response = await fetch(`/api/alerts/rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to update alert rule");
  }
  return (await response.json()) as AlertRuleDTO;
}

export async function resetAlertRule(id: number) {
  await fetch(`/api/alerts/rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset" }),
  });
}

export async function fetchAlertHistory(scope?: AlertScope, limit = 50) {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  params.set("limit", limit.toString());
  const response = await fetch(`/api/alerts/history?${params.toString()}`);
  if (!response.ok) return [];
  return (await response.json()) as AlertHistoryEntry[];
}
