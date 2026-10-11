/**
 * Server-rendered SVG charts (no client JS). Colours come from CSS tokens in globals.css
 * (--series-1 focus, --series-2 other, --seq-1..5 sequential), validated for CVD and
 * contrast in light and dark mode. Every chart ships a hover tooltip (<title>) and a table view.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtCr(n: number): string {
  if (n >= 1000) return `₹${Math.round(n).toLocaleString("en-IN")} cr`;
  if (n >= 10) return `₹${n.toFixed(0)} cr`;
  if (n >= 1) return `₹${n.toFixed(1)} cr`;
  return `₹${n.toFixed(2)} cr`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Path for a bar with 4px rounded top corners, anchored square on the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface StackRow {
  label: string; // "FY2024-25"
  short: string; // "24-25"
  focus: number;
  other: number;
}

export function StackedYearBars({
  rows,
  title,
  focusLabel = "Focus sectors",
  otherLabel = "Other sectors",
  predicted,
}: {
  rows: StackRow[];
  title: string;
  focusLabel?: string;
  otherLabel?: string;
  /** optional forecast bar appended (outlined, not filled) */
  predicted?: { short: string; label: string; focus: number; total: number };
}) {
  const W = 640;
  const H = 220;
  const pad = { l: 56, r: 12, t: 12, b: 28 };
  const all = predicted ? [...rows.map((r) => r.focus + r.other), predicted.total] : rows.map((r) => r.focus + r.other);
  const max = niceMax(Math.max(...all, 0));
  const n = rows.length + (predicted ? 1 : 0);
  const slot = (W - pad.l - pad.r) / Math.max(n, 1);
  const bw = Math.max(6, Math.min(36, slot * 0.6));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <ul className="legend" aria-hidden="true">
        <li><span className="sw sw-1" /> {focusLabel}</li>
        <li><span className="sw sw-2" /> {otherLabel}</li>
        {predicted && <li><span className="sw sw-pred" /> Forecast</li>}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="tick">
              {t === 0 ? "0" : fmtCr(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = pad.l + slot * i + (slot - bw) / 2;
          const yF = y(r.focus);
          const yT = y(r.focus + r.other);
          const base = y(0);
          const gap = r.focus > 0 && r.other > 0 ? 2 : 0;
          return (
            <g key={r.label} className="bar">
              <title>{`${r.label}: ${focusLabel.toLowerCase()} ${fmtCr(r.focus)}, ${otherLabel.toLowerCase()} ${fmtCr(r.other)}, total ${fmtCr(r.focus + r.other)}`}</title>
              <rect x={x - 2} y={pad.t} width={bw + 4} height={base - pad.t} className="hit" />
              {r.focus > 0 && (r.other > 0
                ? <rect x={x} y={yF} width={bw} height={base - yF} className="fill-1" />
                : <path d={topRounded(x, yF, bw, base - yF)} className="fill-1" />)}
              {r.other > 0 && <path d={topRounded(x, yT, bw, Math.max(0, yF - yT - gap))} className="fill-2" />}
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" className="tick">{r.short}</text>
            </g>
          );
        })}
        {predicted && (() => {
          const i = rows.length;
          const x = pad.l + slot * i + (slot - bw) / 2;
          return (
            <g className="bar">
              <title>{`${predicted.label} forecast: total ${fmtCr(predicted.total)}, ${focusLabel.toLowerCase()} ${fmtCr(predicted.focus)}`}</title>
              <rect x={x - 2} y={pad.t} width={bw + 4} height={y(0) - pad.t} className="hit" />
              <path d={topRounded(x, y(predicted.total), bw, y(0) - y(predicted.total))} className="pred" />
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" className="tick">{predicted.short}*</text>
            </g>
          );
        })()}
      </svg>
      <details className="table-view">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr><th>Year</th><th>{focusLabel}</th><th>{otherLabel}</th><th>Total</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td>{fmtCr(r.focus)}</td><td>{fmtCr(r.other)}</td><td>{fmtCr(r.focus + r.other)}</td></tr>
            ))}
            {predicted && (
              <tr><td>{predicted.label} (forecast)</td><td>{fmtCr(predicted.focus)}</td><td>{fmtCr(predicted.total - predicted.focus)}</td><td>{fmtCr(predicted.total)}</td></tr>
            )}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** 12 cells, Jan–Dec, single-hue sequential shading by count; the predicted window is outlined. */
export function MonthStrip({ months, windowStart, label }: { months: number[]; windowStart?: number | null; label: string }) {
  const max = Math.max(...months, 0);
  const inWindow = (m: number) => windowStart != null && [0, 1, 2].some((k) => (windowStart + k) % 12 === m);
  return (
    <figure className="months">
      <figcaption className="chart-title small">{label}</figcaption>
      <ol className="month-strip">
        {months.map((n, m) => {
          const step = max === 0 || n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 5));
          return (
            <li key={m} className={`cell seq-${step}${inWindow(m) ? " in-window" : ""}`} title={`${MONTHS[m]}: ${n} announcement${n === 1 ? "" : "s"}`}>
              <span className="m">{MONTHS[m][0]}</span>
              <span className="n">{n || ""}</span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
