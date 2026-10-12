/**
 * Company linking and de-duplication (part of the daily data-quality audit).
 * News names that were never matched to a National CSR Portal record (empty profiles) and near-
 * duplicates ("Alcobrew Distilleries", "... India", "... India Ltd.") are matched by Gemini Flash to a
 * candidate pulled from the database (never a free-text guess). At ≥ 0.8 confidence the news record
 * is merged into the target: its links move over, its names become aliases (so future news resolves
 * straight to the target), and it is removed. Every merge is logged with its reason.
 */
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { archiveHeadlines, classifications, companies, contacts, feedback, pitchKits, rawItems, relationships, signals } from "@/lib/db/schema";
import { GeminiPool } from "@/lib/gemini";
import { buildLinkPrompt, linkResponseSchema, linkSchema } from "@/prompts/companies";

const GENERIC = new Set(["india", "indian", "limited", "ltd", "private", "pvt", "foundation", "trust", "group", "company", "co", "the", "and", "of", "technologies", "technology", "solutions", "services", "industries", "enterprises", "international", "global", "corporation", "corp", "inc", "llp", "csr"]);
const tokens = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !GENERIC.has(t));

export interface MergeLog {
  from: string;
  to: string;
  relation: string;
  confidence: number;
  why: string;
}

export async function linkCompanies(db: DB, pool: GeminiPool, opts: { max?: number } = {}): Promise<{ checked: number; merged: MergeLog[] }> {
  // News-origin companies the app actually shows (signals, contacts, relationships), newest first.
  const used = await db.execute(sql`
    select c.id, c.canonical_name as name from companies c
    where c.origin = 'news' and (
      exists (select 1 from signals s where s.company_id = c.id) or
      exists (select 1 from contacts k where k.company_id = c.id) or
      exists (select 1 from relationships r where r.company_id = c.id))
    order by c.id desc limit ${opts.max ?? 60}`);
  const news = ((used as { rows?: unknown[] }).rows ?? (used as unknown as unknown[])) as { id: number; name: string }[];
  if (news.length === 0) return { checked: 0, merged: [] };

  const items: { id: number; name: string; context: string; candidates: { id: number; name: string; origin: string }[] }[] = [];
  for (const n of news) {
    const t = tokens(n.name);
    if (t.length === 0) continue;
    const like = (tok: string) => sql`${companies.nameKey} like ${`%${tok}%`}`;
    let cands = await db
      .select({ id: companies.id, name: companies.canonicalName, origin: companies.origin })
      .from(companies)
      .where(and(sql`${companies.id} <> ${n.id}`, like(t[0]), ...(t[1] ? [like(t[1])] : [])))
      .limit(12);
    if (cands.length === 0 && t[1]) {
      cands = await db.select({ id: companies.id, name: companies.canonicalName, origin: companies.origin }).from(companies).where(and(sql`${companies.id} <> ${n.id}`, like(t[0]))).limit(12);
    }
    if (cands.length === 0) continue;
    const [ctx] = await db
      .select({ why: classifications.whyItMatters })
      .from(signals)
      .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
      .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
      .where(eq(signals.companyId, n.id))
      .limit(1);
    items.push({ id: n.id, name: n.name, context: (ctx?.why ?? "").slice(0, 200), candidates: cands.map((c) => ({ id: c.id, name: c.name, origin: c.origin ?? "portal" })) });
  }

  const merged: MergeLog[] = [];
  const gone = new Set<number>();
  for (let k = 0; k < items.length; k += 15) {
    const batch = items.slice(k, k + 15).filter((i) => !gone.has(i.id));
    if (batch.length === 0) continue;
    const res = await pool.generateJson(buildLinkPrompt(batch), linkResponseSchema);
    const v = linkSchema.safeParse(JSON.parse(res.text));
    if (!v.success) continue;
    for (const d of v.data) {
      const item = batch.find((b) => b.id === d.id);
      if (!item || d.relation === "none" || d.match == null || d.confidence < 0.8 || gone.has(d.match) || gone.has(d.id)) continue;
      const target = item.candidates.find((c) => c.id === d.match);
      if (!target) continue; // only a candidate we offered
      await mergeCompany(db, d.id, target.id);
      gone.add(d.id);
      merged.push({ from: item.name, to: target.name, relation: d.relation, confidence: d.confidence, why: d.why });
    }
  }
  return { checked: items.length, merged };
}

/** Moves everything that points at `fromId` to `toId`, keeps its names as aliases, removes it. */
export async function mergeCompany(db: DB, fromId: number, toId: number) {
  const [from] = await db.select().from(companies).where(eq(companies.id, fromId));
  const [to] = await db.select().from(companies).where(eq(companies.id, toId));
  if (!from || !to) return;
  await db.update(signals).set({ companyId: toId }).where(eq(signals.companyId, fromId));
  await db.update(archiveHeadlines).set({ companyId: toId }).where(eq(archiveHeadlines.companyId, fromId));
  await db.update(feedback).set({ companyId: toId }).where(eq(feedback.companyId, fromId));
  await db.update(contacts).set({ companyId: toId }).where(eq(contacts.companyId, fromId));
  await db.update(relationships).set({ companyId: toId }).where(eq(relationships.companyId, fromId));
  await db.execute(sql`insert into company_news (company_id, source, url, title, published_at, kind, sector, model)
    select ${toId}, source, url, title, published_at, kind, sector, model from company_news where company_id = ${fromId}
    on conflict do nothing`);
  const [hasKit] = await db.select({ id: pitchKits.companyId }).from(pitchKits).where(eq(pitchKits.companyId, toId));
  if (!hasKit) await db.update(pitchKits).set({ companyId: toId }).where(eq(pitchKits.companyId, fromId));
  const aliases = [...new Set([...(to.aliases ?? []), from.canonicalName, ...(from.aliases ?? [])])].filter((a) => a !== to.canonicalName);
  await db.update(companies).set({ aliases, domain: to.domain ?? from.domain }).where(eq(companies.id, toId));
  await db.delete(companies).where(eq(companies.id, fromId)); // company_news, company_stats, pitch kit of the old record cascade
  // Old profile links keep working: /companies/<old id> redirects to the merged record.
  await db.execute(sql`insert into model_metrics (key, data) values ('company-redirects', jsonb_build_object(${String(fromId)}::text, ${toId}::int))
    on conflict (key) do update set data = model_metrics.data || excluded.data, updated_at = now()`);
}
