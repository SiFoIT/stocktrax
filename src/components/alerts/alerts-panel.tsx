"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
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
import { ALERT_METRIC_LABELS, ALERT_OPERATOR_LABELS, ALERT_RESET_LABELS, MARKET_METRICS } from "@/lib/alerts/config";
import { InfoTip } from "@/components/ui/info-tip";

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
  onUpdateRule: (id: number, updates: Partial<CreateAlertRuleInput>) => Promise<void>;
  onDeleteRule: (id: number) => Promise<void>;
  onResetRule: (id: number) => Promise<void>;
}

const WATCHLIST_METRICS: AlertMetric[] = ["daily_change_percent", "last_price", "price_vs_anchor"];
const HOLDING_METRICS: AlertMetric[] = ["holding_gain_percent", "price_vs_anchor", "last_price"];

const SELECT_CLASS = "w-full rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/30 px-3 py-2 text-sm";
const LABEL_CLASS = "text-xs font-semibold text-black/60 dark:text-white/60 block";

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
  onUpdateRule,
  onDeleteRule,
  onResetRule,
}: AlertsPanelProps) {
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [metric, setMetric] = useState<AlertMetric>(scope === "holding" ? "holding_gain_percent" : "daily_change_percent");
  const [operator, setOperator] = useState<AlertOperator>("lte");
  const [threshold, setThreshold] = useState<number>(-5);
  const [resetStrategy, setResetStrategy] = useState<AlertResetStrategy>("recovery");
  const [anchorValue, setAnchorValue] = useState<number | undefined>(undefined);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editMetric, setEditMetric] = useState<AlertMetric>("daily_change_percent");
  const [editOperator, setEditOperator] = useState<AlertOperator>("lte");
  const [editThreshold, setEditThreshold] = useState<number>(0);
  const [editResetStrategy, setEditResetStrategy] = useState<AlertResetStrategy>("recovery");
  const [editAnchorValue, setEditAnchorValue] = useState<number | undefined>(undefined);
  const [editCooldownMinutes, setEditCooldownMinutes] = useState<number>(60);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const metricOptions = scope === "holding" ? HOLDING_METRICS : scope === "market" ? MARKET_METRICS : WATCHLIST_METRICS;

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

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

  const startEditing = useCallback((rule: AlertRuleDTO) => {
    setEditingRuleId(rule.id);
    setEditMetric(rule.metric);
    setEditOperator(rule.operator);
    setEditThreshold(rule.threshold);
    setEditResetStrategy(rule.resetStrategy);
    setEditAnchorValue(rule.anchorValue != null ? rule.anchorValue : undefined);
    setEditCooldownMinutes(rule.cooldownMinutes ?? 60);
    setEditError(null);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingRuleId(null);
    setEditError(null);
  }, []);

  const handleEditSave = async (ruleId: number) => {
    setEditSubmitting(true);
    setEditError(null);
    try {
      await onUpdateRule(ruleId, {
        metric: editMetric,
        operator: editOperator,
        threshold: editThreshold,
        resetStrategy: editResetStrategy,
        anchorValue: Number.isFinite(editAnchorValue) ? editAnchorValue! : undefined,
        cooldownMinutes: editCooldownMinutes,
      });
      setEditingRuleId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update rule");
    } finally {
      setEditSubmitting(false);
    }
  };

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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alert");
    } finally {
      setSubmitting(false);
    }
  };

  const groupedHistory = useMemo(() => {
    return history.slice(0, 20);
  }, [history]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{scope === "market" ? "Market Alerts" : scope === "watchlist" ? "Watchlist Alerts" : "Portfolio Alerts"}</h2>
            <p className="text-sm text-black/50 dark:text-white/50">Create and review alert rules tied to this {scope === "market" ? "market overview" : scope === "watchlist" ? "watchlist" : "portfolio"}.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-black/60 dark:text-white/60">
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-3">Create alert</h3>
            <form onSubmit={handleSubmit} className="space-y-3 bg-black/5 dark:bg-white/5 rounded-xl p-4">
              <label className={LABEL_CLASS}>Target <InfoTip text="The symbol this alert watches." /></label>
              <select
                className={SELECT_CLASS}
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
                  <label className={LABEL_CLASS}>Metric <InfoTip text="The value to monitor: daily move %, quote price, % from an anchor price, or holding gain/loss %." /></label>
                  <select
                    className={SELECT_CLASS}
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
                  <label className={LABEL_CLASS}>Operator <InfoTip text="Direction of the trigger. 'At or above' fires when the value reaches or exceeds the threshold. 'At or below' fires when it drops to or past it." /></label>
                  <select
                    className={SELECT_CLASS}
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

              <label className={LABEL_CLASS}>Threshold <InfoTip text="The boundary value. Use negative numbers for drops (e.g. -5 for a 5% decline)." /></label>
              <input
                type="number"
                step="0.1"
                className={SELECT_CLASS}
                value={isNaN(threshold) ? "" : threshold}
                onChange={(e) => setThreshold(e.target.value === "" ? NaN : parseFloat(e.target.value))}
                required
              />

              {metric === "price_vs_anchor" && (
                <div>
                  <label className={LABEL_CLASS}>Anchor price <InfoTip text="Reference price for comparison. Leave blank to use the current price at creation." /></label>
                  <input
                    type="number"
                    step="0.01"
                    className={SELECT_CLASS}
                    value={anchorValue ?? ""}
                    onChange={(e) => setAnchorValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="Leave blank to use current price"
                  />
                </div>
              )}

              {resetStrategy === "cooldown" && (
                <div>
                  <label className={LABEL_CLASS}>Cooldown (minutes) <InfoTip text="Minutes to wait before this alert can fire again." /></label>
                  <input
                    type="number"
                    min={5}
                    className={SELECT_CLASS}
                    value={isNaN(cooldownMinutes) ? "" : cooldownMinutes}
                    onChange={(e) => setCooldownMinutes(e.target.value === "" ? NaN : parseInt(e.target.value, 10))}
                  />
                </div>
              )}

              <label className={LABEL_CLASS}>Reset <InfoTip text="How the alert re-arms. Recovery: resets when value crosses back. Cooldown: waits a set time. Manual: stays muted until you reset." /></label>
              <select
                className={SELECT_CLASS}
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
              {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
            </form>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3">Active rules</h3>
            <div className="space-y-3">
              {rules.length === 0 && <p className="text-sm text-black/50 dark:text-white/50">No alert rules yet.</p>}
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                  {editingRuleId === rule.id ? (
                    /* Edit mode */
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">{rule.symbol}</p>
                      <div className="flex gap-3">
                        <div className="w-1/2">
                          <label className={LABEL_CLASS}>Metric <InfoTip text="The value to monitor: daily move %, quote price, % from an anchor price, or holding gain/loss %." /></label>
                          <select className={SELECT_CLASS} value={editMetric} onChange={(e) => setEditMetric(e.target.value as AlertMetric)}>
                            {metricOptions.map((opt) => (
                              <option key={opt} value={opt}>{ALERT_METRIC_LABELS[opt]}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-1/2">
                          <label className={LABEL_CLASS}>Operator <InfoTip text="Direction of the trigger. 'At or above' fires when the value reaches or exceeds the threshold. 'At or below' fires when it drops to or past it." /></label>
                          <select className={SELECT_CLASS} value={editOperator} onChange={(e) => setEditOperator(e.target.value as AlertOperator)}>
                            {(["gte", "lte"] as AlertOperator[]).map((opt) => (
                              <option key={opt} value={opt}>{ALERT_OPERATOR_LABELS[opt]}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={LABEL_CLASS}>Threshold <InfoTip text="The boundary value. Use negative numbers for drops (e.g. -5 for a 5% decline)." /></label>
                        <input
                          type="number"
                          step="0.1"
                          className={SELECT_CLASS}
                          value={isNaN(editThreshold) ? "" : editThreshold}
                          onChange={(e) => setEditThreshold(e.target.value === "" ? NaN : parseFloat(e.target.value))}
                          required
                        />
                      </div>

                      {editMetric === "price_vs_anchor" && (
                        <div>
                          <label className={LABEL_CLASS}>Anchor price <InfoTip text="Reference price for comparison. Leave blank to use the current price at creation." /></label>
                          <input
                            type="number"
                            step="0.01"
                            className={SELECT_CLASS}
                            value={editAnchorValue ?? ""}
                            onChange={(e) => setEditAnchorValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                            placeholder="Leave blank to use current price"
                          />
                        </div>
                      )}

                      <div>
                        <label className={LABEL_CLASS}>Reset <InfoTip text="How the alert re-arms. Recovery: resets when value crosses back. Cooldown: waits a set time. Manual: stays muted until you reset." /></label>
                        <select className={SELECT_CLASS} value={editResetStrategy} onChange={(e) => setEditResetStrategy(e.target.value as AlertResetStrategy)}>
                          {(["manual", "recovery", "cooldown", "baseline", "end_of_day"] as AlertResetStrategy[]).map((opt) => (
                            <option key={opt} value={opt}>{ALERT_RESET_LABELS[opt]}</option>
                          ))}
                        </select>
                      </div>

                      {editResetStrategy === "cooldown" && (
                        <div>
                          <label className={LABEL_CLASS}>Cooldown (minutes) <InfoTip text="Minutes to wait before this alert can fire again." /></label>
                          <input
                            type="number"
                            min={5}
                            className={SELECT_CLASS}
                            value={isNaN(editCooldownMinutes) ? "" : editCooldownMinutes}
                            onChange={(e) => setEditCooldownMinutes(e.target.value === "" ? NaN : parseInt(e.target.value, 10))}
                          />
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => handleEditSave(rule.id)} disabled={editSubmitting}>
                          {editSubmitting ? "Saving..." : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={editSubmitting}>
                          Cancel
                        </Button>
                      </div>
                      {editError && <p className="text-sm text-red-500">{editError}</p>}
                    </div>
                  ) : (
                    /* Read-only mode */
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{rule.symbol}</p>
                        <p className="text-xs text-black/50 dark:text-white/50">
                          {ALERT_METRIC_LABELS[rule.metric]} · {ALERT_OPERATOR_LABELS[rule.operator]} {rule.threshold}
                        </p>
                        <p className="text-xs text-black/40 dark:text-white/40">{ALERT_RESET_LABELS[rule.resetStrategy]}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => startEditing(rule)} title="Edit rule">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onResetRule(rule.id)}>
                          Reset
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onDeleteRule(rule.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}
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
