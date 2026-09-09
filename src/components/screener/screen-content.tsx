"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenEditor } from "./screen-editor";
import { ScreenResults } from "./screen-results";
import { type ScreenRule } from "@/lib/screener/metrics";
import {
  createScreen,
  updateScreen,
  runScreen,
  runScreenInline,
  type ScreenDTO,
  type ScreenResult,
} from "@/lib/screener/api";

type ScreenUpdates = Partial<{ source: string; rules: ScreenRule[]; match: "all" | "any" }>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 600;

interface ScreenContentProps {
  screen: ScreenDTO | null;
  onScreenUpdated: (screen: ScreenDTO) => void;
  onScreenCreated: (screen: ScreenDTO) => void;
}

export function ScreenContent({ screen, onScreenUpdated, onScreenCreated }: ScreenContentProps) {
  const [source, setSource] = useState("all");
  const [rules, setRules] = useState<ScreenRule[]>([]);
  const [match, setMatch] = useState<"all" | "any">("all");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ScreenResult[] | null>(null);
  const [totalScanned, setTotalScanned] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Autosave. Edits are merged into one pending update per screen and sent
  // after a short pause, so typing "-4.5" is one request rather than four.
  // The pending update remembers its screen id so a flush after switching
  // screens still lands on the right one.
  const pendingRef = useRef<{ screenId: number; updates: ScreenUpdates } | null>(null);
  const failedRef = useRef<{ screenId: number; updates: ScreenUpdates } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs so flushSave stays stable: the page passes a fresh callback each
  // render, and the status should only reflect the screen being viewed.
  const onScreenUpdatedRef = useRef(onScreenUpdated);
  onScreenUpdatedRef.current = onScreenUpdated;
  const viewedScreenIdRef = useRef<number | null>(screen?.id ?? null);
  viewedScreenIdRef.current = screen?.id ?? null;

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const viewing = () => viewedScreenIdRef.current === pending.screenId;
    if (viewing()) setSaveStatus("saving");
    try {
      const updated = await updateScreen(pending.screenId, pending.updates);
      failedRef.current = null;
      onScreenUpdatedRef.current(updated);
      if (!viewing()) return;
      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaveStatus((current) => (current === "saved" ? "idle" : current));
      }, 2000);
    } catch {
      failedRef.current = pending;
      if (viewing()) setSaveStatus("error");
    }
  }, []);

  const queueSave = (updates: ScreenUpdates) => {
    if (!screen) return;
    const previous =
      pendingRef.current?.screenId === screen.id ? pendingRef.current.updates : {};
    pendingRef.current = { screenId: screen.id, updates: { ...previous, ...updates } };
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DELAY_MS);
  };

  const retrySave = () => {
    const failed = failedRef.current;
    if (!failed) return;
    pendingRef.current = failed;
    flushSave();
  };

  // Sync from screen prop, sending any edits to the previous screen first
  useEffect(() => {
    flushSave();
    if (screen) {
      setSource(screen.source);
      setRules(screen.rules);
      setMatch(screen.match);
      setSaveStatus("idle");
      // Reset results when switching screens
      setResults(null);
      setTotalScanned(0);
      setMatchCount(0);
    }
  }, [screen?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send whatever is still pending when the tab or page goes away
  useEffect(() => {
    const unloadFlush = () => {
      flushSave();
    };
    window.addEventListener("pagehide", unloadFlush);
    return () => {
      window.removeEventListener("pagehide", unloadFlush);
      flushSave();
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [flushSave]);

  const handleSourceChange = (newSource: string) => {
    setSource(newSource);
    queueSave({ source: newSource });
  };

  const handleRulesChange = (newRules: ScreenRule[]) => {
    setRules(newRules);
    queueSave({ rules: newRules });
  };

  const handleMatchChange = (newMatch: "all" | "any") => {
    setMatch(newMatch);
    queueSave({ match: newMatch });
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      // Run what is on screen, not what the server last saved
      await flushSave();
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
    return <CreateScreenPrompt onCreated={onScreenCreated} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{screen.name}</h2>
              <p className="text-xs text-muted-foreground">
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
            saveIndicator={<SaveIndicator status={saveStatus} onRetry={retrySave} />}
            running={running}
          />
        </div>
      </div>

      {/* Results */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-accent">
          <h3 className="text-sm font-semibold text-foreground">Results</h3>
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

/** Empty state: name a screen and create it right here. */
function CreateScreenPrompt({ onCreated }: { onCreated: (screen: ScreenDTO) => void }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      onCreated(await createScreen({ name: trimmed }));
      setName("");
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-lg bg-card border border-border p-12">
      <div className="mx-auto max-w-sm text-center">
        <h3 className="text-lg font-semibold text-foreground mb-1">No screen yet</h3>
        <p className="text-muted-foreground mb-5">
          A screen is a set of rules run against your symbols. Name one to get started.
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New screen name"
            aria-label="New screen name"
            autoFocus
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" disabled={!name.trim() || creating}>
            <Plus className="size-4" />
            Create Screen
          </Button>
        </form>
      </div>
    </div>
  );
}

/** Autosave status beside the Run Screen button. Quiet when idle, loud only on failure. */
function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 text-xs text-warning" role="status">
        <AlertTriangle className="size-3.5" />
        Not saved
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border px-2 py-0.5 text-foreground hover:bg-accent"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      {status === "saving" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Check className="size-3.5" />
      )}
      {status === "saving" ? "Saving…" : "Saved"}
    </div>
  );
}
