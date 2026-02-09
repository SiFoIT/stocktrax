"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  METRICS,
  SCREEN_OPERATORS,
  getMetricsByCategory,
  type ScreenRule,
  type ScreenOperator,
} from "@/lib/screener/metrics";
import { SCREEN_PRESETS } from "@/lib/screener/presets";
import { Watchlist, Portfolio } from "@/lib/db/schema";

interface ScreenEditorProps {
  source: string;
  rules: ScreenRule[];
  match: "all" | "any";
  onSourceChange: (source: string) => void;
  onRulesChange: (rules: ScreenRule[]) => void;
  onMatchChange: (match: "all" | "any") => void;
  onRun: () => void;
  running: boolean;
}

export function ScreenEditor({
  source,
  rules,
  match,
  onSourceChange,
  onRulesChange,
  onMatchChange,
  onRun,
  running,
}: ScreenEditorProps) {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const metricsByCategory = getMetricsByCategory();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [wRes, pRes] = await Promise.all([
          fetch("/api/watchlists"),
          fetch("/api/portfolios"),
        ]);
        setWatchlists(await wRes.json());
        setPortfolios(await pRes.json());
      } catch {
        // silent
      }
    };
    fetchData();
  }, []);

  const addRule = () => {
    onRulesChange([...rules, { metric: "pct_off_52w_high", operator: "lte", value: 0 }]);
  };

  const updateRule = (index: number, updates: Partial<ScreenRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    onRulesChange(newRules);
  };

  const removeRule = (index: number) => {
    onRulesChange(rules.filter((_, i) => i !== index));
  };

  const applyPreset = (preset: typeof SCREEN_PRESETS[number]) => {
    onRulesChange([...preset.rules]);
    onMatchChange(preset.match);
  };

  return (
    <div className="space-y-4">
      {/* Source + Match row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-black/70 dark:text-white/70 whitespace-nowrap">Source:</label>
          <select
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            className="h-9 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value="all">All symbols</option>
            {watchlists.map((w) => (
              <option key={`w-${w.id}`} value={`watchlist:${w.id}`}>
                Watchlist: {w.name}
              </option>
            ))}
            {portfolios.map((p) => (
              <option key={`p-${p.id}`} value={`portfolio:${p.id}`}>
                Portfolio: {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-black/70 dark:text-white/70 whitespace-nowrap">Match:</label>
          <div className="flex rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
            <button
              onClick={() => onMatchChange("all")}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                match === "all"
                  ? "bg-violet-500 text-white"
                  : "bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
              }`}
            >
              All (AND)
            </button>
            <button
              onClick={() => onMatchChange("any")}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                match === "any"
                  ? "bg-violet-500 text-white"
                  : "bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
              }`}
            >
              Any (OR)
            </button>
          </div>
        </div>
      </div>

      {/* Preset templates */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-black/50 dark:text-white/50">Presets:</span>
        {SCREEN_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => applyPreset(preset)}
            className="px-3 py-1 rounded-full text-xs font-medium border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-all"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {rules.map((rule, index) => (
          <div key={index} className="flex items-center gap-2 flex-wrap">
            {/* Metric select */}
            <select
              value={rule.metric}
              onChange={(e) => updateRule(index, { metric: e.target.value })}
              className="h-9 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 min-w-[180px]"
            >
              {Object.entries(metricsByCategory).map(([category, metrics]) => (
                <optgroup key={category} label={category}>
                  {metrics.map(({ key, def }) => (
                    <option key={key} value={key}>
                      {def.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Operator select */}
            <select
              value={rule.operator}
              onChange={(e) => updateRule(index, { operator: e.target.value as ScreenOperator })}
              className="h-9 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 w-24"
            >
              {SCREEN_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value input */}
            <Input
              type="number"
              step="any"
              value={rule.value}
              onChange={(e) => updateRule(index, { value: parseFloat(e.target.value) || 0 })}
              className="h-9 w-24 bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:ring-violet-500/50"
            />

            {/* Second value for "between" */}
            {rule.operator === "between" && (
              <>
                <span className="text-xs text-black/50 dark:text-white/50">and</span>
                <Input
                  type="number"
                  step="any"
                  value={rule.valueTo ?? 0}
                  onChange={(e) => updateRule(index, { valueTo: parseFloat(e.target.value) || 0 })}
                  className="h-9 w-24 bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:ring-violet-500/50"
                />
              </>
            )}

            {/* Unit hint */}
            <span className="text-xs text-black/40 dark:text-white/40 min-w-[20px]">
              {METRICS[rule.metric]?.unit || ""}
            </span>

            {/* Remove button */}
            <button
              onClick={() => removeRule(index)}
              className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={addRule}
          className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
          </svg>
          Add Rule
        </Button>
        <Button
          size="sm"
          onClick={onRun}
          disabled={running || rules.length === 0}
          className="bg-violet-500 hover:bg-violet-600 text-white"
        >
          {running ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Scanning...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Run Screen
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}
