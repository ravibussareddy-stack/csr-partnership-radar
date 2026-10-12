// CSR calendar: a real year / month calendar. Past months show dated announcements that happened;
// current and future months show companies likely to announce (recurring windows, with evidence),
// plus the statutory CSR deadlines pinned on their dates.
import { Suspense } from "react";
import Link from "next/link";
import { InfoTip } from "@/app/components/InfoTip";
import { Logo } from "@/app/components/Logo";
import { Hero, Icon, PageBackdrop } from "@/app/components/illustrations";
import { getCachedNow, getUpcomingCycles, getYearEvents } from "@/lib/data";
import type { CalendarEvent, UpcomingCycle } from "@/lib/history/queries";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Statutory CSR dates (Companies Act 2013 s.135; CSR Policy Rules 2014, amended 2021). month is 1-based. */
const DEADLINES: { m: number; d: number; short: string; label: string }[] = [
  { m: 3, d: 31, short: "FY ends", label: "Financial year ends: last day to spend this year's 2% CSR obligation" },
  { m: 4, d: 1, short: "New CSR year", label: "New financial year: boards approve CSR policy and annual action plans (Rule 5(2))" },
  { m: 4, d: 30, short: "Unspent → account", label: "Unspent CSR for ongoing projects moves to the Unspent CSR Account (s.135(6))" },
  { m: 9, d: 30, short: "AGM · unspent → fund", label: "AGM deadline; other unspent CSR goes to a Schedule VII fund (s.135(5))" },
  { m: 10, d: 30, short: "AOC-4 filing", label: "AOC-4 with CSR disclosures, about 30 days after the AGM" },
];
/** Seasons of the CSR year, shown as ribbons on month tiles. */
const SEASON: Record<number, string> = {
  1: "Year-end push", 2: "Year-end push", 3: "Year-end push",
  4: "Budgets approved", 5: "Budgets approved", 6: "Budgets approved",
  7: "Disclosure season", 8: "Disclosure season", 9: "Disclosure season", 10: "Disclosure season",
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <main className="wrap wide">
      <PageBackdrop variant="seasons" />
      <Hero eyebrow="The recurring cycle" title="CSR calendar" variant="calendar">
        Which companies are likely to start an initiative each month, based on when they announced in past years, with the
        statutory CSR deadlines on their dates. Past months show what actually happened.
      </Hero>
      <Suspense fallback={<div className="glass card-pad">Loading the calendar…</div>}>
        {searchParams.then((sp) => <Calendar sp={sp} />)}
      </Suspense>
    </main>
  );
}

function windowStart(c: UpcomingCycle): number {
  return SHORT.indexOf(c.window.slice(0, 3)); // 0-based
}

function href(p: { y: number; m?: number; scope: string; geo?: string }) {
  const q = new URLSearchParams({ y: String(p.y) });
  if (p.m) q.set("m", String(p.m));
  if (p.scope === "all") q.set("scope", "all");
  if (p.geo && p.geo !== "india") q.set("geo", p.geo);
  return `/calendar?${q.toString()}`;
}

const GEOS = [
  { id: "india", label: "All India", help: "All companies with a recurring announcement window." },
  { id: "maharashtra", label: "Maharashtra", help: "Only companies that reported CSR spend in Maharashtra in the latest National CSR Portal year." },
  { id: "pune", label: "Pune district", help: "Only companies that reported CSR spend in Pune district in the latest National CSR Portal year." },
] as const;

