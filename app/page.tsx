// 1 · Summary: a one-page overview. Six key-point panels, each with its top items as one-liners and a
// link to the page with the detail. Public panels are cached (lib/data.ts); "Your partners" renders
// per request for signed-in teammates only.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import Link from "next/link";
import { Greeting } from "@/app/components/Greeting";
import { InfoTip } from "@/app/components/InfoTip";
import { Logo } from "@/app/components/Logo";
import { PartnerWatch } from "@/app/components/PartnerWatch";
import { RegulatoryBrief } from "@/app/components/RegulatoryBrief";
import { PageBackdrop } from "@/app/components/illustrations";
import { NamasteArt } from "@/app/components/posters";
import { fmtCr } from "@/app/components/charts";
import { getImpactStats, getRegulatory, getSummary } from "@/lib/data";
import { CALL_TYPE_HELP, CALL_TYPE_LABELS } from "@/lib/insights";

const dateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

const TIER_TIP =
  "Call this week = a company is putting money into your sectors or looking for NGO partners right now, recently enough that a call this week can still change the outcome. Open the Digest for Watch and Background items.";

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="classroom" />
      <Suspense fallback={<div className="ov-head glass skeleton" />}>
        <Overview />
      </Suspense>
    </main>
    </PageTransition>
  );
}

function Panel({ n, title, tip, more, href, children }: { n: number; title: string; tip: string; more: string; href: string; children: React.ReactNode }) {
  return (
    <section className="ov-panel glass spot" aria-labelledby={`ov-${n}`}>
      <h2 id={`ov-${n}`} className="ov-title"><span className="step">{n}</span> {title} <InfoTip text={tip} /></h2>
      <div className="ov-body">{children}</div>
      <Link href={href} className="ov-more">{more} →</Link>
    </section>
  );
}

