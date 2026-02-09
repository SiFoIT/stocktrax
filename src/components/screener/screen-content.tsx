"use client";

import { useState, useEffect, useCallback } from "react";
import { ScreenEditor } from "./screen-editor";
import { ScreenResults } from "./screen-results";
import { type ScreenRule } from "@/lib/screener/metrics";
import {
  updateScreen,
  runScreen,
  runScreenInline,
  type ScreenDTO,
  type ScreenResult,
} from "@/lib/screener/api";

interface ScreenContentProps {
  screen: ScreenDTO | null;
  onScreenUpdated: (screen: ScreenDTO) => void;
}

export function ScreenContent({ screen, onScreenUpdated }: ScreenContentProps) {
  const [source, setSource] = useState("all");
  const [rules, setRules] = useState<ScreenRule[]>([]);
  const [match, setMatch] = useState<"all" | "any">("all");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ScreenResult[] | null>(null);
  const [totalScanned, setTotalScanned] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  // Sync from screen prop
  useEffect(() => {
    if (screen) {
      setSource(screen.source);
      setRules(screen.rules);
      setMatch(screen.match);
      // Reset results when switching screens
      setResults(null);
      setTotalScanned(0);
      setMatchCount(0);
    }
  }, [screen?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save changes to the screen
  const saveToScreen = useCallback(
    async (updates: Partial<{ source: string; rules: ScreenRule[]; match: "all" | "any" }>) => {
      if (!screen) return;
      try {
        const updated = await updateScreen(screen.id, updates);
        onScreenUpdated(updated);
      } catch {
        // silent
      }
    },
    [screen, onScreenUpdated]
  );

  const handleSourceChange = (newSource: string) => {
    setSource(newSource);
    saveToScreen({ source: newSource });
  };

  const handleRulesChange = (newRules: ScreenRule[]) => {
    setRules(newRules);
    saveToScreen({ rules: newRules });
  };

  const handleMatchChange = (newMatch: "all" | "any") => {
    setMatch(newMatch);
    saveToScreen({ match: newMatch });
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      const response = screen
        ? await runScreen(screen.id)
        : await runScreenInline({ source, rules, match });
      setResults(response.results);
      setTotalScanned(response.totalScanned);
      setMatchCount(response.matchCount);
    } catch {
      // silent
    } finally {
      setRunning(false);
    }
  };

  if (!screen) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-12">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Screen Selected</h3>
          <p className="text-black/50 dark:text-white/50">Create your first screen using the dropdown above.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-violet-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-black dark:text-white">{screen.name}</h2>
              <p className="text-xs text-black/50 dark:text-white/50">
                {rules.length} rule{rules.length !== 1 ? "s" : ""} configured
              </p>
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="p-4">
          <ScreenEditor
            source={source}
            rules={rules}
            match={match}
            onSourceChange={handleSourceChange}
            onRulesChange={handleRulesChange}
            onMatchChange={handleMatchChange}
            onRun={handleRun}
            running={running}
          />
        </div>
      </div>

      {/* Results */}
      <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-violet-500/5 to-transparent">
          <h3 className="text-sm font-semibold text-black dark:text-white">Results</h3>
        </div>
        <div className="p-4">
          <ScreenResults
            results={results}
            rules={rules}
            totalScanned={totalScanned}
            matchCount={matchCount}
          />
        </div>
      </div>
    </div>
  );
}
