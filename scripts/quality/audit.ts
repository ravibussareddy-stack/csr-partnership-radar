/**
 * npm run audit — the daily data-quality audit, so problems are caught and fixed without a developer:
 *  1. Companies: news names never matched to the CSR Portal (empty profiles) and near-duplicates are
 *     linked or merged (Gemini picks among database candidates; ≥ 0.8 confidence; names kept as aliases).
 *  2. Publishers as funders: any signal still pointing at a news site / platform is unlinked.
 *  3. Pitch kits: every cited page must name the company; lines whose page doesn't are removed.
 *  4. Community contacts: the source page must name the person; mismatches are hidden.
 * (Job links are re-checked by npm run jobs:validate in the same workflow.)
 * The results, with examples, go to model_metrics "data-quality" and show on the Team page.
 */
import "../env";
import { and, eq, isNull, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { companies, contacts, modelMetrics, pitchKits, signals, type PitchKit } from "@/lib/db/schema";
import { GeminiPool } from "@/lib/gemini";
import { isPublisher } from "@/lib/publishers";
import { pageMentions } from "@/lib/verify";
import { PoliteFetcher } from "../ingest/robots";
import { linkCompanies } from "./companies";

export interface QualityCheck {
  id: string;
  label: string;
  checked: number;
  found: number;
  fixed: number;
  needsHuman: number;
  examples: string[];
}

const MAX_FETCH = Number(process.env.AUDIT_MAX_FETCH ?? 80);

async function main() {
  const db = await getDb();
  const checks: QualityCheck[] = [];
  const fetcher = new PoliteFetcher(1200);
  let fetches = 0;

  // 1. Companies
  try {
    const pool = new GeminiPool(undefined, undefined, () => {});
    const r = await linkCompanies(db, pool);
    checks.push({
      id: "companies",
      label: "Duplicate or unmatched companies",
      checked: r.checked,
      found: r.merged.length,
      fixed: r.merged.length,
      needsHuman: 0,
      examples: r.merged.slice(0, 6).map((m) => `${m.from} → ${m.to} (${m.relation === "foundation_of" ? "its foundation" : "same company"}, ${Math.round(m.confidence * 100)}%: ${m.why})`),
    });
  } catch (err) {
    console.warn(`audit companies: ${(err as Error).message}`);
  }

  // 2. Publishers recorded as the funding company
  const linked = await db.select({ id: companies.id, name: companies.canonicalName }).from(companies).where(sql`exists (select 1 from signals s where s.company_id = ${companies.id})`);
  const pubs = linked.filter((c) => isPublisher(c.name));
  for (const p of pubs) await db.update(signals).set({ companyId: null }).where(eq(signals.companyId, p.id));
  checks.push({ id: "publishers", label: "News sites recorded as the funder", checked: linked.length, found: pubs.length, fixed: pubs.length, needsHuman: 0, examples: pubs.map((p) => p.name) });

  // 3. Pitch kit sources
  const kits = await db.select({ id: pitchKits.companyId, data: pitchKits.data, name: companies.canonicalName, aliases: companies.aliases }).from(pitchKits).innerJoin(companies, eq(companies.id, pitchKits.companyId));
  let kitLines = 0;
  let kitBad = 0;
  const kitEx: string[] = [];
  for (const k of kits) {
    if (k.data.auditedAt || fetches >= MAX_FETCH) continue;
    const names = [k.name, ...(k.aliases ?? [])];
    const keep = async <T extends { url: string | null; text: string; checked?: boolean }>(rows: T[]) => {
      const out: T[] = [];
      for (const r of rows) {
        kitLines++;
        if (!r.url || fetches >= MAX_FETCH) {
          out.push(r);
          continue;
        }
        fetches++;
        const ok = await pageMentions(r.url, names, fetcher);
        if (ok === false) {
          kitBad++;
          if (kitEx.length < 5) kitEx.push(`${k.name}: “${r.text.slice(0, 80)}…” cited ${new URL(r.url).hostname}, which doesn't mention it`);
          continue;
        }
        out.push({ ...r, checked: ok === true });
      }
      return out;
    };
    const data: PitchKit = { wants: await keep(k.data.wants), recentNews: await keep(k.data.recentNews), proof: await keep(k.data.proof), auditedAt: new Date().toISOString() };
    await db.update(pitchKits).set({ data }).where(eq(pitchKits.companyId, k.id));
  }
  checks.push({ id: "pitch_sources", label: "Pitch-kit lines citing a page about someone else", checked: kitLines, found: kitBad, fixed: kitBad, needsHuman: 0, examples: kitEx });

  // 4. Contact sources
  const todo = await db.select().from(contacts).where(and(isNull(contacts.sourceCheck), sql`${contacts.status} <> 'not_useful'`)).limit(Math.max(0, MAX_FETCH - fetches));
  let bad = 0;
  const cEx: string[] = [];
  for (const c of todo) {
    fetches++;
    const ok = await pageMentions(c.sourceUrl, [c.name], fetcher);
    const v = ok === null ? "unreadable" : ok ? "ok" : "mismatch";
    await db.update(contacts).set({ sourceCheck: v }).where(eq(contacts.id, c.id));
    if (v === "mismatch") {
      bad++;
      if (cEx.length < 5) cEx.push(`${c.name} (${c.companyName ?? "?"}): source ${new URL(c.sourceUrl).hostname} doesn't name them`);
    }
  }
  checks.push({ id: "contact_sources", label: "Contacts whose source page doesn't name them", checked: todo.length, found: bad, fixed: bad, needsHuman: 0, examples: cEx });

  const data = { ranAt: new Date().toISOString(), checks };
  await db.insert(modelMetrics).values({ key: "data-quality", data }).onConflictDoUpdate({ target: modelMetrics.key, set: { data, updatedAt: new Date() } });
  for (const c of checks) console.log(`audit ${c.id}: checked ${c.checked}, found ${c.found}, fixed ${c.fixed}${c.examples.length ? `\n  ${c.examples.join("\n  ")}` : ""}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
