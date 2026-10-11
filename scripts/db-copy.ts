/**
 * One-off: copy every table from one database to another (e.g. local PGlite → Neon), keeping ids.
 *   SOURCE_DATABASE_URL=pglite://./.pglite TARGET_DATABASE_URL=postgres://… npm run db:copy [-- --force]
 * The target must be migrated first and empty (--force truncates it). Saves re-crawling and re-running Gemini.
 */
import "./env";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// Parents before children (foreign keys).
const TABLES: [string, PgTable, number][] = [
  ["config", schema.config, 50],
  ["companies", schema.companies, 2000],
  ["raw_items", schema.rawItems, 300],
  ["classifications", schema.classifications, 500],
  ["csr_spend", schema.csrSpend, 2000],
  ["company_news", schema.companyNews, 1000],
  ["archive_headlines", schema.archiveHeadlines, 1000],
  ["signals", schema.signals, 1000],
  ["company_stats", schema.companyStats, 200],
];

async function main() {
  const src = process.env.SOURCE_DATABASE_URL;
  const dst = process.env.TARGET_DATABASE_URL;
  if (!src?.startsWith("pglite://") || !dst) throw new Error("set SOURCE_DATABASE_URL=pglite://… and TARGET_DATABASE_URL");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(src.slice("pglite://".length));
  const from = drizzle(client, { schema });
  const to = drizzleNeon(neon(dst), { schema });

  const existing = Number((await to.execute(sql`select count(*)::int as n from companies`)).rows[0].n);
  if (existing > 0) {
    if (!process.argv.includes("--force")) throw new Error(`target already has ${existing} companies; pass --force to truncate`);
    await to.execute(sql.raw(`truncate ${TABLES.map(([n]) => n).join(", ")} restart identity cascade`));
  }

  for (const [name, table, batch] of TABLES) {
    const rows = await from.select().from(table);
    for (let i = 0; i < rows.length; i += batch) await to.insert(table).values(rows.slice(i, i + batch));
    if (name !== "config" && name !== "company_stats") {
      await to.execute(sql.raw(`select setval(pg_get_serial_sequence('${name}', 'id'), coalesce((select max(id) from ${name}), 1))`));
    }
    console.log(`${name}: ${rows.length} rows`);
  }
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
