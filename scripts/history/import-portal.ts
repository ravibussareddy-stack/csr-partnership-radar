/**
 * npm run history:import -- <path to Dynamic_CSR_Report.csv>
 *
 * Imports the National CSR Portal "Dynamic CSR Report" (company × FY × state × district ×
 * sector, ₹ crore spent). The portal is CAPTCHA-gated, so the CSV is downloaded by hand
 * from https://www.csr.gov.in and imported here (locally or from a runner), once a year
 * when a new FY is published. Full refresh: existing csr_spend rows are replaced.
 *
 * Expected header:
 * "Company Name","Financial Year",PSU/Non-PSU,"CSR State","CSR District",
 * "CSR Development Sector","CSR Sub Development Sector","Project Amount Spent (In INR Cr.)"
 */
import "../env";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { eq, isNull } from "drizzle-orm";
import { baseKey, nameKey, normSector, parseFy } from "@/lib/companies";
import { closeDb, getDb, type DB } from "@/lib/db/client";
import { companies, csrSpend } from "@/lib/db/schema";

const COLS = {
  company: "Company Name",
  fy: "Financial Year",
  psu: "PSU/Non-PSU",
  state: "CSR State",
  district: "CSR District",
  sector: "CSR Development Sector",
  subSector: "CSR Sub Development Sector",
  amount: "Project Amount Spent (In INR Cr.)",
};
const BATCH = 1000;

type Row = Record<string, string>;

async function* rows(path: string): AsyncGenerator<Row> {
  const parser = createReadStream(path).pipe(parse({ columns: true, bom: true, relax_quotes: true, skip_empty_lines: true }));
  let first = true;
  for await (const r of parser as AsyncIterable<Row>) {
    if (first) {
      const missing = Object.values(COLS).filter((c) => !(c in r));
      if (missing.length) throw new Error(`CSV is missing columns: ${missing.join(", ")}`);
      first = false;
    }
    yield r;
  }
}

/** Gives existing companies (e.g. first seen in news) a name key so they merge with portal names. */
async function backfillKeys(db: DB) {
  const rowsNoKey = await db.select().from(companies).where(isNull(companies.nameKey));
  for (const c of rowsNoKey) {
    const key = nameKey(c.canonicalName);
    const clash = await db.select({ id: companies.id }).from(companies).where(eq(companies.nameKey, key));
    if (clash.length) continue; // leave unkeyed; matching will still work through baseKey
    await db.update(companies).set({ nameKey: key, baseKey: baseKey(c.canonicalName) }).where(eq(companies.id, c.id));
  }
}

async function main() {
  const path = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!path) throw new Error("usage: npm run history:import -- <Dynamic_CSR_Report.csv>");
  const db = await getDb();
  const t0 = Date.now();

  // Pass 1: companies (display name = the most recent spelling seen for each key)
  const seen = new Map<string, { name: string; fy: number; psu: boolean }>();
  let n = 0;
  for await (const r of rows(path)) {
    n++;
    const name = r[COLS.company]?.trim();
    const fy = parseFy(r[COLS.fy] ?? "");
    if (!name || fy === null) continue;
    const key = nameKey(name);
    const prev = seen.get(key);
    if (!prev || fy >= prev.fy) seen.set(key, { name, fy, psu: /^psu$/i.test(r[COLS.psu]?.trim() ?? "") });
  }
  console.log(`pass 1: ${n} rows, ${seen.size} companies`);

  await backfillKeys(db);
  const idByKey = new Map<string, number>();
  for (const c of await db.select({ id: companies.id, key: companies.nameKey }).from(companies)) {
    if (c.key) idByKey.set(c.key, c.id);
  }
  const toInsert = [...seen.entries()].filter(([k]) => !idByKey.has(k));
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH).map(([key, v]) => ({
      canonicalName: v.name,
      nameKey: key,
      baseKey: baseKey(v.name),
      isPsu: v.psu,
      origin: "portal" as const,
    }));
    const out = await db
      .insert(companies)
      .values(chunk)
      // A news-origin row may already use this exact display name: adopt it.
      .onConflictDoUpdate({ target: companies.canonicalName, set: { origin: "portal" } })
      .returning({ id: companies.id, key: companies.nameKey, name: companies.canonicalName });
    for (const o of out) idByKey.set(o.key ?? nameKey(o.name), o.id);
  }
  // Existing rows matched by key become portal companies too.
  console.log(`companies: ${toInsert.length} new, ${seen.size - toInsert.length} already known`);

  // Pass 2: spend rows (full refresh)
  await db.delete(csrSpend);
  let batch: (typeof csrSpend.$inferInsert)[] = [];
  let inserted = 0;
  let skipped = 0;
  for await (const r of rows(path)) {
    const name = r[COLS.company]?.trim();
    const fy = parseFy(r[COLS.fy] ?? "");
    const amount = Number(r[COLS.amount]);
    const companyId = name ? idByKey.get(nameKey(name)) : undefined;
    // Zero-amount lines carry no spend information; skipping them keeps the table small.
    if (!companyId || fy === null || !Number.isFinite(amount) || amount <= 0) {
      skipped++;
      continue;
    }
    batch.push({
      companyId,
      fyStart: fy,
      state: r[COLS.state]?.trim() ?? "",
      district: r[COLS.district]?.trim() ?? "",
      sector: normSector(r[COLS.sector] ?? ""),
      subSector: r[COLS.subSector]?.trim() ?? "",
      amountCr: amount,
    });
    if (batch.length === BATCH) {
      await db.insert(csrSpend).values(batch);
      inserted += batch.length;
      batch = [];
      if (inserted % 50000 === 0) console.log(`  ${inserted} spend rows…`);
    }
  }
  if (batch.length) {
    await db.insert(csrSpend).values(batch);
    inserted += batch.length;
  }
  console.log(`csr_spend: ${inserted} rows inserted, ${skipped} skipped (zero amount or unparseable)`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s. Next: npm run history:stats`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
