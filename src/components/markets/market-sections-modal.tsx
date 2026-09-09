"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PanelTabs } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import {
  Category,
  CATEGORIES,
  CATEGORY_LABELS,
  CurrencyItem,
  DEFAULT_SECTIONS,
  isPairSelection,
  MarketSections,
} from "@/lib/markets/symbols";
import {
  CatalogEntry,
  CurrencyPair,
  GROUP_ORDER,
  SECTION_CAP,
  pairEntry,
  pairGroup,
} from "@/lib/markets/catalog";

interface CatalogPayload {
  markets: CatalogEntry[];
  commodities: CatalogEntry[];
  currency: CurrencyPair[];
  currencyFixed: CatalogEntry[];
  crypto: CatalogEntry[];
}

interface MarketSectionsModalProps {
  open: boolean;
  initialTab: Category;
  sections: MarketSections;
  onClose: () => void;
  onSave: (sections: MarketSections) => Promise<void> | void;
}

/** Same pair in either direction is the same row. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("");
}

function currencyKey(item: CurrencyItem): string {
  return isPairSelection(item) ? pairKey(item.base, item.quote) : item.symbol;
}

function groupsFor(category: Category, entries: { group: string }[]): string[] {
  const present = new Set(entries.map((e) => e.group));
  const ordered = (GROUP_ORDER[category] ?? []).filter((g) => present.has(g));
  const extra = [...present].filter((g) => !ordered.includes(g)).sort();
  return [...ordered, ...extra];
}

/**
 * Picks the rows for all four Markets sections. One modal with four tabs
 * rather than four modals: the sections are read side by side on the page, and
 * their lengths are chosen against each other.
 */
