"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BenchmarkOption {
  symbol: string;
  label: string;
  description?: string;
  preset: boolean;
}

interface Suggestion {
  symbol: string;
  name: string;
  type?: string;
  exchange?: string;
}

/**
 * Choose what the performance chart compares against: the presets, plus any
 * ticker found with the same search the watchlists use. Saved on the server,
 * so the choice follows the user between devices.
 */
export function BenchmarkPicker({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [presets, setPresets] = useState<BenchmarkOption[]>([]);
  const [selected, setSelected] = useState<BenchmarkOption[]>([]);
  const [max, setMax] = useState(6);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    fetch("/api/settings/benchmarks")
      .then((r) => r.json())
      .then((d: { selected: BenchmarkOption[]; presets: BenchmarkOption[]; max: number }) => {
        setSelected(d.selected);
        setPresets(d.presets);
        setMax(d.max);
      })
      .catch(() => setError("Couldn't load benchmarks"));
  }, []);

  // Debounced search; a slower, older response never overwrites a newer one.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data: Suggestion[] = res.ok ? await res.json() : [];
        if (seq === searchSeq.current) setSuggestions(data);
      } catch {
        if (seq === searchSeq.current) setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const isSelected = (symbol: string) => selected.some((s) => s.symbol === symbol);
  const full = selected.length >= max;

  const toggle = (option: BenchmarkOption) => {
    setError(null);
    if (isSelected(option.symbol)) {
      setSelected((prev) => prev.filter((s) => s.symbol !== option.symbol));
    } else if (!full) {
      setSelected((prev) => [...prev, option]);
    }
  };

  const addCustom = (s: Suggestion) => {
    const symbol = s.symbol.toUpperCase();
    const preset = presets.find((p) => p.symbol === symbol);
    toggle(preset ?? { symbol, label: symbol.replace(/\.(TO|V|NE|CN)$/i, ""), description: s.name, preset: false });
    setQuery("");
    setSuggestions([]);
  };

  const save = async () => {
    if (selected.length === 0) {
      setError("Choose at least one benchmark");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/benchmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: selected.map((s) => s.symbol) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const custom = selected.filter((s) => !presets.some((p) => p.symbol === s.symbol));

  return (
    <Modal
      onClose={onClose}
      title="Benchmarks"
      subtitle={`Compare against up to ${max}. Each receives your deposits on the same days, dividends reinvested.`}
      maxWidth="max-w-lg"
      center
    >
      <div className="space-y-5 p-4">
        <section>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">Presets</h4>
          <ul className="divide-y divide-border rounded-md border border-border">
            {presets.map((p) => {
              const on = isSelected(p.symbol);
              return (
                <li key={p.symbol}>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    disabled={!on && full}
                    aria-pressed={on}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{p.label}</span>
                      <span className="ml-2 font-mono text-xs text-subtle-foreground">{p.symbol}</span>
                      {p.description && (
                        <span className="block truncate text-xs text-muted-foreground">{p.description}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">Any other symbol</h4>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={full ? `Remove one to add another (max ${max})` : "Search ticker or fund, e.g. VGRO"}
              disabled={full}
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-subtle-foreground focus:border-border-strong focus:outline-none disabled:opacity-50"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover py-1">
                {suggestions.map((s) => (
                  <li key={s.symbol}>
                    <button
                      type="button"
                      onClick={() => addCustom(s)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Plus className="size-3.5 shrink-0 text-subtle-foreground" />
                      <span className="font-mono text-foreground">{s.symbol}</span>
                      <span className="truncate text-xs text-muted-foreground">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {custom.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {custom.map((c) => (
                <li
                  key={c.symbol}
                  className="inline-flex items-center gap-1 rounded-md bg-muted py-0.5 pl-2 pr-1 text-xs text-muted-foreground"
                >
                  <span className="font-mono text-foreground">{c.symbol}</span>
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    aria-label={`Remove ${c.symbol}`}
                    className="rounded p-0.5 hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-subtle-foreground">
            Prefer funds over indexes: an index level leaves out dividends. US-listed symbols are converted to CAD
            at each day&apos;s rate.
          </p>
        </section>

        {error && <p className="text-sm text-negative">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || selected.length === 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
