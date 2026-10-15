// Current relationships: Ananya's existing funders and contracts, and what changes mean for each
// (company news, rule changes, spend trends, renewal timing). Team-only and never cached: contract
// details are confidential.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { InfoTip } from "@/app/components/InfoTip";
import { Logo } from "@/app/components/Logo";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { fmtCr } from "@/app/components/charts";
import { getSectors } from "@/lib/data";
import { loadRelationships, type RelationshipView } from "@/lib/relationships";
import { currentMember } from "@/lib/session";
import { DismissAlert, RelationshipActions, RelationshipForm } from "./RelationshipForms";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const LEVEL: Record<string, string> = { risk: "At risk", watch: "Watch", opportunity: "Opportunity", ok: "No changes" };
const KIND: Record<string, string> = { company_news: "Company news", regulatory: "Rule change", spend_change: "CSR spend trend", renewal: "Renewal timing", hiring: "CSR hiring" };
const STATUS: Record<string, string> = { active: "Active", renewal_due: "Renewal due", prospect: "In discussion", lapsed: "Lapsed" };

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="network" />
      <Hero eyebrow="Relationships" title="Your current funders, watched daily" variant="planner" poster="relationships">
        Add the companies you already work with. Every day the Radar checks their CSR news, rule changes, their reported CSR spend and
        your renewal timing, and tells you what each change means for the contract, with its reasoning.{" "}
        <InfoTip text="Levels: At risk = could reduce, delay or end the funding or add obligations. Opportunity = could expand it. Watch = relevant, direction unclear. Renewal timing, spend trends and CSR hiring are calculated from the data (no AI); company news and rule changes are judged by Gemini against this specific contract, and a rule that is not official yet is never shown as more than Watch. Only your team can see this page." />
      </Hero>
      <Suspense fallback={<div className="glass card-pad">Loading relationships…</div>}>
        <Body />
      </Suspense>
    </main>
    </PageTransition>
  );
}

async function Body() {
  await connection();
  const me = await currentMember();
  if (!me) {
    return <div className="notice glass"><h2>Team only</h2><p>Contract details are private. <Link href="/inbox">Sign in on People messages</Link> to see and add relationships.</p></div>;
  }
  const [rels, sectorRows] = await Promise.all([loadRelationships(), getSectors()]);
  const sectors = sectorRows.map((s) => ({ id: s.id, label: s.label }));
  const sectorLabel = new Map(sectors.map((s) => [s.id, s.label]));
  const soon = rels.filter((r) => r.renewalInDays != null && r.renewalInDays <= 90 && r.status !== "lapsed");
  const total = rels.filter((r) => r.status !== "lapsed").reduce((a, r) => a + (r.valueLakh ?? 0), 0);
  return (
    <>
      <ul className="impact">
        <li className="glass-chip"><b>{rels.filter((r) => r.status !== "lapsed").length}</b> current relationships</li>
        {total > 0 && <li className="glass-chip"><b>₹{total.toLocaleString("en-IN")} lakh</b> under contract</li>}
        <li className="glass-chip"><b>{rels.filter((r) => r.alerts.some((a) => a.level === "risk")).length}</b> at risk</li>
        <li className="glass-chip"><b>{rels.filter((r) => r.alerts.some((a) => a.level === "opportunity")).length}</b> with an opportunity</li>
        <li className="glass-chip"><b>{soon.length}</b> renewals in 90 days</li>
      </ul>

      <section className="section" aria-labelledby="h-rel-list">
        <h2 id="h-rel-list" className="section-title">Relationships</h2>
        {rels.length === 0 ? (
          <p className="muted">None yet. Add your first funder below; the first check runs within a few minutes.</p>
        ) : (
          <div className="rel-list">{rels.map((r) => <RelationshipCard key={r.id} r={r} sectorLabel={sectorLabel} sectors={sectors} />)}</div>
        )}
      </section>

      <section className="section glass card-pad" aria-labelledby="h-rel-add">
        <h2 id="h-rel-add" className="section-title">Add a relationship</h2>
        <RelationshipForm sectors={sectors} />
      </section>
    </>
  );
}

function RelationshipCard({ r, sectorLabel, sectors }: { r: RelationshipView; sectorLabel: Map<string, string>; sectors: { id: string; label: string }[] }) {
  const days = r.renewalInDays;
  return (
    <article className={`glass card-pad rel-card spot rel-${r.health}`}>
      <header className="cue-head">
        <Logo name={r.companyName} domain={r.domain} size={44} />
        <div className="cue-who">
          {r.companyId ? <Link href={`/companies/${r.companyId}`} className="cue-company">{r.companyName}</Link> : <span className="cue-company">{r.companyName}</span>}
          <span className="cue-type">{r.programme ?? "Programme not set"} · {STATUS[r.status]}</span>
        </div>
        <span className={`rel-health rel-h-${r.health}`}>{LEVEL[r.health]}</span>
      </header>
      <ul className="facts">
        {r.valueLakh != null && <li className="fact">₹{r.valueLakh.toLocaleString("en-IN")} lakh</li>}
        {r.renewalDate && <li className={days != null && days <= 60 ? "fact fact-review" : "fact"}>Renewal {dateFmt.format(new Date(r.renewalDate))}{days != null ? ` · ${days < 0 ? `${-days} days ago` : `in ${days} days`}` : ""}</li>}
        {r.sectors.map((s) => <li key={s} className="fact fact-good">{sectorLabel.get(s) ?? s}</li>)}
        {r.districts.length > 0 && <li className="fact">{r.districts.join(", ")}</li>}
        {r.contactRole && <li className="fact">Contact: {r.contactRole}</li>}
      </ul>
      {r.portal ? (
        <p className="small muted">
          CSR Portal FY{r.portal.fy}-{String(r.portal.fy + 1).slice(2)}: {fmtCr(r.portal.focusCr)} in your sectors · Maharashtra {fmtCr(r.portal.maharashtraCr)} · Pune {fmtCr(r.portal.puneCr)}
          {r.portal.window ? ` · announces in ${r.portal.window}` : ""}
        </p>
      ) : (
        <p className="small muted">Not matched to CSR Portal records (spend and timing checks skipped). Try the company&rsquo;s registered name.</p>
      )}
      {r.radarHelped && <p className="small"><span className="fact fact-good">Found with the Radar</span>{r.radarNote ? ` ${r.radarNote}` : ""}</p>}
      {r.notes && <p className="small">{r.notes}</p>}
      {r.alerts.length === 0 ? (
        <p className="small muted">{r.lastCheckedAt ? `No changes found (last checked ${dateFmt.format(new Date(r.lastCheckedAt))}).` : "First check pending (within a few minutes)."}</p>
      ) : (
        <ol className="rel-alerts">
          {r.alerts.map((a) => (
            <li key={a.id} className={`rel-alert rel-a-${a.level}`}>
              <p className="small"><span className={`rel-health rel-h-${a.level}`}>{LEVEL[a.level]}</span> <span className="muted">{KIND[a.kind] ?? a.kind} · {dateFmt.format(new Date(a.createdAt))}</span></p>
              <p className="rel-alert-title">{a.title}</p>
              <p className="small">{a.impact}</p>
              <details className="small"><summary>Why this level</summary><p>{a.reasoning}</p></details>
              <div className="row">
                {a.sourceUrl && <a className="chip" href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Source ↗</a>}
                <DismissAlert id={a.id} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <RelationshipActions rel={r} sectors={sectors} />
    </article>
  );
}
