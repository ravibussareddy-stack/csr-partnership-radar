/**
 * Cached, read-only data for the pages ('use cache', tag "radar"). Pages are served from cache and
 * refreshed at most hourly; the message drop and the optional /api/revalidate endpoint (called at
 * the end of each ingest workflow) refresh the tag immediately.
 */
import { cacheLife, cacheTag } from "next/cache";
import { count, eq, gte, sql } from "drizzle-orm";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { companyNews, companyStats, csrSpend, rawItems } from "@/lib/db/schema";
import { loadDigest, loadRecentSearches } from "@/lib/digest";
import {
  loadAnnouncementGrid,
  loadCompany,
  loadEventsForYear,
  loadHiring,
  loadLens,
  loadModelMetrics,
  type Lens,
  loadPlanner,
  loadRegionTrend,
  loadSectorSeasonality,
  loadUpcomingCycles,
  type PlannerSort,
} from "@/lib/history/queries";
import { loadWarmList } from "@/lib/warm";

export const RADAR_TAG = "radar";

function tag() {
  cacheTag(RADAR_TAG);
  cacheLife("hours");
}

/** Tracked sectors from the stored config (incl. sectors added in the app), defaults without a DB. */
async function sectorList() {
  if (!hasDatabaseUrl()) return DEFAULT_CONFIG.sectors;
  const { loadConfig } = await import("@/lib/config");
  return (await loadConfig(await getDb())).sectors;
}

export async function getSectors() {
  "use cache";
  tag();
  return (await sectorList()).map((s) => ({ id: s.id, label: s.label, status: s.status ?? "ready", custom: Boolean(s.custom), description: s.description ?? null, addedBy: s.addedBy ?? null, keywords: s.keywords, portalSectors: s.portalSectors ?? [] }));
}

export async function getSavedSearches() {
  "use cache";
  tag();
  if (!hasDatabaseUrl()) return DEFAULT_CONFIG.searches;
  const { loadConfig } = await import("@/lib/config");
  return (await loadConfig(await getDb())).searches;
}

export async function getDigest() {
  "use cache";
  tag();
  return loadDigest(new Date());
}

export async function getWarm() {
  "use cache";
  tag();
  return loadWarmList(new Date()).catch(() => null);
}

export async function getSearches() {
  "use cache";
  tag();
  return loadRecentSearches(new Date()).catch(() => []);
}

export async function getCompany(id: number) {
  "use cache";
  tag();
  return loadCompany(id);
}

export async function getPlanner(sort: PlannerSort, q: string) {
  "use cache";
  tag();
  return loadPlanner({ sort, q, limit: 60 });
}

export async function getRegionTrend() {
  "use cache";
  tag();
  return loadRegionTrend((await sectorList()).flatMap((s) => s.portalSectors ?? []));
}

export async function getSectorSeasonality() {
  "use cache";
  tag();
  const m = await loadSectorSeasonality();
  return m ? [...m.entries()] : null; // Maps aren't serialisable across the cache boundary
}

export async function getUpcomingCycles(focusOnly: boolean) {
  "use cache";
  tag();
  return loadUpcomingCycles({ focusOnly });
}

export async function getAnnouncementGrid(focusOnly: boolean) {
  "use cache";
  tag();
  return loadAnnouncementGrid(focusOnly ? (await sectorList()).map((s) => s.id) : null);
}

export interface ImpactStats {
  itemsThisWeek: number;
  dropsThisWeek: number;
  hoursSaved: number;
  companiesTracked: number;
  announcementsTracked: number;
  puneFocusCr: number | null;
  puneCompanies: number | null;
  lastFy: number | null;
}

