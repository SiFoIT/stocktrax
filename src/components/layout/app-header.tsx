"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { NavDropdown } from "@/components/layout/nav-dropdown";
import { Portfolio, Watchlist, Screen } from "@/lib/db/schema";
import { getDefaultTab, type DefaultTab } from "@/components/settings/general-settings-modal";

export type Tab = "general" | "watchlist" | "portfolios" | "screens";

interface AppHeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedWatchlistId: number | null;
  onSelectWatchlist: (id: number) => void;
  selectedPortfolioId: number | null;
  onSelectPortfolio: (id: number) => void;
  selectedScreenId: number | null;
  onSelectScreen: (id: number) => void;
  onOpenAlerts?: () => void;
  alertCount?: number;
  hasTriggeredAlerts?: boolean;
}

/**
 * The whole application chrome in one 52px row: wordmark, tabs (three of which
 * carry a list dropdown) and the action buttons. Below `md` the tabs wrap to a
 * second, horizontally scrollable row.
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
  onOpenAlerts,
  alertCount = 0,
  hasTriggeredAlerts = false,
}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSubPage = pathname !== "/";

  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);

  const [openDropdown, setOpenDropdown] = useState<Tab | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [newScreenName, setNewScreenName] = useState("");
  const [creatingScreen, setCreatingScreen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [watchlistsRes, portfoliosRes, screensRes] = await Promise.all([
          fetch("/api/watchlists"),
          fetch("/api/portfolios"),
          fetch("/api/screens"),
        ]);
        setWatchlists(await watchlistsRes.json());
        setPortfolios(await portfoliosRes.json());
        setScreens(await screensRes.json());
      } catch {
        // silently handle fetch error
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      await fetch(`/api/watchlists?id=${id}`, { method: "DELETE" });
      setWatchlists((prev) => prev.filter((w) => w.id !== id));
      if (selectedWatchlistId === id) {
        const remaining = watchlists.filter((w) => w.id !== id);
        if (remaining.length > 0) {
          onSelectWatchlist(remaining[0].id);
        }
      }
    } catch {
      // silently handle fetch error
    }
  };

  const handleRenameWatchlist = async (id: number, name: string) => {
    if (!name.trim()) return;

    try {
      await fetch(`/api/watchlists?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setWatchlists((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
    } catch {
      // silently handle fetch error
    }
  };

  // Portfolio handlers
  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortfolioName.trim()) return;

    setCreatingPortfolio(true);
    try {
      const response = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPortfolioName }),
      });

      if (response.ok) {
        const newPortfolio = await response.json();
        setNewPortfolioName("");
        setPortfolios((prev) => [...prev, newPortfolio]);
        if (isSubPage) {
          router.push(`/portfolio/${newPortfolio.id}`);
        } else {
          onSelectPortfolio(newPortfolio.id);
          onTabChange("portfolios");
        }
        setOpenDropdown(null);
      }
    } catch {
      // silently handle fetch error
    } finally {
      setCreatingPortfolio(false);
    }
  };

  const handleDeletePortfolio = async (id: number) => {
    if (!confirm("Are you sure you want to delete this portfolio?")) return;

    try {
      await fetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
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
      // silently handle fetch error
    }
  };

  const handleRenamePortfolio = async (id: number, name: string) => {
    if (!name.trim()) return;

    try {
      await fetch(`/api/portfolios?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    } catch {
      // silently handle fetch error
    }
  };

  // Screen handlers
  const handleCreateScreen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScreenName.trim()) return;

    setCreatingScreen(true);
    try {
      const response = await fetch("/api/screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newScreenName }),
      });

      if (response.ok) {
        const newScreen = await response.json();
        setNewScreenName("");
        setScreens((prev) => [...prev, newScreen]);
        if (isSubPage) {
          sessionStorage.setItem("selectedScreenId", newScreen.id.toString());
          window.location.href = "/?tab=screens";
        } else {
          onSelectScreen(newScreen.id);
          onTabChange("screens");
        }
        setOpenDropdown(null);
      }
    } catch {
      // silently handle fetch error
    } finally {
      setCreatingScreen(false);
    }
  };

  const handleDeleteScreen = async (id: number) => {
    if (!confirm("Are you sure you want to delete this screen?")) return;

    try {
      await fetch(`/api/screens?id=${id}`, { method: "DELETE" });
      setScreens((prev) => prev.filter((s) => s.id !== id));
      if (selectedScreenId === id) {
        const remaining = screens.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          onSelectScreen(remaining[0].id);
        }
      }
    } catch {
      // silently handle fetch error
    }
  };

  const handleRenameScreen = async (id: number, name: string) => {
    if (!name.trim()) return;

    try {
      await fetch(`/api/screens?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setScreens((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    } catch {
      // silently handle fetch error
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
      onTabChange(tab);
    }
    setOpenDropdown(null);
  };

  const tabClass =
    "flex h-11 items-center border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex min-h-[52px] max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-1 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground"
        >
          <span className="size-2 rounded-[2px] bg-primary" />
          StockTrax
        </Link>

        <nav ref={navRef} className="-mb-px flex gap-0.5 overflow-x-auto" aria-label="Sections">
          <button type="button" onClick={() => handleTabClick("general")} data-active={activeTab === "general"} className={`${tabClass} shrink-0 px-3`}>
            General
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
            {openDropdown === "watchlist" && (
              <NavDropdown
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
              />
            )}
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
            {openDropdown === "portfolios" && (
              <NavDropdown
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
                width="w-80"
              />
            )}
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
            {openDropdown === "screens" && (
              <NavDropdown
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
              />
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {onOpenAlerts && (
            <button
              type="button"
              onClick={onOpenAlerts}
              aria-label="Alerts"
              className={`relative flex size-8 items-center justify-center rounded-md transition-colors ${
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
