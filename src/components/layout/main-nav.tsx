"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { Portfolio, Watchlist } from "@/lib/db/schema";
import { getDefaultTab, type DefaultTab } from "@/components/settings/general-settings-modal";

export type Tab = "general" | "watchlist" | "portfolios";

interface MainNavProps {
  onOpenAlerts?: () => void;
  alertCount?: number;
  hasTriggeredAlerts?: boolean;
}

interface MainNavTabsProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedWatchlistId: number | null;
  onSelectWatchlist: (id: number) => void;
  selectedPortfolioId: number | null;
  onSelectPortfolio: (id: number) => void;
  children?: React.ReactNode;
}

export function MainNav({ onOpenAlerts, alertCount = 0, hasTriggeredAlerts = false }: MainNavProps = {}) {
  return (
    <div className="mb-8 flex items-start justify-between">
      <div>
        <Link href="/" className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-black to-black/70 dark:from-white dark:to-white/70 bg-clip-text text-transparent">
            StockTrax
          </h1>
        </Link>
        <p className="text-black/50 dark:text-white/50 text-sm">Track your investments with real-time data</p>
      </div>
      <div className="flex items-center gap-2">
        {onOpenAlerts && (
          <button
            onClick={onOpenAlerts}
            className={`relative w-10 h-10 rounded-xl border transition-all flex items-center justify-center ${
              hasTriggeredAlerts
                ? "border-red-500/60 bg-red-500/15 text-red-500 hover:bg-red-500/25"
                : "border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
            }`}
            aria-label="Alerts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold text-center">
                {alertCount}
              </span>
            )}
          </button>
        )}
        <SettingsMenu />
      </div>
    </div>
  );
}

