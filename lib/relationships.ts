/** Relationships page data (team-only; read per request, never cached). */
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies, companyStats, relationshipAlerts, relationships } from "@/lib/db/schema";

export type AlertLevel = "risk" | "watch" | "opportunity";

export interface RelationshipView {
  id: number;
  companyName: string;
  companyId: number | null;
  domain: string | null;
  programme: string | null;
  sectors: string[];
  districts: string[];
  valueLakh: number | null;
  startDate: string | null;
  renewalDate: string | null;
  /** days from today to the renewal date (negative = passed) */
  renewalInDays: number | null;
  status: "active" | "renewal_due" | "lapsed" | "prospect";
  contactRole: string | null;
  notes: string | null;
  radarHelped: boolean;
  radarNote: string | null;
  lastCheckedAt: string | null;
  portal: { fy: number; focusCr: number; puneCr: number; maharashtraCr: number; window: string | null; nextWindowStart: string | null } | null;
  alerts: { id: number; kind: string; level: AlertLevel; title: string; impact: string; reasoning: string; sourceUrl: string | null; createdAt: string }[];
  health: AlertLevel | "ok";
}

export async function loadRelationships(): Promise<RelationshipView[]> {
  const db = await getDb();
  const rels = await db
    .select({ r: relationships, domain: companies.domain })
    .from(relationships)
    .leftJoin(companies, eq(companies.id, relationships.companyId))
    .orderBy(relationships.renewalDate, relationships.companyName);
  if (rels.length === 0) return [];
  const ids = rels.map((x) => x.r.id);
  const alerts = await db
    .select()
    .from(relationshipAlerts)
    .where(inArray(relationshipAlerts.relationshipId, ids))
    .orderBy(desc(relationshipAlerts.createdAt));
  const coIds = rels.map((x) => x.r.companyId).filter((x): x is number => x != null);
  const stats = coIds.length ? await db.select().from(companyStats).where(inArray(companyStats.companyId, coIds)) : [];
  const statBy = new Map(stats.map((s) => [s.companyId, s]));
  const rank: Record<AlertLevel, number> = { risk: 3, opportunity: 2, watch: 1 };
  const now = Date.now();
  return rels.map(({ r, domain }) => {
    const st = r.companyId ? statBy.get(r.companyId) : undefined;
    const mine = alerts.filter((a) => a.relationshipId === r.id && !a.dismissed);
    const top = mine.reduce<AlertLevel | "ok">((acc, a) => (acc === "ok" || rank[a.level] > rank[acc] ? a.level : acc), "ok");
    return {
      ...r,
      domain,
      renewalInDays: r.renewalDate ? Math.round((new Date(r.renewalDate).getTime() - now) / 86400_000) : null,
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
      portal: st
        ? { fy: st.lastFy ?? 0, focusCr: st.focusLastCr, puneCr: st.puneLastCr, maharashtraCr: st.maharashtraFocusLastCr, window: st.data.timing?.window ?? null, nextWindowStart: st.data.timing?.nextWindowStart ?? null }
        : null,
      alerts: mine
        .sort((a, b) => rank[b.level] - rank[a.level] || b.createdAt.getTime() - a.createdAt.getTime())
        .map((a) => ({ id: a.id, kind: a.kind, level: a.level, title: a.title, impact: a.impact, reasoning: a.reasoning, sourceUrl: a.sourceUrl, createdAt: a.createdAt.toISOString() })),
      health: top,
    };
  });
}
