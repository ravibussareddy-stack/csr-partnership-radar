// CSR calendar: the recurring cycle. Statutory CSR year + each company's recurring announcement
// window (year-consistency, with the years as justification) + the year × month evidence.
import { Suspense } from "react";
import Link from "next/link";
import { fmtCr, YearMonthCalendar } from "@/app/components/charts";
import { Hero, Icon } from "@/app/components/illustrations";
import { getAnnouncementGrid, getCachedNow, getUpcomingCycles } from "@/lib/data";
import type { UpcomingCycle } from "@/lib/history/queries";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PER_MONTH = 8;

/** The legal rhythm of an Indian CSR year (Companies Act 2013 s.135; CSR Policy Rules 2014, amended 2021). */
const STATUTORY: { months: string; title: string; detail: string }[] = [
  {
    months: "Apr – Jun",
    title: "New CSR year starts; budgets approved",
    detail: "The financial year starts 1 April. Boards typically approve the CSR policy and annual action plan (Rule 5(2)) early in the year, so implementing partners are often chosen now.",
  },
  {
    months: "Apr 30",
    title: "Unspent money on ongoing projects parked",
    detail: "Unspent CSR for ongoing projects must move to an Unspent CSR Account within 30 days of the year end (s.135(6)), and is then spent over the next three years.",
  },
  {
    months: "Jul – Oct",
    title: "Annual reports and CSR disclosures",
    detail: "AGMs fall by 30 September (within six months of the year end), with the CSR annexure in the Board Report and AOC-4 filed within 30 days of the AGM. Spend figures and new commitments hit the news.",
  },
  {
    months: "Sep 30",
    title: "Other unspent CSR leaves the company",
    detail: "Unspent CSR not tied to ongoing projects goes to a Schedule VII fund within six months of the year end (s.135(5)), so companies prefer to commit it to projects before then.",
  },
  {
    months: "Jan – Mar",
    title: "Year-end spending push",
    detail: "Companies close gaps against their 2% obligation before 31 March: a good time to offer ready-to-fund, well-documented programmes.",
  },
];

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <main className="wrap wide">
      <Hero eyebrow="The recurring cycle" title="CSR calendar" variant="calendar">
        When companies tend to announce, month by month. Each window comes with the years that back it, so you can plan outreach
        before decisions are made, not after.
      </Hero>
      <Suspense fallback={<p className="muted">Loading the calendar…</p>}>
        {searchParams.then((sp) => <Calendar sp={sp} />)}
      </Suspense>
    </main>
  );
}

function monthIndex(now: Date, offset: number) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), key: d.getUTCFullYear() * 12 + d.getUTCMonth() };
}

function CycleRow({ c }: { c: UpcomingCycle }) {
  const hit = new Set(c.yearsHit);
  return (
    <div className="cycle">
      <span>
        <Link className="company-link" href={`/companies/${c.companyId}`}>{c.name}</Link>{" "}
        <span className={`strength ${c.strength}`}>{c.strength === "clear" ? "clear cycle" : "mild cycle"}</span>
      </span>
      <span className="muted small">{c.window}</span>
      <p className="why">
        Announced in {c.window} in {c.yearsHit.length} of {c.activeYears.length} active years{" "}
        <span className="years">
          {c.activeYears.map((y) => (
            <span key={y} className={`yr${hit.has(y) ? " hit" : ""}`}>{y}</span>
          ))}
        </span>
        {c.predictedFocusCr > 0 ? ` · forecast ${fmtCr(c.predictedFocusCr)} in your sectors next year` : ` · forecast ${fmtCr(c.predictedTotalCr)} CSR next year`}
      </p>
    </div>
  );
}

async function Calendar({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const scope = sp.scope === "all" ? "all" : "focus";
  const [cycles, grid, nowIso] = await Promise.all([getUpcomingCycles(scope === "focus"), getAnnouncementGrid(scope === "focus"), getCachedNow()]);
  const now = new Date(nowIso);
  if (!cycles || !grid) {
    return <div className="notice"><h2>No history loaded</h2><p>Run the history scripts (see README).</p></div>;
  }

  // Group by the month the next window opens; windows already open fall into the current month.
  const nowKey = monthIndex(now, 0).key;
  const months = Array.from({ length: 12 }, (_, i) => ({ ...monthIndex(now, i), items: [] as UpcomingCycle[] }));
  for (const c of cycles) {
    const d = new Date(c.nextWindowStart);
    const key = Math.max(nowKey, d.getUTCFullYear() * 12 + d.getUTCMonth());
    months.find((m) => m.key === key)?.items.push(c);
  }
  const rank = (c: UpcomingCycle) => (c.strength === "clear" ? 1e9 : 0) + c.yearsHit.length * 1e6 + c.predictedFocusCr;
  for (const m of months) m.items.sort((a, b) => rank(b) - rank(a));

  return (
    <>
      <section className="section">
        <h2 className="section-title"><Icon name="sun" /> The CSR year</h2>
        <p className="muted small">The legal rhythm behind the calendar (Companies Act 2013, section 135; CSR Policy Rules 2014, amended 2021).</p>
        <div className="grid2">
          {STATUTORY.map((s) => (
            <div key={s.title} className="card">
              <h3>{s.months}</h3>
              <p><strong>{s.title}</strong></p>
              <p className="muted small">{s.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title"><Icon name="calendar" /> The next 12 months</h2>
        <nav className="filters" aria-label="Scope">
          <Link href="/calendar" className={scope === "focus" ? "on" : undefined}>Companies funding your sectors</Link>
          <Link href="/calendar?scope=all" className={scope === "all" ? "on" : undefined}>All sectors (for expansion)</Link>
        </nav>
        <p className="muted small">
          A company is listed when its dated CSR announcements since 2009 repeat in the same 3-month window: a <strong>clear cycle</strong> is
          hit in at least 60% of 4+ active years, a <strong>mild cycle</strong> in at least 40% of 3+ years. Ticked years are the evidence.
        </p>
        <ol className="timeline" style={{ marginTop: 14 }}>
          {months.map((m) => (
            <li key={m.key} className={`month-card${m.key === nowKey ? " now" : ""}${m.items.length === 0 ? " quiet" : ""}`}>
              <h3>
                {MONTHS[m.month]} {m.year}
                <span className="muted">
                  {m.key === nowKey ? "windows open now · " : ""}
                  {m.items.length} compan{m.items.length === 1 ? "y" : "ies"}
                </span>
              </h3>
              {m.items.length === 0 ? null : (
                <>
                  {m.items.slice(0, PER_MONTH).map((c) => <CycleRow key={c.companyId} c={c} />)}
                  {m.items.length > PER_MONTH && <p className="muted small">and {m.items.length - PER_MONTH} more</p>}
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="section">
        <h2 className="section-title"><Icon name="leaf" /> The evidence: announcements by month and year</h2>
        <YearMonthCalendar
          grid={grid}
          now={now}
          fromYear={2014}
          title={`Dated CSR announcements ${scope === "focus" ? "in your focus sectors" : "in all sectors"} (CSR news archives, all tracked companies)`}
        />
        <p className="method">
          Coverage grows over time: the archives are thinner before 2019, and the last 12 months are complete for every company. Counts
          are announcements (new initiatives, partnerships, spend/allocation news, partner searches), not ongoing activity.
        </p>
      </section>
    </>
  );
}
