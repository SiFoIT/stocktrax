import { ScreenRule } from "./metrics";
import { nextCopyName } from "./describe";

export interface CustomPresetDTO {
  id: number;
  name: string;
  rules: ScreenRule[];
  match: "all" | "any";
  createdAt: string;
}

export async function fetchPresets(): Promise<CustomPresetDTO[]> {
  const response = await fetch("/api/screen-presets");
  if (!response.ok) return [];
  return response.json();
}

export async function createPreset(data: {
  name: string;
  rules: ScreenRule[];
  match: "all" | "any";
}): Promise<CustomPresetDTO> {
  const response = await fetch("/api/screen-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create preset");
  return response.json();
}

export async function deletePreset(id: number): Promise<void> {
  await fetch(`/api/screen-presets?id=${id}`, { method: "DELETE" });
}

export interface ScreenDTO {
  id: number;
  name: string;
  source: string;
  rules: ScreenRule[];
  match: "all" | "any";
  createdAt: string;
  updatedAt: string;
  /** Written by the run endpoint only. Null until the screen has been run. */
  lastRunAt: string | null;
  lastMatchCount: number | null;
  lastTotalScanned: number | null;
}

/** The three run fields, as returned by a run and merged into a ScreenDTO. */
export type ScreenRunStats = Pick<
  ScreenDTO,
  "lastRunAt" | "lastMatchCount" | "lastTotalScanned"
>;

export interface ScreenResult {
  symbol: string;
  shortName?: string;
  price?: number;
  changePercent?: number;
  metricValues: Record<string, number | undefined>;
}

export interface RunScreenResponse {
  results: ScreenResult[];
  totalScanned: number;
  matchCount: number;
  /** The timestamp just stored, or null for an inline (unsaved) run. */
  lastRunAt: string | null;
}

export async function fetchScreens(): Promise<ScreenDTO[]> {
  const response = await fetch("/api/screens");
  if (!response.ok) return [];
  return response.json();
}

export async function createScreen(data: {
  name: string;
  source?: string;
  rules?: ScreenRule[];
  match?: "all" | "any";
}): Promise<ScreenDTO> {
  const response = await fetch("/api/screens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create screen");
  return response.json();
}

export async function updateScreen(
  id: number,
  data: Partial<{ name: string; source: string; rules: ScreenRule[]; match: "all" | "any" }>
): Promise<ScreenDTO> {
  const response = await fetch(`/api/screens?id=${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update screen");
  return response.json();
}

export async function deleteScreen(id: number): Promise<void> {
  await fetch(`/api/screens?id=${id}`, { method: "DELETE" });
}

/**
 * Copy a screen's rules under a free name. The copy starts unrun: the run
 * fields belong to the run, not to the rules.
 */
export async function duplicateScreen(
  screen: ScreenDTO,
  existingNames: string[]
): Promise<ScreenDTO> {
  return createScreen({
    name: nextCopyName(screen.name, existingNames),
    source: screen.source,
    rules: screen.rules,
    match: screen.match,
  });
}

export async function runScreen(screenId: number): Promise<RunScreenResponse> {
  const response = await fetch("/api/screens/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screenId }),
  });
  if (!response.ok) throw new Error("Failed to run screen");
  return response.json();
}

export async function runScreenInline(data: {
  source: string;
  rules: ScreenRule[];
  match: "all" | "any";
}): Promise<RunScreenResponse> {
  const response = await fetch("/api/screens/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to run screen");
  return response.json();
}
