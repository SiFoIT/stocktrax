"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Briefcase, ChartLine, ChevronDown, Eye, ListFilter } from "lucide-react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { NavDropdown } from "@/components/layout/nav-dropdown";
import { Portfolio, Watchlist } from "@/lib/db/schema";
import { createScreen, deleteScreen, updateScreen, type ScreenDTO } from "@/lib/screener/api";
import { createPortfolio } from "@/lib/portfolios/api";
import { getDefaultTab, type DefaultTab } from "@/components/settings/general-settings-modal";

export type Tab = "general" | "watchlist" | "portfolios" | "screens";

interface AppHeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedWatchlistId: number | null;
  /** null when the selected watchlist was deleted and none is left. */
  onSelectWatchlist: (id: number | null) => void;
  selectedPortfolioId: number | null;
  onSelectPortfolio: (id: number) => void;
  selectedScreenId: number | null;
  /** null selects the screens index rather than a screen. */
  onSelectScreen: (id: number | null) => void;
  /**
   * The dashboard owns the screens list so the index and this dropdown stay
   * in step. Omitted on sub-pages, where the header fetches its own copy.
   */
  screens?: ScreenDTO[];
  onScreensChange?: (next: ScreenDTO[]) => void;
  /** Called after a portfolio is renamed or deleted, so the page can refetch. */
  onPortfoliosChange?: () => void;
  onOpenAlerts?: () => void;
  alertCount?: number;
  hasTriggeredAlerts?: boolean;
}

/**
 * The whole application chrome in one 52px row: wordmark, tabs (three of which
 * carry a list dropdown) and the action buttons. On phones the tabs move to a
 * fixed bottom bar and the header keeps just the wordmark and actions.
 */
