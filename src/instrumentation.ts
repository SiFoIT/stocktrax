/**
 * Next.js runs this once when the server boots, which is where the digest
 * scheduler starts. The guard matters: this module is also evaluated for the
 * edge runtime, where `setInterval` work and better-sqlite3 have no place.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("@/lib/digest/scheduler");
  startScheduler();
}