/** Numbers for the greeting: what the Radar did this week and why the work matters. */
export async function getImpactStats(): Promise<ImpactStats | null> {
  "use cache";
  tag();
  if (!hasDatabaseUrl()) return null;
  try {
    const db = await getDb();
    const since = new Date(Date.now() - 7 * 86400_000);
    const focus = (await sectorList()).flatMap((s) => s.portalSectors ?? []).map((s) => s.toLowerCase());
    const [[items], [drops], [tracked], [news], [pune]] = await Promise.all([
      db.select({ n: count() }).from(rawItems).where(gte(rawItems.fetchedAt, since)),
      db.select({ n: count() }).from(rawItems).where(sql`${rawItems.source} = 'pasted' and ${rawItems.fetchedAt} >= ${since}`),
      db.select({ n: count() }).from(companyStats),
      db.select({ n: count() }).from(companyNews),
      db
        .select({
          fy: sql<number>`max(${csrSpend.fyStart})`,
          cr: sql<number>`sum(${csrSpend.amountCr}) filter (where ${csrSpend.fyStart} = (select max(fy_start) from csr_spend))`,
          cos: sql<number>`count(distinct ${csrSpend.companyId}) filter (where ${csrSpend.fyStart} = (select max(fy_start) from csr_spend))`,
        })
        .from(csrSpend)
        .where(sql`lower(${csrSpend.district}) = 'pune' and lower(${csrSpend.sector}) in (${sql.join(focus.map((f) => sql`${f}`), sql`, `)})`),
    ]);
    const itemsThisWeek = Number(items.n);
    return {
      itemsThisWeek,
      dropsThisWeek: Number(drops.n),
      // ~40 seconds to find, open and skim one article, alert or message by hand
      hoursSaved: Math.round((itemsThisWeek * 40) / 360) / 10,
      companiesTracked: Number(tracked.n),
      announcementsTracked: Number(news.n),
      puneFocusCr: pune?.cr != null ? Number(pune.cr) : null,
      puneCompanies: pune?.cos != null ? Number(pune.cos) : null,
      lastFy: pune?.fy != null ? Number(pune.fy) : null,
    };
  } catch {
    return null;
  }
}

/** Recent pasted messages and their status (message drop page). */
export async function getRecentPasted() {
  "use cache";
  tag();
  if (!hasDatabaseUrl()) return [];
  const db = await getDb();
  return db
    .select({ id: rawItems.id, title: rawItems.title, channel: rawItems.channel, status: rawItems.classifyStatus, passed: rawItems.prefilterPassed, fetchedAt: rawItems.fetchedAt })
    .from(rawItems)
    .where(eq(rawItems.source, "pasted"))
    .orderBy(sql`${rawItems.id} desc`)
    .limit(30);
}

/** Home cue cards, built inside the cache (card building reads the current date). */
export async function getHomeInsights() {
  "use cache";
  tag();
  const { fromDigest, fromWarm } = await import("@/lib/insights");
  const sourceNames = new Map(DEFAULT_CONFIG.sources.map((s) => [s.id, s.name]));
  const [digest, warm] = await Promise.all([loadDigest(new Date()), loadWarmList(new Date()).catch(() => null)]);
  if (digest.status !== "ok") return { status: digest.status } as const;
  const signals = digest.items.map((i) => fromDigest(i, sourceNames));
  const warmCards = (warm ?? []).filter((w) => !signals.some((s) => s.companyId === w.companyId)).map(fromWarm);
  return { status: "ok" as const, signals, warm: warmCards, lastUpdated: digest.lastUpdated };
}

/** "Now" for cached pages (calendar grouping, future months): refreshed with the cache, hourly. */
export async function getCachedNow(): Promise<string> {
  "use cache";
  tag();
  return new Date().toISOString();
}

export async function getHiring() {
  "use cache";
  tag();
  return loadHiring(60);
}

export async function getYearEvents(year: number, focusOnly: boolean) {
  "use cache";
  tag();
  return loadEventsForYear(year, focusOnly ? (await sectorList()).map((s) => s.id) : null);
}

export interface SummaryData {
  calls: import("@/lib/insights").Insight[];
  hiring: import("@/lib/history/queries").HiringPost[];
  likelySoon: (import("@/lib/history/queries").UpcomingCycle & { opensIn: number; inWindow: boolean })[];
  engagement: { action: string; reason: string | null; title: string; at: string }[];
  lastUpdated: string | null;
}

