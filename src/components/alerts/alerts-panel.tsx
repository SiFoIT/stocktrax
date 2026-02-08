"use client";

import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type {
  AlertHistoryEntry,
  AlertRuleDTO,
  AlertScope,
  AlertMetric,
  AlertOperator,
  AlertResetStrategy,
} from "@/types";
import { CreateAlertRuleInput } from "@/lib/alerts/api";
import { ALERT_METRIC_LABELS, ALERT_OPERATOR_LABELS, ALERT_RESET_LABELS } from "@/lib/alerts/config";

interface AlertsPanelProps {
  open: boolean;
  scope: AlertScope;
  sourceOptions: { id: number; label: string; symbol: string }[];
  rules: AlertRuleDTO[];
  alerts: AlertHistoryEntry[];
  history: AlertHistoryEntry[];
  focusSymbol?: string | null;
  onClose: () => void;
  onCreateRule: (input: CreateAlertRuleInput) => Promise<void>;
  onDeleteRule: (id: number) => Promise<void>;
  onResetRule: (id: number) => Promise<void>;
}

const WATCHLIST_METRICS: AlertMetric[] = ["daily_change_percent", "last_price", "price_vs_anchor"];
const HOLDING_METRICS: AlertMetric[] = ["holding_gain_percent", "price_vs_anchor", "last_price"];

