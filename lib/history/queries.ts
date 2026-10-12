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
  modelMetrics,
  rawItems,
  signals,
  contacts,
} from "@/lib/db/schema";
import { groupStories } from "@/lib/dedupe";

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
  // Companies below the stats threshold (< ₹1 cr) still get their raw portal history.
  const spend = stats
    ? []
    : await db
        .select({ fy: csrSpend.fyStart, total: sql<number>`sum(${csrSpend.amountCr})`, sectors: sql<string>`string_agg(distinct ${csrSpend.sector}, ', ')` })
        .from(csrSpend)
        .where(eq(csrSpend.companyId, id))
        .groupBy(csrSpend.fyStart)
        .orderBy(csrSpend.fyStart);
  const people = await db
    .select({ name: contacts.name, title: contacts.title, url: contacts.sourceUrl })
    .from(contacts)
    .where(and(eq(contacts.companyId, id), sql`coalesce(${contacts.sourceCheck}, 'ok') <> 'mismatch'`, sql`${contacts.status} <> 'not_useful'`))
    .limit(8);
  return {
    company: co,
    stats: stats ?? null,
    // Same story from several outlets → one line (the first, newest first), with the other outlets counted.
    recentSignals: groupStories(recentSignals.filter((r) => /^https?:/.test(r.url)), (r) => r.title, (r) => r.date ?? new Date(0), 3).map(({ primary, copies }) => ({ ...primary, outlets: copies.length })),
    announcements: groupStories(announcements, (a) => a.title, (a) => a.at, 3).map(({ primary, copies }) => ({ ...primary, outlets: copies.length })),
    spend: spend.map((r) => ({ fy: r.fy, total: Number(r.total), sectors: r.sectors })),
    people,
  };
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

export interface UpcomingCycle {
  companyId: number;
  name: string;
  domain: string | null;
  window: string;
  nextWindowStart: string;
  strength: "clear" | "mild" | "none";
  yearsHit: number[];
  activeYears: number[];
  events: number;
  predictedFocusCr: number;
  predictedTotalCr: number;
  maharashtraFocusLastCr: number;
  maharashtraLastCr: number;
  puneLastCr: number;
  /** top CSR sectors by spend over the last 3 reported FYs, with share of that spend */
  topSectors: { sector: string; share: number; focus: boolean }[];
}

/** Companies with a recurring announcement window (≥ mild), grouped later by the month their next window opens. */
export async function loadUpcomingCycles(opts: { focusOnly: boolean }): Promise<UpcomingCycle[] | null> {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: companies.id, name: companies.canonicalName, domain: companies.domain, s: companyStats })
    .from(companyStats)
    .innerJoin(companies, eq(companies.id, companyStats.companyId))
    .where(
      and(
        sql`${companyStats.data}->'timing'->>'basis' = 'company'`,
        sql`${companyStats.data}->'timing'->>'strength' in ('clear', 'mild')`,
        opts.focusOnly ? gt(companyStats.predictedFocusCr, 0) : undefined,
      ),
    );
  return rows
    .map((r) => {
      const t = r.s.data.timing;
      return {
        companyId: r.id,
        name: r.name,
        domain: r.domain,
        window: t.window ?? "",
        nextWindowStart: t.nextWindowStart ?? "",
        strength: t.strength,
        yearsHit: t.recurrence?.yearsHit ?? [],
        activeYears: t.recurrence?.activeYears ?? [],
        events: t.events,
        predictedFocusCr: r.s.predictedFocusCr,
        predictedTotalCr: r.s.predictedTotalCr,
        maharashtraFocusLastCr: r.s.maharashtraFocusLastCr,
        maharashtraLastCr: r.s.data.byYear.at(-1)?.maharashtra ?? 0,
        puneLastCr: r.s.puneLastCr,
        topSectors: (() => {
          const rec = r.s.data.sectorsRecent ?? [];
          const total = rec.reduce((a, x) => a + x.amount, 0) || 1;
          return rec.slice(0, 3).map((x) => ({ sector: x.sector, share: Math.round((x.amount / total) * 100), focus: Boolean(x.focusId) }));
        })(),
      };
    })
    .filter((u) => u.window && u.nextWindowStart);
}

/** Announcements per year × month across all companies (optionally focus sectors only). */
export async function loadAnnouncementGrid(focusSectorIds: string[] | null) {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const rows = await db
    .select({
      y: sql<number>`extract(year from ${companyNews.publishedAt})`,
      m: sql<number>`extract(month from ${companyNews.publishedAt})`,
      n: sql<number>`count(*)`,
    })
    .from(companyNews)
    .where(and(inArray(companyNews.kind, ANNOUNCEMENT_KINDS), focusSectorIds ? inArray(companyNews.sector, focusSectorIds) : undefined))
    .groupBy(sql`1`, sql`2`);
  const by = new Map<number, number[]>();
  for (const r of rows) {
    const y = Number(r.y);
    const row = by.get(y) ?? new Array(12).fill(0);
    row[Number(r.m) - 1] = Number(r.n);
    by.set(y, row);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([year, months]) => ({ year, months }));
}

