"use client";
import { useState } from "react";
import { Discussion } from "@/app/components/Discussion";
import { POLICY_STATUS } from "@/lib/policy";
import type { PolicyItem, PolicyStatus } from "@/lib/regulatory";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const ORDER: PolicyStatus[] = ["executed", "confirmed", "inferred"];

export function RegulatoryList({ items }: { items: PolicyItem[] }) {
  const [status, setStatus] = useState<PolicyStatus | "all">("all");
  const [officialOnly, setOfficialOnly] = useState(false);
  const [quotesOnly, setQuotesOnly] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const shown = items.filter((i) => (status === "all" || i.status === status) && (!officialOnly || i.official) && (!quotesOnly || i.quotes.length > 0));
  return (
    <>
      <div className="filter-bar glass" role="search">
        <div className="chips">
          <button className={status === "all" ? "chip on" : "chip"} onClick={() => setStatus("all")}>All <b>{items.length}</b></button>
          {ORDER.map((s) => (
            <button key={s} className={status === s ? `chip on ps-chip-${s}` : `chip ps-chip-${s}`} onClick={() => setStatus(s)} title={POLICY_STATUS[s].help}>
              {POLICY_STATUS[s].label} <b>{items.filter((i) => i.status === s).length}</b>
            </button>
          ))}
          <button className={officialOnly ? "chip on" : "chip"} aria-pressed={officialOnly} onClick={() => setOfficialOnly(!officialOnly)}>Official sources only</button>
          <button className={quotesOnly ? "chip on" : "chip"} aria-pressed={quotesOnly} onClick={() => setQuotesOnly(!quotesOnly)}>With quotes</button>
        </div>
      </div>
      {status !== "all" && <p className="tier-definition"><b>{POLICY_STATUS[status].label}</b>: {POLICY_STATUS[status].help}</p>}
      {shown.length === 0 ? (
        <p className="muted">Nothing matches.</p>
      ) : (
        <ol className="reg-list">
          {shown.map((i) => (
            <li key={i.itemId} id={`reg-${i.itemId}`} className={`reg-item glass spot ps-${i.status}`}>
              <header className="reg-head">
                <span className={`policy-badge ps-${i.status}`} title={POLICY_STATUS[i.status].help}>{POLICY_STATUS[i.status].label}</span>
                {i.official && <span className="badge-official" title="Published on a government or regulator website">Official source</span>}
                <span className="muted small">{dateFmt.format(new Date(i.date))} · {i.host}</span>
              </header>
              <h3 className="reg-title"><a href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a></h3>
              {i.coverage.map((c) => <span key={c.itemId} id={`reg-${c.itemId}`} aria-hidden="true" />)}
              {i.originalTitle && <p className="muted small">Original headline: {i.originalTitle}</p>}
              {i.summary && <p>{i.summary}</p>}
              {i.worthIt && <p className="small"><b>What it means for you:</b> {i.worthIt}</p>}
              {i.keyPoints.length > 0 && <ul className="keypoints">{i.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>}
              {i.quotes.map((q) => (
                <blockquote key={q.quote} className="quote">
                  <p>&ldquo;{q.quote}&rdquo;</p>
                  <footer>{q.speaker}{q.role ? `, ${q.role}` : ""} <span className="muted small">· verbatim from the source</span></footer>
                </blockquote>
              ))}
              {i.coverage.length > 0 && (
                <p className="small muted reg-coverage">
                  Event dated {dateFmt.format(new Date(i.date))}; also covered by {i.coverage.length} later or other article{i.coverage.length === 1 ? "" : "s"}:{" "}
                  {i.coverage.map((c, k) => (
                    <span key={c.itemId}>{k > 0 && " · "}<a href={c.url} target="_blank" rel="noopener noreferrer" title={c.title}>{c.host}</a> ({dateFmt.format(new Date(c.date))})</span>
                  ))}
                </p>
              )}
              <button type="button" className="chip" onClick={() => setOpen(open === i.itemId ? null : i.itemId)} aria-expanded={open === i.itemId}>
                {open === i.itemId ? "Hide discussion" : "Discuss / ask the Radar"}
              </button>
              {open === i.itemId && <Discussion itemId={i.itemId} />}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
