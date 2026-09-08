"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

/** What the user picked. "system" defers to the OS and can change while the app is open. */
export type ThemePreference = "light" | "dark" | "system";

/** What is actually on screen. "system" is always resolved to one of these. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** Used when nothing is stored, matching what the app has always opened as. */
export const DEFAULT_THEME: ThemePreference = "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const isPreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Private windows and blocked site data both throw on access.
    return DEFAULT_THEME;
  }
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * Applies the theme before first paint, so a light or system user never sees a
 * dark flash while React boots. Kept in sync with the provider by sharing the
 * storage key and default; inlined into the document head by the root layout.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(DEFAULT_THEME)};var d=p==="dark"||(p==="system"&&window.matchMedia(${JSON.stringify(
  DARK_QUERY
)}).matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

/** Never changes: this store only reports whether hydration has happened. */
const subscribeNever = () => () => {};

interface ThemeContextType {
  /** The stored preference, which may be "system". */
  theme: ThemePreference;
  /**
   * False on the server and through the hydrating render, true afterwards.
   * `theme` comes from localStorage, which the server cannot see, so markup
   * that depends on it must render the DEFAULT_THEME shape until this is true.
   */
  hydrated: boolean;
  /** The theme in effect right now, never "system". */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  // The OS setting can change while the app is open, and "system" has to follow
  // it without a reload. Subscribed unconditionally so the value is already
  // correct the moment the user switches to "system".
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setSystemTheme(query.matches ? "dark" : "light");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A theme that cannot be persisted still applies for this session.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, hydrated, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
