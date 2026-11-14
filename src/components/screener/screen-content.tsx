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
  // The rules the shown results were run with: the columns follow them, not
  // the editor, which may have moved on since.
  const [ranRules, setRanRules] = useState<ScreenRule[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  // Autosave. Edits are merged into one pending update per screen and sent
  // after a short pause, so typing "-4.5" is one request rather than four.
  // The pending update remembers its screen id so a flush after switching
  // screens still lands on the right one.
  const pendingRef = useRef<{ screenId: number; updates: ScreenUpdates } | null>(null);
  const failedRef = useRef<{ screenId: number; updates: ScreenUpdates } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The save currently on the wire, so a run (or the next save) can wait for
  // it. Resolves true when it stored the update.
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs so flushSave stays stable: the page passes a fresh callback each
  // render, and the status should only reflect the screen being viewed.
  const onScreenUpdatedRef = useRef(onScreenUpdated);
  onScreenUpdatedRef.current = onScreenUpdated;
  const viewedScreenIdRef = useRef<number | null>(screen.id);
  viewedScreenIdRef.current = screen.id;
  // The screen id whose open-and-run has already been honoured.
  const autoRanScreenIdRef = useRef<number | null>(null);

  /**
   * Send the pending update, after any save already in flight, and resolve
   * true once everything for the viewed screen is stored: false when a save
   * failed and is still unsaved.
   */
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const previous = inFlightRef.current;
    const queued = pendingRef.current;
    if (!queued) {
      if (previous) await previous;
      return failedRef.current?.screenId !== viewedScreenIdRef.current;
    }
    pendingRef.current = null;
    // Fold an earlier failed update for the same screen in, so a later edit
    // doesn't leave the failed fields behind.
    const failed = failedRef.current?.screenId === queued.screenId ? failedRef.current : null;
    const pending = failed
      ? { screenId: queued.screenId, updates: { ...failed.updates, ...queued.updates } }
      : queued;
    const viewing = () => viewedScreenIdRef.current === pending.screenId;
    if (viewing()) setSaveStatus("saving");
    const save = (async () => {
      // Keep saves in order: an older one landing last would win.
      if (previous) await previous;
      try {
        const updated = await updateScreen(pending.screenId, pending.updates);
        failedRef.current = null;
        onScreenUpdatedRef.current(updated);
        if (!viewing()) return true;
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => {
          setSaveStatus((current) => (current === "saved" ? "idle" : current));
        }, 2000);
        return true;
      } catch {
        failedRef.current = pending;
        if (viewing()) setSaveStatus("error");
        return false;
      }
    })();
    inFlightRef.current = save;
    const ok = await save;
    if (inFlightRef.current === save) inFlightRef.current = null;
    return ok;
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
    failedRef.current = null;
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
    setRanRules([]);
    setRunError(null);

    // Opened from the index's Run button: run straight away. The ref keeps
    // StrictMode's double effect from running the screen twice.
    if (runOnOpen && autoRanScreenIdRef.current !== screen.id) {
      autoRanScreenIdRef.current = screen.id;
      onRunConsumed?.();
      // State above hasn't applied yet, so name this screen's rules.
      void handleRun(screen.rules);
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

  const handleRun = async (rulesToRun?: ScreenRule[]) => {
    const screenId = screen.id;
    setRunning(true);
    setRunError(null);
    try {
      // Run what is on screen, not what the server last saved: wait for the
      // pending save and any already in flight, and refuse to run stale rules.
      const saved = await flushSave();
      if (!saved) {
        setRunError("Your latest changes could not be saved, so the screen was not run. Retry the save first.");
        return;
      }
      const ran = rulesToRun ?? rulesRef.current;
      const response = await runScreen(screenId);
      onScreenRan?.(screenId, {
        lastRunAt: response.lastRunAt,
        lastMatchCount: response.matchCount,
        lastTotalScanned: response.totalScanned,
      });
      // The user may have opened another screen meanwhile.
      if (viewedScreenIdRef.current !== screenId) return;
      setResults(response.results);
      setRanRules(ran);
      setTotalScanned(response.totalScanned);
      setMatchCount(response.matchCount);
    } catch (error) {
      if (viewedScreenIdRef.current === screenId) {
        setRunError(error instanceof Error ? error.message : "Failed to run screen");
      }
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
            onRun={() => handleRun()}
            saveIndicator={<SaveIndicator status={saveStatus} onRetry={retrySave} />}
            running={running}
          />
        </PanelBody>
      </Panel>

      {/* Results */}
      <Panel>
        <PanelHeader title="Results" />
        <PanelBody className="p-4">
          {runError && (
            <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-negative">
              <AlertTriangle className="size-4 shrink-0" />
              {runError}
            </p>
          )}
          <ScreenResults
            results={results}
            rules={ranRules}
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
