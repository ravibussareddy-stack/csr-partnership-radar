// Pitch kit: what the company wants from CSR, recent news, and published proof, each with its source.
import type { PitchKit } from "@/lib/db/schema";
import { InfoTip } from "./InfoTip";

const host = (u: string | null) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

export function PitchKitView({ kit, compact = false }: { kit: PitchKit; compact?: boolean }) {
  const sections: [string, string, { text: string; url: string | null; date?: string | null }[]][] = [
    ["What they want from CSR", "Stated goals, focus areas and the business benefits they link to CSR. Shape the pitch around these.", kit.wants],
    ["Recent news to mention", "Recent CSR or business news that gives a reason to reach out now.", kit.recentNews],
    ["Proof you can cite", "Numbers the company or its partners have published about CSR outcomes. Only sourced figures are shown; nothing is estimated.", kit.proof],
  ];
  return (
    <div className={compact ? "pitch compact" : "pitch"}>
      {sections.map(([title, tip, rows]) =>
        rows.length === 0 ? null : (
          <div key={title}>
            <h4>{title} <InfoTip text={tip} /></h4>
            <ul className="pitch-list">
              {rows.map((r) => (
                <li key={r.text}>
                  {r.date ? <span className="muted small">{r.date} · </span> : null}
                  {r.text}{" "}
                  {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="pitch-src">{host(r.url)} ↗</a>}
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
