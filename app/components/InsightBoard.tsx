"use client";
/**
 * Filterable cue-card board. Data arrives pre-rendered from the (cached) server page; filters run
 * instantly in the browser: source group, tier, sector, city / state, company.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { giveFeedback, rateInsight, undoRead } from "@/app/actions";
import Link from "next/link";
import { CALL_TYPE_HELP, CALL_TYPE_LABELS, type Insight } from "@/lib/insights";
import type { SourceGroup } from "@/lib/sources";
import { track } from "./Ambient";
import { Discussion } from "./Discussion";
import { PitchKitView } from "./PitchKitView";
import { SearchPanel } from "./SearchPanel";
import type { SearchRunSummary } from "@/lib/digest";
import { POLICY_STATUS } from "@/lib/policy";
import { InfoTip } from "./InfoTip";
import { Logo } from "./Logo";

const TIERS = [
  { id: "call_this_week", label: "Call this week" },
  { id: "watch", label: "Watch" },
  { id: "background", label: "Background" },
] as const;

export const TIER_HELP: Record<string, string> = {
  call_this_week: "A company is putting money into your sectors or looking for NGO partners RIGHT NOW (new programme, RFP, funding ramp-up near Pune), and it happened recently enough that a call this week can still change who gets the grant. Action: reach out before Friday.",
  watch: "Relevant, but not urgent yet, or an early sign of a future opportunity: an ongoing programme, CSR outside your four sectors that is still worth an introduction, a company hiring CSR staff, or a company opening a plant in Maharashtra. Action: track it and plan outreach for when it matures.",
  background: "Context only: older or loosely related CSR activity (including CSR outside your sectors that the analysis says to monitor) that helps you read the market. Action: none this week.",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });


const REASONS = ["Not my sector", "Wrong company", "Old news", "Not CSR", "Not in our geography", "Other"];

export function CueCard({ i, sectorLabels }: { i: Insight; sectorLabels: Record<string, string> }) {
  const company = i.company ?? "Company not identified";
  const dialog = useRef<HTMLDialogElement>(null);
  const [read, setRead] = useState(i.read);
  const [rating, setRating] = useState(i.rating);
  const [hidden, setHidden] = useState(false);
  const [askWhy, setAskWhy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; needsUnlock?: boolean; message?: string }>, onOk: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) onOk();
      else setNote(r.needsUnlock ? "unlock" : (r.message ?? "Couldn't save that."));
    });
  const rate = (r: "helpful" | "not_helpful") =>
    i.itemId != null &&
    start(async () => {
      const res = await rateInsight(i.itemId!, r);
      if (res.ok) setRating(res.rating ?? null);
      else setNote(res.needsUnlock ? "unlock" : (res.message ?? "Couldn't save that."));
    });
  const toggleRead = () =>
    i.itemId != null && act(() => (read ? undoRead(i.itemId!) : giveFeedback(i.itemId!, "read")), () => setRead(!read));
  const reject = (reason: string) =>
    i.itemId != null &&
    act(() => giveFeedback(i.itemId!, "irrelevant", reason), () => {
      dialog.current?.close();
      setHidden(true);
    });
  if (hidden) return null;
  const open = () => {
    dialog.current?.showModal();
    setOpened(true);
    track("opens");
  };
  const tierLabel = TIERS.find((t) => t.id === i.tier)?.label;
  return (
    <article className={`cue spot tier-${i.tier}${read ? " is-read" : ""}`}>
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
      {i.callType && (
        <span className={`call-type ct-${i.callType}`}>
          {CALL_TYPE_LABELS[i.callType]}
          <InfoTip text={CALL_TYPE_HELP[i.callType]} label={`What is a ${CALL_TYPE_LABELS[i.callType].toLowerCase()}?`} />
        </span>
      )}
      <h3 className="cue-title">{i.title}</h3>
      {i.policyStatus && <span className={`policy-badge ps-${i.policyStatus}`} title={POLICY_STATUS[i.policyStatus].help}>{POLICY_STATUS[i.policyStatus].label}</span>}
      <p className="cue-summary">{i.worthIt ?? i.summary}</p>
      <footer className="cue-meta">
        {i.date && <span>{dateFmt.format(new Date(i.date))}</span>}
        <span className={`src src-${i.sourceGroup}`}>{i.sourceLabel}</span>
        {i.sectors.slice(0, 2).map((s) => sectorLabels[s] && <span key={s} className="sector-dot">{sectorLabels[s]}</span>)}
        {!i.classified && <span className="badge-warn">unclassified</span>}
        {i.tier === "watch" && i.action === "prepare" && i.companyId != null && <span className="fact fact-good" title="Worth an introduction in the coming weeks (not urgent this week)">Introduce soon</span>}
        {i.facts.some((f) => f.text.startsWith("Outside your region")) && <span className="fact fact-good" title="Funds your sectors outside Maharashtra: reach out about a Pune programme">Pitch Pune</span>}
        {i.alsoReported.length > 0 && <span className="fact" title={i.alsoReported.map((a) => a.source).join(", ")}>+{i.alsoReported.length} outlet{i.alsoReported.length === 1 ? "" : "s"}</span>}
        {i.isDemo && <span className="badge-demo" title="Sample data for demonstration, built from real public news">Demo</span>}
      </footer>
      <div className="cue-actions">
        <button type="button" className="cue-open" onClick={open}>
          {i.nextStep ? "Job to be done & breakdown" : "Open breakdown"} <span aria-hidden="true">↗</span>
        </button>
        {i.itemId != null && (
          <button type="button" className={read ? "cue-read on" : "cue-read"} onClick={toggleRead} disabled={pending} aria-pressed={read} title={read ? "Mark as unread" : "Mark as read"}>
            {read ? "✓ Read" : "Mark read"}
          </button>
        )}
        {i.itemId != null && (
          <span className="cue-rate" role="group" aria-label="Was this helpful?">
            <button type="button" className={rating === "helpful" ? "chip on" : "chip"} onClick={() => rate("helpful")} disabled={pending} aria-pressed={rating === "helpful"} title="Helpful">👍</button>
            <button type="button" className={rating === "not_helpful" ? "chip on" : "chip"} onClick={() => rate("not_helpful")} disabled={pending} aria-pressed={rating === "not_helpful"} title="Not helpful">👎</button>
          </span>
        )}
      </div>
      {note && (
        <p className="cue-note">{note === "unlock" ? <>Unlock first on <Link href="/inbox">People messages</Link> to save feedback.</> : note}</p>
      )}

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
          {i.callType && <p className="small"><span className={`call-type ct-${i.callType}`}>{CALL_TYPE_LABELS[i.callType]}</span> <span className="muted">{CALL_TYPE_HELP[i.callType]}</span></p>}
          <h3 className="dialog-title">{i.title}</h3>
          {i.originalTitle && <p className="muted small">Original headline: {i.originalTitle}</p>}
          {i.policyStatus && (
            <p><span className={`policy-badge ps-${i.policyStatus}`}>{POLICY_STATUS[i.policyStatus].label}</span> <span className="muted small">{POLICY_STATUS[i.policyStatus].help}</span></p>
          )}
          <p>{i.summary}</p>
          {i.worthIt && (
            <div className="worth">
              <span className="jtbd-label">Why it&rsquo;s worth your time</span>
              <p>{i.worthIt}</p>
            </div>
          )}
          {i.nextStep && (
            <div className="jtbd">
              <span className="jtbd-label">Job to be done</span>
              <p>{i.nextStep}</p>
            </div>
          )}
          {i.pitch && (
            <details className="pitch-wrap" open>
              <summary>Pitch kit: what they want, recent news, proof to cite</summary>
              <PitchKitView kit={i.pitch} compact />
            </details>
          )}
          {i.keyPoints.length > 0 && (
            <>
              <h4>Key points</h4>
              <ul className="keypoints">{i.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>
            </>
          )}
          {i.quotes.length > 0 && (
            <>
              <h4>In their words</h4>
              {i.quotes.map((q) => (
                <blockquote key={q.quote} className="quote">
                  <p>&ldquo;{q.quote}&rdquo;</p>
                  <footer>{q.speaker}{q.role ? `, ${q.role}` : ""}</footer>
                </blockquote>
              ))}
            </>
          )}
          {i.geographies.length > 0 && <p className="muted small">Where: {i.geographies.join(", ")}</p>}
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
          {i.alsoReported.length > 0 && (
            <>
              <h4>Also reported by</h4>
              <ul className="research">{i.alsoReported.map((a) => <li key={a.url}>{a.url.startsWith("http") ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a> : a.title} · {a.source}</li>)}</ul>
            </>
          )}
          <div className="cue-links">
            {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" className="pill-link">Read the source ↗</a>}
            {i.companyId && <Link href={`/companies/${i.companyId}`} className="pill-link strong">Company profile →</Link>}
          </div>
          {i.itemId != null && (
            <div className="feedback-row">
              <button type="button" className={read ? "chip on" : "chip"} onClick={toggleRead} disabled={pending}>{read ? "✓ Read" : "Mark read"}</button>
              {!askWhy ? (
                <button type="button" className="chip" onClick={() => setAskWhy(true)}>Not relevant…</button>
              ) : (
                <span className="why-reasons" role="group" aria-label="Why is this not relevant?">
                  <span className="muted small">Why?</span>
                  {REASONS.map((r) => <button key={r} type="button" className="chip" disabled={pending} onClick={() => reject(r)}>{r}</button>)}
                </span>
              )}
              <InfoTip text="Not relevant removes this item now. After a couple of similar rejections (same company, source or signal type), the next scoring run lowers similar items, and you'll see 'learned from your feedback' in their reasons. Email alerts follow the same scores." />
            </div>
          )}
          {note && <p className="cue-note">{note === "unlock" ? <>Unlock first on <Link href="/inbox">People messages</Link> to save feedback.</> : note}</p>}
          {opened && i.itemId != null && <Discussion itemId={i.itemId} />}
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
  searches = [],
}: {
  signals: Insight[];
  warm: Insight[];
  groups: readonly { id: SourceGroup; label: string; hint: string }[];
  sectors: { id: string; label: string }[];
  searches?: SearchRunSummary[];
}) {
  const [group, setGroup] = useState<SourceGroup | "all">("all");
  const [tier, setTier] = useState<string>("all");
  const [sector, setSector] = useState<string>("all");
  const [company, setCompany] = useState("");
  const [place, setPlace] = useState("all");
  const [hideRead, setHideRead] = useState(false);
  // Demo samples are hidden by default so counts match the Summary (which never counts them).
  const [hideDemo, setHideDemo] = useState(true);
  const sectorLabels = Object.fromEntries(sectors.map((s) => [s.id, s.label]));
  const companies = useMemo(
    () => [...new Set([...signals, ...warm].map((i) => i.company).filter((c): c is string => Boolean(c)))].sort(),
    [signals, warm],
  );

  const placeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of signals) if (!i.isDemo) for (const p of i.places) m.set(p, (m.get(p) ?? 0) + 1);
    return m;
  }, [signals]);
  const states = [...placeCounts].filter(([k]) => k.startsWith("state:")).sort((a, b) => b[1] - a[1]);
  const cities = [...placeCounts].filter(([k]) => k.startsWith("city:")).sort((a, b) => b[1] - a[1]);

  const match = (i: Insight) =>
    (place === "all" || i.places.includes(place)) &&
    (group === "all" || i.groups.includes(group)) &&
    (tier === "all" || i.tier === tier) &&
    (sector === "all" || i.sectors.includes(sector)) &&
    (!company || (i.company ?? "").toLowerCase().includes(company.toLowerCase())) &&
    !(hideRead && i.read) &&
    !(hideDemo && i.isDemo);
  const shownSignals = signals.filter(match);
  const shownReal = shownSignals.filter((i) => !i.isDemo).length;
  const filtered = group !== "all" || tier !== "all" || sector !== "all" || Boolean(company) || place !== "all";
  const passing = new Set(shownSignals.map((i) => i.url).filter((u): u is string => Boolean(u)));
  const shownWarm = group === "all" || group === "news" ? warm.filter(match) : [];
  // Counts are real items only, whether or not demo samples are shown (same rule as every page).
  const real = signals.filter((s) => !s.isDemo);
  const counts = Object.fromEntries(groups.map((g) => [g.id, real.filter((s) => s.groups.includes(g.id)).length]));
  const tierCounts = Object.fromEntries(TIERS.map((t) => [t.id, real.filter((s) => s.tier === t.id).length]));

  return (
    <div className="board">
      <div className="filter-bar glass" role="search">
        <div className="chips" aria-label="Source">
          <InfoTip text="Where each insight came from. News feeds: CSR news sites read automatically. Google search: your saved searches, job searches and Google Alerts. LinkedIn: your LinkedIn alert emails. Personal messages: anything pasted into the message drop or forwarded with [CSR-IN]. Self added: leads the team entered with Add a lead." label="About sources" />
          <button className={group === "all" ? "chip on" : "chip"} onClick={() => setGroup("all")}>All sources <b>{real.length}</b></button>
          {groups.map((g) => (
            <button key={g.id} className={group === g.id ? "chip on" : "chip"} onClick={() => setGroup(g.id)} title={g.hint}>
              {g.label} <b>{counts[g.id] ?? 0}</b>
            </button>
          ))}
        </div>
        <div className="selects">
          <span className="tier-chips" role="group" aria-label="Tier">
            <button className={tier === "all" ? "chip on" : "chip"} onClick={() => setTier("all")}>All tiers</button>
            {TIERS.map((t) => (
              <span key={t.id} className={`tier-chip tier-${t.id}${tier === t.id ? " on" : ""}`}>
                <button className="chip" onClick={() => setTier(t.id)} aria-pressed={tier === t.id}>{t.label} <b>{tierCounts[t.id]}</b></button>
                <InfoTip text={<><b>{t.label}:</b> {TIER_HELP[t.id]}</>} label={`What does ${t.label} mean?`} />
              </span>
            ))}
          </span>
          <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
            <option value="all">All sectors</option>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={place} onChange={(e) => setPlace(e.target.value)} aria-label="City or state">
            <option value="all">All places</option>
            <optgroup label="States">{states.map(([k, n]) => <option key={k} value={k}>{k.slice(6)} ({n})</option>)}</optgroup>
            <optgroup label="Cities">{cities.map(([k, n]) => <option key={k} value={k}>{k.slice(5)} ({n})</option>)}</optgroup>
          </select>
          <Link href="/sectors" className="chip" title="Add a sector to track">+ Sector</Link>
          <input list="companies" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Filter by company" aria-label="Company" />
          <datalist id="companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
          <button className={hideRead ? "chip on" : "chip"} onClick={() => setHideRead(!hideRead)} aria-pressed={hideRead}>Hide read</button>
          {signals.some((x) => x.isDemo) && <button className={hideDemo ? "chip" : "chip on"} onClick={() => setHideDemo(!hideDemo)} aria-pressed={!hideDemo} title="Labelled demo items built from real articles">{hideDemo ? `Show demo samples (${signals.filter((x) => x.isDemo).length})` : "Hide demo samples"}</button>}
          {(group !== "all" || tier !== "all" || sector !== "all" || company || place !== "all") && (
            <button className="chip clear" onClick={() => { setGroup("all"); setTier("all"); setSector("all"); setCompany(""); setPlace("all"); }}>Clear</button>
          )}
        </div>
      </div>

      {tier !== "all" && (
        <p className={`tier-definition tier-${tier}`}>
          <b>{TIERS.find((t) => t.id === tier)?.label}</b>: {TIER_HELP[tier]}
        </p>
      )}

      <section aria-labelledby="h-week" className="section">
        <h2 id="h-week" className="section-title">This week <span className="muted">· {shownReal} insight{shownReal === 1 ? "" : "s"}{shownSignals.length > shownReal ? ` + ${shownSignals.length - shownReal} demo` : ""}</span> <InfoTip text="New CSR signals from the last 7 days, highest score first. Each card ends in a decision (Call this week, Watch or Background) with the reason inside its breakdown." /></h2>
        {shownSignals.length === 0 ? (
          <p className="muted">Nothing matches these filters this week.</p>
        ) : (
          <div className="cue-grid">{shownSignals.map((i) => <CueCard key={i.key} i={i} sectorLabels={sectorLabels} />)}</div>
        )}
      </section>

      <SearchPanel searches={searches} passing={passing} filtered={filtered} />

      {shownWarm.length > 0 && (
        <section aria-labelledby="h-warm" className="section">
          <h2 id="h-warm" className="section-title">Warm all year <span className="muted">· active in your sectors in the last 12 months</span> <InfoTip text="Companies that announced education, skilling, digital literacy or youth-employment CSR in the past year, or spend on it in Maharashtra. A company that has been active recently is a warm conversation, even without news this week." /></h2>
          <div className="cue-grid">{shownWarm.map((i) => <CueCard key={i.key} i={i} sectorLabels={sectorLabels} />)}</div>
        </section>
      )}
    </div>
  );
}