/** Landing summary: calls this week, hiring observed, likely to start CSR funding in Pune/Maharashtra in 30 days. */
export async function getSummary(): Promise<SummaryData | null> {
  "use cache";
  tag();
  if (!hasDatabaseUrl()) return null;
  const { fromDigest } = await import("@/lib/insights");
  const sourceNames = new Map(DEFAULT_CONFIG.sources.map((s) => [s.id, s.name]));
  const now = new Date();
  const [digest, hiring, cycles] = await Promise.all([loadDigest(now), loadHiring(30), loadUpcomingCycles({ focusOnly: false })]);
  const calls = digest.status === "ok" ? digest.items.filter((i) => i.tier === "call_this_week").map((i) => fromDigest(i, sourceNames)) : [];

  // Window open now, or opening within 30 days; spending in Pune / Maharashtra.
  const DAY = 86400_000;
  const likelySoon = (cycles ?? [])
    .map((c) => {
      const start = new Date(c.nextWindowStart);
      const opensIn = Math.round((start.getTime() - now.getTime()) / DAY);
      const inWindow = opensIn <= 0 && opensIn > -92;
      return { ...c, opensIn, inWindow };
    })
    .filter((c) => (c.inWindow || (c.opensIn >= 0 && c.opensIn <= 30)) && (c.puneLastCr > 0 || c.maharashtraLastCr > 0))
    .sort((a, b) => b.puneLastCr - a.puneLastCr || b.maharashtraFocusLastCr - a.maharashtraFocusLastCr || b.yearsHit.length - a.yearsHit.length)
    .slice(0, 12);

  const db = await getDb();
  const { feedback } = await import("@/lib/db/schema");
  const fb = await db
    .select({ action: feedback.action, reason: feedback.reason, title: rawItems.title, at: feedback.createdAt })
    .from(feedback)
    .innerJoin(rawItems, eq(rawItems.id, feedback.itemId))
    .orderBy(sql`${feedback.createdAt} desc`)
    .limit(8);
  return {
    calls,
    hiring: (hiring ?? []).filter((h) => !["generic", "dead", "expired"].includes(h.linkStatus ?? "")).slice(0, 8),
    likelySoon,
    engagement: fb.map((f) => ({ action: f.action, reason: f.reason, title: f.title, at: f.at.toISOString() })),
    lastUpdated: digest.status === "ok" && digest.lastUpdated ? new Date(digest.lastUpdated).toISOString() : null,
  };
}

export async function getLens(lens: Lens) {
  "use cache";
  tag();
  return loadLens(lens, (await sectorList()).flatMap((s) => s.portalSectors ?? []));
}

export async function getModelMetrics() {
  "use cache";
  tag();
  return loadModelMetrics();
}

export async function getContacts() {
  "use cache";
  tag();
  if (!hasDatabaseUrl()) return [];
  const db = await getDb();
  const { contacts, companies: co } = await import("@/lib/db/schema");
  return db
    .select({
      id: contacts.id, name: contacts.name, title: contacts.title, companyName: contacts.companyName, companyId: contacts.companyId,
      domain: co.domain, kind: contacts.kind, sourceUrl: contacts.sourceUrl, sourceTitle: contacts.sourceTitle, context: contacts.context,
      status: contacts.status, notes: contacts.notes, isDemo: contacts.isDemo, firstSeenAt: contacts.firstSeenAt, statusUpdatedAt: contacts.statusUpdatedAt,
    })
    .from(contacts)
    .leftJoin(co, eq(co.id, contacts.companyId))
    .orderBy(sql`${contacts.firstSeenAt} desc`)
    .limit(300);
}

export async function getRegulatory() {
  "use cache";
  tag();
  const { loadRegulatory } = await import("@/lib/regulatory");
  return loadRegulatory(180);
}
