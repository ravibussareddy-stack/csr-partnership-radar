/**
 * npm run history:recent — keeps the warm window (WARM_DAYS, default 365) of CSR news complete
 * for ALL companies, not just the tracked ones:
 *   1. fetch every headline from the CSR news archives' WordPress REST APIs by date
 *      (incremental: from the newest stored headline per source);
 *   2. batch-classify new headlines with Gemini (80 per call): company, kind, sector;
 *   3. resolve the company and copy CSR headlines into company_news (used by the warm list
 *      and announcement timing).
 * robots.txt + per-host rate limits via PoliteFetcher. Cheap after the first run.
 */
import "../env";
import { and, eq, isNull, max } from "drizzle-orm";
import { loadConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";
import { archiveHeadlines, companyNews } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { loadCompanyIndex, resolveCompany } from "@/lib/resolve";
import { stripHtml } from "@/lib/text";
import { archiveHeadlineResponseSchema, archiveHeadlineSchema, buildArchiveHeadlinePrompt, HEADLINE_PROMPT_VERSION } from "@/prompts/headlines";
import { PoliteFetcher } from "../ingest/robots";

const ARCHIVES = [
  { id: "indiacsr", base: "https://indiacsr.in" },
  { id: "thecsrjournal", base: "https://thecsrjournal.in", categorySlug: "corporate-social-responsibility" },
  { id: "csrtimes", base: "https://www.csrtimes.org" },
];
const WARM_DAYS = Number(process.env.WARM_DAYS ?? 365);
const BATCH = 80;
const MAX_CALLS = Number(process.env.HEADLINE_MAX_CALLS ?? 120);
const MAX_PAGES = 120; // 12,000 posts per site per run, a safety cap

interface WpPost {
  date: string;
  date_gmt?: string;
  link: string;
  title: { rendered: string };
}

async function fetchNew(fetcher: PoliteFetcher, site: (typeof ARCHIVES)[number], after: Date) {
  let category = "";
  if (site.categorySlug) {
    // The CSR Journal publishes lots of general news; only its CSR category is relevant.
    const body = await fetcher.get(`${site.base}/wp-json/wp/v2/categories?slug=${site.categorySlug}&_fields=id`);
    const id = body ? (JSON.parse(body) as { id: number }[])[0]?.id : undefined;
    if (id) category = `&categories=${id}`;
  }
  const out: { source: string; url: string; title: string; publishedAt: Date }[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${site.base}/wp-json/wp/v2/posts?after=${after.toISOString().slice(0, 19)}&orderby=date&order=asc&per_page=100&page=${page}${category}&_fields=date,date_gmt,link,title`;
    let posts: WpPost[];
    try {
      const body = await fetcher.get(url);
      if (body === null) {
        console.warn(`${site.id}: robots.txt disallows the REST API`);
        break;
      }
      posts = JSON.parse(body);
    } catch {
      break; // 400 past the last page
    }
    if (!Array.isArray(posts) || posts.length === 0) break;
    for (const p of posts) {
      const at = new Date(`${p.date_gmt ?? p.date}Z`);
      const title = stripHtml(p.title.rendered);
      if (!Number.isNaN(at.getTime()) && title) out.push({ source: site.id, url: p.link, title, publishedAt: at });
    }
    if (posts.length < 100) break;
  }
  return out;
}

async function main() {
  const db = await getDb();
  const cfg = await loadConfig(db);
  const t0 = Date.now();
  const windowStart = new Date(Date.now() - WARM_DAYS * 86400_000);

  // 1. Fetch (one worker per host)
  const fetcher = new PoliteFetcher(1500);
  const fetched = await Promise.all(
    ARCHIVES.map(async (site) => {
      const [{ last }] = await db.select({ last: max(archiveHeadlines.publishedAt) }).from(archiveHeadlines).where(eq(archiveHeadlines.source, site.id));
      const after = last && new Date(last) > windowStart ? new Date(last) : windowStart;
      const rows = await fetchNew(fetcher, site, after);
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const res = await db.insert(archiveHeadlines).values(rows.slice(i, i + 500)).onConflictDoNothing().returning({ id: archiveHeadlines.id });
        inserted += res.length;
      }
      console.log(`${site.id}: ${rows.length} headlines since ${after.toISOString().slice(0, 10)}, ${inserted} new`);
      return inserted;
    }),
  );

  // 2. Classify unclassified headlines (batched)
  const todo = await db
    .select({ id: archiveHeadlines.id, title: archiveHeadlines.title })
    .from(archiveHeadlines)
    .where(isNull(archiveHeadlines.kind))
    .limit(BATCH * MAX_CALLS);
  let pool: GeminiPool | null = null;
  try {
    pool = new GeminiPool(undefined, undefined, () => {});
  } catch (err) {
    console.warn(`no Gemini (${(err as Error).message}); headlines stay unclassified until next run`);
  }
  const version = pool ? `${pool.model}@${HEADLINE_PROMPT_VERSION}` : "";
  const schema = archiveHeadlineResponseSchema(cfg);
  const validator = archiveHeadlineSchema(cfg);
  let classified = 0;
  for (let i = 0; pool && i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    let parsed: ReturnType<typeof validator.parse> | null = null;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      try {
        const res = await pool.generateJson(buildArchiveHeadlinePrompt(chunk.map((r, j) => ({ i: j, title: r.title })), cfg), schema);
        const v = validator.safeParse(JSON.parse(res.text));
        if (v.success) parsed = v.data;
      } catch (err) {
        if (err instanceof GeminiError && err.kind !== "transient") {
          console.warn(`classify stopped (${err.kind}); the rest is picked up next run`);
          pool = null;
          break;
        }
      }
    }
    for (const r of parsed ?? []) {
      const row = chunk[r.i];
      if (!row) continue;
      await db
        .update(archiveHeadlines)
        .set({ company: r.company || null, kind: r.kind, sector: r.sector, model: version })
        .where(eq(archiveHeadlines.id, row.id));
      classified++;
    }
  }

  // 3. Resolve companies and copy CSR headlines into company_news
  const pending = await db
    .select()
    .from(archiveHeadlines)
    .where(and(isNull(archiveHeadlines.companyId)));
  const idx = await loadCompanyIndex(db);
  let linked = 0;
  for (const h of pending) {
    if (!h.kind || h.kind === "not_csr" || !h.company) continue;
    const companyId = await resolveCompany(db, h.company, idx);
    await db.update(archiveHeadlines).set({ companyId }).where(eq(archiveHeadlines.id, h.id));
    await db
      .insert(companyNews)
      .values({ companyId, source: h.source, url: h.url, title: h.title, publishedAt: h.publishedAt, kind: h.kind, sector: h.sector, model: h.model })
      .onConflictDoNothing();
    linked++;
  }
  console.log(
    `done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${fetched.reduce((a, b) => a + b, 0)} new headlines, ${classified} classified (${todo.length - classified} left), ${linked} linked to companies. Next: npm run history:stats`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
