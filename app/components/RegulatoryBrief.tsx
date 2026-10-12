// Compact regulatory brief for the Summary overview: the one-paragraph overview and the top highlights.
import Link from "next/link";
import { POLICY_STATUS } from "@/lib/policy";
import type { RegulatorySummary } from "@/lib/regulatory";

export function RegulatoryBrief({ summary, limit = 2 }: { summary: RegulatorySummary | null; limit?: number }) {
  if (!summary) return <p className="muted small">The regulatory summary appears after the next daily run.</p>;
  return (
    <>
      <p className="small ov-clamp">{summary.overview}</p>
      <ul className="ov-list">
        {summary.highlights.slice(0, limit).map((h) => (
          <li key={h.text}>
            <span className={`policy-badge ps-${h.status}`} title={POLICY_STATUS[h.status].help}>{POLICY_STATUS[h.status].label}</span>
            <span className="ov-clamp"><Link href={`/regulatory#reg-${h.itemIds[0]}`}>{h.text}</Link></span>
          </li>
        ))}
      </ul>
    </>
  );
}