async function Overview() {
  const [data, stats, reg] = await Promise.all([getSummary(), getImpactStats(), getRegulatory()]);
  if (!data) return <div className="notice glass"><h2>No database configured</h2><p>Set DATABASE_URL and run npm run ingest.</p></div>;
  const { calls, introduce, hiring, likelySoon } = data;
  const regCounts = { executed: 0, confirmed: 0, inferred: 0 };
  for (const i of reg.items) regCounts[i.status]++;

  return (
    <>
      <header className="ov-head glass">
        <div className="ov-welcome">
          <NamasteArt />
          <div>
          <p className="eyebrow">1 · Summary{data.lastUpdated ? ` · updated ${dateTime.format(new Date(data.lastUpdated))}` : ""}</p>
          <Greeting name="Ananya" />
          <p className="namaste-line">Namaste · Vanakkam · नमस्कार</p>
          <p className="lede small">This week at a glance. Each panel shows the top items; open it for the detail.</p>
          </div>
        </div>
        <ul className="ov-stats">
          <li><b>{calls.length}</b><span>to call this week</span></li>
          <li><b>{likelySoon.length}</b><span>likely to fund Pune / MH in 30 days</span></li>
          <li><b>{hiring.length}</b><span>companies hiring for CSR</span></li>
          <li><b>{reg.items.length}</b><span>rule updates (6 months)</span></li>
          {stats && <li><b>{stats.hoursSaved} h</b><span>searching saved this week</span></li>}
        </ul>
      </header>

      <div className="ov-grid">
        <Panel n={1} title="Call this week" tip={`${TIER_TIP} A call must pass every check: a named funder, an NGO partner route, Pune/Maharashtra or national (or a company already funding in Maharashtra), and the analysis itself recommending outreach now. Each call is an Open opportunity (the company is asking for partners: partner search, call for proposals, RFP, EOI) or a Warm lead (it funds your sectors through NGOs; approach now for its next cycle). "Introduce soon" are good leads that aren't urgent.`} more={`All in the digest`} href="/digest">
          {calls.length === 0 ? <p className="muted small">No calls this week.</p> : (
            <ul className="ov-list">
              {calls.slice(0, introduce.length ? 2 : 3).map((c) => (
                <li key={c.key}>
                  <Logo name={c.company ?? "?"} domain={c.domain} size={26} />
                  <span>{c.callType && <span className={`call-type ct-${c.callType}`} title={CALL_TYPE_HELP[c.callType]}>{CALL_TYPE_LABELS[c.callType]}</span>} <b>{c.company ?? "Company not named"}</b>: {c.title}<span className="muted small ov-clamp"> {c.worthIt ?? c.summary}</span></span>
                </li>
              ))}
            </ul>
          )}
          {introduce.length > 0 && (
            <p className="small ov-introduce">
              <span className="fact fact-good">Introduce soon · {introduce.length}</span> {introduce.slice(0, 4).map((i) => i.company).filter(Boolean).join(", ")}
            </p>
          )}
        </Panel>

        <Panel n={2} title="Your partners" tip="Risks and opportunities on the funders you already work with: their CSR news, rule changes, spend trends and renewal timing. Team only." more="Relationships" href="/relationships">
          <Suspense fallback={<p className="muted small">Checking your partners…</p>}>
            <PartnerWatch limit={3} />
          </Suspense>
        </Panel>

        <Panel n={3} title="Likely to fund Pune & Maharashtra · 30 days" tip="Companies that spend CSR in Pune district or Maharashtra (National CSR Portal, latest year) and whose recurring announcement window is open now or opens within 30 days, from their dated CSR announcements since 2009." more="CSR calendar" href="/calendar?geo=maharashtra">
          {likelySoon.length === 0 ? <p className="muted small">No windows opening in the next 30 days.</p> : (
            <ul className="ov-list">
              {likelySoon.slice(0, 3).map((c) => (
                <li key={c.companyId}>
                  <Logo name={c.name} domain={c.domain} size={26} />
                  <span>
                    <Link href={`/companies/${c.companyId}`}><b>{c.name}</b></Link>{" "}
                    <span className="muted small">{c.inWindow ? `window ${c.window} open now` : `window opens in ${c.opensIn} d`} · {c.puneLastCr > 0 ? `Pune ${fmtCr(c.puneLastCr)}` : `MH ${fmtCr(c.maharashtraLastCr)}`} · {c.strength} cycle{c.topSectors[0] ? ` · ${c.topSectors[0].sector} ${c.topSectors[0].share}%` : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel n={4} title="Hiring observed" tip="Companies recruiting CSR, foundation or community roles in the last 30 days (verified job links only). A new CSR hire usually means new programmes and partners within months." more="Hiring radar" href="/jobs">
          {hiring.length === 0 ? <p className="muted small">No verified CSR postings in 30 days.</p> : (
            <ul className="ov-list">
              {hiring.slice(0, 3).map((h) => (
                <li key={h.itemId}>
                  <Logo name={h.company ?? "?"} domain={h.domain} size={26} />
                  <span><a href={h.url} target="_blank" rel="noopener noreferrer">{h.title}</a> <span className="muted small">{h.geographies[0] ?? ""}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel n={5} title="Rules & regulation" tip="CSR rule changes and debate, labelled Executed (in force), Confirmed (officially notified, not yet in force) or Inferred (draft, debate or expert view)." more={`Regulatory · ${regCounts.executed} executed, ${regCounts.confirmed} confirmed, ${regCounts.inferred} inferred`} href="/regulatory">
          <RegulatoryBrief summary={reg.summary} limit={2} />
        </Panel>

        <Panel n={6} title="Team & engagement" tip="What you and your team marked read or not relevant (this teaches the scoring), plus comments and questions on the Team page." more="Team" href="/team">
          {data.engagement.length === 0 ? <p className="muted small">Nothing yet. Use Mark read / Not relevant on any card.</p> : (
            <ul className="ov-list">
              {data.engagement.slice(0, 3).map((e, k) => (
                <li key={k}><span className="ov-clamp">{e.action === "read" ? "✓ Read" : `✕ Not relevant${e.reason ? ` (${e.reason})` : ""}`}: {e.title}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
