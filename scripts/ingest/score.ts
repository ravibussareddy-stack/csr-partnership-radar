import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import type { DB } from "@/lib/db/client";
import { classifications, companies, companyNews, feedback, rawItems, signals, type HeadlineKind, type SignalType } from "@/lib/db/schema";
import { loadCompanyIndex, resolveCompany } from "@/lib/resolve";
import { isPublisher } from "@/lib/publishers";
import { scoreItem } from "@/lib/scoring";

export interface ScoreStats {
  scored: number;
  removed: number;
  byTier: Record<string, number>;
}

const HEADLINE_KIND: Partial<Record<SignalType, HeadlineKind>> = {
  new_initiative: "new_initiative",
  allocation_increase: "allocation_or_spend",
  partner_search: "partner_search",
  ongoing_programme: "ongoing_activity",
};

/** Re-scores every pre-filtered item in the lookback window (so recency stays current). */
export async function scoreRecent(db: DB, cfg: AppConfig, now = new Date()): Promise<ScoreStats> {
  const stats: ScoreStats = { scored: 0, removed: 0, byTier: {} };
  const since = new Date(now.getTime() - cfg.scoringWeights.lookbackDays * 86400_000);
  const sources = new Map(cfg.sources.map((s) => [s.id, s]));

  const companyIdx = await loadCompanyIndex(db);

  // Feedback learning: what Ananya marked "not relevant" recently, by company / source / signal type.
  const fbSince = new Date(now.getTime() - cfg.scoringWeights.feedback.days * 86400_000);
  const rejected = await db
    .select({ itemId: feedback.itemId, companyId: feedback.companyId, source: feedback.source, type: feedback.signalType })
    .from(feedback)
    .where(and(eq(feedback.action, "irrelevant"), gte(feedback.createdAt, fbSince)));
  const rejectedItems = new Set(rejected.map((r) => r.itemId));
  const countBy = (key: "companyId" | "source" | "type") => {
    const m = new Map<string | number, number>();
    for (const r of rejected) if (r[key] != null) m.set(r[key]!, (m.get(r[key]!) ?? 0) + 1);
    return m;
  };
  const byCompany = countBy("companyId");
  const bySource = countBy("source");
  const byType = countBy("type");
  // Items she rejected leave the digest entirely.
  if (rejectedItems.size) {
    const del = await db.delete(signals).where(inArray(signals.itemId, [...rejectedItems].filter((x): x is number => x != null))).returning({ id: signals.id });
    stats.removed += del.length;
  }
  // Job postings whose links failed the check (generic portal, dead, expired) leave the digest too.
  await db.delete(signals).where(sql`${signals.itemId} in (select id from raw_items where link_status in ('generic','dead','expired'))`);

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
    if (rejectedItems.has(item.id) || ["generic", "dead", "expired"].includes(item.linkStatus ?? "")) continue;
    if (cls && !cls.isSignal) {
      const del = await db.delete(signals).where(eq(signals.itemId, item.id)).returning({ id: signals.id });
      stats.removed += del.length;
      continue;
    }
    // The funder is the first named company that is not a news publisher or platform.
    const funder = cls?.companies.find((c) => !isPublisher(c));
    const companyId = funder ? await resolveCompany(db, funder, companyIdx) : null;
    const r = scoreItem(
      {
        feedback: {
          company: companyId ? (byCompany.get(companyId) ?? 0) : 0,
          source: bySource.get(item.source) ?? 0,
          type: cls ? (byType.get(cls.signalType) ?? 0) : 0,
        },
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
              hasCompany: cls.companies.length > 0,
            }
          : null,
      },
      cfg,
      now,
    );
    // Remember the company's website domain (for logos) the first time we learn it.
    if (companyId && cls?.companyDomain) {
      await db.update(companies).set({ domain: cls.companyDomain }).where(and(eq(companies.id, companyId), isNull(companies.domain)));
    }
    // Feed the company's dated-news history (announcement timing) from the live pipeline.
    const kind = cls ? HEADLINE_KIND[cls.signalType] : undefined;
    if (companyId && cls && kind) {
      await db
        .insert(companyNews)
        .values({
          companyId,
          source: item.source,
          url: item.url,
          title: item.title,
          publishedAt: item.publishedAt ?? item.fetchedAt,
          kind,
          sector: cls.sectors[0] ?? cls.otherSectors[0] ?? "other",
          model: cls.model,
        })
        .onConflictDoNothing();
    }
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