export function MarketSectionsModal({
  open,
  initialTab,
  sections,
  onClose,
  onSave,
}: MarketSectionsModalProps) {
  const [tab, setTab] = useState<Category>(initialTab);
  const [draft, setDraft] = useState<MarketSections>(sections);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening starts from what is on the page, discarding an abandoned draft.
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setDraft(sections);
    setError(null);
  }, [open, initialTab, sections]);

  useEffect(() => {
    if (!open || catalog) return;
    let cancelled = false;
    fetch("/api/settings/markets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((data) => {
        if (!cancelled) setCatalog(data.catalog as CatalogPayload);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the list of instruments.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalog]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(sections),
    [draft, sections]
  );

  const counts = useMemo(
    () =>
      ({
        markets: draft.markets.length,
        commodities: draft.commodities.length,
        currency: draft.currency.length,
        crypto: draft.crypto.length,
      }) as Record<Category, number>,
    [draft]
  );

  /**
   * Rows read in catalog order rather than the order they were ticked, so a
   * section stays grouped — every metal together, then energy — however it was
   * assembled. This is also why there is no reordering control.
   */
  const sortByCatalog = useCallback(
    <T,>(items: T[], keyOf: (item: T) => string, order: string[]): T[] =>
      [...items].sort((a, b) => order.indexOf(keyOf(a)) - order.indexOf(keyOf(b))),
    []
  );

  const toggleSymbol = useCallback(
    (category: Exclude<Category, "currency">, symbol: string) => {
      setDraft((prev) => {
        const list = prev[category];
        if (list.includes(symbol)) {
          return { ...prev, [category]: list.filter((s) => s !== symbol) };
        }
        if (list.length >= SECTION_CAP) return prev;
        const order = (catalog?.[category] ?? []).map((e) => e.symbol);
        return { ...prev, [category]: sortByCatalog([...list, symbol], (s) => s, order) };
      });
    },
    [catalog, sortByCatalog]
  );

  const toggleCurrency = useCallback(
    (item: CurrencyItem) => {
      setDraft((prev) => {
        const key = currencyKey(item);
        if (prev.currency.some((c) => currencyKey(c) === key)) {
          return { ...prev, currency: prev.currency.filter((c) => currencyKey(c) !== key) };
        }
        if (prev.currency.length >= SECTION_CAP) return prev;
        const order = [
          ...(catalog?.currency ?? []).map((p) => pairKey(p.base, p.quote)),
          ...(catalog?.currencyFixed ?? []).map((e) => e.symbol),
        ];
        return {
          ...prev,
          currency: sortByCatalog([...prev.currency, item], currencyKey, order),
        };
      });
    },
    [catalog, sortByCatalog]
  );

  /** Orientation of pairs the user has flipped but not selected. */
  const [orientations, setOrientations] = useState<Record<string, { base: string; quote: string }>>({});

  useEffect(() => {
    if (!open) setOrientations({});
  }, [open]);

  /**
   * Flipping is independent of selection, so a row shows its orientation
   * whether or not it is on the page yet.
   */
  const flipPair = useCallback((base: string, quote: string) => {
    setOrientations((prev) => ({ ...prev, [pairKey(base, quote)]: { base: quote, quote: base } }));
    setDraft((prev) => ({
      ...prev,
      currency: prev.currency.map((c) =>
        isPairSelection(c) && pairKey(c.base, c.quote) === pairKey(base, quote)
          ? { base: quote, quote: base }
          : c
      ),
    }));
  }, []);

  const orientationOf = useCallback(
    (pair: CurrencyPair) => {
      const key = pairKey(pair.base, pair.quote);
      const selected = draft.currency.find(
        (c) => isPairSelection(c) && pairKey(c.base, c.quote) === key
      );
      if (selected && isPairSelection(selected)) return { base: selected.base, quote: selected.quote };
      return orientations[key] ?? { base: pair.base, quote: pair.quote };
    },
    [draft.currency, orientations]
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/markets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("Save failed");
      const data = await response.json();
      await onSave(data.sections as MarketSections);
      onClose();
    } catch {
      setError("Could not save. Your choices are still here; try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const atCap = counts[tab] >= SECTION_CAP;

  const tabs = CATEGORIES.map((category) => ({
    key: category,
    label: `${CATEGORY_LABELS[category]} ${counts[category]}/${SECTION_CAP}`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Markets rows"
      subtitle="Up to 8 per section. Sections sit side by side, so similar lengths keep the page even."
      maxWidth="max-w-2xl"
      center
    >
      <PanelTabs tabs={tabs} activeTab={tab} onTabChange={setTab} className="border-b border-border" />

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {counts[tab]} of {SECTION_CAP} selected
          {atCap ? " — remove one to add another" : ""}
        </span>
      </div>

      <div className="mt-2 max-h-[55vh] overflow-y-auto pr-1">
        {!catalog ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading instruments…
          </div>
        ) : tab === "currency" ? (
          <CurrencyTab
            pairs={catalog.currency}
            fixed={catalog.currencyFixed}
            selected={draft.currency}
            atCap={atCap}
            orientationOf={orientationOf}
            onToggle={toggleCurrency}
            onFlip={flipPair}
          />
        ) : (
          <SymbolTab
            category={tab}
            entries={catalog[tab]}
            selected={draft[tab]}
            atCap={atCap}
            onToggle={(symbol) => toggleSymbol(tab, symbol)}
          />
        )}
      </div>

      {error && <p className="mt-3 text-xs text-negative">{error}</p>}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_SECTIONS)}>
          Reset to defaults
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const groupHeading = "px-1 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground";
const rowClass =
  "flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-accent has-[:disabled]:opacity-50 has-[:disabled]:hover:bg-transparent";

function SymbolTab({
  category,
  entries,
  selected,
  atCap,
  onToggle,
}: {
  category: Category;
  entries: CatalogEntry[];
  selected: string[];
  atCap: boolean;
  onToggle: (symbol: string) => void;
}) {
  return (
    <div>
      {groupsFor(category, entries).map((group) => (
        <div key={group}>
          <p className={groupHeading}>{group}</p>
          {entries
            .filter((entry) => entry.group === group)
            .map((entry) => {
              const checked = selected.includes(entry.symbol);
              return (
                <label key={entry.symbol} className={rowClass}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atCap}
                    onChange={() => onToggle(entry.symbol)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">{entry.name}</span>
                    <span className="block text-xs text-muted-foreground">{entry.description}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-subtle-foreground">
                    {entry.symbol}
                  </span>
                </label>
              );
            })}
        </div>
      ))}
    </div>
  );
}

function CurrencyTab({
  pairs,
  fixed,
  selected,
  atCap,
  orientationOf,
  onToggle,
  onFlip,
}: {
  pairs: CurrencyPair[];
  fixed: CatalogEntry[];
  selected: CurrencyItem[];
  atCap: boolean;
  orientationOf: (pair: CurrencyPair) => { base: string; quote: string };
  onToggle: (item: CurrencyItem) => void;
  onFlip: (base: string, quote: string) => void;
}) {
  const selectedKeys = new Set(selected.map(currencyKey));
  const groups = groupsFor("currency", [...pairs, ...fixed]);

  return (
    <div>
      {groups.map((group) => (
        <div key={group}>
          <p className={groupHeading}>{group}</p>
          {pairs
            .filter((pair) => pair.group === group)
            .map((pair) => {
              const { base, quote } = orientationOf(pair);
              const entry = pairEntry(base, quote, pairGroup(base, quote));
              const checked = selectedKeys.has(pairKey(base, quote));
              return (
                <div key={pairKey(pair.base, pair.quote)} className={rowClass}>
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && atCap}
                      onChange={() => onToggle({ base, quote })}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-foreground">{entry.name}</span>
                      <span className="block text-xs text-muted-foreground">{entry.description}</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onFlip(base, quote)}
                    aria-label={`Show as ${quote}/${base}`}
                    title={`Show as ${quote}/${base}`}
                    className="shrink-0 rounded p-1 text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeftRight className="size-3.5" />
                  </button>
                  <span className="w-24 shrink-0 text-right font-mono text-[11px] text-subtle-foreground">
                    {entry.symbol}
                  </span>
                </div>
              );
            })}
          {fixed
            .filter((entry) => entry.group === group)
            .map((entry) => {
              const checked = selectedKeys.has(entry.symbol);
              return (
                <label key={entry.symbol} className={rowClass}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atCap}
                    onChange={() => onToggle({ symbol: entry.symbol })}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">{entry.name}</span>
                    <span className="block text-xs text-muted-foreground">{entry.description}</span>
                  </span>
                  <span className="w-24 shrink-0 text-right font-mono text-[11px] text-subtle-foreground">
                    {entry.symbol}
                  </span>
                </label>
              );
            })}
        </div>
      ))}
    </div>
  );
}
