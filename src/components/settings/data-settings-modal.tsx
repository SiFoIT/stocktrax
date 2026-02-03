"use client";

import { useState, useEffect, useRef } from "react";
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
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-cyan-500/10 to-transparent shrink-0">
          <div className="relative flex items-start justify-between p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-cyan-400"
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
                <h2 className="text-xl font-bold text-white">Data & Backup</h2>
                <p className="text-sm text-white/50">
                  Export or import your data
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Export Section */}
          <div className="rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-emerald-500/20 to-transparent">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-white">
                <svg
                  className="w-4 h-4 text-emerald-400"
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
              <p className="text-xs text-white/50 mt-1">
                Back up your watchlists, portfolios, and settings
              </p>
            </div>
            <div className="p-4 space-y-3">
              {iCloudAvailable && (
                <button
                  onClick={handleExportToICloud}
                  disabled={isExporting}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-transparent hover:bg-white/10 hover:border-white/10 transition-all disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-500/30 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-blue-400"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">
                      Save to iCloud
                    </p>
                    <p className="text-xs text-white/50">
                      Automatically syncs across devices
                    </p>
                  </div>
                </button>
              )}

              <button
                onClick={handleExportToFile}
                disabled={isExporting}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-transparent hover:bg-white/10 hover:border-white/10 transition-all disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/30 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-emerald-400"
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
                  <p className="text-sm font-medium text-white">Download File</p>
                  <p className="text-xs text-white/50">
                    Save JSON backup to your computer
                  </p>
                </div>
              </button>

              {exportMessage && (
                <div
                  className={`px-3 py-2 rounded-lg text-sm ${
                    exportMessage.type === "success"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {exportMessage.text}
                </div>
              )}
            </div>
          </div>

          {/* Import Section */}
          <div className="rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-amber-500/20 to-transparent">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-white">
                <svg
                  className="w-4 h-4 text-amber-400"
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
              <p className="text-xs text-white/50 mt-1">
                Restore from a backup file
              </p>
            </div>
            <div className="p-4">
              {importStatus === "idle" && (
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragging
                      ? "border-amber-500/50 bg-amber-500/10"
                      : "border-white/10 hover:border-white/20"
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
                    className="w-10 h-10 mx-auto text-white/30 mb-3"
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
                  <p className="text-sm text-white/50 mb-2">
                    Drag and drop a backup file here, or
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    Choose File
                  </Button>
                </div>
              )}

              {importStatus === "preview" && importData && (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-sm text-amber-300 font-medium">
                      Warning: This will replace all existing data
                    </p>
                    <p className="text-xs text-amber-300/70 mt-1">
                      Your current watchlists, portfolios, and settings will be
                      overwritten.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-white/50">
                      Backup from: {formatDate(importData.exportedAt)}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/50">Portfolios:</span>
                        <span className="text-white font-medium">
                          {importData.data.portfolios.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Holdings:</span>
                        <span className="text-white font-medium">
                          {importData.data.holdings.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Transactions:</span>
                        <span className="text-white font-medium">
                          {importData.data.transactions.length}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Watchlists:</span>
                        <span className="text-white font-medium">
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
                      className="flex-1 border-white/20 text-white hover:bg-white/10"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleImportConfirm}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      Import
                    </Button>
                  </div>
                </div>
              )}

              {importStatus === "importing" && (
                <div className="text-center py-6">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-white/50">Importing data...</p>
                </div>
              )}

              {importStatus === "success" && importResult && (
                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <p className="text-sm text-emerald-300 font-medium">
                      Import successful!
                    </p>
                    <p className="text-xs text-emerald-300/70 mt-1">
                      Refresh the page to see your imported data.
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-lg p-3 space-y-1 text-sm">
                    <p className="text-white/70">
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
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-black"
                  >
                    Refresh Page
                  </Button>
                </div>
              )}

              {importStatus === "error" && (
                <div className="space-y-4">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-sm text-red-300 font-medium">
                      Import failed
                    </p>
                    <p className="text-xs text-red-300/70 mt-1">{importError}</p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImportCancel}
                    className="w-full border-white/20 text-white hover:bg-white/10"
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
