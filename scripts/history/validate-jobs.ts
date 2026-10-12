/** npm run jobs:validate — re-check links of CSR job postings from the last 60 days (daily in ingest.yml; generic / dead / expired are excluded). */
import "../env";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { classifications, rawItems } from "@/lib/db/schema";
import { checkJobLink } from "@/lib/joblinks";
import { PoliteFetcher } from "../ingest/robots";

async function main() {
  const db = await getDb();
  const rows = await db
    .select({ id: rawItems.id, url: rawItems.url, title: rawItems.title, companies: classifications.companies })
    .from(rawItems)
    .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
    .where(and(or(eq(rawItems.source, "gemini-jobs"), eq(classifications.signalType, "csr_hiring")), gte(rawItems.fetchedAt, new Date(Date.now() - 60 * 86400_000))));
  const fetcher = new PoliteFetcher(1500);
  const tally: Record<string, number> = {};
  for (const r of rows) {
    const status = r.url.startsWith("http") ? await checkJobLink(r.url, fetcher, { title: r.title, company: r.companies?.[0] }) : "unverified";
    await db.update(rawItems).set({ linkStatus: status }).where(eq(rawItems.id, r.id));
    tally[status] = (tally[status] ?? 0) + 1;
    console.log(`${status.padEnd(10)} ${r.title.slice(0, 70)}  ${r.url.slice(0, 90)}`);
  }
  // Remove failed postings from the digest now (scoring would do it at the next run).
  const bad = await db.select({ id: rawItems.id }).from(rawItems).where(inArray(rawItems.linkStatus, ["generic", "dead", "expired"]));
  if (bad.length) await db.execute(sql`delete from signals where item_id in (select id from raw_items where link_status in ('generic','dead','expired'))`);
  console.log(`checked ${rows.length}: ${JSON.stringify(tally)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
