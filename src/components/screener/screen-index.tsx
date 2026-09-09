"use client";

import { useEffect, useState } from "react";
import { Copy, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Portfolio, Watchlist } from "@/lib/db/schema";
import { SCREEN_PRESETS, type ScreenPreset } from "@/lib/screener/presets";
import {
  createScreen,
  deleteScreen,
  duplicateScreen,
  fetchPresets,
  updateScreen,
  type CustomPresetDTO,
  type ScreenDTO,
} from "@/lib/screener/api";
import { describeScreen, describeSource, formatLastRun } from "@/lib/screener/describe";

interface ScreenIndexProps {
  screens: ScreenDTO[];
  loading: boolean;
  onOpen: (id: number) => void;
  /** Open the screen and start a run as soon as it mounts. */
  onRun: (id: number) => void;
  onScreensChange: (next: ScreenDTO[]) => void;
}

/** Neutral metadata chip. A source or a match mode is not a status. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * The Screens landing page: every saved screen with what it looks for and
 * what it found last time. A screen is a query you run, so the collection is
 * the useful thing to land on.
 */
export function ScreenIndex({
  screens,
  loading,
  onOpen,
  onRun,
  onScreensChange,
}: ScreenIndexProps) {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Only to label each screen's source; the editor fetches the same two.
  useEffect(() => {
    const load = async () => {
      try {
        const [wRes, pRes] = await Promise.all([
          fetch("/api/watchlists"),
          fetch("/api/portfolios"),
        ]);
        if (wRes.ok) setWatchlists(await wRes.json());
        if (pRes.ok) setPortfolios(await pRes.json());
      } catch {
        // silent: an unlabelled source still reads as "All symbols"
      }
    };
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await createScreen({ name: trimmed });
      onScreensChange([...screens, created]);
      setNewName("");
      // A new screen has no rules, so the editor is the only useful next step.
      onOpen(created.id);
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: number, name: string) => {
    const trimmed = name.trim();
    setEditingId(null);
    setEditingName("");
    if (!trimmed) return;
    try {
      await updateScreen(id, { name: trimmed });
      onScreensChange(screens.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
    } catch {
      // silent
    }
  };

  const handleDelete = async (screen: ScreenDTO) => {
    if (!confirm("Are you sure you want to delete this screen?")) return;
    try {
      await deleteScreen(screen.id);
      onScreensChange(screens.filter((s) => s.id !== screen.id));
    } catch {
      // silent
    }
  };

  const handleDuplicate = async (screen: ScreenDTO) => {
    if (busyId !== null) return;
    setBusyId(screen.id);
    try {
      const copy = await duplicateScreen(screen, screens.map((s) => s.name));
      onScreensChange([...screens, copy]);
    } catch {
      // silent
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <Panel>
        <PanelHeader title="Screens" />
        <PanelBody className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </PanelBody>
      </Panel>
    );
  }

  if (screens.length === 0) {
    return (
      <EmptyScreens
        onCreated={(created) => {
          onScreensChange([created]);
          onOpen(created.id);
        }}
      />
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Screens"
        meta={`${screens.length} screen${screens.length === 1 ? "" : "s"}`}
        right={
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              placeholder="New screen name"
              aria-label="New screen name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 w-44 text-sm"
            />
            <Button type="submit" size="sm" disabled={!newName.trim() || creating}>
              Add
            </Button>
          </form>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3.5 py-2 text-left text-[11.5px] font-medium text-muted-foreground">
                Screen
              </th>
              <th className="px-3.5 py-2 text-left text-[11.5px] font-medium text-muted-foreground">
                Source
              </th>
              <th className="px-3.5 py-2 text-left text-[11.5px] font-medium text-muted-foreground">
                Match
              </th>
              <th className="px-3.5 py-2 text-right text-[11.5px] font-medium text-muted-foreground">
                Last run
              </th>
              <th className="px-3.5 py-2 text-right text-[11.5px] font-medium text-muted-foreground">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {screens.map((screen) => {
              const isEditing = editingId === screen.id;
              const summary = describeScreen(screen.rules, screen.match);
              return (
                <tr
                  key={screen.id}
                  className="group border-b border-border transition-colors last:border-b-0 hover:bg-accent/40"
                >
                  <td className="max-w-md px-3.5 py-3">
                    {isEditing ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRename(screen.id, editingName);
                        }}
                      >
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditingName("");
                            }
                          }}
                        />
                        <Button type="submit" size="sm" variant="outline" className="h-7 px-2">
                          Save
                        </Button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpen(screen.id)}
                        className="block w-full cursor-pointer text-left"
                      >
                        <span className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                          {screen.name}
                        </span>
                        <span
                          className="block truncate text-xs text-subtle-foreground"
                          title={summary}
                        >
                          {summary}
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <Chip>{describeSource(screen.source, watchlists, portfolios)}</Chip>
                  </td>
                  <td className="px-3.5 py-3">
                    <Chip>{screen.match === "all" ? "All" : "Any"}</Chip>
                  </td>
                  <td className="px-3.5 py-3 text-right">
                    <span className="block text-xs text-muted-foreground">
                      {formatLastRun(screen.lastRunAt)}
                    </span>
                    {screen.lastRunAt && screen.lastMatchCount != null && (
                      <span className="block font-mono text-xs text-subtle-foreground">
                        {screen.lastMatchCount} of {screen.lastTotalScanned ?? 0} matched
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={`Run ${screen.name}`}
                        title="Run"
                        className="rounded p-1 text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => onRun(screen.id)}
                      >
                        <Play className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Duplicate ${screen.name}`}
                        title="Duplicate"
                        disabled={busyId === screen.id}
                        className="rounded p-1 text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        onClick={() => handleDuplicate(screen)}
                      >
                        <Copy className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Rename ${screen.name}`}
                        title="Rename"
                        className="rounded p-1 text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => {
                          setEditingId(screen.id);
                          setEditingName(screen.name);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${screen.name}`}
                        title="Delete"
                        className="rounded p-1 text-subtle-foreground transition-colors hover:bg-negative/10 hover:text-negative"
                        onClick={() => handleDelete(screen)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/**
 * First-run state: name a screen, or take a preset's rules as a starting
 * point. Presets are the fastest way to a screen that actually does something.
 */
function EmptyScreens({ onCreated }: { onCreated: (screen: ScreenDTO) => void }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [customPresets, setCustomPresets] = useState<CustomPresetDTO[]>([]);

  useEffect(() => {
    fetchPresets()
      .then(setCustomPresets)
      .catch(() => {
        // silent
      });
  }, []);

  const create = async (data: Parameters<typeof createScreen>[0]) => {
    if (creating) return;
    setCreating(true);
    try {
      onCreated(await createScreen(data));
      setName("");
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create({ name: trimmed });
  };

  const startFromPreset = (preset: ScreenPreset | CustomPresetDTO) => {
    create({ name: preset.name, rules: preset.rules, match: preset.match });
  };

  const presets: (ScreenPreset | CustomPresetDTO)[] = [...SCREEN_PRESETS, ...customPresets];

  return (
    <div className="rounded-lg border border-border bg-card p-12">
      <div className="mx-auto max-w-md text-center">
        <h3 className="mb-1 text-lg font-semibold text-foreground">No screens yet</h3>
        <p className="mb-5 text-muted-foreground">
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

        <p className="mt-8 mb-3 text-xs font-medium text-muted-foreground">
          Or start from a preset
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {presets.map((preset, i) => (
            <button
              key={`${preset.name}-${i}`}
              type="button"
              disabled={creating}
              onClick={() => startFromPreset(preset)}
              className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
