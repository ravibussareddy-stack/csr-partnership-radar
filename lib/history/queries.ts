/** Read-only queries for the company profile and expansion planner pages. */
import { and, desc, eq, gt, ilike, inArray, sql } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import {
  ANNOUNCEMENT_KINDS,
  classifications,
  companies,
  companyNews,
  companyStats,
  csrSpend,
  rawItems,
  signals,
} from "@/lib/db/schema";

export async function loadCompany(id: number) {
  if (!hasDatabaseUrl() || !Number.isInteger(id)) return null;
  const db = await getDb();
  const [co] = await db.select().from(companies).where(eq(companies.id, id));
  if (!co) return null;
  const [stats] = await db.select().from(companyStats).where(eq(companyStats.companyId, id));
  const recentSignals = await db
    .select({
      id: signals.id,
      tier: signals.tier,
      signalType: signals.signalType,
      title: rawItems.title,
      url: rawItems.url,
      date: rawItems.publishedAt,
      why: classifications.whyItMatters,
    })
    .from(signals)
    .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
    .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
    .where(eq(signals.companyId, id))
    .orderBy(desc(rawItems.publishedAt))
    .limit(10);
  const announcements = await db
    .select({ title: companyNews.title, url: companyNews.url, at: companyNews.publishedAt, kind: companyNews.kind, sector: companyNews.sector, source: companyNews.source })
    .from(companyNews)
    .where(and(eq(companyNews.companyId, id), inArray(companyNews.kind, ANNOUNCEMENT_KINDS)))
    .orderBy(desc(companyNews.publishedAt))
    .limit(12);
  return { company: co, stats: stats ?? null, recentSignals, announcements };
}

export type PlannerSort = "maharashtra" | "pune" | "focus" | "total";

export async function loadPlanner(opts: { sort: PlannerSort; q?: string; limit?: number }) {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const order = {
    maharashtra: companyStats.maharashtraFocusLastCr,
    pune: companyStats.puneLastCr,
    focus: companyStats.predictedFocusCr,
    total: companyStats.predictedTotalCr,
  }[opts.sort];
  const rows = await db
    .select({ id: companies.id, name: companies.canonicalName, s: companyStats })
    .from(companyStats)
    .innerJoin(companies, eq(companies.id, companyStats.companyId))
    .where(and(gt(order, 0), opts.q ? ilike(companies.canonicalName, `%${opts.q.replace(/[%_]/g, "")}%`) : undefined))
    .orderBy(desc(order))
    .limit(opts.limit ?? 50);
  return rows;
}

/** ₹ crore by FY in Pune district and Maharashtra, all sectors and focus sectors. */
export async function loadRegionTrend(focusSectors: string[]) {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const focus = focusSectors.length
    ? sql`lower(${csrSpend.sector}) in (${sql.join(focusSectors.map((s) => sql`${s.toLowerCase()}`), sql`, `)})`
    : sql`false`;
  const rows = await db
    .select({
      fy: csrSpend.fyStart,
      mhAll: sql<number>`sum(${csrSpend.amountCr}) filter (where ${csrSpend.state} = 'Maharashtra')`,
      mhFocus: sql<number>`sum(${csrSpend.amountCr}) filter (where ${csrSpend.state} = 'Maharashtra' and ${focus})`,
      puneAll: sql<number>`sum(${csrSpend.amountCr}) filter (where lower(${csrSpend.district}) = 'pune')`,
      puneFocus: sql<number>`sum(${csrSpend.amountCr}) filter (where lower(${csrSpend.district}) = 'pune' and ${focus})`,
      puneCompanies: sql<number>`count(distinct ${csrSpend.companyId}) filter (where lower(${csrSpend.district}) = 'pune' and ${focus})`,
    })
    .from(csrSpend)
    .groupBy(csrSpend.fyStart)
    .orderBy(csrSpend.fyStart);
  return rows.map((r) => ({
    fy: r.fy,
    mhAll: Number(r.mhAll ?? 0),
    mhFocus: Number(r.mhFocus ?? 0),
    puneAll: Number(r.puneAll ?? 0),
    puneFocus: Number(r.puneFocus ?? 0),
    puneCompanies: Number(r.puneCompanies ?? 0),
  }));
}

/** Announcement counts by calendar month for each sector (all companies), from dated headlines. */
export async function loadSectorSeasonality() {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const rows = await db
    .select({
      sector: companyNews.sector,
      m: sql<number>`extract(month from ${companyNews.publishedAt})`,
      n: sql<number>`count(*)`,
    })
    .from(companyNews)
    .where(inArray(companyNews.kind, ANNOUNCEMENT_KINDS))
    .groupBy(companyNews.sector, sql`2`);
  const bySector = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.sector ?? "other";
    const arr = bySector.get(key) ?? new Array(12).fill(0);
    arr[Number(r.m) - 1] += Number(r.n);
    bySector.set(key, arr);
  }
  return bySector;
}
