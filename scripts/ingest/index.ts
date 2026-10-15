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
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { loadConfig, seedConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";
import { modelMetrics, rawItems } from "@/lib/db/schema";
import { prefilter } from "@/lib/prefilter";
import { stripHtml, truncate } from "@/lib/text";
import { contentHash } from "@/lib/hash";
import { classifyPending } from "./classify";
import { PoliteFetcher } from "./robots";
import { fetchRssSource } from "./rss";
import { scoreRecent } from "./score";
import { runSearches } from "./search";
import { fetchIntakeEmail } from "./email";
import { contextScreen } from "./screen";
import { runResearch } from "./research";

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
      const em = await fetchIntakeEmail(db, { config: cfg });
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

  // 2c. "We missed this" reports (Results page): read the reported page, so the analysis works from the
  // article itself rather than the teammate's one-line note. Runs in the 10-minute intake too.
  const missed = await db
    .select({ id: rawItems.id, url: rawItems.url, title: rawItems.title, body: rawItems.body })
    .from(rawItems)
    .where(and(eq(rawItems.channel, "missed"), eq(rawItems.classifyStatus, "pending"), isNull(rawItems.prefilterPassed)));
  if (missed.length) {
    const pageFetcher = new PoliteFetcher();
    for (const m of missed) {
      try {
        const html = /^https?:\/\//.test(m.url) ? await pageFetcher.get(m.url) : null;
        if (!html) continue;
        const pageTitle = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200);
        const text = truncate(stripHtml(html.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")), 4000);
        const title = pageTitle || m.title;
        const body = `${m.body}\n\nPage text: ${text}`;
        await db.update(rawItems).set({ title, body, contentHash: contentHash(title, body) }).where(eq(rawItems.id, m.id));
      } catch (err) {
        console.warn(`missed report ${m.id}: page not read (${(err as Error).message}); analysing the note only`);
      }
    }
    console.log(`missed reports: ${missed.length} page(s) read for analysis`);
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
  const failed: { id: number; title: string; body: string }[] = [];
  for (const it of toFilter) {
    const pf = prefilter(it, sources.get(it.source), cfg);
    if (pf.passed) passed++;
    else failed.push({ id: it.id, title: it.title, body: it.body });
    await db
      .update(rawItems)
      .set({
        prefilterPassed: pf.passed,
        prefilterNote: `keywords: ${pf.reason}`,
        // Failing items never reach Gemini. Don't downgrade an already-classified item.
        ...(pf.passed ? (it.classifyStatus === "filtered_out" ? { classifyStatus: "pending" as const } : {}) : { classifyStatus: "filtered_out" as const }),
      })
      .where(eq(rawItems.id, it.id));
  }
  console.log(`prefilter: ${passed}/${toFilter.length} passed keywords`);
  // Stage 2: context screen (Gemini, batched, headline + first lines) for keyword misses.
  const sc = await contextScreen(db, cfg, failed);
  console.log(`context screen: ${sc.status}${sc.screened ? `, ${sc.released}/${sc.screened} released to classification in ${sc.calls} call(s)` : ""}`);

  // 4. Classify (Gemini; failures → unclassified, run continues). The AI steps share a time budget
  // (INGEST_BUDGET_MIN, default 30 min from the start of the run): once it is spent no new Gemini
  // call starts, the leftovers wait for the next run, and scoring always runs. Before this, a heavy
  // day ran past the job's time limit mid-classification and the whole digest went stale.
  const budgetMin = Number(process.env.INGEST_BUDGET_MIN ?? 30);
  const deadline = t0 + (Number.isFinite(budgetMin) ? budgetMin : 30) * 60_000;
  const limit = Number(process.env.MAX_CLASSIFY_PER_RUN ?? 60);
  const concurrency = Number(process.env.CLASSIFY_CONCURRENCY ?? 3);
  const cs = await classifyPending(db, cfg, Number.isFinite(limit) ? limit : 60, { deadline, concurrency: Number.isFinite(concurrency) ? concurrency : 3 });
  console.log(
    `classify: ${cs.classified} classified, ${cs.cacheHits} cache hits, ${cs.unclassified} failed, ${cs.skippedNoKeys} skipped (no keys / cap), ${cs.deferred} deferred (time budget); by key ${JSON.stringify(cs.byKey)}`,
  );

  // 4b. Research personal / forwarded leads (Gemini + Google Search grounding)
  const rs = await runResearch(db, deadline);
  console.log(`research: ${rs.status}${rs.researched ? `, ${rs.researched} item(s), ${rs.sources} source(s)` : ""}`);

  // 5. Score
  const ss = await scoreRecent(db, cfg);
  console.log(`score: ${ss.scored} signals ${JSON.stringify(ss.byTier)}, ${ss.removed} removed (not a signal)`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Run record for the health check (scripts/ops/health.ts). The 10-minute message-drop runs
  // (--no-fetch) keep their own record so they never mask the daily run's.
  await db
    .insert(modelMetrics)
    .values({
      key: args.has("--no-fetch") ? "intake-run" : "pipeline-run",
      data: {
        finishedAt: new Date().toISOString(),
        seconds: Math.round((Date.now() - t0) / 1000),
        fetchFailures,
        sources: enabled.length,
        classified: cs.classified,
        failed: cs.unclassified,
        deferred: cs.deferred,
        geminiStopped: cs.stoppedReason,
        research: rs.status,
        scored: ss.scored,
      },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({ target: modelMetrics.key, set: { data: sql`excluded.data`, updatedAt: new Date() } });

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
