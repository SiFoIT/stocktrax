"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Check, ChevronLeft, Loader2 } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ScreenEditor } from "./screen-editor";
import { ScreenResults } from "./screen-results";
import { type ScreenRule } from "@/lib/screener/metrics";
import { formatLastRun } from "@/lib/screener/describe";
import {
  updateScreen,
  runScreen,
  type ScreenDTO,
  type ScreenResult,
  type ScreenRunStats,
} from "@/lib/screener/api";

type ScreenUpdates = Partial<{ source: string; rules: ScreenRule[]; match: "all" | "any" }>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 600;

interface ScreenContentProps {
  screen: ScreenDTO;
  onScreenUpdated: (screen: ScreenDTO) => void;
  /** Back to the screens index. */
  onBack: () => void;
  /** Start a run as soon as this screen mounts (opened via the index's Run). */
  runOnOpen?: boolean;
  onRunConsumed?: () => void;
  /** Hand the just-stored run stats back so the index row stays current. */
  onScreenRan?: (id: number, run: ScreenRunStats) => void;
}

export function ScreenContent({
  screen,
  onScreenUpdated,
  onBack,
  runOnOpen = false,
  onRunConsumed,
  onScreenRan,
}: ScreenContentProps) {
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
  const viewedScreenIdRef = useRef<number | null>(screen.id);
  viewedScreenIdRef.current = screen.id;
  // The screen id whose open-and-run has already been honoured.
  const autoRanScreenIdRef = useRef<number | null>(null);

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
    setSource(screen.source);
    setRules(screen.rules);
    setMatch(screen.match);
    setSaveStatus("idle");
    // Reset results when switching screens
    setResults(null);
    setTotalScanned(0);
    setMatchCount(0);

    // Opened from the index's Run button: run straight away. The ref keeps
    // StrictMode's double effect from running the screen twice.
    if (runOnOpen && autoRanScreenIdRef.current !== screen.id) {
      autoRanScreenIdRef.current = screen.id;
      onRunConsumed?.();
      void handleRun();
    }
  }, [screen.id, runOnOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const response = await runScreen(screen.id);
      setResults(response.results);
      setTotalScanned(response.totalScanned);
      setMatchCount(response.matchCount);
      onScreenRan?.(screen.id, {
        lastRunAt: response.lastRunAt,
        lastMatchCount: response.matchCount,
        lastTotalScanned: response.totalScanned,
      });
    } catch {
      // silent
    } finally {
      setRunning(false);
    }
  };

  const lastRun = formatLastRun(screen.lastRunAt);
  const lastRunLabel =
    screen.lastRunAt && screen.lastMatchCount != null
      ? `${lastRun} · ${screen.lastMatchCount} of ${screen.lastTotalScanned ?? 0} matched`
      : lastRun;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to screens"
                className="flex items-center gap-1 font-normal text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
                Screens
              </button>
              <span className="text-subtle-foreground">/</span>
              {screen.name}
            </span>
          }
          meta={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}
          right={lastRunLabel}
        />

        {/* Editor */}
        <PanelBody className="p-4">
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
        </PanelBody>
      </Panel>

      {/* Results */}
      <Panel>
        <PanelHeader title="Results" />
        <PanelBody className="p-4">
          <ScreenResults
            results={results}
            rules={rules}
            totalScanned={totalScanned}
            matchCount={matchCount}
          />
        </PanelBody>
      </Panel>
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