export function MainNavTabs({
  activeTab,
  onTabChange,
  selectedWatchlistId,
  onSelectWatchlist,
  selectedPortfolioId,
  onSelectPortfolio,
  children,
}: MainNavTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSubPage = pathname !== "/";

  // Data state
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  // Dropdown state
  const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false);
  const [showPortfolioDropdown, setShowPortfolioDropdown] = useState(false);
  const watchlistDropdownRef = useRef<HTMLDivElement>(null);
  const portfolioDropdownRef = useRef<HTMLDivElement>(null);

  // Create state
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);

  // Edit state
  const [editingWatchlistId, setEditingWatchlistId] = useState<number | null>(null);
  const [editingWatchlistName, setEditingWatchlistName] = useState("");
  const [editingPortfolioId, setEditingPortfolioId] = useState<number | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = useState("");

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [watchlistsRes, portfoliosRes] = await Promise.all([
          fetch("/api/watchlists"),
          fetch("/api/portfolios"),
        ]);
        const watchlistsData = await watchlistsRes.json();
        const portfoliosData = await portfoliosRes.json();
        setWatchlists(watchlistsData);
        setPortfolios(portfoliosData);
      } catch {
      }
    };
    fetchData();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (watchlistDropdownRef.current && !watchlistDropdownRef.current.contains(e.target as Node)) {
        setShowWatchlistDropdown(false);
      }
      if (portfolioDropdownRef.current && !portfolioDropdownRef.current.contains(e.target as Node)) {
        setShowPortfolioDropdown(false);
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
        setShowWatchlistDropdown(false);
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

  const handleRenameWatchlist = async (id: number) => {
    if (!editingWatchlistName.trim()) return;

    try {
      await fetch(`/api/watchlists?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingWatchlistName }),
      });
      setWatchlists((prev) =>
        prev.map((w) => (w.id === id ? { ...w, name: editingWatchlistName } : w))
      );
      setEditingWatchlistId(null);
      setEditingWatchlistName("");
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
        setShowPortfolioDropdown(false);
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

  const handleRenamePortfolio = async (id: number) => {
    if (!editingPortfolioName.trim()) return;

    try {
      await fetch(`/api/portfolios?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingPortfolioName }),
      });
      setPortfolios((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: editingPortfolioName } : p))
      );
      setEditingPortfolioId(null);
      setEditingPortfolioName("");
    } catch {
      // silently handle fetch error
    }
  };

  const handleSelectWatchlistItem = (id: number) => {
    if (isSubPage) {
      sessionStorage.setItem("selectedWatchlistId", id.toString());
      window.location.href = "/?tab=watchlist";
    } else {
      onSelectWatchlist(id);
      onTabChange("watchlist");
    }
    setShowWatchlistDropdown(false);
  };

  const handleSelectPortfolioItem = (id: number) => {
    router.push(`/portfolio/${id}`);
    setShowPortfolioDropdown(false);
  };

  const handleTabClick = (tab: Tab) => {
    if (isSubPage) {
      // Use URL params for reliable navigation
      window.location.href = `/?tab=${tab}`;
    } else {
      onTabChange(tab);
    }
    setShowWatchlistDropdown(false);
    setShowPortfolioDropdown(false);
  };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex gap-2 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
        {/* General Tab */}
        <button
          onClick={() => handleTabClick("general")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-all ${
            activeTab === "general"
              ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-black dark:text-white"
              : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          General
        </button>

        {/* Watchlists Tab with Dropdown */}
        <div className="relative" ref={watchlistDropdownRef}>
          <div
            className={`flex items-center rounded-lg transition-all ${
              activeTab === "watchlist"
                ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-black dark:text-white"
                : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <button
              onClick={() => handleTabClick("watchlist")}
              className="flex items-center gap-2 pl-4 pr-1 py-2"
            >
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Watchlists
            </button>
            <button
              onClick={() => {
                setShowWatchlistDropdown(!showWatchlistDropdown);
                setShowPortfolioDropdown(false);
              }}
              className="px-2 py-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-r-lg transition-colors"
            >
              <svg className={`w-4 h-4 text-black/50 dark:text-white/50 transition-transform ${showWatchlistDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {showWatchlistDropdown && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent">
                <form onSubmit={handleCreateWatchlist} className="flex gap-2">
                  <Input
                    placeholder="New watchlist name"
                    value={newWatchlistName}
                    onChange={(e) => setNewWatchlistName(e.target.value)}
                    className="h-9 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-blue-500/50"
                  />
                  <Button type="submit" size="sm" disabled={creatingWatchlist} className="bg-blue-500 hover:bg-blue-600">
                    Add
                  </Button>
                </form>
              </div>
              <div className="max-h-64 overflow-auto">
                {watchlists.length === 0 ? (
                  <p className="p-4 text-sm text-black/50 dark:text-white/50 text-center">No watchlists yet</p>
                ) : (
                  watchlists.map((watchlist) => (
                    <div
                      key={watchlist.id}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                        watchlist.id === selectedWatchlistId
                          ? "bg-gradient-to-r from-blue-500/20 to-transparent border-l-2 border-blue-500"
                          : "hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                      onClick={() => {
                        if (editingWatchlistId !== watchlist.id) {
                          handleSelectWatchlistItem(watchlist.id);
                        }
                      }}
                    >
                      {editingWatchlistId === watchlist.id ? (
                        <form
                          className="flex gap-2 flex-1 mr-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleRenameWatchlist(watchlist.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            value={editingWatchlistName}
                            onChange={(e) => setEditingWatchlistName(e.target.value)}
                            className="h-7 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setEditingWatchlistId(null);
                                setEditingWatchlistName("");
                              }
                            }}
                          />
                          <Button type="submit" size="sm" className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600">
                            Save
                          </Button>
                        </form>
                      ) : (
                        <span className="text-sm font-medium">{watchlist.name}</span>
                      )}
                      {editingWatchlistId !== watchlist.id && (
                        <div className="flex gap-1">
                          <button
                            className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWatchlistId(watchlist.id);
                              setEditingWatchlistName(watchlist.name);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteWatchlist(watchlist.id);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Portfolios Tab with Dropdown */}
        <div className="relative" ref={portfolioDropdownRef}>
          <div
            className={`flex items-center rounded-lg transition-all ${
              activeTab === "portfolios"
                ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-black dark:text-white"
                : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <button
              onClick={() => handleTabClick("portfolios")}
              className="flex items-center gap-2 pl-4 pr-1 py-2"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Portfolios
            </button>
            <button
              onClick={() => {
                setShowPortfolioDropdown(!showPortfolioDropdown);
                setShowWatchlistDropdown(false);
              }}
              className="px-2 py-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-r-lg transition-colors"
            >
              <svg className={`w-4 h-4 text-black/50 dark:text-white/50 transition-transform ${showPortfolioDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {showPortfolioDropdown && (
            <div className="absolute top-full left-0 mt-2 w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
                <form onSubmit={handleCreatePortfolio} className="flex gap-2">
                  <Input
                    placeholder="New portfolio name"
                    value={newPortfolioName}
                    onChange={(e) => setNewPortfolioName(e.target.value)}
                    className="h-9 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50"
                  />
                  <Button type="submit" size="sm" disabled={creatingPortfolio} className="bg-emerald-500 hover:bg-emerald-600">
                    Add
                  </Button>
                </form>
              </div>
              <div className="max-h-64 overflow-auto">
                {portfolios.length === 0 ? (
                  <p className="p-4 text-sm text-black/50 dark:text-white/50 text-center">No portfolios yet</p>
                ) : (
                  portfolios.map((portfolio) => (
                    <div
                      key={portfolio.id}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all ${
                        portfolio.id === selectedPortfolioId
                          ? "bg-gradient-to-r from-emerald-500/20 to-transparent border-l-2 border-emerald-500"
                          : "hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                      onClick={() => {
                        if (editingPortfolioId !== portfolio.id) {
                          handleSelectPortfolioItem(portfolio.id);
                        }
                      }}
                    >
                      {editingPortfolioId === portfolio.id ? (
                        <form
                          className="flex gap-2 flex-1 mr-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleRenamePortfolio(portfolio.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            value={editingPortfolioName}
                            onChange={(e) => setEditingPortfolioName(e.target.value)}
                            className="h-7 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setEditingPortfolioId(null);
                                setEditingPortfolioName("");
                              }
                            }}
                          />
                          <Button type="submit" size="sm" className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600">
                            Save
                          </Button>
                        </form>
                      ) : (
                        <span className="text-sm font-medium">{portfolio.name}</span>
                      )}
                      {editingPortfolioId !== portfolio.id && (
                        <div className="flex gap-1">
                          <button
                            className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPortfolioId(portfolio.id);
                              setEditingPortfolioName(portfolio.name);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePortfolio(portfolio.id);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// Helper to get initial tab from sessionStorage or default
export function getInitialTab(): DefaultTab {
  if (typeof window === "undefined") return "general";

  const tabFromStorage = sessionStorage.getItem("navigateToTab") as DefaultTab | null;
  if (tabFromStorage && ["general", "watchlist", "portfolios"].includes(tabFromStorage)) {
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
