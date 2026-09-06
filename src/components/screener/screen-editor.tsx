"use client";

import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  METRICS,
  SCREEN_OPERATORS,
  getMetricsByCategory,
  type ScreenRule,
  type ScreenOperator,
} from "@/lib/screener/metrics";
import { SCREEN_PRESETS, ScreenPreset } from "@/lib/screener/presets";
import { fetchPresets, createPreset, deletePreset, CustomPresetDTO } from "@/lib/screener/api";
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
  const [customPresets, setCustomPresets] = useState<CustomPresetDTO[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const metricsByCategory = getMetricsByCategory();

  const loadPresets = async () => {
    try {
      setCustomPresets(await fetchPresets());
    } catch {
      // silent
    }
  };

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
    loadPresets();
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

  const applyPreset = (preset: ScreenPreset) => {
    onRulesChange([...preset.rules]);
    onMatchChange(preset.match);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim() || rules.length === 0) return;
    try {
      await createPreset({ name: presetName.trim(), rules, match });
      setPresetName("");
      setSavingPreset(false);
      loadPresets();
    } catch {
      // silent
    }
  };

  const handleDeletePreset = async (id: number) => {
    try {
      await deletePreset(id);
      loadPresets();
    } catch {
      // silent
    }
  };

  return (
    <div className="space-y-4">
      {/* Source + Match row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground/80 whitespace-nowrap">Source:</label>
          <select
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            className="h-9 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
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
          <label className="text-sm font-medium text-foreground/80 whitespace-nowrap">Match:</label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => onMatchChange("all")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                match === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All (AND)
            </button>
            <button
              onClick={() => onMatchChange("any")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                match === "any"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Any (OR)
            </button>
          </div>
        </div>
      </div>

      {/* Preset templates */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Presets:</span>
        {SCREEN_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => applyPreset(preset)}
            className="px-3 py-1 rounded-full text-xs font-medium border border-border bg-muted text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
          >
            {preset.name}
          </button>
        ))}
        {customPresets.map((preset) => (
          <span key={preset.id} className="inline-flex items-center gap-1 rounded-full border border-positive/30 bg-positive/10 transition-colors">
            <button
              onClick={() => applyPreset(preset)}
              className="pl-3 py-1 text-xs font-medium text-positive hover:text-positive/80"
            >
              {preset.name}
            </button>
            <button
              onClick={() => handleDeletePreset(preset.id)}
              className="pr-2 py-1 text-positive hover:text-negative transition-colors"
              title="Delete preset"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {savingPreset ? (
          <span className="inline-flex items-center gap-1">
            <Input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePreset();
                if (e.key === "Escape") { setSavingPreset(false); setPresetName(""); }
              }}
              placeholder="Preset name…"
              className="h-7 w-36 text-xs bg-muted border-border"
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim() || rules.length === 0}
              className="px-2 py-1 rounded-full text-xs font-medium bg-positive text-white hover:bg-positive disabled:opacity-40 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => { setSavingPreset(false); setPresetName(""); }}
              className="px-1.5 py-1 text-xs text-subtle-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setSavingPreset(true)}
            disabled={rules.length === 0}
            className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-border-strong text-muted-foreground hover:border-positive/50 hover:text-positive hover:bg-positive/5 disabled:opacity-30 disabled:hover:border-black/20 disabled:hover:text-black/50 disabled:hover:bg-transparent transition-colors"
          >
            + Save Preset
          </button>
        )}
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {rules.map((rule, index) => (
          <div key={index} className="flex items-center gap-2 flex-wrap">
            {/* Metric select */}
            <select
              value={rule.metric}
              onChange={(e) => updateRule(index, { metric: e.target.value })}
              className="h-9 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 min-w-[180px]"
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
              className="h-9 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 w-24"
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
              onChange={(e) => updateRule(index, { value: e.target.value === "" || e.target.value === "-" ? 0 : parseFloat(e.target.value) })}
              className="h-9 w-24 bg-muted border-border focus:ring-violet-500/50"
            />

            {/* Second value for "between" */}
            {rule.operator === "between" && (
              <>
                <span className="text-xs text-muted-foreground">and</span>
                <Input
                  type="number"
                  step="any"
                  value={rule.valueTo ?? 0}
                  onChange={(e) => updateRule(index, { valueTo: e.target.value === "" || e.target.value === "-" ? 0 : parseFloat(e.target.value) })}
                  className="h-9 w-24 bg-muted border-border focus:ring-violet-500/50"
                />
              </>
            )}

            {/* Unit hint */}
            <span className="text-xs text-subtle-foreground min-w-[20px]">
              {METRICS[rule.metric]?.unit || ""}
            </span>

            {/* Remove button */}
            <button
              onClick={() => removeRule(index)}
              className="p-1.5 rounded-lg text-subtle-foreground hover:text-negative hover:bg-negative/10 transition-colors"
            >
              <X className="size-4" />
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
          className="bg-muted border-border hover:bg-accent"
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
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {running ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Scanning...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Search className="size-4" />
              Run Screen
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}
