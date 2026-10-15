/**
 * Display settings the team can change through dashboard feedback, without a developer: today the
 * site-wide text size. Stored in model_metrics ("display-settings"), applied by
 * app/components/DisplaySettings.tsx, changed only by the feedback triage (scripts/ingest/team-tasks.ts)
 * within these bounds.
 */
export const DISPLAY_KEY = "display-settings";

export interface DisplaySettings {
  /** multiplies every text size on the site (rem-based CSS); 1 = default */
  fontScale: number;
}

export const DISPLAY_DEFAULTS: DisplaySettings = { fontScale: 1 };
export const FONT_SCALE_MIN = 0.9;
export const FONT_SCALE_MAX = 1.25;
/** largest change one piece of feedback may make (10 percentage points) */
export const FONT_SCALE_MAX_STEP = 0.1;

export function readDisplay(data: unknown): DisplaySettings {
  const n = Number((data as Partial<DisplaySettings> | null)?.fontScale);
  return { fontScale: Number.isFinite(n) ? Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n)) : 1 };
}

/**
 * Parses a requested text size: "1.02", "102%" or "+2%" (relative to the current size). Returns null
 * when it is out of bounds or changes more than FONT_SCALE_MAX_STEP at once.
 */
export function nextFontScale(current: number, value: string): number | null {
  const v = value.trim();
  let n: number;
  const rel = v.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*%$/);
  if (rel) n = current * (1 + (rel[1] === "-" ? -1 : 1) * Number(rel[2]) / 100);
  else if (/%$/.test(v)) n = Number(v.slice(0, -1)) / 100;
  else n = Number(v);
  if (!Number.isFinite(n)) return null;
  n = Math.round(n * 100) / 100;
  if (n < FONT_SCALE_MIN || n > FONT_SCALE_MAX || Math.abs(n - current) > FONT_SCALE_MAX_STEP + 1e-9) return null;
  return n;
}
