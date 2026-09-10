import type { Portfolio } from "@/lib/db/schema";

/** Shared by the Portfolios menu and the panel's + button. */
export async function createPortfolio(name: string): Promise<Portfolio> {
  const response = await fetch("/api/portfolios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!response.ok) throw new Error("Failed to create portfolio");
  return response.json();
}
