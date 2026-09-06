"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";

export type DefaultTab = "general" | "watchlist" | "portfolios" | "screens";

const TAB_OPTIONS: { value: DefaultTab; label: string; icon: React.ReactNode; color: string }[] = [
  {
    value: "general",
    label: "General",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "text-warning",
  },
  {
    value: "watchlist",
    label: "Watchlists",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    color: "text-primary",
  },
  {
    value: "portfolios",
    label: "Portfolios",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    color: "text-positive",
  },
  {
    value: "screens",
    label: "Screens",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
    color: "text-muted-foreground",
  },
];

const STORAGE_KEY = "stocktrax_default_tab";

export function getDefaultTab(): DefaultTab {
  if (typeof window === "undefined") return "general";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "general" || stored === "watchlist" || stored === "portfolios" || stored === "screens") {
    return stored;
  }
  return "general";
}

export function setDefaultTab(tab: DefaultTab): void {
  localStorage.setItem(STORAGE_KEY, tab);
}

interface GeneralSettingsModalProps {
  onClose: () => void;
}

export function GeneralSettingsModal({ onClose }: GeneralSettingsModalProps) {
  const [selectedTab, setSelectedTab] = useState<DefaultTab>(() => getDefaultTab());

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleTabChange = (tab: DefaultTab) => {
    setSelectedTab(tab);
    setDefaultTab(tab);
  };

  return (
    <Modal open onClose={onClose} title="General settings" subtitle="Configure app preferences" maxWidth="max-w-md" center>
        <div className="space-y-4">
          {/* Default Tab Setting */}
          <div className="rounded-lg bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-accent">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Default Tab
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Choose which tab opens when you start the app</p>
            </div>
            <div className="p-4 space-y-2">
              {TAB_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleTabChange(option.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    selectedTab === option.value
                      ? "bg-accent border border-primary/30"
                      : "bg-muted border border-transparent hover:bg-accent hover:border-border"
                  }`}
                >
                  <span className={option.color}>{option.icon}</span>
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                  {selectedTab === option.value && (
                    <Check className="size-5 text-primary ml-auto" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
    </Modal>
  );
}
