/**
 * Deterministic, explainable forecasts from the National CSR Portal history and dated news.
 * No LLM involved: every number can be traced back to the rule that produced it.
 */
import type { Range, Timing } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MIN_COMPANY_EVENTS = 4;

/**
 * Next-FY amount from the last 3 reported FYs (oldest → newest):
 *   mid  = weighted average (20/30/50) × (1 + growth), growth = CAGR over the 3 years capped at ±25%
 *   low/high = min/max of the 3 years, widened to include mid (mid is clamped to 0.75×low … 1.25×high)
 */
export function forecastAmount(last3: [number, number, number]): Range {
  const [a, b, c] = last3;
  const wavg = 0.2 * a + 0.3 * b + 0.5 * c;
  let growth = 0;
  if (a > 0 && c > 0) growth = Math.max(-0.25, Math.min(0.25, Math.sqrt(c / a) - 1));
  else if (c === 0) growth = -0.25; // stopped last year: expect a smaller programme, not zero
  const low = Math.min(a, b, c);
  const high = Math.max(a, b, c);
  const mid = Math.min(high * 1.25, Math.max(low * 0.75, wavg * (1 + growth)));
  return { low: round(Math.min(low, mid)), mid: round(mid), high: round(Math.max(high, mid)) };
}

/** Laplace-smoothed share of the last N FYs with spend in a sector: (k + 1) / (N + 2). */
export function sectorOdds(yearsWithSpend: number, window: number): number {
  return round((yearsWithSpend + 1) / (window + 2), 2);
}

/** Best 3-consecutive-month window (wrapping Dec→Jan) by event count. */
export function bestWindow(months: number[]): { start: number; count: number } {
  let best = { start: 0, count: -1 };
  for (let s = 0; s < 12; s++) {
    const count = months[s] + months[(s + 1) % 12] + months[(s + 2) % 12];
    if (count > best.count) best = { start: s, count };
  }
  return best;
}

export function windowLabel(start: number): string {
  return `${MONTHS[start]}–${MONTHS[(start + 2) % 12]}`;
}

/** First day of the next occurrence of `startMonth` that is not in the past (current window counts). */
export function nextWindowStart(startMonth: number, now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  // Still inside this year's window → it started this year.
  const inWindow = [0, 1, 2].some((k) => (startMonth + k) % 12 === m);
  let year = y;
  if (!inWindow && startMonth <= m) year = y + 1;
  if (inWindow && startMonth > m) year = y - 1; // window wrapped from last year (e.g. Nov–Jan in Jan)
  return new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
}

/** Small samples can't show a clear pattern: "clear" needs ≥ 8 events. */
function strengthOf(share: number, events: number): Timing["strength"] {
  if (share >= 0.45 && events >= 8) return "clear";
  return share >= 0.33 ? "mild" : "none";
}

export function timingFrom(
  companyDates: Date[],
  sectorMonths: number[] | null,
  now: Date,
  counted: Timing["counted"] = "announcements",
): Timing {
  const months = new Array(12).fill(0);
  for (const d of companyDates) months[d.getUTCMonth()]++;
  const lastEvent = companyDates.length
    ? new Date(Math.max(...companyDates.map((d) => d.getTime()))).toISOString().slice(0, 10)
    : null;

  let basis: Timing["basis"] = "none";
  let hist = months;
  if (companyDates.length >= MIN_COMPANY_EVENTS) basis = "company";
  else if (sectorMonths && sectorMonths.some((n) => n > 0)) {
    basis = "sector";
    hist = sectorMonths;
  }
  if (basis === "none") {
    return { basis, events: companyDates.length, months, window: null, windowShare: 0, nextWindowStart: null, lastEvent, strength: "none", counted };
  }
  const total = hist.reduce((a, b) => a + b, 0);
  const w = bestWindow(hist);
  const share = total ? round(w.count / total, 2) : 0;
  return {
    basis,
    events: companyDates.length,
    months,
    window: windowLabel(w.start),
    windowShare: share,
    nextWindowStart: nextWindowStart(w.start, now),
    lastEvent,
    strength: strengthOf(share, total),
    counted,
  };
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
