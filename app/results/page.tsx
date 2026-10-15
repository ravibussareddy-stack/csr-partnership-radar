// Results: is the Radar a success for the team? Helpfulness (👍 / 👎 on cards), opportunities it missed,
// partnerships it helped win and their value, and how quickly it finds news. Team-only, never cached
// (contract values are confidential).
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { InfoTip } from "@/app/components/InfoTip";
import { MissedForm } from "@/app/components/MissedForm";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { currentMember } from "@/lib/session";
import { loadResults } from "@/lib/results";

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const TIER: Record<string, string> = { call_this_week: "Call this week", watch: "Watch", background: "Background" };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const money = (lakh: number) => (lakh >= 100 ? `₹${(lakh / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })} crore` : `₹${lakh.toLocaleString("en-IN", { maximumFractionDigits: 1 })} lakh`);

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="team" />
      <Hero eyebrow="Results" title="Is the Radar working for us?" variant="planner" poster="team">
        Four measures of success: are the cards helpful, what did it miss, which partnerships did it help win, and how fast does it find news.{" "}
        <InfoTip text="Built from what the team records as it works: 👍 / 👎 on each card, 'Did the Radar miss something?' reports, and the 'The Radar helped us find or win this' tick on Relationships. Lead time is calculated automatically. The numbers become meaningful after a few weeks of use." />
      </Hero>
      <Suspense fallback={<div className="glass card-pad">Loading results…</div>}>
        <Body />
      </Suspense>
    </main>
    </PageTransition>
  );
}

async function Body() {
  await connection();
  const me = await currentMember();
  if (!me) return <div className="notice glass"><h2>Sign in to see results</h2><p><Link href="/inbox">Sign in on People messages</Link> with your name and passcode.</p></div>;
  const r = await loadResults();
  if (!r) return <div className="notice glass"><h2>No database configured</h2></div>;
  const rated = r.helpful.up + r.helpful.down;
  const rated30 = r.helpful.up30 + r.helpful.down30;
  return (
    <>
      <ul className="ov-stats results-stats">
        <li><b>{pct(r.helpful.up, rated)}</b><span>cards rated helpful ({rated} rated)</span></li>
        <li><b>{r.missed.last30}</b><span>misses reported (30 days)</span></li>
        <li><b>{r.relationships.helped}</b><span>partnerships the Radar helped win</span></li>
        <li><b>{money(r.relationships.valueHelpedLakh)}</b><span>contract value supported</span></li>
        <li><b>{r.leadTime.medianDays != null ? `${r.leadTime.medianDays} d` : "–"}</b><span>median days from publication to the Radar</span></li>
      </ul>

      <section className="section" aria-labelledby="h-help">
        <h2 id="h-help" className="section-title">1 · Were the cards helpful? <InfoTip text="From the 👍 / 👎 on every Digest card. A low share on Call this week means the calls aren't trustworthy; a high share on Background means good items are being buried." /></h2>
        <div className="glass card-pad">
          <p>{rated === 0 ? "No ratings yet. Use 👍 / 👎 on Digest cards." : <>All time <b>{r.helpful.up}</b> 👍 · <b>{r.helpful.down}</b> 👎 ({pct(r.helpful.up, rated)} helpful) · last 30 days <b>{r.helpful.up30}</b> 👍 · <b>{r.helpful.down30}</b> 👎 ({pct(r.helpful.up30, rated30)})</>}</p>
          {rated > 0 && (
            <ul className="kv">
              {r.helpful.byTier.filter((t) => t.up + t.down > 0).map((t) => (
                <li key={t.tier}><span>{TIER[t.tier]}</span><span>{t.up} 👍 · {t.down} 👎 · {pct(t.up, t.up + t.down)} helpful</span></li>
              ))}
            </ul>
          )}
          {r.helpful.recentDown.length > 0 && (
            <>
              <p className="small muted" style={{ marginTop: 8 }}>Recently marked not helpful</p>
              <ul className="kv">{r.helpful.recentDown.map((d, k) => <li key={k}><span>{d.url.startsWith("http") ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> : d.title}</span><span>{d.by} · {when.format(new Date(d.at))}</span></li>)}</ul>
            </>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="h-miss">
        <h2 id="h-miss" className="section-title">2 · What did the Radar miss? <InfoTip text="Opportunities a teammate found elsewhere. 'New to the Radar' means it never collected the story (a coverage gap: add a source or search). 'Already had it' means it was collected but ranked too low (a scoring gap)." /></h2>
        <MissedForm />
        <div className="glass card-pad" style={{ marginTop: 10 }}>
          <p>{r.missed.total === 0 ? "No misses reported yet." : <><b>{r.missed.total}</b> reported · <b>{r.missed.total - r.missed.alreadyHad}</b> new to the Radar (coverage gap) · <b>{r.missed.alreadyHad}</b> already collected but ranked low (scoring gap)</>}</p>
          {r.missed.recent.length > 0 && (
            <ul className="kv">
              {r.missed.recent.map((m, k) => (
                <li key={k}>
                  <span>{m.url?.startsWith("http") ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.summary.replace(/^Reported missed \([^)]*\): /, "")}</a> : m.summary}</span>
                  <span>{m.alreadyHad ? "already had it" : "new to the Radar"}{m.tier ? ` · now ${TIER[m.tier]}` : ""} · {m.by} · {when.format(new Date(m.at))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="h-won">
        <h2 id="h-won" className="section-title">3 · Partnerships the Radar helped win <InfoTip text="Relationships ticked 'The Radar helped us find or win this partnership' on the Relationships page, with their contract value. Tick it when adding or editing a relationship." /></h2>
        <div className="glass card-pad">
          <p>
            <b>{r.relationships.helped}</b> of {r.relationships.total} relationships · <b>{money(r.relationships.valueHelpedLakh)}</b> of {money(r.relationships.valueAllLakh)} in contract value
            {r.relationships.valueAllLakh > 0 ? ` (${pct(r.relationships.valueHelpedLakh, r.relationships.valueAllLakh)})` : ""}
          </p>
          {r.relationships.list.length === 0 ? (
            <p className="small muted">None marked yet. On <Link href="/relationships">Relationships</Link>, tick &ldquo;The Radar helped us find or win this partnership&rdquo;.</p>
          ) : (
            <ul className="kv">
              {r.relationships.list.map((x, k) => (
                <li key={k}><span><b>{x.company}</b>{x.programme ? ` · ${x.programme}` : ""}{x.note ? <span className="muted small"> · {x.note}</span> : null}</span><span>{x.valueLakh != null ? money(x.valueLakh) : "value not set"}</span></li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="h-lead">
        <h2 id="h-lead" className="section-title">4 · How fast does the Radar find news? <InfoTip text="For articles scored in the last 30 days: days from the article's publication date to when the Radar collected it. The brief's example was a company searching for partners for three months before the team knew." /></h2>
        <div className="glass card-pad">
          <p>{r.leadTime.items === 0 ? "Not enough dated articles yet." : <>Median <b>{r.leadTime.medianDays} days</b> from publication to the Radar · <b>{r.leadTime.within2Days}%</b> found within 2 days · {r.leadTime.items} articles in the last 30 days</>}</p>
        </div>
      </section>
    </>
  );
}
