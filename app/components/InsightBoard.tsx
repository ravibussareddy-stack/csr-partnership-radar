"use client";
/**
 * Filterable cue-card board. Data arrives pre-rendered from the (cached) server page; filters run
 * instantly in the browser: source group, tier, sector, company.
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Insight } from "@/lib/insights";
import type { SourceGroup } from "@/lib/sources";
import { track } from "./Ambient";
import { InfoTip } from "./InfoTip";
import { Logo } from "./Logo";

const TIERS = [
  { id: "call_this_week", label: "Call this week" },
  { id: "watch", label: "Watch" },
  { id: "background", label: "Background" },
] as const;

const TIER_HELP: Record<string, string> = {
  call_this_week: "A company is allocating money or looking for partners right now, in your sectors, recently enough that a call can still change the outcome. Reach out before Friday.",
  watch: "Relevant but not urgent, or an early sign: an ongoing programme, CSR outside your sectors, a company hiring CSR staff, or a new plant near you (a future funder).",
  background: "Context only: older or loosely related CSR activity. No action needed this week.",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function CueCard({ i, sectorLabels }: { i: Insight; sectorLabels: Record<string, string> }) {
  const company = i.company ?? "Company not identified";
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => {
    dialog.current?.showModal();
    track("opens");
  };
  const tierLabel = TIERS.find((t) => t.id === i.tier)?.label;
  return (
    <article className={`cue spot tier-${i.tier}`}>
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
        <span className={`tier-pill tier-${i.tier}`}>
          {tierLabel}
          <InfoTip text={TIER_HELP[i.tier]} label={`What does ${tierLabel} mean?`} />
        </span>
      </header>
      <h3 className="cue-title">{i.title}</h3>
      <p className="cue-summary">{i.summary}</p>
      <footer className="cue-meta">
        {i.date && <span>{dateFmt.format(new Date(i.date))}</span>}
        <span className={`src src-${i.sourceGroup}`}>{i.sourceLabel}</span>
        {i.sectors.slice(0, 2).map((s) => sectorLabels[s] && <span key={s} className="sector-dot">{sectorLabels[s]}</span>)}
        {!i.classified && <span className="badge-warn">unclassified</span>}
      </footer>
      <button type="button" className="cue-open" onClick={open}>
        {i.nextStep ? "Job to be done & breakdown" : "Open breakdown"} <span aria-hidden="true">↗</span>
      </button>

      <dialog ref={dialog} className="cue-dialog glass" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="dialog-inner">
          <header className="cue-head">
            <Logo name={company} domain={i.domain} size={52} />
            <div className="cue-who">
              <span className="cue-company big-co">{company}</span>
              <span className="cue-type">{i.signalLabel} · {i.date ? dateFmt.format(new Date(i.date)) : ""} · {i.sourceLabel}</span>
            </div>
            <span className={`tier-pill tier-${i.tier}`}>{tierLabel}</span>
            <button type="button" className="dialog-close" onClick={() => dialog.current?.close()} aria-label="Close">×</button>
          </header>
          <h3 className="dialog-title">{i.title}</h3>
          <p>{i.summary}</p>
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
            {i.companyId && <Link href={`/companies/${i.companyId}`} className="pill-link strong">Company profile →</Link>}
          </div>
        </div>
      </dialog>
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
          <InfoTip text="Where each insight came from. News feeds: CSR news sites read automatically. Google search: your saved searches, job searches and Google Alerts. LinkedIn: your LinkedIn alert emails. Personal messages: anything pasted into the message drop or forwarded with [CSR-IN]." label="About sources" />
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
        <h2 id="h-week" className="section-title">This week <span className="muted">· {shownSignals.length} insight{shownSignals.length === 1 ? "" : "s"}</span> <InfoTip text="New CSR signals from the last 7 days, highest score first. Each card ends in a decision (Call this week, Watch or Background) with the reason inside its breakdown." /></h2>
        {shownSignals.length === 0 ? (
          <p className="muted">Nothing matches these filters this week.</p>
        ) : (
          <div className="cue-grid">{shownSignals.map((i) => <CueCard key={i.key} i={i} sectorLabels={sectorLabels} />)}</div>
        )}
      </section>

      {shownWarm.length > 0 && (
        <section aria-labelledby="h-warm" className="section">
          <h2 id="h-warm" className="section-title">Warm all year <span className="muted">· active in your sectors in the last 12 months</span> <InfoTip text="Companies that announced education, skilling, digital literacy or youth-employment CSR in the past year, or spend on it in Maharashtra. A company that has been active recently is a warm conversation, even without news this week." /></h2>
          <div className="cue-grid">{shownWarm.map((i) => <CueCard key={i.key} i={i} sectorLabels={sectorLabels} />)}</div>
        </section>
      )}
    </div>
  );
}
