/** Back-tests and correlations for the Funding insights page (pure functions; computed in history:stats). */
import { forecastAmount, recurringWindow, round } from "./predict";
import type { YearRow } from "./types";

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 8) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? round(sxy / Math.sqrt(sxx * syy), 2) : null;
}

export function strength(r: number | null): string {
  if (r === null) return "not enough data";
  const a = Math.abs(r);
  const dir = r > 0 ? "positive" : "negative";
  return a < 0.1 ? "no relationship" : a < 0.3 ? `weak ${dir}` : a < 0.5 ? `moderate ${dir}` : `strong ${dir}`;
}

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface ForecastBacktest {
  heldOutFy: number;
  companies: number;
  medianAbsPctError: number | null;
  baselineMedianAbsPctError: number | null;
  withinRangePct: number | null;
  directionCorrectPct: number | null;
}

/** Predict the last reported FY from the 3 before it, for companies with ≥ ₹1 cr actual that year. */
export function backtestForecast(byCompany: YearRow[][], lastFy: number): ForecastBacktest {
  const errs: number[] = [], base: number[] = [];
  let within = 0, dirOk = 0, n = 0;
  for (const rows of byCompany) {
    const v = (fy: number) => rows.find((r) => r.fy === fy)?.total ?? 0;
    const actual = v(lastFy);
    const l3: [number, number, number] = [v(lastFy - 3), v(lastFy - 2), v(lastFy - 1)];
    if (actual < 1 || l3.filter((x) => x > 0).length < 2) continue;
    const f = forecastAmount(l3);
    n++;
    errs.push(Math.abs(f.mid - actual) / actual);
    base.push(Math.abs(l3[2] - actual) / actual);
    if (actual >= f.low && actual <= f.high) within++;
    if (Math.sign(f.mid - l3[2]) === Math.sign(actual - l3[2])) dirOk++;
  }
  const pct = (x: number | null) => (x === null ? null : round(x * 100, 1));
  return {
    heldOutFy: lastFy,
    companies: n,
    medianAbsPctError: pct(median(errs)),
    baselineMedianAbsPctError: pct(median(base)),
    withinRangePct: n ? round((within / n) * 100, 1) : null,
    directionCorrectPct: n ? round((dirOk / n) * 100, 1) : null,
  };
}

export interface TimingBacktest {
  companies: number;
  hitRatePct: number | null;
  baselinePct: number;
}

/** Hold out each company's latest active year; learn the window from earlier years; did that year hit it? */
export function backtestTiming(datesByCompany: Date[][]): TimingBacktest {
  let n = 0, hits = 0;
  for (const dates of datesByCompany) {
    const years = [...new Set(dates.map((d) => d.getUTCFullYear()))].sort((a, b) => a - b);
    if (years.length < 5) continue;
    const holdout = years.at(-1)!;
    const train = dates.filter((d) => d.getUTCFullYear() < holdout);
    const test = dates.filter((d) => d.getUTCFullYear() === holdout);
    if (train.length < 4 || !test.length) continue;
    const w = recurringWindow(train);
    n++;
    if (test.some((d) => [0, 1, 2].some((k) => (w.start + k) % 12 === d.getUTCMonth()))) hits++;
  }
  return { companies: n, hitRatePct: n ? round((hits / n) * 100, 1) : null, baselinePct: 25 };
}
