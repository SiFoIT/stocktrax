import { ExtendedHoursData } from "@/types";

/** One extended-hours print, chosen for the current market state. */
export interface ExtendedHoursMove {
  /** "Pre:" before the open; "Post:" after the close; "After:" once Yahoo calls the day closed. */
  label: string;
  price: number;
  change?: number;
  changePercent?: number;
  /** ISO timestamp of the print, when Yahoo sent one. */
  time?: string;
}

/**
 * Which extended-hours print a quote should show, if any. Pre-market while the
 * next session is approaching, post-market after the close and over the
 * weekend. Nothing during regular hours, where the live price already says it
 * all, and nothing when Yahoo sent no print for the state it reports.
 *
 * Shared by the stock rows and the index tiles so the two never disagree about
 * what "After:" means.
 */
export function selectExtendedHours(data: ExtendedHoursData | undefined): ExtendedHoursMove | null {
  const state = data?.marketState;
  if (!data || !state || state === "REGULAR") return null;

  if ((state === "PRE" || state === "PREPRE") && data.preMarketPrice != null) {
    return {
      label: "Pre:",
      price: data.preMarketPrice,
      change: data.preMarketChange,
      changePercent: data.preMarketChangePercent,
      time: data.preMarketTime,
    };
  }

  if ((state === "POST" || state === "POSTPOST" || state === "CLOSED") && data.postMarketPrice != null) {
    return {
      label: state === "CLOSED" ? "After:" : "Post:",
      price: data.postMarketPrice,
      change: data.postMarketChange,
      changePercent: data.postMarketChangePercent,
      time: data.postMarketTime,
    };
  }

  return null;
}
