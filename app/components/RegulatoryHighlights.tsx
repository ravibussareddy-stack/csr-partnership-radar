import { InfoTip } from "./InfoTip";
import { POLICY_STATUS } from "@/lib/policy";
import type { RegulatorySummary } from "@/lib/regulatory";

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The highlight summary card; also shown on the Summary page. */
export function RegulatoryHighlights({ summary, titles, anchor = false }: { summary: RegulatorySummary | null; titles: Map<number, string>; anchor?: boolean }) {
  if (!summary) {
    return (
      <div className="glass card-pad reg-summary">
        <p className="muted">The highlight summary appears after the next daily run finds policy items.</p>
      </div>
    );
  }
  return (
    <section className="glass card-pad reg-summary" aria-labelledby="h-reg-sum">
      <h2 id="h-reg-sum" className="section-title">
        Highlights <span className="muted small">· from {summary.items} articles · {when.format(new Date(summary.computedAt))}</span>
        <InfoTip text="Written by Gemini from the articles below only. Each point links to the articles it is based on, and its label can never be stronger than what those articles support." />
      </h2>
      <p className="reg-overview">{summary.overview}</p>
      <ul className="reg-highlights">
        {summary.highlights.map((h) => (
          <li key={h.text}>
            <span className={`policy-badge ps-${h.status}`} title={POLICY_STATUS[h.status].help}>{POLICY_STATUS[h.status].label}</span> {h.text}{" "}
            {h.itemIds.map((id, k) => (
              <a key={id} href={anchor ? `#reg-${id}` : `/regulatory#reg-${id}`} className="cite" title={titles.get(id)}>[{k + 1}]</a>
            ))}
          </li>
        ))}
      </ul>
      {summary.watchNext.length > 0 && (
        <>
          <h3 className="small-title">Watch next</h3>
          <ul className="reg-watch">{summary.watchNext.map((w) => <li key={w}>{w}</li>)}</ul>
        </>
      )}
    </section>
  );
}