export function AppHeader({
  activeTab,
  onTabChange,
  selectedWatchlistId,
  onSelectWatchlist,
  selectedPortfolioId,
  onSelectPortfolio,
  selectedScreenId,
  onSelectScreen,
  screens: screensProp,
  onScreensChange,
  onPortfoliosChange,
  onOpenAlerts,
  alertCount = 0,
  hasTriggeredAlerts = false,
}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSubPage = pathname !== "/";

  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [ownScreens, setOwnScreens] = useState<ScreenDTO[]>([]);
  // The prop is the source of truth when the page supplies one; otherwise
  // this header keeps its own copy.
  const screensLifted = screensProp !== undefined;
  const screens = screensProp ?? ownScreens;
  const setScreens = (next: ScreenDTO[]) => {
    if (onScreensChange) onScreensChange(next);
    else setOwnScreens(next);
  };

  const [openDropdown, setOpenDropdownState] = useState<Tab | null>(null);
  // A failed rename/delete, shown in the dropdown it came from.
  const [navError, setNavError] = useState<{ tab: Tab; message: string } | null>(null);
  const setOpenDropdown = (tab: Tab | null) => {
    setNavError(null);
    setOpenDropdownState(tab);
  };
  const navRef = useRef<HTMLElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [newScreenName, setNewScreenName] = useState("");
  const [creatingScreen, setCreatingScreen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [watchlistsRes, portfoliosRes] = await Promise.all([
          fetch("/api/watchlists"),
          fetch("/api/portfolios"),
        ]);
        setWatchlists(await watchlistsRes.json());
        setPortfolios(await portfoliosRes.json());
      } catch {
        // silently handle fetch error
      }
    };
    fetchData();
  }, []);

  // Only fetch screens when the page has not lifted the list.
  useEffect(() => {
    if (screensLifted) return;
    fetch("/api/screens")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setOwnScreens(data);
      })
      .catch(() => {});
  }, [screensLifted]);

  // A screen can be created from the page body (the empty state), so refetch
  // the list when the selection points at an id this header has not seen.
  // Refetch at most once per id, or a deleted id would loop forever.
  const refetchedScreenId = useRef<number | null>(null);
  useEffect(() => {
    if (screensLifted) return;
    if (selectedScreenId == null || refetchedScreenId.current === selectedScreenId) return;
    if (screens.some((s) => s.id === selectedScreenId)) return;
    refetchedScreenId.current = selectedScreenId;
    fetch("/api/screens")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setOwnScreens(data);
      })
      .catch(() => {});
  }, [selectedScreenId, screens, screensLifted]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // The desktop tabs and the phone bottom bar each host the dropdowns; a
      // press inside either one is not "outside".
      const target = e.target as Node;
      if (navRef.current?.contains(target) || mobileNavRef.current?.contains(target)) return;
      setOpenDropdown(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /** The server's error message for a failed response, or a fallback. */
  const failureMessage = async (res: Response, fallback: string) => {
    try {
      const body = await res.json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // Not JSON: use the fallback.
    }
    return fallback;
  };

  // Watchlist handlers
  const handleCreateWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWatchlistName.trim()) return;

    setCreatingWatchlist(true);
    try {
      const response = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWatchlistName }),
      });

      if (response.ok) {
        const newWatchlist = await response.json();
        setNewWatchlistName("");
        setWatchlists((prev) => [...prev, newWatchlist]);
        if (isSubPage) {
          sessionStorage.setItem("selectedWatchlistId", newWatchlist.id.toString());
          window.location.href = "/?tab=watchlist";
        } else {
          onSelectWatchlist(newWatchlist.id);
          onTabChange("watchlist");
        }
        setOpenDropdown(null);
      }
    } catch {
      // silently handle fetch error
    } finally {
      setCreatingWatchlist(false);
    }
  };

  const handleDeleteWatchlist = async (id: number) => {
    if (!confirm("Are you sure you want to delete this watchlist?")) return;

    try {
      const res = await fetch(`/api/watchlists?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        setNavError({ tab: "watchlist", message: await failureMessage(res, "Could not delete the watchlist") });
        return;
      }
      setWatchlists((prev) => prev.filter((w) => w.id !== id));
      if (selectedWatchlistId === id) {
        // The last list going leaves nothing selected rather than a dead id.
        const remaining = watchlists.filter((w) => w.id !== id);
        onSelectWatchlist(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch {
      setNavError({ tab: "watchlist", message: "Could not delete the watchlist" });
    }
  };

  const handleRenameWatchlist = async (id: number, name: string) => {
    if (!name.trim()) return;

    try {
      const res = await fetch(`/api/watchlists?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setNavError({ tab: "watchlist", message: await failureMessage(res, "Could not rename the watchlist") });
        return;
      }
      setWatchlists((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
    } catch {
      setNavError({ tab: "watchlist", message: "Could not rename the watchlist" });
    }
  };

  // Portfolio handlers
  /**
   * A new portfolio opens, the same as picking one from this list: it is
   * empty, so what comes next is its transaction form, not a zero row on the
   * dashboard. The destination mounts its own header and refetches the list;
   * the append below only covers a header that survives the navigation.
   */
  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;

    setCreatingPortfolio(true);
    try {
      const newPortfolio = await createPortfolio(newPortfolioName);
      setNewPortfolioName("");
      setPortfolios((prev) => [...prev, newPortfolio]);
      setOpenDropdown(null);
      router.push(`/portfolio/${newPortfolio.id}`);
    } catch {
      // silently handle fetch error
    } finally {
      setCreatingPortfolio(false);
    }
  };

  const handleDeletePortfolio = async (id: number) => {
    if (!confirm("Are you sure you want to delete this portfolio?")) return;

    try {
      const res = await fetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        setNavError({ tab: "portfolios", message: await failureMessage(res, "Could not delete the portfolio") });
        return;
      }
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
      onPortfoliosChange?.();
      if (selectedPortfolioId === id) {
        const remaining = portfolios.filter((p) => p.id !== id);
        if (remaining.length > 0) {
          onSelectPortfolio(remaining[0].id);
        }
      }
      // If on a portfolio page that was deleted, go home
      if (isSubPage && pathname === `/portfolio/${id}`) {
        window.location.href = "/?tab=portfolios";
      }
    } catch {
      setNavError({ tab: "portfolios", message: "Could not delete the portfolio" });
    }
  };

  const handleRenamePortfolio = async (id: number, name: string) => {
    if (!name.trim()) return;

    try {
      const res = await fetch(`/api/portfolios?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setNavError({ tab: "portfolios", message: await failureMessage(res, "Could not rename the portfolio") });
        return;
      }
      setPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
      onPortfoliosChange?.();
    } catch {
      setNavError({ tab: "portfolios", message: "Could not rename the portfolio" });
    }
  };

  // Screen handlers
  const handleCreateScreen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScreenName.trim()) return;

    setCreatingScreen(true);
    try {
      const newScreen = await createScreen({ name: newScreenName.trim() });
      setNewScreenName("");
      setScreens([...screens, newScreen]);
      if (isSubPage) {
        sessionStorage.setItem("selectedScreenId", newScreen.id.toString());
        window.location.href = "/?tab=screens";
      } else {
        onSelectScreen(newScreen.id);
        onTabChange("screens");
      }
      setOpenDropdown(null);
    } catch {
      // silently handle fetch error
    } finally {
      setCreatingScreen(false);
    }
  };

  const handleDeleteScreen = async (id: number) => {
    if (!confirm("Are you sure you want to delete this screen?")) return;

    try {
      await deleteScreen(id);
      setScreens(screens.filter((s) => s.id !== id));
      // Deleting the open screen returns to the index rather than jumping
      // into an unrelated screen.
      if (selectedScreenId === id) onSelectScreen(null);
    } catch {
      setNavError({ tab: "screens", message: "Could not delete the screen" });
    }
  };

  const handleRenameScreen = async (id: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await updateScreen(id, { name: trimmed });
      setScreens(screens.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
    } catch {
      setNavError({ tab: "screens", message: "Could not rename the screen" });
    }
  };

  // Selection
  const handleSelectWatchlistItem = (id: number) => {
    if (isSubPage) {
      sessionStorage.setItem("selectedWatchlistId", id.toString());
      window.location.href = "/?tab=watchlist";
    } else {
      onSelectWatchlist(id);
      onTabChange("watchlist");
    }
    setOpenDropdown(null);
  };

  const handleSelectPortfolioItem = (id: number) => {
    router.push(`/portfolio/${id}`);
    setOpenDropdown(null);
  };

  const handleSelectScreenItem = (id: number) => {
    if (isSubPage) {
      sessionStorage.setItem("selectedScreenId", id.toString());
      window.location.href = "/?tab=screens";
    } else {
      onSelectScreen(id);
      onTabChange("screens");
    }
    setOpenDropdown(null);
  };

  const handleTabClick = (tab: Tab) => {
    if (isSubPage) {
      // Use URL params for reliable navigation
      window.location.href = `/?tab=${tab}`;
    } else {
      // The Screens tab is the index of saved screens, so clicking it always
      // leaves whichever screen is open.
      if (tab === "screens") onSelectScreen(null);
      onTabChange(tab);
    }
    setOpenDropdown(null);
  };

  /** The list dropdown for a tab; `above` opens it as a sheet over the phone bottom bar. */
  const dropdownFor = (tab: "watchlist" | "portfolios" | "screens", placement: "below" | "above" = "below") => {
    switch (tab) {
      case "watchlist":
        return (
      <NavDropdown
        placement={placement}
        items={watchlists}
        selectedId={selectedWatchlistId}
        emptyLabel="No watchlists yet"
        createPlaceholder="New watchlist name"
        creating={creatingWatchlist}
        newName={newWatchlistName}
        onNewNameChange={setNewWatchlistName}
        onCreate={handleCreateWatchlist}
        onSelect={handleSelectWatchlistItem}
        onRename={handleRenameWatchlist}
        onDelete={handleDeleteWatchlist}
        error={navError?.tab === "watchlist" ? navError.message : null}
      />
        );
      case "portfolios":
        return (
      <NavDropdown
        placement={placement}
        items={portfolios}
        selectedId={selectedPortfolioId}
        emptyLabel="No portfolios yet"
        createPlaceholder="New portfolio name"
        creating={creatingPortfolio}
        newName={newPortfolioName}
        onNewNameChange={setNewPortfolioName}
        onCreate={handleCreatePortfolio}
        onSelect={handleSelectPortfolioItem}
        onRename={handleRenamePortfolio}
        onDelete={handleDeletePortfolio}
        error={navError?.tab === "portfolios" ? navError.message : null}
        width="w-80"
      />
        );
      case "screens":
        return (
      <NavDropdown
        placement={placement}
        items={screens}
        selectedId={selectedScreenId}
        emptyLabel="No screens yet"
        createPlaceholder="New screen name"
        creating={creatingScreen}
        newName={newScreenName}
        onNewNameChange={setNewScreenName}
        onCreate={handleCreateScreen}
        onSelect={handleSelectScreenItem}
        onRename={handleRenameScreen}
        onDelete={handleDeleteScreen}
        error={navError?.tab === "screens" ? navError.message : null}
      />
        );
    }
  };

  // Phone bottom bar: a tap switches section; tapping the section you're
  // already on opens its list, since there's no room for a separate chevron.
  const handleMobileTabClick = (tab: Tab) => {
    if (tab !== "general" && activeTab === tab) {
      setOpenDropdown(openDropdown === tab ? null : tab);
      return;
    }
    handleTabClick(tab);
  };

  const mobileTabs: { tab: Tab; label: string; icon: typeof Bell }[] = [
    { tab: "general", label: "Markets", icon: ChartLine },
    { tab: "watchlist", label: "Watchlists", icon: Eye },
    { tab: "portfolios", label: "Portfolios", icon: Briefcase },
    { tab: "screens", label: "Screens", icon: ListFilter },
  ];

  const tabClass =
    "flex h-11 items-center border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex min-h-[52px] max-w-[1536px] flex-wrap items-center gap-x-7 gap-y-1 px-6 max-sm:min-h-0 max-sm:gap-y-0 max-sm:px-4 max-sm:pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={() => handleTabClick("general")}
          aria-label="StockTrax home"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground max-sm:h-12"
        >
          <span className="size-2 rounded-[2px] bg-primary" />
          StockTrax
        </button>

        <nav ref={navRef} className="-mb-px flex flex-wrap gap-0.5 max-sm:hidden" aria-label="Sections">
          <button type="button" onClick={() => handleTabClick("general")} data-active={activeTab === "general"} className={`${tabClass} shrink-0 px-3`}>
            Markets
          </button>

          <div className="relative shrink-0">
            <div data-active={activeTab === "watchlist"} className={`${tabClass} pl-3`}>
              <button type="button" onClick={() => handleTabClick("watchlist")} className="h-full">
                Watchlists
              </button>
              <button
                type="button"
                aria-label="Choose watchlist"
                onClick={() => setOpenDropdown(openDropdown === "watchlist" ? null : "watchlist")}
                className="flex h-full items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={`size-3.5 transition-transform ${openDropdown === "watchlist" ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openDropdown === "watchlist" && dropdownFor("watchlist")}
          </div>

          <div className="relative shrink-0">
            <div data-active={activeTab === "portfolios"} className={`${tabClass} pl-3`}>
              <button type="button" onClick={() => handleTabClick("portfolios")} className="h-full">
                Portfolios
              </button>
              <button
                type="button"
                aria-label="Choose portfolio"
                onClick={() => setOpenDropdown(openDropdown === "portfolios" ? null : "portfolios")}
                className="flex h-full items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={`size-3.5 transition-transform ${openDropdown === "portfolios" ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openDropdown === "portfolios" && dropdownFor("portfolios")}
          </div>

          <div className="relative shrink-0">
            <div data-active={activeTab === "screens"} className={`${tabClass} pl-3`}>
              <button type="button" onClick={() => handleTabClick("screens")} className="h-full">
                Screens
              </button>
              <button
                type="button"
                aria-label="Choose screen"
                onClick={() => setOpenDropdown(openDropdown === "screens" ? null : "screens")}
                className="flex h-full items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={`size-3.5 transition-transform ${openDropdown === "screens" ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openDropdown === "screens" && dropdownFor("screens")}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {onOpenAlerts && (
            <button
              type="button"
              onClick={onOpenAlerts}
              aria-label="Alerts"
              className={`relative flex size-8 touch:size-10 items-center justify-center rounded-md transition-colors ${
                hasTriggeredAlerts
                  ? "text-negative hover:bg-negative/10"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Bell
                className={`size-4 ${hasTriggeredAlerts ? "animate-[bell-ring_2s_ease-in-out_infinite] origin-top" : ""}`}
              />
              {alertCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-warning px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {alertCount}
                </span>
              )}
            </button>
          )}
          <SettingsMenu />
        </div>
      </div>

      <nav
        ref={mobileNavRef}
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {openDropdown && openDropdown !== "general" && (
          <div className="relative mx-4">{dropdownFor(openDropdown, "above")}</div>
        )}
        <div className="grid h-14 grid-cols-4">
          {mobileTabs.map(({ tab, label, icon: Icon }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleMobileTabClick(tab)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="flex items-center gap-0.5">
                  <Icon className="size-5" />
                  {tab !== "general" && active && (
                    <ChevronDown className={`size-3 transition-transform ${openDropdown === tab ? "" : "rotate-180"}`} />
                  )}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

// Helper to get initial tab from sessionStorage or default
export function getInitialTab(): DefaultTab {
  if (typeof window === "undefined") return "general";

  const tabFromStorage = sessionStorage.getItem("navigateToTab") as DefaultTab | null;
  if (tabFromStorage && ["general", "watchlist", "portfolios", "screens"].includes(tabFromStorage)) {
    sessionStorage.removeItem("navigateToTab");
    return tabFromStorage;
  }
  return getDefaultTab();
}

// Helper to get initial watchlist ID from sessionStorage
export function getInitialWatchlistId(): number | null {
  if (typeof window === "undefined") return null;

  const idFromStorage = sessionStorage.getItem("selectedWatchlistId");
  if (idFromStorage) {
    sessionStorage.removeItem("selectedWatchlistId");
    return parseInt(idFromStorage);
  }
  return null;
}

// Helper to get initial screen ID from sessionStorage
export function getInitialScreenId(): number | null {
  if (typeof window === "undefined") return null;

  const idFromStorage = sessionStorage.getItem("selectedScreenId");
  if (idFromStorage) {
    sessionStorage.removeItem("selectedScreenId");
    return parseInt(idFromStorage);
  }
  return null;
}
