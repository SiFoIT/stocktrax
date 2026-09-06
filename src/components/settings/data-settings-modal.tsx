"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  collectSettings,
  restoreSettings,
  BackupData,
} from "@/lib/backup/settings-registry";

interface DataSettingsModalProps {
  onClose: () => void;
}

type ImportStatus = "idle" | "preview" | "importing" | "success" | "error";

export function DataSettingsModal({ onClose }: DataSettingsModalProps) {
  const [iCloudAvailable, setICloudAvailable] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importData, setImportData] = useState<BackupData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    portfolios: number;
    holdings: number;
    transactions: number;
    watchlists: number;
    watchlistItems: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if iCloud is available
    fetch("/api/export", { method: "HEAD" })
      .then((res) => setICloudAvailable(res.ok))
      .catch(() => setICloudAvailable(false));
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleExportToFile = async () => {
    setIsExporting(true);
    setExportMessage(null);

    try {
      const settings = collectSettings();
      const settingsParam = encodeURIComponent(JSON.stringify(settings));
      const response = await fetch(`/api/export?settings=${settingsParam}`);

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="(.+)"/)?.[1] ||
        `stocktrax-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportMessage({ type: "success", text: "Backup downloaded successfully" });
    } catch {
      setExportMessage({ type: "error", text: "Failed to export data" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportToICloud = async () => {
    setIsExporting(true);
    setExportMessage(null);

    try {
      const settings = collectSettings();
      const settingsParam = encodeURIComponent(JSON.stringify(settings));
      const response = await fetch(
        `/api/export?destination=icloud&settings=${settingsParam}`
      );

      if (!response.ok) throw new Error("Export failed");

      const result = await response.json();
      setExportMessage({
        type: "success",
        text: `Saved to iCloud: ${result.filename}`,
      });
    } catch {
      setExportMessage({ type: "error", text: "Failed to save to iCloud" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setImportError(null);
    setImportStatus("idle");

    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;

      if (!data.version || !data.data) {
        throw new Error("Invalid backup file format");
      }

      setImportData(data);
      setImportStatus("preview");
    } catch (e) {
      setImportError(
        e instanceof Error ? e.message : "Failed to read backup file"
      );
      setImportStatus("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/json") {
      handleFileSelect(file);
    } else {
      setImportError("Please drop a JSON file");
      setImportStatus("error");
    }
  };

  const handleImportConfirm = async () => {
    if (!importData) return;

    setImportStatus("importing");
    setImportError(null);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Import failed");
      }

      // Restore settings to localStorage
      if (result.settings) {
        restoreSettings(result.settings);
      }

      setImportResult(result.imported);
      setImportStatus("success");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
      setImportStatus("error");
    }
  };

  const handleImportCancel = () => {
    setImportData(null);
    setImportStatus("idle");
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative overflow-hidden shrink-0">
          <div className="relative flex items-start justify-between p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-cyan-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">Data & Backup</h2>
                <p className="text-sm text-muted-foreground">
                  Export or import your data
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <X className="size-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Export Section */}
          <div className="rounded-lg bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-accent">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <svg
                  className="w-4 h-4 text-positive"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                Export
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Back up your watchlists, portfolios, and settings
              </p>
            </div>
            <div className="p-4 space-y-3">
              {iCloudAvailable && (
                <button
                  onClick={handleExportToICloud}
                  disabled={isExporting}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted border border-transparent hover:bg-accent hover:border-border transition-colors disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-primary"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">
                      Save to iCloud
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Automatically syncs across devices
                    </p>
                  </div>
                </button>
              )}

              <button
                onClick={handleExportToFile}
                disabled={isExporting}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted border border-transparent hover:bg-accent hover:border-border transition-colors disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-positive"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Download File</p>
                  <p className="text-xs text-muted-foreground">
                    Save JSON backup to your computer
                  </p>
                </div>
              </button>

              {exportMessage && (
                <div
                  className={`px-3 py-2 rounded-lg text-sm ${
                    exportMessage.type === "success"
                      ? "bg-positive/20 text-positive"
                      : "bg-negative/20 text-negative"
                  }`}
                >
                  {exportMessage.text}
                </div>
              )}
            </div>
          </div>

          {/* Import Section */}
          <div className="rounded-lg bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-accent">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <svg
                  className="w-4 h-4 text-warning"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Import
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Restore from a backup file
              </p>
            </div>
            <div className="p-4">
              {importStatus === "idle" && (
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragging
                      ? "border-warning/50 bg-warning/10"
                      : "border-border hover:border-border-strong"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                  <svg
                    className="w-10 h-10 mx-auto text-subtle-foreground mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-sm text-muted-foreground mb-2">
                    Drag and drop a backup file here, or
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-border-strong text-foreground hover:bg-accent"
                  >
                    Choose File
                  </Button>
                </div>
              )}

              {importStatus === "preview" && importData && (
                <div className="space-y-4">
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
                    <p className="text-sm text-warning font-medium">
                      Warning: This will replace all existing data
                    </p>
                    <p className="text-xs text-warning mt-1">
                      Your current watchlists, portfolios, and settings will be
                      overwritten.
                    </p>
                  </div>

                  <div className="bg-muted rounded-lg p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Backup from: {formatDate(importData.exportedAt)}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Portfolios:</span>
                        <span className="text-foreground font-medium">
                          {importData.data.portfolios.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Holdings:</span>
                        <span className="text-foreground font-medium">
                          {importData.data.holdings.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Transactions:</span>
                        <span className="text-foreground font-medium">
                          {importData.data.transactions.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Watchlists:</span>
                        <span className="text-foreground font-medium">
                          {importData.data.watchlists.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleImportCancel}
                      className="flex-1 border-border-strong text-foreground hover:bg-accent"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleImportConfirm}
                      className="flex-1 bg-warning hover:bg-warning/90 text-black"
                    >
                      Import
                    </Button>
                  </div>
                </div>
              )}

              {importStatus === "importing" && (
                <div className="text-center py-6">
                  <div className="w-8 h-8 border-2 border-border-strong border-t-amber-400 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Importing data...</p>
                </div>
              )}

              {importStatus === "success" && importResult && (
                <div className="space-y-4">
                  <div className="bg-positive/10 border border-positive/20 rounded-lg p-3">
                    <p className="text-sm text-positive font-medium">
                      Import successful!
                    </p>
                    <p className="text-xs text-positive mt-1">
                      Refresh the page to see your imported data.
                    </p>
                  </div>

                  <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                    <p className="text-muted-foreground">
                      Imported {importResult.portfolios} portfolios,{" "}
                      {importResult.holdings} holdings,{" "}
                      {importResult.transactions} transactions,{" "}
                      {importResult.watchlists} watchlists, and{" "}
                      {importResult.watchlistItems} watchlist items.
                    </p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="w-full bg-positive hover:bg-positive/90 text-black"
                  >
                    Refresh Page
                  </Button>
                </div>
              )}

              {importStatus === "error" && (
                <div className="space-y-4">
                  <div className="bg-negative/10 border border-negative/20 rounded-lg p-3">
                    <p className="text-sm text-negative font-medium">
                      Import failed
                    </p>
                    <p className="text-xs text-negative mt-1">{importError}</p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImportCancel}
                    className="w-full border-border-strong text-foreground hover:bg-accent"
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