export interface HiringPost {
  itemId: number;
  title: string;
  url: string;
  source: string;
  date: Date;
  company: string | null;
  companyId: number | null;
  domain: string | null;
  geographies: string[];
  why: string;
  linkStatus: string | null;
}

/** CSR / foundation / community job postings (csr_hiring) from all sources in the last `days` (demo samples excluded). */
export async function loadHiring(days = 60): Promise<HiringPost[] | null> {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      itemId: rawItems.id,
      title: rawItems.title,
      url: rawItems.url,
      source: rawItems.source,
      publishedAt: rawItems.publishedAt,
      fetchedAt: rawItems.fetchedAt,
      companyName: sql<string | null>`${classifications.companies}[1]`,
      geographies: classifications.geographies,
      why: classifications.whyItMatters,
      domain: classifications.companyDomain,
      companyId: signals.companyId,
      linkStatus: rawItems.linkStatus,
    })
    .from(classifications)
    .innerJoin(rawItems, eq(rawItems.contentHash, classifications.contentHash))
    .leftJoin(signals, eq(signals.itemId, rawItems.id))
    .where(and(eq(classifications.signalType, "csr_hiring"), eq(rawItems.isDemo, false), sql`coalesce(${rawItems.publishedAt}, ${rawItems.fetchedAt}) >= ${since}`))
    .orderBy(desc(sql`coalesce(${rawItems.publishedAt}, ${rawItems.fetchedAt})`));
  // One entry per role: the same company + job title from several job boards counts once, keeping the
  // company's own careers page when it is one of them.
  const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|india|inc)\b/g, "").replace(/[^a-z0-9]+/g, "");
  const roleKey = (r: (typeof rows)[number]) => {
    const co = norm(r.companyName ?? "") || String(r.companyId ?? r.itemId);
    const title = r.title.toLowerCase().replace(/\s+(at|@)\s+[^,]*$/, "");
    return `${co}|${norm(title)}`;
  };
  const ownSite = (r: (typeof rows)[number]) => {
    const co = norm(r.companyName ?? "");
    try {
      return co.length > 2 && new URL(r.url).hostname.replace(/[^a-z0-9]/g, "").includes(co);
    } catch {
      return false;
    }
  };
  const byRole = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const k = roleKey(r);
    const prev = byRole.get(k);
    if (!prev || (!ownSite(prev) && ownSite(r))) byRole.set(k, r);
  }
  const keep = new Set(byRole.values());
  return rows
    .filter((r) => keep.has(r))
    .map((r) => ({
      itemId: r.itemId,
      title: r.title,
      url: r.url,
      source: r.source,
      date: r.publishedAt ?? r.fetchedAt,
      company: r.companyName,
      companyId: r.companyId,
      domain: r.domain,
      geographies: r.geographies,
      why: r.why,
      linkStatus: r.linkStatus,
    }));
}

export interface CalendarEvent {
  date: string; // ISO
  companyId: number;
  company: string;
  title: string;
  url: string;
  kind: string | null;
  /** other stories about the same company on the same day */
  more: { title: string; url: string }[];
}

/**
 * Dated CSR announcements in one calendar year (for the calendar). One entry per company per day
 * (the same story from several outlets is merged; `count` and `more` keep the other links). `geo`
 * keeps companies that reported CSR spend in Maharashtra / Pune district in their latest portal year.
 */
export async function loadEventsForYear(year: number, focusSectorIds: string[] | null, geo: "india" | "maharashtra" | "pune" = "india"): Promise<CalendarEvent[] | null> {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const rows = await db
    .select({ at: companyNews.publishedAt, companyId: companyNews.companyId, company: companies.canonicalName, title: companyNews.title, url: companyNews.url, kind: companyNews.kind })
    .from(companyNews)
    .innerJoin(companies, eq(companies.id, companyNews.companyId))
    .where(
      and(
        inArray(companyNews.kind, ANNOUNCEMENT_KINDS),
        sql`${companyNews.publishedAt} >= ${from} and ${companyNews.publishedAt} < ${to}`,
        focusSectorIds ? inArray(companyNews.sector, focusSectorIds) : undefined,
        // Real article links only: no pasted/demo items, no category, tag or topic listing pages.
        sql`${companyNews.url} like 'http%' and ${companyNews.url} not like '%#demo%' and ${companyNews.url} !~* '/(category|tag|tags|topic|topics|author|page)/[^/]*/?$'`,
        geo === "pune"
          ? sql`exists (select 1 from company_stats s where s.company_id = ${companyNews.companyId} and s.pune_last_cr > 0)`
          : geo === "maharashtra"
            ? sql`exists (select 1 from company_stats s where s.company_id = ${companyNews.companyId} and (s.data->'byYear'->-1->>'maharashtra')::float > 0)`
            : undefined,
      ),
    )
    .orderBy(companyNews.publishedAt);
  const out = new Map<string, CalendarEvent>();
  for (const r of rows) {
    const key = `${r.companyId}:${r.at.toISOString().slice(0, 10)}`;
    const e = out.get(key);
    if (!e) out.set(key, { date: r.at.toISOString(), companyId: r.companyId, company: r.company, title: r.title, url: r.url, kind: r.kind, more: [] });
    else if (e.url !== r.url && !e.more.some((m) => m.url === r.url)) e.more.push({ title: r.title, url: r.url });
  }
  return [...out.values()];
}

