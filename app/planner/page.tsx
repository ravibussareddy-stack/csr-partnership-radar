// Expansion planner: where CSR money for the focus sectors is, where it is heading, and when companies announce.
import { Suspense } from "react";
import Link from "next/link";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { fmtCr, MonthStrip, StackedYearBars } from "@/app/components/charts";
import { Hero, Icon, PageBackdrop } from "@/app/components/illustrations";
import { fyLabel } from "@/lib/companies";
import { bestWindow, windowLabel } from "@/lib/history/predict";
import { getPlanner, getRegionTrend, getSectorSeasonality } from "@/lib/data";
import type { PlannerSort } from "@/lib/history/queries";
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
      <PageBackdrop variant="map" />
      <Hero eyebrow="Where the money is going" title="Expansion planner" variant="planner">
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
  const [rows, trend, seasonalityEntries] = await Promise.all([getPlanner(sort, q), getRegionTrend(), getSectorSeasonality()]);
  const seasonality = seasonalityEntries ? new Map(seasonalityEntries) : null;
  if (!rows || !trend) {
    return <div className="notice"><h2>No history loaded</h2><p>Run <code>npm run history:import</code> and <code>npm run history:stats</code>.</p></div>;
  }
  if (trend.length === 0) {
    return <div className="notice"><h2>No history loaded</h2><p>Import the National CSR Portal report with <code>npm run history:import</code>.</p></div>;
  }
  const first = trend[0];
  const last = trend.at(-1)!;
  const growth = first.puneFocus > 0 ? last.puneFocus / first.puneFocus : null;

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
      <div className="grid2">
        <div className="card">
          <h3>Pune district · focus sectors · {fyLabel(last.fy)}</h3>
          <p className="big">{fmtCr(last.puneFocus)}</p>
          <p className="muted small">
            from {last.puneCompanies.toLocaleString("en-IN")} companies{growth ? ` · ${growth.toFixed(1)}× ${fyLabel(first.fy)}` : ""}
          </p>
        </div>
        <div className="card">
          <h3>Maharashtra · focus sectors · {fyLabel(last.fy)}</h3>
          <p className="big">{fmtCr(last.mhFocus)}</p>
          <p className="muted small">of {fmtCr(last.mhAll)} total CSR in the state</p>
        </div>
      </div>

      <div className="grid2 charts2">
        <StackedYearBars
          title="Pune district: CSR spent per year"
          rows={trend.map((r) => ({ label: fyLabel(r.fy), short: short(r.fy), focus: r.puneFocus, other: Math.max(0, r.puneAll - r.puneFocus) }))}
        />
        <StackedYearBars
          title="Maharashtra: CSR spent per year"
          rows={trend.map((r) => ({ label: fyLabel(r.fy), short: short(r.fy), focus: r.mhFocus, other: Math.max(0, r.mhAll - r.mhFocus) }))}
        />
      </div>
      <p className="method">
        Focus sectors map to the portal&rsquo;s Education, Special education, Vocational skills and Livelihood enhancement categories. The portal has
        no digital-literacy category; those projects are reported under Education.
      </p>

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
            <Link key={s.id} href={{ pathname: "/planner", query: { sort: s.id, ...(q ? { q } : {}) } }} className={s.id === sort ? "on" : undefined}>
              {s.label}
            </Link>
          ))}
          <form action="/planner">
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
