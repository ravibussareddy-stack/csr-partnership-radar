import { and, asc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import { classifyItem } from "@/lib/classifier";
import type { DB } from "@/lib/db/client";
import { classifications, rawItems } from "@/lib/db/schema";
import { GeminiPool, loadKeys } from "@/lib/gemini";

export interface ClassifyStats {
  attempted: number;
  classified: number;
  cacheHits: number;
  unclassified: number;
  skippedNoKeys: number;
  byKey: Record<string, number>;
}

/**
 * Classifies pre-filtered items that have no classification yet (pending or
 * previously unclassified), newest first, up to `limit` Gemini calls.
 */
export async function classifyPending(db: DB, cfg: AppConfig, limit: number): Promise<ClassifyStats> {
  const stats: ClassifyStats = {
    attempted: 0, classified: 0, cacheHits: 0, unclassified: 0, skippedNoKeys: 0, byKey: {},
  };
  const since = new Date(Date.now() - cfg.scoringWeights.lookbackDays * 86400_000);

  const queue = await db
    .select()
    .from(rawItems)
    .where(
      and(
        eq(rawItems.prefilterPassed, true),
        inArray(rawItems.classifyStatus, ["pending", "unclassified"]),
        or(gte(rawItems.publishedAt, since), and(isNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since))),
      ),
    )
    .orderBy(asc(rawItems.id));
  queue.reverse(); // newest first, so a capped run spends quota on fresh items

  const sourceNames = new Map(cfg.sources.map((s) => [s.id, s.name]));
  let pool: GeminiPool | null = null;
  try {
    if (loadKeys().length > 0) pool = new GeminiPool();
    else console.warn("classify: no Gemini keys set; all items stay unclassified (rules-only scoring)");
  } catch (err) {
    console.warn(`classify: Gemini not configured (${(err as Error).message}); rules-only scoring`);
  }

  let stop = !pool;
  for (const item of queue) {
    // Cache by content hash: same content seen under another URL is never re-classified.
    const cached = await db
      .select({ id: classifications.id })
      .from(classifications)
      .where(eq(classifications.contentHash, item.contentHash))
      .limit(1);
    if (cached.length > 0) {
      await db.update(rawItems).set({ classifyStatus: "classified" }).where(eq(rawItems.id, item.id));
      stats.cacheHits++;
      continue;
    }
    if (stop || stats.attempted >= limit) {
      if (item.classifyStatus === "pending") {
        await db.update(rawItems).set({ classifyStatus: "unclassified" }).where(eq(rawItems.id, item.id));
      }
      stats.skippedNoKeys++;
      continue;
    }

    stats.attempted++;
    const out = await classifyItem(
      { title: item.title, body: item.body, source: sourceNames.get(item.source) ?? item.source, publishedAt: item.publishedAt },
      cfg,
      pool!,
    );
    if (out.ok) {
      await db
        .insert(classifications)
        .values({
          itemId: item.id,
          contentHash: item.contentHash,
          isSignal: out.data.is_signal,
          signalType: out.data.signal_type,
          sectors: out.data.sectors,
          geographies: out.data.geographies,
          companies: out.data.companies,
          whyItMatters: out.data.why_it_matters,
          confidence: out.data.confidence,
          model: out.model,
          keyLabel: out.keyLabel,
        })
        .onConflictDoNothing({ target: classifications.contentHash });
      await db.update(rawItems).set({ classifyStatus: "classified" }).where(eq(rawItems.id, item.id));
      stats.classified++;
      stats.byKey[out.keyLabel] = (stats.byKey[out.keyLabel] ?? 0) + 1;
    } else {
      await db.update(rawItems).set({ classifyStatus: "unclassified" }).where(eq(rawItems.id, item.id));
      stats.unclassified++;
      console.warn(`classify: item ${item.id} unclassified (${out.reason})`);
      if (out.stopRun) {
        console.warn("classify: stopping Gemini calls for this run; remaining items stay unclassified");
        stop = true;
      }
    }
  }
  return stats;
}