export type Lens = "india" | "maharashtra" | "pune";

function lensWhere(lens: Lens) {
  if (lens === "maharashtra") return sql`${csrSpend.state} = 'Maharashtra'`;
  if (lens === "pune") return sql`lower(${csrSpend.district}) = 'pune'`;
  return sql`true`;
}

/** For one lens: spend by FY (focus vs other), by sector and top companies in the latest FY. */
export async function loadLens(lens: Lens, focusSectors: string[]) {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const focus = focusSectors.length
    ? sql`lower(${csrSpend.sector}) in (${sql.join(focusSectors.map((s) => sql`${s.toLowerCase()}`), sql`, `)})`
    : sql`false`;
  const where = lensWhere(lens);
  const [trend, [{ lastFy }]] = await Promise.all([
    db
      .select({
        fy: csrSpend.fyStart,
        total: sql<number>`sum(${csrSpend.amountCr})`,
        focus: sql<number>`coalesce(sum(${csrSpend.amountCr}) filter (where ${focus}), 0)`,
        companies: sql<number>`count(distinct ${csrSpend.companyId})`,
      })
      .from(csrSpend)
      .where(where)
      .groupBy(csrSpend.fyStart)
      .orderBy(csrSpend.fyStart),
    db.select({ lastFy: sql<number>`max(${csrSpend.fyStart})` }).from(csrSpend),
  ]);
  const fy = Number(lastFy);
  const [sectors, top] = await Promise.all([
    db
      .select({ sector: csrSpend.sector, amount: sql<number>`sum(${csrSpend.amountCr})`, isFocus: sql<boolean>`bool_or(${focus})` })
      .from(csrSpend)
      .where(and(where, eq(csrSpend.fyStart, fy)))
      .groupBy(csrSpend.sector)
      .orderBy(desc(sql`sum(${csrSpend.amountCr})`))
      .limit(10),
    db
      .select({
        companyId: csrSpend.companyId,
        name: companies.canonicalName,
        domain: companies.domain,
        amount: sql<number>`sum(${csrSpend.amountCr})`,
        focusAmount: sql<number>`coalesce(sum(${csrSpend.amountCr}) filter (where ${focus}), 0)`,
      })
      .from(csrSpend)
      .innerJoin(companies, eq(companies.id, csrSpend.companyId))
      .where(and(where, eq(csrSpend.fyStart, fy)))
      .groupBy(csrSpend.companyId, companies.canonicalName, companies.domain)
      .orderBy(desc(sql`coalesce(sum(${csrSpend.amountCr}) filter (where ${focus}), 0)`))
      .limit(12),
  ]);
  return {
    lens,
    lastFy: fy,
    trend: trend.map((r) => ({ fy: r.fy, total: Number(r.total), focus: Number(r.focus), companies: Number(r.companies) })),
    sectors: sectors.map((r) => ({ sector: r.sector, amount: Number(r.amount), focus: Boolean(r.isFocus) })),
    top: top.map((r) => ({ companyId: r.companyId, name: r.name, domain: r.domain, amount: Number(r.amount), focusAmount: Number(r.focusAmount) })),
  };
}

export async function loadModelMetrics() {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const [row] = await db.select().from(modelMetrics).where(eq(modelMetrics.key, "insights"));
  return (row?.data ?? null) as {
    forecast: import("./metrics").ForecastBacktest;
    timing: import("./metrics").TimingBacktest;
    correlations: { id: string; label: string; detail: string; r: number | null; n: number; strength: string }[];
    computedAt: string;
  } | null;
}

/** Where a merged company's old id now lives (data-quality audit merges), or null. */
export async function loadCompanyRedirect(id: number): Promise<number | null> {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const [m] = await db.select().from(modelMetrics).where(eq(modelMetrics.key, "company-redirects"));
  const to = (m?.data as Record<string, number> | undefined)?.[String(id)];
  return typeof to === "number" ? to : null;
}
