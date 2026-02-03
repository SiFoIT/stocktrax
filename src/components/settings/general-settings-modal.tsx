"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export type DefaultTab = "general" | "watchlist" | "portfolios";

const TAB_OPTIONS: { value: DefaultTab; label: string; icon: React.ReactNode; color: string }[] = [
  {
    value: "general",
    label: "General",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "text-amber-400",
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
    color: "text-blue-400",
  },
  {
    value: "portfolios",
    label: "Portfolios",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    color: "text-emerald-400",
  },
];

const STORAGE_KEY = "stocktrax_default_tab";

export function getDefaultTab(): DefaultTab {
  if (typeof window === "undefined") return "general";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "general" || stored === "watchlist" || stored === "portfolios") {
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
  const [selectedTab, setSelectedTab] = useState<DefaultTab>("general");

  useEffect(() => {
    setSelectedTab(getDefaultTab());
  }, []);

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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-500/10 to-transparent">
          <div className="relative flex items-start justify-between p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">General Settings</h2>
                <p className="text-sm text-white/50">Configure app preferences</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-white/50 hover:text-white hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Default Tab Setting */}
          <div className="rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-purple-500/20 to-transparent">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-white">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Default Tab
              </h3>
              <p className="text-xs text-white/50 mt-1">Choose which tab opens when you start the app</p>
            </div>
            <div className="p-4 space-y-2">
              {TAB_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleTabChange(option.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    selectedTab === option.value
                      ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30"
                      : "bg-white/5 border border-transparent hover:bg-white/10 hover:border-white/10"
                  }`}
                >
                  <span className={option.color}>{option.icon}</span>
                  <span className="text-sm font-medium text-white">{option.label}</span>
                  {selectedTab === option.value && (
                    <svg className="w-5 h-5 text-blue-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