export function AlertsPanel({
  open,
  scope,
  sourceOptions,
  rules,
  alerts,
  history,
  focusSymbol,
  onClose,
  onCreateRule,
  onDeleteRule,
  onResetRule,
}: AlertsPanelProps) {
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [metric, setMetric] = useState<AlertMetric>(scope === "watchlist" ? "daily_change_percent" : "holding_gain_percent");
  const [operator, setOperator] = useState<AlertOperator>("lte");
  const [threshold, setThreshold] = useState<number>(-5);
  const [resetStrategy, setResetStrategy] = useState<AlertResetStrategy>("recovery");
  const [anchorValue, setAnchorValue] = useState<number | undefined>(undefined);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(60);
  const [submitting, setSubmitting] = useState(false);

  const metricOptions = scope === "watchlist" ? WATCHLIST_METRICS : HOLDING_METRICS;

  useEffect(() => {
    if (sourceOptions.length === 0) {
      setSelectedSource(null);
      return;
    }
    if (!sourceOptions.some((option) => option.id === selectedSource)) {
      setSelectedSource(sourceOptions[0].id);
    }
  }, [sourceOptions, selectedSource]);

  useEffect(() => {
    if (!focusSymbol) return;
    const match = sourceOptions.find((option) => option.symbol === focusSymbol);
    if (match) {
      setSelectedSource(match.id);
    }
  }, [focusSymbol, sourceOptions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSource === null) return;
    const option = sourceOptions.find((opt) => opt.id === selectedSource);
    if (!option) return;

    setSubmitting(true);
    try {
      await onCreateRule({
        scope,
        symbol: option.symbol,
        watchlistItemId: scope === "watchlist" ? option.id : undefined,
        holdingId: scope === "holding" ? option.id : undefined,
        metric,
        operator,
        threshold,
        resetStrategy,
        anchorValue: Number.isFinite(anchorValue) ? anchorValue! : undefined,
        cooldownMinutes,
      });
      setThreshold(-5);
      setAnchorValue(undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const groupedHistory = useMemo(() => {
    return history.slice(0, 20);
  }, [history]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col">
        <div className="p-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{scope === "watchlist" ? "Watchlist Alerts" : "Portfolio Alerts"}</h2>
            <p className="text-sm text-black/50 dark:text-white/50">Create and review alert rules tied to this {scope === "watchlist" ? "watchlist" : "portfolio"}.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-black/60 dark:text-white/60">
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-3">Create alert</h3>
            <form onSubmit={handleSubmit} className="space-y-3 bg-black/5 dark:bg-white/5 rounded-xl p-4">
              <label className="text-xs font-semibold text-black/60 dark:text-white/60 block">Target</label>
              <select
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm"
                value={selectedSource ?? ""}
                onChange={(e) => setSelectedSource(Number(e.target.value))}
                required
              >
                <option value="" disabled>
                  Select symbol
                </option>
                {sourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.symbol} · {option.label}
                  </option>
                ))}
              </select>

              <div className="flex gap-3">
                <div className="w-1/2">
                  <label className="text-xs font-semibold text-black/60 dark:text-white/60 block">Metric</label>
                  <select
                    className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as AlertMetric)}
                  >
                    {metricOptions.map((option) => (
                      <option key={option} value={option}>
                        {ALERT_METRIC_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="text-xs font-semibold text-black/60 dark:text-white/60 block">Operator</label>
                  <select
                    className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value as AlertOperator)}
                  >
                    {(["gte", "lte"] as AlertOperator[]).map((option) => (
                      <option key={option} value={option}>
                        {ALERT_OPERATOR_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="text-xs font-semibold text-black/60 dark:text-white/60 block">Threshold</label>
              <input
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                required
              />

              {metric === "price_vs_anchor" && (
                <div>
                  <label className="text-xs font-semibold text-black/60 dark:text-white/60 block">Anchor price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm"
                    value={anchorValue ?? ""}
                    onChange={(e) => setAnchorValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Leave blank to use current price"
                  />
                </div>
              )}

              {resetStrategy === "cooldown" && (
                <div>
                  <label className="text-xs font-semibold text-black/60 dark:text-white/60 block">Cooldown (minutes)</label>
                  <input
                    type="number"
                    min={5}
                    className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm"
                    value={cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(parseInt(e.target.value, 10))}
                  />
                </div>
              )}

              <label className="text-xs font-semibold text-black/60 dark:text-white/60 block">Reset</label>
              <select
                className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm"
                value={resetStrategy}
                onChange={(e) => setResetStrategy(e.target.value as AlertResetStrategy)}
              >
                {(["manual", "recovery", "cooldown", "baseline", "end_of_day"] as AlertResetStrategy[]).map((option) => (
                  <option key={option} value={option}>
                    {ALERT_RESET_LABELS[option]}
                  </option>
                ))}
              </select>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Saving..." : "Create alert"}
              </Button>
            </form>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3">Active rules</h3>
            <div className="space-y-3">
              {rules.length === 0 && <p className="text-sm text-black/50 dark:text-white/50">No alert rules yet.</p>}
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{rule.symbol}</p>
                      <p className="text-xs text-black/50 dark:text-white/50">
                        {ALERT_METRIC_LABELS[rule.metric]} {ALERT_OPERATOR_LABELS[rule.operator]} {rule.threshold}
                      </p>
                      <p className="text-xs text-black/40 dark:text-white/40">{ALERT_RESET_LABELS[rule.resetStrategy]}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onResetRule(rule.id)}>
                        Reset
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDeleteRule(rule.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3">Latest alerts</h3>
            <div className="space-y-2">
              {alerts.length === 0 && <p className="text-sm text-black/50 dark:text-white/50">No alerts triggered yet.</p>}
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-sm font-semibold">{alert.symbol}</p>
                  <p className="text-xs text-black/60 dark:text-white/60">{alert.message}</p>
                  <p className="text-[11px] text-black/40 dark:text-white/40 mt-1">
                    {new Date(alert.triggeredAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3">History</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {groupedHistory.length === 0 && <p className="text-sm text-black/50 dark:text-white/50">No history yet.</p>}
              {groupedHistory.map((entry) => (
                <div key={entry.id} className="border border-black/10 dark:border-white/10 rounded-lg p-3">
                  <p className="text-sm font-semibold">{entry.symbol}</p>
                  <p className="text-xs text-black/60 dark:text-white/60">{entry.message}</p>
                  <p className="text-[11px] text-black/40 dark:text-white/40 mt-1">
                    {new Date(entry.triggeredAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
