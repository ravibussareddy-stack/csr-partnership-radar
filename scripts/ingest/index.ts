/**
 * npm run ingest — fetch → store → pre-filter → classify → score.
 * Runs in GitHub Actions (daily). Never runs inside Vercel.
 *
 * Flags:
 *   --refilter   re-run the pre-filter on items in the lookback window (after keyword changes)
 *   --no-fetch   skip fetching and searching (re-classify / re-score only)
 *   --no-search  skip the saved Google searches (Gemini grounding)
 */
import "../env";
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { loadConfig, seedConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";
import { rawItems } from "@/lib/db/schema";
import { prefilter } from "@/lib/prefilter";
import { classifyPending } from "./classify";
import { PoliteFetcher } from "./robots";
import { fetchRssSource } from "./rss";
import { scoreRecent } from "./score";
import { runSearches } from "./search";
import { fetchIntakeEmail } from "./email";

async function main() {
  const args = new Set(process.argv.slice(2));
  const db = await getDb();
  if ((await seedConfig(db)) === "inserted") console.log("config: seeded defaults");
  const cfg = await loadConfig(db);
  const t0 = Date.now();

  // 1–2. Fetch + store (idempotent by URL)
  let fetchFailures = 0;
  const enabled = cfg.sources.filter((s) => s.enabled && s.type === "rss");
  if (!args.has("--no-fetch")) {
    // TODO(phase-2): Gmail, WhatsApp intake and BRSR adapters plug in here alongside RSS.
    const fetcher = new PoliteFetcher();
    for (const src of enabled) {
      const res = await fetchRssSource(src, fetcher);
      if (res.status !== "ok") {
        fetchFailures++;
        console.warn(`fetch ${src.id}: ${res.status}${res.error ? ` (${res.error})` : ""}`);
        continue;
      }
      let inserted = 0;
      for (const it of res.items) {
        const out = await db.insert(rawItems).values(it).onConflictDoNothing({ target: rawItems.url }).returning({ id: rawItems.id });
        inserted += out.length;
      }
      console.log(`fetch ${src.id}: ${res.items.length} items, ${inserted} new`);
    }
  }

  // 2a. Intake inbox: Google Alerts, LinkedIn notification emails, forwarded messages
  if (!args.has("--no-fetch")) {
    try {
      const em = await fetchIntakeEmail(db);
      console.log(`email: ${em.status}${em.status.startsWith("ok") ? `, ${em.emails} emails → ${em.items} items kept, ${em.inserted} new` : ""}`);
    } catch (err) {
      console.warn(`email: failed (${(err as Error).message}); continuing`);
    }
  }

  // 2b. Saved Google searches via Gemini grounding (skip with --no-search)
  if (!args.has("--no-search") && !args.has("--no-fetch")) {
    const sr = await runSearches(db, cfg);
    console.log(`search: ${sr.runs} searches, ${sr.found} sourced items, ${sr.inserted} new`);
  }

  // 3. Pre-filter (new items, or the whole lookback window with --refilter)
  const since = new Date(Date.now() - cfg.scoringWeights.lookbackDays * 86400_000);
  const toFilter = await db
    .select()
    .from(rawItems)
    .where(
      args.has("--refilter")
        ? or(gte(rawItems.publishedAt, since), and(isNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since)))
        : isNull(rawItems.prefilterPassed),
    );
  const sources = new Map(cfg.sources.map((s) => [s.id, s]));
  let passed = 0;
  for (const it of toFilter) {
    const pf = prefilter(it, sources.get(it.source), cfg);
    if (pf.passed) passed++;
    await db
      .update(rawItems)
      .set({
        prefilterPassed: pf.passed,
        // Failing items never reach Gemini. Don't downgrade an already-classified item.
        ...(pf.passed ? (it.classifyStatus === "filtered_out" ? { classifyStatus: "pending" as const } : {}) : { classifyStatus: "filtered_out" as const }),
      })
      .where(eq(rawItems.id, it.id));
  }
  console.log(`prefilter: ${passed}/${toFilter.length} passed`);

  // 4. Classify (Gemini; failures → unclassified, run continues)
  const limit = Number(process.env.MAX_CLASSIFY_PER_RUN ?? 60);
  const cs = await classifyPending(db, cfg, Number.isFinite(limit) ? limit : 60);
  console.log(
    `classify: ${cs.classified} classified, ${cs.cacheHits} cache hits, ${cs.unclassified} failed, ${cs.skippedNoKeys} skipped (no keys / cap); by key ${JSON.stringify(cs.byKey)}`,
  );

  // 5. Score
  const ss = await scoreRecent(db, cfg);
  console.log(`score: ${ss.scored} signals ${JSON.stringify(ss.byTier)}, ${ss.removed} removed (not a signal)`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (enabled.length > 0 && fetchFailures === enabled.length && !args.has("--no-fetch")) {
    console.error("all sources failed to fetch");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
