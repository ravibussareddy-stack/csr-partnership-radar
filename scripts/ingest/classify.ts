import { and, asc, eq, gte, inArray, isNull, not, or, like } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import { classifyItem } from "@/lib/classifier";
import type { DB } from "@/lib/db/client";
import { classifications, rawItems } from "@/lib/db/schema";
import { GeminiPool, loadKeys } from "@/lib/gemini";
import { promptVersion } from "@/prompts/classify";

export interface ClassifyStats {
  attempted: number;
  classified: number;
  cacheHits: number;
  unclassified: number;
  skippedNoKeys: number;
  /** not attempted because the run's time budget ran out; picked up by the next run */
  deferred: number;
  /** why Gemini calls stopped early (quota / auth), if they did */
  stoppedReason: string | null;
  byKey: Record<string, number>;
}

export interface ClassifyOptions {
  /** epoch ms: no new Gemini call starts after this, so scoring still runs inside the job limit */
  deadline?: number;
  /** Gemini calls in flight at once (CLASSIFY_CONCURRENCY, default 3) */
  concurrency?: number;
}

/**
 * Classifies pre-filtered items that have no classification yet (pending or
 * previously unclassified), newest first, up to `limit` Gemini calls, a few at a time, and only
 * while the run's time budget lasts. Items left over keep their place in the queue for the next run.
 */
export async function classifyPending(db: DB, cfg: AppConfig, limit: number, opts: ClassifyOptions = {}): Promise<ClassifyStats> {
  const stats: ClassifyStats = {
    attempted: 0, classified: 0, cacheHits: 0, unclassified: 0, skippedNoKeys: 0, deferred: 0, stoppedReason: null, byKey: {},
  };
  const deadline = opts.deadline ?? Infinity;
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const since = new Date(Date.now() - cfg.scoringWeights.lookbackDays * 86400_000);
  const inWindow = or(gte(rawItems.publishedAt, since), and(isNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since)));
  const version = promptVersion(cfg);
  const current = `%@${version}`;

  // Prompt upgrade: items in the window classified under an older prompt version are
  // queued once more (the cache is per content hash AND prompt version).
  const stale = await db
    .select({ id: rawItems.id })
    .from(rawItems)
    .innerJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
    .where(and(eq(rawItems.prefilterPassed, true), inWindow, not(like(classifications.model, current))));
  if (stale.length > 0) {
    console.log(`classify: ${stale.length} items classified under an older prompt; re-classifying with ${version}`);
    await db.update(rawItems).set({ classifyStatus: "pending" }).where(inArray(rawItems.id, stale.map((r) => r.id)));
  }

  const queue = await db
    .select()
    .from(rawItems)
    .where(
      and(
        eq(rawItems.prefilterPassed, true),
        inArray(rawItems.classifyStatus, ["pending", "unclassified"]),
        // Regulatory searches look back further (rules move slowly), so classify them when freshly fetched.
        or(inWindow, and(like(rawItems.searchId, "policy%"), gte(rawItems.fetchedAt, since))),
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
  // Cache hits first (database only, no Gemini call).
  const toCall: typeof queue = [];
  for (const item of queue) {
    // Cache by content hash: same content seen under another URL is never re-classified.
    const cached = await db
      .select({ id: classifications.id })
      .from(classifications)
      .where(and(eq(classifications.contentHash, item.contentHash), like(classifications.model, current)))
      .limit(1);
    if (cached.length > 0) {
      await db.update(rawItems).set({ classifyStatus: "classified" }).where(eq(rawItems.id, item.id));
      stats.cacheHits++;
    } else toCall.push(item);
  }

  const classifyOne = async (item: (typeof queue)[number]) => {
    const out = await classifyItem(
      { title: item.title, body: item.body, source: sourceNames.get(item.source) ?? item.source, publishedAt: item.publishedAt },
      cfg,
      pool!,
    );
    if (out.ok) {
      const values = {
        itemId: item.id,
        contentHash: item.contentHash,
        isSignal: out.data.is_signal,
        signalType: out.data.signal_type,
        sectors: out.data.sectors,
        otherSectors: out.data.other_sectors,
        geographies: out.data.geographies,
        companies: out.data.companies,
        activelyPartnering: out.data.actively_partnering,
        partners: out.data.partners,
        programmeStartYear: out.data.programme_start_year,
        amountInrCrore: out.data.amount_inr_crore,
        financialYear: out.data.financial_year,
        keyPoints: out.data.key_points,
        nextStep: out.data.next_step || null,
        companyDomain: out.data.company_domain,
        headline: out.data.headline || null,
        recommendedAction: out.data.recommended_action,
        worthIt: out.data.worth_it || null,
        policyStatus: out.data.signal_type === "policy_change" ? (out.data.policy_status ?? "inferred") : null,
        // Keep a quote only if it appears word for word in the item (no paraphrases or inventions).
        quotes: out.data.quotes.filter((q) => normalise(`${item.title} ${item.body}`).includes(normalise(q.quote))),
        whyItMatters: out.data.why_it_matters,
        confidence: out.data.confidence,
        model: out.model,
        keyLabel: out.keyLabel,
        createdAt: new Date(),
      };
      // Upsert: replaces a row from an older prompt version.
      await db
        .insert(classifications)
        .values(values)
        .onConflictDoUpdate({ target: classifications.contentHash, set: values });
      await db.update(rawItems).set({ classifyStatus: "classified" }).where(eq(rawItems.id, item.id));
      stats.classified++;
      stats.byKey[out.keyLabel] = (stats.byKey[out.keyLabel] ?? 0) + 1;
    } else {
      await db.update(rawItems).set({ classifyStatus: "unclassified" }).where(eq(rawItems.id, item.id));
      stats.unclassified++;
      console.warn(`classify: item ${item.id} unclassified (${out.reason})`);
      if (out.stopRun && !stop) {
        console.warn("classify: stopping Gemini calls for this run; remaining items stay unclassified");
        stats.stoppedReason = out.reason;
        stop = true;
      }
    }
  };

  // A few workers share the queue (newest first). A worker takes the next item only while the cap,
  // the time budget and the key pool allow; everything not started waits for the next run.
  let next = 0;
  const leftOver: (typeof queue)[number][] = [];
  const worker = async () => {
    while (next < toCall.length) {
      const item = toCall[next++];
      if (stop || stats.attempted >= limit || Date.now() >= deadline) {
        if (!stop && stats.attempted < limit) stats.deferred++;
        else stats.skippedNoKeys++;
        leftOver.push(item);
        continue;
      }
      stats.attempted++;
      await classifyOne(item);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  for (const item of leftOver) {
    if (item.classifyStatus === "pending") {
      await db.update(rawItems).set({ classifyStatus: "unclassified" }).where(eq(rawItems.id, item.id));
    }
  }

  return stats;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[“”"‘’'`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
