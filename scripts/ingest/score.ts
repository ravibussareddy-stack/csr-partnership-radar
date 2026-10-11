import { and, eq, gte, isNull, or } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import type { DB } from "@/lib/db/client";
import { classifications, companies, rawItems, signals } from "@/lib/db/schema";
import { baseKey, nameKey } from "@/lib/companies";
import { scoreItem } from "@/lib/scoring";

export interface ScoreStats {
  scored: number;
  removed: number;
  byTier: Record<string, number>;
}

interface CompanyIndex {
  byKey: Map<string, number>;
  byBase: Map<string, number | null>; // null = ambiguous
}

async function loadCompanyIndex(db: DB): Promise<CompanyIndex> {
  const idx: CompanyIndex = { byKey: new Map(), byBase: new Map() };
  const rows = await db
    .select({ id: companies.id, name: companies.canonicalName, aliases: companies.aliases, key: companies.nameKey, base: companies.baseKey })
    .from(companies);
  for (const co of rows) {
    for (const n of [co.name, ...co.aliases]) idx.byKey.set(nameKey(n), co.id);
    if (co.key) idx.byKey.set(co.key, co.id);
    const b = co.base ?? baseKey(co.name);
    if (!b) continue;
    idx.byBase.set(b, idx.byBase.has(b) && idx.byBase.get(b) !== co.id ? null : co.id);
  }
  return idx;
}

/**
 * Entity resolution: exact normalised name (incl. aliases and the 71k National CSR Portal
 * names), then a unique match without legal suffixes ("Hindustan Zinc" → "Hindustan Zinc
 * Limited"); otherwise a new news-origin company. TODO(phase-2): fuzzy matching, CIN.
 */
async function resolveCompany(db: DB, name: string, idx: CompanyIndex): Promise<number> {
  const key = nameKey(name);
  const hit = idx.byKey.get(key) ?? idx.byBase.get(baseKey(name)) ?? undefined;
  if (hit) return hit;
  const [row] = await db
    .insert(companies)
    .values({ canonicalName: name.trim(), nameKey: key, baseKey: baseKey(name), origin: "news" })
    .onConflictDoUpdate({ target: companies.canonicalName, set: { isActive: true } })
    .returning({ id: companies.id });
  idx.byKey.set(key, row.id);
  return row.id;
}

/** Re-scores every pre-filtered item in the lookback window (so recency stays current). */
export async function scoreRecent(db: DB, cfg: AppConfig, now = new Date()): Promise<ScoreStats> {
  const stats: ScoreStats = { scored: 0, removed: 0, byTier: {} };
  const since = new Date(now.getTime() - cfg.scoringWeights.lookbackDays * 86400_000);
  const sources = new Map(cfg.sources.map((s) => [s.id, s]));

  const companyIdx = await loadCompanyIndex(db);

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
    const companyId = cls?.companies[0] ? await resolveCompany(db, cls.companies[0], companyIdx) : null;
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
