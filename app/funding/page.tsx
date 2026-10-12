// Expansion planner: where CSR money for the focus sectors is, where it is heading, and when companies announce.
import { Suspense } from "react";
import Link from "next/link";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { fmtCr, HBars, MonthStrip, StackedYearBars } from "@/app/components/charts";
import { Hero, Icon, PageBackdrop } from "@/app/components/illustrations";
import { fyLabel } from "@/lib/companies";
import { bestWindow, windowLabel } from "@/lib/history/predict";
import { getLens, getModelMetrics, getPlanner, getRegionTrend, getSectorSeasonality } from "@/lib/data";
import { InfoTip } from "@/app/components/InfoTip";
import type { Lens, PlannerSort } from "@/lib/history/queries";
import { OTHER_SECTORS } from "@/prompts/classify";

const SORTS: { id: PlannerSort; label: string }[] = [
  { id: "maharashtra", label: "Focus spend in Maharashtra" },
  { id: "pune", label: "Spend in Pune district" },
  { id: "focus", label: "Forecast focus spend (India)" },
  { id: "total", label: "Forecast total CSR (all sectors)" },
];
const SECTOR_LABELS = new Map<string, string>([
  ...DEFAULT_CONFIG.sectors.map((s) => [s.id, s.label] as [string, string]),
  ...OTHER_SECTORS.map((o) => [o.id, o.label] as [string, string]),
]);
const short = (fy: number) => `${String(fy % 100).padStart(2, "0")}-${String((fy + 1) % 100).padStart(2, "0")}`;

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <main className="wrap wide">
      <PageBackdrop variant="funding" />
      <Hero eyebrow="Where the money is going" title="Funding insights" variant="planner">
        Eleven years of reported CSR spend (National CSR Portal, FY2014-15 to FY2024-25) and dated announcements: who funds your
        sectors, where the money is growing, and when companies tend to announce.
      </Hero>
      <Suspense fallback={<p className="muted">Loading history…</p>}>
        {searchParams.then((sp) => <Planner sp={sp} />)}
      </Suspense>
    </main>
  );
}

