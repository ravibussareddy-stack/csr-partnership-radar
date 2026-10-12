// "Your partners" on the Summary page: alerts on existing relationships. Rendered per request for
// signed-in teammates only, so the cached public page never contains contract details.
import Link from "next/link";
import { connection } from "next/server";
import { loadRelationships } from "@/lib/relationships";
import { currentMember } from "@/lib/session";
import { Logo } from "./Logo";

const LEVEL: Record<string, string> = { risk: "At risk", watch: "Watch", opportunity: "Opportunity" };

export async function PartnerWatch({ limit = 6 }: { limit?: number }) {
  await connection();
  const me = await currentMember();
  if (!me) return <p className="muted small"><Link href="/inbox">Sign in</Link> to see alerts on your current funders (team only).</p>;
  const rels = await loadRelationships();
  if (rels.length === 0) return <p className="muted small">No relationships added yet. <Link href="/relationships">Add your current funders</Link> and the Radar will watch them daily.</p>;
  const rows = rels
    .flatMap((r) => r.alerts.filter((a) => a.level !== "watch" || a.kind === "renewal").slice(0, 2).map((a) => ({ r, a })))
    .sort((x, y) => (x.a.level === "risk" ? 0 : 1) - (y.a.level === "risk" ? 0 : 1))
    .slice(0, limit);
  if (rows.length === 0) return <p className="muted small">No risks or opportunities on your {rels.length} current relationships right now. <Link href="/relationships">See all →</Link></p>;
  return (
    <ul className="ov-list">
      {rows.map(({ r, a }) => (
        <li key={a.id}>
          <Logo name={r.companyName} domain={r.domain} size={26} />
          <span><span className={`rel-health rel-h-${a.level}`}>{LEVEL[a.level]}</span> <b>{r.companyName}</b>: {a.title}</span>
        </li>
      ))}
    </ul>
  );
}
