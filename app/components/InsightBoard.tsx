"use client";
/**
 * Filterable cue-card board. Data arrives pre-rendered from the (cached) server page; filters run
 * instantly in the browser: source group, tier, sector, company.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Insight } from "@/lib/insights";
import type { SourceGroup } from "@/lib/sources";
import { Logo } from "./Logo";

const TIERS = [
  { id: "call_this_week", label: "Call this week" },
  { id: "watch", label: "Watch" },
  { id: "background", label: "Background" },
] as const;

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function CueCard({ i, sectorLabels }: { i: Insight; sectorLabels: Record<string, string> }) {
  const company = i.company ?? "Company not identified";
  return (
    <article className={`cue tier-${i.tier}`}>
      <header className="cue-head">
        <Logo name={company} domain={i.domain} />
        <div className="cue-who">
          {i.companyId ? (
            <Link href={`/companies/${i.companyId}`} className="cue-company">{company}</Link>
          ) : (
            <span className="cue-company">{company}</span>
          )}
          <span className="cue-type">{i.signalLabel}</span>
        </div>
        <span className={`tier-pill tier-${i.tier}`}>{TIERS.find((t) => t.id === i.tier)?.label}</span>
      </header>
      <h3 className="cue-title">{i.title}</h3>
      <p className="cue-summary">{i.summary}</p>
      <footer className="cue-meta">
        {i.date && <span>{dateFmt.format(new Date(i.date))}</span>}
        <span className={`src src-${i.sourceGroup}`}>{i.sourceLabel}</span>
        {i.sectors.map((s) => sectorLabels[s] && <span key={s} className="sector-dot">{sectorLabels[s]}</span>)}
        {!i.classified && <span className="badge-warn">unclassified</span>}
      </footer>
      <details className="cue-more">
        <summary>Open breakdown</summary>
        <div className="cue-body">
          {i.nextStep && (
            <div className="jtbd">
              <span className="jtbd-label">Job to be done</span>
              <p>{i.nextStep}</p>
            </div>
          )}
          {i.keyPoints.length > 0 && (
            <>
              <h4>Key points</h4>
              <ul className="keypoints">{i.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>
            </>
          )}
          {i.facts.length > 0 && (
            <ul className="facts">{i.facts.map((f) => <li key={f.text} className={f.tone ? `fact fact-${f.tone}` : "fact"}>{f.text}</li>)}</ul>
          )}
          {i.research.length > 0 && (
            <>
              <h4>Researched sources</h4>
              <ul className="research">
                {i.research.map((r) => (
                  <li key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>{r.publisher ? ` · ${r.publisher}` : ""}</li>
                ))}
              </ul>
            </>
          )}
          <p className="reason"><span className="label">Why this tier:</span> {i.reason}</p>
          <div className="cue-links">
            {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" className="pill-link">Read the source ↗</a>}
            {i.companyId && <Link href={`/companies/${i.companyId}`} className="pill-link">Company profile →</Link>}
          </div>
        </div>
      </details>
    </article>
  );
}

export function InsightBoard({
  signals,
  warm,
  groups,
  sectors,
}: {
  signals: Insight[];
  warm: Insight[];
  groups: readonly { id: SourceGroup; label: string; hint: string }[];
  sectors: { id: string; label: string }[];
}) {
  const [group, setGroup] = useState<SourceGroup | "all">("all");
  const [tier, setTier] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");
  const [company, setCompany] = useState("");
  const sectorLabels = Object.fromEntries(sectors.map((s) => [s.id, s.label]));
  const companies = useMemo(
    () => [...new Set([...signals, ...warm].map((i) => i.company).filter((c): c is string => Boolean(c)))].sort(),
    [signals, warm],
  );

  const match = (i: Insight) =>
    (group === "all" || i.sourceGroup === group) &&
    (tier === "all" || i.tier === tier) &&
    (sector === "all" || i.sectors.includes(sector)) &&
    (!company || (i.company ?? "").toLowerCase().includes(company.toLowerCase()));
  const shownSignals = signals.filter(match);
  const shownWarm = group === "all" || group === "news" ? warm.filter(match) : [];
  const counts = Object.fromEntries(groups.map((g) => [g.id, signals.filter((s) => s.sourceGroup === g.id).length]));

  return (
    <div className="board">
      <div className="filter-bar glass" role="search">
        <div className="chips" aria-label="Source">
          <button className={group === "all" ? "chip on" : "chip"} onClick={() => setGroup("all")}>All sources <b>{signals.length}</b></button>
          {groups.map((g) => (
            <button key={g.id} className={group === g.id ? "chip on" : "chip"} onClick={() => setGroup(g.id)} title={g.hint}>
              {g.label} <b>{counts[g.id] ?? 0}</b>
            </button>
          ))}
        </div>
        <div className="selects">
          <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier">
            <option value="all">All tiers</option>
            {TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
            <option value="all">All focus sectors</option>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input list="companies" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Filter by company" aria-label="Company" />
          <datalist id="companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
          {(group !== "all" || tier !== "all" || sector !== "all" || company) && (
            <button className="chip clear" onClick={() => { setGroup("all"); setTier("all"); setSector("all"); setCompany(""); }}>Clear</button>
          )}
        </div>
      </div>

      <section aria-labelledby="h-week" className="section">
        <h2 id="h-week" className="section-title">This week <span className="muted">· {shownSignals.length} insight{shownSignals.length === 1 ? "" : "s"}</span></h2>
        {shownSignals.length === 0 ? (
          <p className="muted">Nothing matches these filters this week.</p>
        ) : (
          <div className="cue-grid">{shownSignals.map((i) => <CueCard key={i.key} i={i} sectorLabels={sectorLabels} />)}</div>
        )}
      </section>

      {shownWarm.length > 0 && (
        <section aria-labelledby="h-warm" className="section">
          <h2 id="h-warm" className="section-title">Warm all year <span className="muted">· active in your sectors in the last 12 months</span></h2>
          <div className="cue-grid">{shownWarm.map((i) => <CueCard key={i.key} i={i} sectorLabels={sectorLabels} />)}</div>
        </section>
      )}
    </div>
  );
}
