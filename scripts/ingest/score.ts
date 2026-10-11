import { and, eq, gte, isNull, or } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import type { DB } from "@/lib/db/client";
import { classifications, companies, rawItems, signals } from "@/lib/db/schema";
import { scoreItem } from "@/lib/scoring";

export interface ScoreStats {
  scored: number;
  removed: number;
  byTier: Record<string, number>;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Minimal entity resolution: exact (case-insensitive) match on canonical name or
 * alias, otherwise insert. TODO(phase-2): real entity resolver (fuzzy, Ltd/Limited, CIN).
 */
async function upsertCompany(db: DB, name: string, cache: Map<string, number>): Promise<number> {
  const key = normName(name);
  const hit = cache.get(key);
  if (hit) return hit;
  const [row] = await db
    .insert(companies)
    .values({ canonicalName: name.trim() })
    .onConflictDoUpdate({ target: companies.canonicalName, set: { isActive: true } })
    .returning({ id: companies.id });
  cache.set(key, row.id);
  return row.id;
}

/** Re-scores every pre-filtered item in the lookback window (so recency stays current). */
export async function scoreRecent(db: DB, cfg: AppConfig, now = new Date()): Promise<ScoreStats> {
  const stats: ScoreStats = { scored: 0, removed: 0, byTier: {} };
  const since = new Date(now.getTime() - cfg.scoringWeights.lookbackDays * 86400_000);
  const sources = new Map(cfg.sources.map((s) => [s.id, s]));

  const companyCache = new Map<string, number>();
  for (const co of await db.select().from(companies)) {
    companyCache.set(normName(co.canonicalName), co.id);
    for (const a of co.aliases) companyCache.set(normName(a), co.id);
  }

  const rows = await db
    .select({ item: rawItems, cls: classifications })
    .from(rawItems)
    .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
    .where(
      and(
        eq(rawItems.prefilterPassed, true),
        or(gte(rawItems.publishedAt, since), and(isNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since))),
      ),
    );

  for (const { item, cls } of rows) {
    if (cls && !cls.isSignal) {
      const del = await db.delete(signals).where(eq(signals.itemId, item.id)).returning({ id: signals.id });
      stats.removed += del.length;
      continue;
    }
    const r = scoreItem(
      {
        title: item.title,
        body: item.body,
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
        source: sources.get(item.source),
        classification: cls
          ? {
              signalType: cls.signalType,
              sectors: cls.sectors,
              geographies: cls.geographies,
              confidence: cls.confidence,
              otherSectors: cls.otherSectors,
              activelyPartnering: cls.activelyPartnering,
              partners: cls.partners,
              programmeStartYear: cls.programmeStartYear,
              amountInrCrore: cls.amountInrCrore,
            }
          : null,
      },
      cfg,
      now,
    );
    const companyId = cls?.companies[0] ? await upsertCompany(db, cls.companies[0], companyCache) : null;
    const values = {
      itemId: item.id,
      companyId,
      signalType: r.signalType,
      score: r.score,
      tier: r.tier,
      reason: r.reason,
      classified: r.classified,
      updatedAt: now,
    };
    await db.insert(signals).values(values).onConflictDoUpdate({ target: signals.itemId, set: values });
    stats.scored++;
    stats.byTier[r.tier] = (stats.byTier[r.tier] ?? 0) + 1;
  }
  return stats;
}
