"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Database, Info, Mail, Monitor, Moon, Settings, Sliders, Sun } from "lucide-react";
import { DEFAULT_THEME, useTheme, type ThemePreference } from "@/contexts/theme-context";
import { GeneralSettingsModal } from "./general-settings-modal";
import { DataSettingsModal } from "./data-settings-modal";
import { DigestSettingsModal } from "./digest-settings-modal";

const THEME_OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const satisfies readonly { value: ThemePreference; label: string; Icon: typeof Sun }[];

/** What the server renders, since it cannot read the stored preference. */
const DEFAULT_OPTION =
  THEME_OPTIONS.find((o) => o.value === DEFAULT_THEME) ?? THEME_OPTIONS[1];

export function SettingsMenu() {
  // The two menus are mutually exclusive, so one piece of state closes both.
  const [openMenu, setOpenMenu] = useState<"theme" | "settings" | null>(null);
  const [showGeneralSettings, setShowGeneralSettings] = useState(false);
  const [showDataSettings, setShowDataSettings] = useState(false);
  const [showDigestSettings, setShowDigestSettings] = useState(false);
  const { theme, hydrated, resolvedTheme, setTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  const isOpen = openMenu === "settings";
  const setIsOpen = (open: boolean) => setOpenMenu(open ? "settings" : null);

  // Until hydration the stored preference is unknown to the server, so the
  // button must render the default's icon and label or the markup will not match.
  const activeOption = hydrated
    ? THEME_OPTIONS.find((o) => o.value === theme) ?? DEFAULT_OPTION
    : DEFAULT_OPTION;
  const ActiveThemeIcon = activeOption.Icon;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="flex items-center gap-2" ref={menuRef}>
      {/* Theme Menu */}
      <div className="relative">
        <button
          onClick={() => setOpenMenu(openMenu === "theme" ? null : "theme")}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={`Theme: ${activeOption.label}`}
          aria-haspopup="menu"
          aria-expanded={openMenu === "theme"}
        >
          <ActiveThemeIcon className="size-4" />
        </button>

        {openMenu === "theme" && (
          <div
            role="menu"
            aria-label="Theme"
            className="absolute top-full right-0 z-50 mt-1 w-44 overflow-hidden rounded-md border border-border bg-popover p-1"
          >
            {THEME_OPTIONS.map(({ value, label, Icon }) => {
              const selected = theme === value;
              return (
                <button
                  key={value}
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setTheme(value);
                    setOpenMenu(null);
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent ${
                    selected ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 text-sm">
                    {label}
                    {/* Says which way "system" currently resolves, which the icon cannot. */}
                    {value === "system" && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {resolvedTheme === "dark" ? "Dark" : "Light"}
                      </span>
                    )}
                  </span>
                  {selected && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings Button */}
      <div className="relative">
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

              {/* Email Digest Settings */}
              <button
                onClick={() => {
                  setShowDigestSettings(true);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2.5 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Email digest</p>
                    <p className="text-xs text-muted-foreground">Daily & weekly summaries</p>
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

      {/* Email Digest Modal */}
      {showDigestSettings && (
        <DigestSettingsModal onClose={() => setShowDigestSettings(false)} />
      )}
    </div>
  );
}
