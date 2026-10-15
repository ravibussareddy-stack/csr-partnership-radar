/**
 * Results page (team-only, never cached): is the Radar working for the team?
 *  - Helpfulness: 👍 / 👎 on cards (precision as the team sees it).
 *  - Misses: opportunities a teammate reported that the Radar did not show (coverage).
 *  - Relationships the Radar helped find or win, and their contract value (value supported).
 *  - Lead time: days from an article's publication to the Radar finding it.
 */
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { activity, feedback, rawItems, relationships, signals, teamMembers } from "@/lib/db/schema";

const DAY = 86400_000;

export interface ResultsData {
  helpful: { up: number; down: number; up30: number; down30: number; byTier: { tier: string; up: number; down: number }[]; recentDown: { title: string; url: string; at: string; by: string }[] };
  missed: { total: number; last30: number; alreadyHad: number; recent: { summary: string; url: string | null; tier: string | null; at: string; by: string; alreadyHad: boolean }[] };
  relationships: { total: number; helped: number; valueAllLakh: number; valueHelpedLakh: number; list: { company: string; programme: string | null; valueLakh: number | null; note: string | null; status: string }[] };
  leadTime: { items: number; medianDays: number | null; within2Days: number | null };
}

export async function loadResults(now = new Date()): Promise<ResultsData | null> {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const members = new Map((await db.select({ id: teamMembers.id, name: teamMembers.name }).from(teamMembers)).map((m) => [m.id, m.name]));
  const who = (id: number | null) => (id != null ? (members.get(id) ?? "Someone") : "Someone");

  // Helpfulness
  const ratings = await db
    .select({ action: feedback.action, at: feedback.createdAt, by: feedback.memberId, tier: signals.tier, title: rawItems.title, url: rawItems.url })
    .from(feedback)
    .innerJoin(rawItems, eq(rawItems.id, feedback.itemId))
    .leftJoin(signals, eq(signals.itemId, feedback.itemId))
    .where(inArray(feedback.action, ["helpful", "not_helpful"]))
    .orderBy(desc(feedback.createdAt));
  const tiers = ["call_this_week", "watch", "background"];
  const helpful = {
    up: ratings.filter((r) => r.action === "helpful").length,
    down: ratings.filter((r) => r.action === "not_helpful").length,
    up30: ratings.filter((r) => r.action === "helpful" && r.at >= since30).length,
    down30: ratings.filter((r) => r.action === "not_helpful" && r.at >= since30).length,
    byTier: tiers.map((t) => ({ tier: t, up: ratings.filter((r) => r.tier === t && r.action === "helpful").length, down: ratings.filter((r) => r.tier === t && r.action === "not_helpful").length })),
    recentDown: ratings.filter((r) => r.action === "not_helpful").slice(0, 6).map((r) => ({ title: r.title, url: r.url, at: r.at.toISOString(), by: who(r.by) })),
  };

  // Misses reported through "We missed this"
  const misses = await db
    .select({ summary: activity.summary, at: activity.createdAt, by: activity.memberId, url: rawItems.url, tier: signals.tier })
    .from(activity)
    .leftJoin(rawItems, eq(rawItems.id, activity.itemId))
    .leftJoin(signals, eq(signals.itemId, activity.itemId))
    .where(eq(activity.kind, "missed"))
    .orderBy(desc(activity.createdAt));
  const had = (s: string) => s.startsWith("Reported missed (already in the Radar");
  const missed = {
    total: misses.length,
    last30: misses.filter((m) => m.at >= since30).length,
    alreadyHad: misses.filter((m) => had(m.summary)).length,
    recent: misses.slice(0, 10).map((m) => ({ summary: m.summary, url: m.url, tier: m.tier, at: m.at.toISOString(), by: who(m.by), alreadyHad: had(m.summary) })),
  };

  // Relationships the Radar helped with
  const rels = await db.select().from(relationships);
  const lakh = (v: number | null) => (v != null && Number.isFinite(v) ? v : 0);
  const helpedRels = rels.filter((r) => r.radarHelped);
  const relationshipsOut = {
    total: rels.length,
    helped: helpedRels.length,
    valueAllLakh: rels.reduce((a, r) => a + lakh(r.valueLakh), 0),
    valueHelpedLakh: helpedRels.reduce((a, r) => a + lakh(r.valueLakh), 0),
    list: helpedRels.map((r) => ({ company: r.companyName, programme: r.programme, valueLakh: r.valueLakh, note: r.radarNote, status: r.status })),
  };

  // Lead time: publication → found by the Radar, for real articles scored in the last 30 days
  const timed = await db
    .select({ pub: rawItems.publishedAt, found: rawItems.fetchedAt })
    .from(signals)
    .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
    .where(and(isNotNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since30), eq(rawItems.isDemo, false), sql`${rawItems.url} like 'http%'`));
  const days = timed
    .map((t) => (t.found.getTime() - (t.pub as Date).getTime()) / DAY)
    .filter((d) => d >= -1 && d < 365)
    .map((d) => Math.max(0, d))
    .sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
  const leadTime = {
    items: days.length,
    medianDays: days.length ? Math.round(median * 10) / 10 : null,
    within2Days: days.length ? Math.round((days.filter((d) => d <= 2).length / days.length) * 100) : null,
  };

  return { helpful, missed, relationships: relationshipsOut, leadTime };
}