async function Planner({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const sort = (SORTS.find((s) => s.id === sp.sort)?.id ?? "maharashtra") as PlannerSort;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const lens: Lens = sort === "pune" ? "pune" : sort === "maharashtra" ? "maharashtra" : "india";
  const [rows, trend, seasonalityEntries, view, metrics] = await Promise.all([getPlanner(sort, q), getRegionTrend(), getSectorSeasonality(), getLens(lens), getModelMetrics()]);
  const seasonality = seasonalityEntries ? new Map(seasonalityEntries) : null;
  if (!rows || !trend) {
    return <div className="notice"><h2>No history loaded</h2><p>Run <code>npm run history:import</code> and <code>npm run history:stats</code>.</p></div>;
  }
  if (trend.length === 0) {
    return <div className="notice"><h2>No history loaded</h2><p>Import the National CSR Portal report with <code>npm run history:import</code>.</p></div>;
  }
  const last = trend.at(-1)!;
  const LENS_NAME = { india: "India", maharashtra: "Maharashtra", pune: "Pune district" }[lens];
  const vt = view?.trend ?? [];
  const vFirst = vt[0];
  const vLast = vt.at(-1);
  const vGrowth = vFirst && vLast && vFirst.focus > 0 ? vLast.focus / vFirst.focus : null;

  const sectors = seasonality
    ? [...seasonality.entries()]
        .filter(([id]) => id !== "other")
        .map(([id, months]) => ({ id, months, total: months.reduce((a, b) => a + b, 0), w: bestWindow(months) }))
        .filter((s) => s.total >= 10)
        .sort((a, b) => (DEFAULT_CONFIG.sectors.some((f) => f.id === b.id) ? 1 : 0) - (DEFAULT_CONFIG.sectors.some((f) => f.id === a.id) ? 1 : 0) || b.total - a.total)
        .slice(0, 8)
    : [];

  return (
    <>
      <nav className="filters lens-chips" aria-label="Lens">
        <span className="muted small">Lens:</span>
        {(["india", "maharashtra", "pune"] as const).map((l) => (
          <Link key={l} href={{ pathname: "/funding", query: { sort: l === "india" ? "focus" : l, ...(q ? { q } : {}) } }} className={lens === l ? "on" : undefined}>
            {{ india: "India", maharashtra: "Maharashtra", pune: "Pune district" }[l]}
          </Link>
        ))}
        <InfoTip text="Every chart and number on this page follows the lens: all of India, Maharashtra, or Pune district. Picking 'Spend in Pune district' in the company table below switches the lens to Pune too." />
      </nav>

      {view && vLast && (
        <>
          <div className="grid2">
            <div className="card">
              <h3>{LENS_NAME} · your sectors · {fyLabel(view.lastFy)}</h3>
              <p className="big">{fmtCr(vLast.focus)}</p>
              <p className="muted small">of {fmtCr(vLast.total)} total CSR{vGrowth ? ` · ${vGrowth.toFixed(1)}× since ${fyLabel(vFirst!.fy)}` : ""}</p>
            </div>
            <div className="card">
              <h3>{LENS_NAME} · companies funding · {fyLabel(view.lastFy)}</h3>
              <p className="big">{vLast.companies.toLocaleString("en-IN")}</p>
              <p className="muted small">{Math.round((vLast.focus / Math.max(1, vLast.total)) * 100)}% of the money went to your four sectors</p>
            </div>
          </div>
          <div className="grid2 charts3">
            <StackedYearBars
              title={`${LENS_NAME}: CSR spent per year`}
              rows={vt.map((r) => ({ label: fyLabel(r.fy), short: short(r.fy), focus: r.focus, other: Math.max(0, r.total - r.focus) }))}
            />
            <HBars
              title={`${LENS_NAME}: spend by sector · ${fyLabel(view.lastFy)}`}
              rows={view.sectors.map((x) => ({ label: x.sector, value: x.amount, focus: x.focus }))}
            />
            <HBars
              title={`${LENS_NAME}: top companies in your sectors · ${fyLabel(view.lastFy)}`}
              focusLabel="Spend in your sectors"
              showLegend={false}
              rows={view.top.filter((t) => t.focusAmount > 0).map((t) => ({ label: t.name, value: t.focusAmount, focus: true, href: `/companies/${t.companyId}`, sub: `${fmtCr(t.amount)} total` }))}
            />
          </div>
        </>
      )}
      <p className="method">
        Focus sectors map to the portal&rsquo;s Education, Special education, Vocational skills and Livelihood enhancement categories. The portal has
        no digital-literacy category; those projects are reported under Education.
      </p>

      {metrics && (
        <section className="section" aria-labelledby="h-acc">
          <h2 id="h-acc" className="section-title">
            <Icon name="spark" /> How reliable are the predictions? And what patterns show up?
            <InfoTip text="Back-tests: we hide the most recent year, predict it from earlier years only, and compare with what actually happened. Correlations are across companies; they show association, not cause." />
          </h2>
          <div className="grid2">
            <div className="card">
              <h3>Amount forecasts · back-test on {fyLabel(metrics.forecast.heldOutFy)}</h3>
              <p className="big">{metrics.forecast.withinRangePct ?? "–"}% <span className="muted small">landed inside the predicted range</span></p>
              <ul className="kv">
                <li><span>Typical error (median)</span><span>{metrics.forecast.medianAbsPctError ?? "–"}%</span></li>
                <li><span>Naive &ldquo;same as last year&rdquo; error</span><span>{metrics.forecast.baselineMedianAbsPctError ?? "–"}%</span></li>
                <li><span>Direction (up/down) right</span><span>{metrics.forecast.directionCorrectPct ?? "–"}%</span></li>
                <li><span>Companies tested</span><span>{metrics.forecast.companies.toLocaleString("en-IN")}</span></li>
              </ul>
              <p className="method">
                {metrics.forecast.medianAbsPctError != null && metrics.forecast.baselineMedianAbsPctError != null
                  ? metrics.forecast.medianAbsPctError < metrics.forecast.baselineMedianAbsPctError
                    ? "The forecast beats simply assuming last year repeats."
                    : "The forecast does not beat 'same as last year' on typical error: treat amounts as a rough range."
                  : ""}
              </p>
            </div>
            <div className="card">
              <h3>Announcement timing · back-test</h3>
              <p className="big">{metrics.timing.hitRatePct ?? "–"}% <span className="muted small">of held-out years fell in the predicted window</span></p>
              <ul className="kv">
                <li><span>A random 3-month window would hit</span><span>~{metrics.timing.baselinePct}%</span></li>
                <li><span>Companies tested (5+ active years)</span><span>{metrics.timing.companies}</span></li>
              </ul>
              <p className="method">Higher than the random baseline means recurring windows carry real signal; small samples make this indicative.</p>
            </div>
          </div>
          <ul className="corr-list">
            {metrics.correlations.map((c) => (
              <li key={c.id} className="card">
                <div className="corr-head">
                  <strong>{c.label}</strong>
                  <span className={`corr-r ${c.r != null && Math.abs(c.r) >= 0.3 ? "strong" : ""}`}>r = {c.r ?? "–"}</span>
                </div>
                <p className="muted small">{c.strength} · {c.n.toLocaleString("en-IN")} companies. {c.detail}</p>
                <span className="corr-meter" aria-hidden="true"><span style={{ left: `${50 + (c.r ?? 0) * 50}%` }} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sectors.length > 0 && (
        <section className="section">
          <h2 className="section-title"><Icon name="calendar" /> When companies announce, by sector</h2>
          <p className="muted small">Dated CSR announcements across all tracked companies. The outlined months are the busiest 3-month window.</p>
          <div className="grid2">
            {sectors.map((s) => (
              <MonthStrip
                key={s.id}
                months={s.months}
                windowStart={s.w.start}
                label={`${SECTOR_LABELS.get(s.id) ?? s.id}${DEFAULT_CONFIG.sectors.some((f) => f.id === s.id) ? " ★" : ""}: busiest ${windowLabel(s.w.start)} (${Math.round((s.w.count / s.total) * 100)}% of ${s.total})`}
              />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title"><Icon name="compass" /> Companies to plan around</h2>
        <nav className="filters" aria-label="Sort companies">
          {SORTS.map((s) => (
            <Link key={s.id} href={{ pathname: "/funding", query: { sort: s.id, ...(q ? { q } : {}) } }} className={s.id === sort ? "on" : undefined}>
              {s.label}
            </Link>
          ))}
          <form action="/funding">
            <input type="hidden" name="sort" value={sort} />
            <input type="search" name="q" defaultValue={q} placeholder="Find a company" aria-label="Find a company" />
          </form>
        </nav>
        <div className="rank-wrap">
          <table className="rank">
            <thead>
              <tr>
                <th>#</th>
                <th>Company</th>
                <th>Next window</th>
                <th>Focus {fyLabel(last.fy)} · MH</th>
                <th>Pune {fyLabel(last.fy)}</th>
                <th>Forecast focus {fyLabel(last.fy + 1)}</th>
                <th>Forecast total</th>
                <th>Years</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const t = r.s.data.timing;
                return (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td><Link className="company-link" href={`/companies/${r.id}`}>{r.name}</Link></td>
                    <td title={t.basis === "company" ? `${t.events} announcements, ${Math.round(t.windowShare * 100)}% in window` : "pattern across all companies"}>
                      {t.window ? `${t.window}${t.basis === "company" ? "" : "*"}` : "–"}
                    </td>
                    <td>{fmtCr(r.s.maharashtraFocusLastCr)}</td>
                    <td>{fmtCr(r.s.puneLastCr)}</td>
                    <td>{fmtCr(r.s.predictedFocusCr)}</td>
                    <td>{fmtCr(r.s.predictedTotalCr)}</td>
                    <td>{r.s.yearsActive}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="method">
          * no company-specific pattern yet (fewer than 4 dated announcements); the all-company pattern is shown. Forecasts: weighted
          average of the last 3 reported FYs adjusted by growth (capped ±25%). Companies under ₹1 cr in the last 3 FYs are not listed.
        </p>
      </section>
    </>
  );
}
