// 1 · Summary (landing): calls this week, hiring observed, and companies likely to start CSR funding
// in Pune / Maharashtra in the next 30 days. Cached (lib/data.ts).
import { Suspense } from "react";
import Link from "next/link";
import { CueCard } from "@/app/components/InsightBoard";
import { Greeting } from "@/app/components/Greeting";
import { InfoTip } from "@/app/components/InfoTip";
import { KeepUp } from "@/app/components/KeepUp";
import { Logo } from "@/app/components/Logo";
import { ClassroomScene, Icon, PageBackdrop } from "@/app/components/illustrations";
import { fmtCr } from "@/app/components/charts";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { getImpactStats, getRegulatory, getSectors, getSummary } from "@/lib/data";
import { RegulatoryHighlights } from "@/app/components/RegulatoryHighlights";

const SOURCE_NAMES = new Map(DEFAULT_CONFIG.sources.map((s) => [s.id, s.name]));
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const dateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function Page() {
  return (
    <main className="wrap wide">
      <PageBackdrop variant="classroom" />
      <Suspense fallback={<div className="hero-glass glass skeleton" />}>
        <Summary />
      </Suspense>
    </main>
  );
}

async function Summary() {
  const [data, stats, sectorRows, reg] = await Promise.all([getSummary(), getImpactStats(), getSectors(), getRegulatory()]);
  const SECTOR_LABELS = Object.fromEntries(sectorRows.map((s) => [s.id, s.label]));
  if (!data) {
    return <div className="notice glass"><h2>No database configured</h2><p>Set DATABASE_URL and run npm run ingest.</p></div>;
  }
  const { calls, hiring, likelySoon, engagement } = data;

  return (
    <>
      <header className="hero-glass glass">
        <div className="hero-copy">
          <p className="eyebrow">1 · Summary{data.lastUpdated ? ` · updated ${dateTime.format(new Date(data.lastUpdated))}` : ""}</p>
          <Greeting name="Ananya" />
          <p className="lede">
            Small steps, big impact. Here is this week in three moves: who to call, who is building a CSR team, and who is about to open
            their CSR purse in Pune and Maharashtra.
          </p>
          <ul className="impact">
            <li className="glass-chip"><b>{calls.length}</b> to call this week</li>
            <li className="glass-chip"><b>{hiring.length}</b> CSR roles being hired</li>
            <li className="glass-chip"><b>{likelySoon.length}</b> likely to fund in the next 30 days</li>
            {stats && <li className="glass-chip">≈ <b>{stats.hoursSaved} h</b> of searching saved this week</li>}
          </ul>
          {stats && <KeepUp name="Ananya" dropsThisWeek={stats.dropsThisWeek} />}
          <div className="hero-actions">
            <Link href="/digest" className="pill-link strong">Open the full digest →</Link>
            <Link href="/inbox" className="pill-link"><Icon name="people" /> Add people&rsquo;s messages</Link>
          </div>
        </div>
        <div className="hero-art classroom-art"><ClassroomScene /></div>
      </header>

      <section className="section" aria-labelledby="h-calls">
        <h2 id="h-calls" className="section-title">
          <span className="step">1</span> Calls this week
          <InfoTip text="Call this week = a company is putting money into your sectors or looking for NGO partners right now, and recently enough that a call this week can still change the outcome. Watch = relevant but not urgent, or an early sign. Background = context only." />
        </h2>
        {calls.length === 0 ? (
          <p className="muted">No calls this week: see the Watch items in the digest.</p>
        ) : (
          <div className="cue-grid">{calls.slice(0, 6).map((i) => <CueCard key={i.key} i={i} sectorLabels={SECTOR_LABELS} />)}</div>
        )}
        {calls.length > 6 && <p className="more-link"><Link href="/digest">See all {calls.length} calls in the digest →</Link></p>}
      </section>

      <section className="section" aria-labelledby="h-hiring">
        <h2 id="h-hiring" className="section-title">
          <span className="step">2</span> Hiring observed: be aware
          <InfoTip text="Companies recruiting CSR, foundation or community roles in the last 30 days. A new CSR hire usually means new programmes and new implementation partners within months, so note the company and reach out once the role is filled. Only postings with a working, specific job link are shown." />
        </h2>
        {hiring.length === 0 ? (
          <p className="muted">No verified CSR job postings in the last 30 days.</p>
        ) : (
          <ul className="row-list glass">
            {hiring.map((h) => (
              <li key={h.itemId} className="row-item">
                <Logo name={h.company ?? "?"} domain={h.domain} size={36} />
                <div className="row-main">
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="row-title">{h.title}</a>
                  <span className="muted small">{h.company ?? "Company not identified"} · {h.geographies.slice(0, 2).join(", ") || "location not stated"} · {dateFmt.format(new Date(h.date))} · {SOURCE_NAMES.get(h.source) ?? h.source}</span>
                </div>
                {h.linkStatus === "unverified" && <span className="badge-warn" title="The job site doesn't allow automated checks; open the link to confirm it's still open">check link</span>}
                {h.companyId && <Link href={`/companies/${h.companyId}`} className="pill-link">Profile</Link>}
              </li>
            ))}
          </ul>
        )}
        <p className="more-link"><Link href="/jobs">Hiring radar →</Link></p>
      </section>

      <section className="section" aria-labelledby="h-soon">
        <h2 id="h-soon" className="section-title">
          <span className="step">3</span> Likely to start CSR funding in Pune &amp; Maharashtra · next 30 days
          <InfoTip text="Companies that spend CSR in Pune district or Maharashtra (National CSR Portal, latest year) and whose recurring announcement window is open now or opens within 30 days, based on their dated CSR announcements since 2009. Highlighted years are the evidence." />
        </h2>
        {likelySoon.length === 0 ? (
          <p className="muted">No Pune / Maharashtra funders have a window opening in the next 30 days.</p>
        ) : (
          <div className="soon-grid">
            {likelySoon.map((c) => {
              const hit = new Set(c.yearsHit);
              return (
                <article key={c.companyId} className="glass card-pad soon-card spot">
                  <header className="cue-head">
                    <Logo name={c.name} domain={c.domain} size={40} />
                    <div className="cue-who">
                      <Link href={`/companies/${c.companyId}`} className="cue-company">{c.name}</Link>
                      <span className="cue-type">{c.inWindow ? `Window ${c.window} is open now` : `Window ${c.window} opens in ${c.opensIn} day${c.opensIn === 1 ? "" : "s"}`}</span>
                    </div>
                    <span className={`strength ${c.strength}`}>{c.strength} cycle</span>
                  </header>
                  <p className="small">
                    {c.puneLastCr > 0 && <>Pune <b>{fmtCr(c.puneLastCr)}</b> · </>}
                    Maharashtra <b>{fmtCr(c.maharashtraLastCr)}</b> last FY · forecast {fmtCr(c.predictedFocusCr || c.predictedTotalCr)} {c.predictedFocusCr ? "in your sectors" : "CSR"} next year
                  </p>
                  <ul className="facts">
                    {c.topSectors.map((t) => <li key={t.sector} className={t.focus ? "fact fact-good" : "fact"}>{t.sector} {t.share}%</li>)}
                  </ul>
                  <p className="years">{c.activeYears.slice(-8).map((y) => <span key={y} className={`yr${hit.has(y) ? " hit" : ""}`}>{y}</span>)}</p>
                </article>
              );
            })}
          </div>
        )}
        <p className="more-link"><Link href="/calendar">CSR calendar →</Link></p>
      </section>

      <section className="section" aria-labelledby="h-reg">
        <h2 id="h-reg" className="section-title">
          <span className="step">4</span> Regulatory watch
          <InfoTip text="What changed in CSR rules recently, labelled Executed (in force), Confirmed (officially notified, not yet in force) or Inferred (draft, debate or expert view). Each point links to its sources on the Regulatory page." />
        </h2>
        <RegulatoryHighlights summary={reg.summary} titles={new Map(reg.items.map((i) => [i.itemId, i.title]))} />
        <p className="more-link"><Link href="/regulatory">All regulatory news ({reg.items.length}) →</Link></p>
      </section>

      <section className="section" aria-labelledby="h-eng">
        <h2 id="h-eng" className="section-title">
          <Icon name="spark" /> Your recent engagement
          <InfoTip text="What you marked read or not relevant. Not-relevant marks teach the scoring: after a couple of similar rejections, similar items are scored lower (you'll see 'learned from your feedback' in their reasons)." />
        </h2>
        {engagement.length === 0 ? (
          <p className="muted small">Nothing yet. Use &ldquo;Mark read&rdquo; and &ldquo;Not relevant&rdquo; on any card to teach the Radar.</p>
        ) : (
          <ul className="kv glass card-pad">
            {engagement.map((e, k) => (
              <li key={k}><span>{e.action === "read" ? "✓ Read" : `✕ Not relevant${e.reason ? ` (${e.reason})` : ""}`}: {e.title}</span><span>{dateTime.format(new Date(e.at))}</span></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
