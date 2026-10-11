/**
 * npm run history:news — backfills dated CSR news mentions per company (for announcement
 * timing) from the WordPress REST archives of CSR news sites, back to 2009/2014.
 *
 * Targets: the top HISTORY_NEWS_TOP companies by focus-sector spend (all-India and
 * Maharashtra) plus every company in the digest. A hit counts only if the headline names
 * the company, so a passing mention in a body doesn't count. robots.txt + per-host rate limit
 * via PoliteFetcher. Re-runs are idempotent (unique company + URL).
 *
 * Excluded: csrmandate.org (rejects non-browser clients with HTTP 444).
 */
import "../env";
import { desc, inArray, isNotNull } from "drizzle-orm";
import { MANUAL_ALIASES } from "@/config/aliases";
import { baseKey, nameKey } from "@/lib/companies";
import { closeDb, getDb } from "@/lib/db/client";
import { companies, companyNews, companyStats, signals } from "@/lib/db/schema";
import { matchKeywords, stripHtml } from "@/lib/text";
import { PoliteFetcher } from "../ingest/robots";

const ARCHIVES = [
  { id: "indiacsr", base: "https://indiacsr.in" },
  { id: "thecsrjournal", base: "https://thecsrjournal.in" },
  { id: "csrtimes", base: "https://www.csrtimes.org" },
];
const TOP = Number(process.env.HISTORY_NEWS_TOP ?? 150);
const MAX_PAGES = 3; // up to 300 hits per company per site
const MANUAL = new Set(Object.values(MANUAL_ALIASES).flat().map(nameKey));

/** Short acronyms ("OMC", "CCL") collide with other meanings in news; search them only if set manually. */
function searchable(alias: string): boolean {
  if (MANUAL.has(nameKey(alias))) return true;
  const compact = alias.replace(/[^A-Za-z0-9&]/g, "");
  return alias.includes(" ") || compact.length >= 4;
}

interface WpPost {
  date_gmt?: string;
  date: string;
  link: string;
  title: { rendered: string };
}

/** Headline must contain every word of the company's short name (e.g. "bajaj finance") or one of its aliases ("TCS"). */
function headlineNames(title: string, short: string, aliases: string[]): boolean {
  const t = ` ${baseKey(title)} `;
  if (short.split(" ").every((w) => t.includes(` ${w} `))) return true;
  return matchKeywords(title, aliases).length > 0;
}

async function main() {
  const db = await getDb();
  const fetcher = new PoliteFetcher(1500);
  const t0 = Date.now();

  const byFocus = await db.select({ id: companyStats.companyId }).from(companyStats).orderBy(desc(companyStats.predictedFocusCr)).limit(TOP);
  const byMh = await db.select({ id: companyStats.companyId }).from(companyStats).orderBy(desc(companyStats.maharashtraFocusLastCr)).limit(TOP);
  const inDigest = await db.select({ id: signals.companyId }).from(signals).where(isNotNull(signals.companyId));
  const ids = [...new Set([...byFocus, ...byMh, ...inDigest].map((r) => r.id!))];
  const aliasesOnly = process.argv.includes("--aliases-only");
  const targets = await db
    .select({ id: companies.id, name: companies.canonicalName, aliases: companies.aliases })
    .from(companies)
    .where(inArray(companies.id, ids));
  console.log(`news backfill: ${targets.length} companies × ${ARCHIVES.length} archives`);

  let total = 0;
  // One worker per archive host so the per-host rate limit doesn't serialise everything.
  await Promise.all(
    ARCHIVES.map(async (site) => {
      let siteHits = 0;
      for (const co of targets) {
        const short = baseKey(co.name);
        const aliases = co.aliases.filter(searchable);
        // Search the short name (unless --aliases-only) and each alias.
        const terms = [...(aliasesOnly || short.length < 3 ? [] : [short]), ...aliases];
        for (const term of terms)
        for (let page = 1; page <= MAX_PAGES; page++) {
          const url = `${site.base}/wp-json/wp/v2/posts?search=${encodeURIComponent(term)}&per_page=100&page=${page}&_fields=date,date_gmt,link,title`;
          let posts: WpPost[];
          try {
            const body = await fetcher.get(url);
            if (body === null) {
              console.warn(`${site.id}: robots.txt disallows the REST API, skipping site`);
              return;
            }
            posts = JSON.parse(body);
          } catch {
            break; // 400 past the last page, or a transient error
          }
          if (!Array.isArray(posts) || posts.length === 0) break;
          const rows = posts
            .map((p) => ({ title: stripHtml(p.title.rendered), link: p.link, at: new Date(`${p.date_gmt ?? p.date}Z`) }))
            .filter((p) => !Number.isNaN(p.at.getTime()) && headlineNames(p.title, short, aliases))
            .map((p) => ({ companyId: co.id, source: site.id, url: p.link, title: p.title, publishedAt: p.at }));
          if (rows.length) {
            const out = await db.insert(companyNews).values(rows).onConflictDoNothing().returning({ id: companyNews.id });
            siteHits += out.length;
          }
          if (posts.length < 100) break;
        }
      }
      console.log(`${site.id}: ${siteHits} new dated headlines`);
      total += siteHits;
    }),
  );
  const n = await db.$count(companyNews);
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${total} new, ${n} total. Next: npm run history:stats`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