/** Monday-first weeks for a month: arrays of day numbers (0 = padding). */
function weeksOf(y: number, m0: number): number[][] {
  const first = (new Date(Date.UTC(y, m0, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const cells = [...Array(first).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(0);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

function evidence(c: UpcomingCycle) {
  return `${c.window} in ${c.yearsHit.length} of ${c.activeYears.length} yrs`;
}

async function Calendar({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const scope = sp.scope === "all" ? "all" : "focus";
  const geo = sp.geo === "pune" ? "pune" : sp.geo === "maharashtra" ? "maharashtra" : "india";
  // Every link keeps the current geography unless it sets its own.
  const link = (p: { y: number; m?: number; scope: string; geo?: string }): string => href({ geo, ...p });
  const nowIso = await getCachedNow();
  const now = new Date(nowIso);
  const thisY = now.getUTCFullYear();
  const thisM = now.getUTCMonth();
  const y = Math.min(thisY + 2, Math.max(2009, Number(sp.y) || thisY));
  const mParam = Number(sp.m);
  const month = mParam >= 1 && mParam <= 12 ? mParam - 1 : null;
  const [allCycles, events] = await Promise.all([getUpcomingCycles(scope === "focus"), getYearEvents(y, scope === "focus")]);
  // Geography: where the company actually spends CSR (portal, latest year). Announcements in the
  // past months are not filtered, because a news item rarely states where the money will go.
  const cycles = allCycles?.filter((c) => geo === "india" || (geo === "pune" ? c.puneLastCr > 0 : c.maharashtraLastCr > 0));
  if (!cycles || !events) return <div className="notice glass"><h2>No history loaded</h2><p>Run the history scripts (see README).</p></div>;

  const rank = (c: UpcomingCycle) => (c.strength === "clear" ? 1e9 : 0) + c.yearsHit.length * 1e6 + c.predictedFocusCr;
  const opensIn = (m0: number) => cycles.filter((c) => windowStart(c) === m0).sort((a, b) => rank(b) - rank(a));
  const inWindow = (m0: number) => cycles.filter((c) => [1, 2].some((k) => (windowStart(c) + k) % 12 === m0)).sort((a, b) => rank(b) - rank(a));
  const isPast = (m0: number) => y < thisY || (y === thisY && m0 < thisM);
  const eventsIn = (m0: number) => events.filter((e) => new Date(e.date).getUTCMonth() === m0);

  return (
    <>
      <nav className="cal-controls glass" aria-label="Calendar navigation">
        <div className="chips">
          <Link className="chip" href={month === null ? link({ y: y - 1, scope }) : link({ y: month === 0 ? y - 1 : y, m: month === 0 ? 12 : month, scope })} aria-label="Previous">‹</Link>
          <strong className="cal-title">{month === null ? y : `${MONTHS[month]} ${y}`}</strong>
          <Link className="chip" href={month === null ? link({ y: y + 1, scope }) : link({ y: month === 11 ? y + 1 : y, m: month === 11 ? 1 : month + 2, scope })} aria-label="Next">›</Link>
          <Link className="chip" href={link({ y: thisY, m: month === null ? undefined : thisM + 1, scope })}>Today</Link>
        </div>
        <div className="chips">
          <Link className={month === null ? "chip on" : "chip"} href={link({ y, scope })}>Year</Link>
          <Link className={month !== null ? "chip on" : "chip"} href={link({ y, m: (month ?? (y === thisY ? thisM : 0)) + 1, scope })}>Month</Link>
          <span className="sep" />
          <Link className={scope === "focus" ? "chip on" : "chip"} href={link({ y, m: month === null ? undefined : month + 1, scope: "focus" })}>Your sectors</Link>
          <Link className={scope === "all" ? "chip on" : "chip"} href={link({ y, m: month === null ? undefined : month + 1, scope: "all" })}>All sectors</Link>
          <span className="sep" />
          {GEOS.map((g) => (
            <Link key={g.id} className={geo === g.id ? "chip on" : "chip"} title={g.help} href={link({ y, m: month === null ? undefined : month + 1, scope, geo: g.id })}>{g.label}</Link>
          ))}
          <InfoTip text="Filters the companies likely to start an initiative by where they reported CSR spend in the latest National CSR Portal year (Maharashtra or Pune district). Past announcements are not filtered, because news rarely says where the money will be spent." />
        </div>
      </nav>

      {month === null ? (
        <div className="year-grid">
          {MONTHS.map((name, m0) => {
            const past = isPast(m0);
            const opens = opensIn(m0);
            const happened = eventsIn(m0);
            const eventDays = new Set(happened.map((e) => new Date(e.date).getUTCDate()));
            const deadlines = DEADLINES.filter((d) => d.m === m0 + 1);
            const current = y === thisY && m0 === thisM;
            const names = [...new Set(happened.map((e) => e.company))];
            return (
              <Link key={name} href={link({ y, m: m0 + 1, scope })} className={`month-tile glass${current ? " current" : ""}${past ? " past" : ""}`}>
                <div className="tile-head">
                  <span className="tile-name">{name}</span>
                  {SEASON[m0 + 1] && <span className="season">{SEASON[m0 + 1]}</span>}
                </div>
                <table className="mini" aria-hidden="true">
                  <thead><tr>{WEEKDAYS.map((w) => <th key={w}>{w[0]}</th>)}</tr></thead>
                  <tbody>
                    {weeksOf(y, m0).map((wk, i) => (
                      <tr key={i}>
                        {wk.map((d, j) => (
                          <td key={j} className={[d && deadlines.some((x) => x.d === d) ? "dl" : "", d && eventDays.has(d) ? "ev" : "", current && d === now.getUTCDate() ? "today" : ""].join(" ").trim() || undefined}>
                            {d || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {deadlines.map((d) => <p key={d.short} className="tile-deadline">◆ {d.d} {SHORT[m0]}: {d.short}</p>)}
                {past ? (
                  <p className="tile-line">{happened.length ? <><b>{happened.length}</b> announcement{happened.length === 1 ? "" : "s"}: {names.slice(0, 2).join(", ")}{names.length > 2 ? "…" : ""}</> : <span className="muted">No dated announcements</span>}</p>
                ) : opens.length ? (
                  <div className="tile-likely">
                    <span className="likely-label">Likely to start</span>
                    <ul>
                      {opens.slice(0, 3).map((c) => (
                        <li key={c.companyId}><Logo name={c.name} domain={c.domain} size={20} /> <span>{c.name}</span>{c.topSectors[0] && <span className={c.topSectors[0].focus ? "tile-sector focus" : "tile-sector"}>{c.topSectors[0].sector}</span>}</li>
                      ))}
                    </ul>
                    {opens.length > 3 && <span className="muted small">+{opens.length - 3} more</span>}
                  </div>
                ) : (
                  <p className="tile-line muted">No recurring windows open</p>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <MonthView y={y} m0={month} now={now} past={isPast(month)} events={eventsIn(month)} opens={opensIn(month)} during={inWindow(month)} />
      )}

      <section className="section">
        <div className="cal-legend glass card-pad">
          <span><span className="k k-dl" /> statutory CSR date</span>
          <span><span className="k k-ev" /> dated announcement (past)</span>
          <span><span className="k k-today" /> today</span>
          <span className="muted small">
            &ldquo;Likely to start&rdquo; = the company&rsquo;s recurring 3-month announcement window opens that month: a <b>clear</b> cycle repeats in ≥ 60% of
            4+ active years, a <b>mild</b> one in ≥ 40% of 3+. Source: CSR news archives since 2009.
          </span>
        </div>
      </section>
    </>
  );
}

function MonthView({ y, m0, now, past, events, opens, during }: { y: number; m0: number; now: Date; past: boolean; events: CalendarEvent[]; opens: UpcomingCycle[]; during: UpcomingCycle[] }) {
  const byDay = new Map<number, CalendarEvent[]>();
  for (const e of events) {
    const d = new Date(e.date).getUTCDate();
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e);
  }
  const deadlines = DEADLINES.filter((d) => d.m === m0 + 1);
  const isToday = (d: number) => now.getUTCFullYear() === y && now.getUTCMonth() === m0 && now.getUTCDate() === d;

  return (
    <div className="month-layout">
      <div className="month-grid glass">
        <div className="mg-head">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
        {weeksOf(y, m0).map((wk, i) => (
          <div key={i} className="mg-week">
            {wk.map((d, j) => {
              const dl = deadlines.filter((x) => x.d === d);
              const ev = byDay.get(d) ?? [];
              return (
                <div key={j} className={`mg-day${d ? "" : " pad"}${isToday(d) ? " today" : ""}${dl.length ? " has-dl" : ""}`}>
                  {d > 0 && <span className="mg-num">{d}</span>}
                  {dl.map((x) => <span key={x.short} className="mg-dl" title={x.label}>◆ {x.short}</span>)}
                  {ev.slice(0, 2).map((e) => (
                    <a key={e.url} className="mg-ev" href={e.url} target="_blank" rel="noopener noreferrer" title={e.title}>{e.company}</a>
                  ))}
                  {ev.length > 2 && <span className="mg-more">+{ev.length - 2} more</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <aside className="month-side">
        {deadlines.length > 0 && (
          <div className="glass card-pad">
            <h3 className="side-title"><Icon name="sun" /> Statutory dates <InfoTip text="Fixed dates in every Indian CSR year (Companies Act 2013, section 135; CSR Policy Rules 2014, amended 2021). Budgets and partners are usually decided around them." /></h3>
            <ul className="kv">{deadlines.map((d) => <li key={d.short}><span>{d.d} {MONTHS[m0]}</span><span>{d.label}</span></li>)}</ul>
          </div>
        )}
        <div className="glass card-pad">
          <h3 className="side-title"><Icon name="calendar" /> {past ? "Usually announced this month" : "Likely to start an initiative"} <InfoTip text="Companies whose dated CSR announcements since 2009 cluster in a 3-month window that opens this month. Clear = the window was hit in at least 60% of 4+ active years; mild = 40% of 3+. Highlighted years are the evidence." /></h3>
          {opens.length === 0 ? <p className="muted small">No recurring windows open this month.</p> : (
            <ul className="likely-list">
              {opens.slice(0, 12).map((c) => {
                const hit = new Set(c.yearsHit);
                return (
                  <li key={c.companyId}>
                    <Logo name={c.name} domain={c.domain} size={28} />
                    <div>
                      <Link href={`/companies/${c.companyId}`} className="cue-company">{c.name}</Link>
                      <span className="muted small"> · <span className={`strength ${c.strength}`}>{c.strength}</span> · {evidence(c)}</span>
                      <span className="years">{c.activeYears.slice(-8).map((yy) => <span key={yy} className={`yr${hit.has(yy) ? " hit" : ""}`}>{yy}</span>)}</span>
                      {c.topSectors.length > 0 && (
                        <ul className="facts" aria-label="Where their CSR money goes (latest 3 years)">
                          {c.topSectors.map((t) => <li key={t.sector} className={t.focus ? "fact fact-good" : "fact"}>{t.sector} {t.share}%</li>)}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {during.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>Also inside their window this month: {during.slice(0, 6).map((c) => c.name).join(", ")}{during.length > 6 ? ` +${during.length - 6}` : ""}.</p>}
        </div>
        <div className="glass card-pad">
          <h3 className="side-title"><Icon name="leaf" /> {past ? "What happened" : "So far this month"}</h3>
          {events.length === 0 ? <p className="muted small">No dated announcements{past ? "" : " yet"}.</p> : (
            <ul className="kv">{events.slice(0, 10).map((e) => <li key={e.url}><span><a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a></span><span>{new Date(e.date).getUTCDate()} {SHORT[m0]}</span></li>)}</ul>
          )}
        </div>
      </aside>
    </div>
  );
}
