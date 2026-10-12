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
  return loadRegionTrend(DEFAULT_CONFIG.sectors.flatMap((s) => s.portalSectors ?? []));
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
  return loadAnnouncementGrid(focusOnly ? DEFAULT_CONFIG.sectors.map((s) => s.id) : null);
}

export interface ImpactStats {
  itemsThisWeek: number;
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
    const focus = DEFAULT_CONFIG.sectors.flatMap((s) => s.portalSectors ?? []).map((s) => s.toLowerCase());
    const [[items], [tracked], [news], [pune]] = await Promise.all([
      db.select({ n: count() }).from(rawItems).where(gte(rawItems.fetchedAt, since)),
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
