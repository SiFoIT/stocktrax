"use client";

import { useState, useRef, useEffect } from "react";
import { Database, Info, Moon, Settings, Sliders, Sun } from "lucide-react";
import { useTheme } from "@/contexts/theme-context";
import { GeneralSettingsModal } from "./general-settings-modal";
import { DataSettingsModal } from "./data-settings-modal";

export function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [showGeneralSettings, setShowGeneralSettings] = useState(false);
  const [showDataSettings, setShowDataSettings] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </button>

      {/* Settings Button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </button>

        {isOpen && (
          <div className="absolute top-full right-0 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-md z-50">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-foreground">Settings</h3>
            </div>

            <div className="p-2">
              {/* General Settings */}
              <button
                onClick={() => {
                  setShowGeneralSettings(true);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Sliders className="size-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">General</p>
                    <p className="text-xs text-muted-foreground">App preferences</p>
                  </div>
                </div>
              </button>

              {/* Data Settings */}
              <button
                onClick={() => {
                  setShowDataSettings(true);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Database className="size-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Data</p>
                    <p className="text-xs text-muted-foreground">Export & import backup</p>
                  </div>
                </div>
              </button>

              {/* Divider */}
              <div className="my-2 border-t border-border" />

              {/* About */}
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Info className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">StockTrax</p>
                    <p className="text-xs text-muted-foreground">Version {process.env.NEXT_PUBLIC_APP_VERSION}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* General Settings Modal */}
      {showGeneralSettings && (
        <GeneralSettingsModal onClose={() => setShowGeneralSettings(false)} />
      )}

      {/* Data Settings Modal */}
      {showDataSettings && (
        <DataSettingsModal onClose={() => setShowDataSettings(false)} />
      )}
    </div>
  );
}
