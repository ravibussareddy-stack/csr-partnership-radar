/** Team page data: members, active time, what each did this week, the activity feed, mentions, dashboard feedback. */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, dashboardFeedback, memberTime, modelMetrics, rawItems, teamMembers } from "@/lib/db/schema";

const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

export interface TeamMemberRow {
  id: number;
  name: string;
  role: "lead" | "member";
  active: boolean;
  lastSeenAt: string | null;
  todaySecs: number;
  weekSecs: number;
  topPages: [string, number][];
  week: Record<string, number>; // activity kind → count (last 7 days)
}

export async function loadTeam(meId: number) {
  const db = await getDb();
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const fromDay = istDay(new Date(Date.now() - 6 * 86400_000));
  const today = istDay(new Date());
  const members = await db.select().from(teamMembers).orderBy(sql`${teamMembers.role} = 'lead' desc`, teamMembers.name);
  const times = await db.select().from(memberTime).where(gte(memberTime.day, fromDay));
  const counts = await db
    .select({ memberId: activity.memberId, kind: activity.kind, n: sql<number>`count(*)` })
    .from(activity)
    .where(gte(activity.createdAt, weekAgo))
    .groupBy(activity.memberId, activity.kind);
  const rows: TeamMemberRow[] = members.map((m) => {
    const mine = times.filter((t) => t.memberId === m.id);
    const pages: Record<string, number> = {};
    for (const t of mine) for (const [k, v] of Object.entries(t.pages)) pages[k] = (pages[k] ?? 0) + v;
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      active: m.active,
      lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
      todaySecs: mine.find((t) => t.day === today)?.seconds ?? 0,
      weekSecs: mine.reduce((a, t) => a + t.seconds, 0),
      topPages: Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 3),
      week: Object.fromEntries(counts.filter((c) => c.memberId === m.id && c.kind !== "mention").map((c) => [c.kind, Number(c.n)])),
    };
  });
  const feed = await db
    .select({ id: activity.id, kind: activity.kind, summary: activity.summary, at: activity.createdAt, memberId: activity.memberId, itemId: activity.itemId, url: rawItems.url })
    .from(activity)
    .leftJoin(rawItems, eq(rawItems.id, activity.itemId))
    .where(sql`${activity.kind} <> 'mention'`)
    .orderBy(desc(activity.createdAt))
    .limit(50);
  const mentions = await db
    .select({ id: activity.id, summary: activity.summary, at: activity.createdAt, url: rawItems.url })
    .from(activity)
    .leftJoin(rawItems, eq(rawItems.id, activity.itemId))
    .where(and(eq(activity.kind, "mention"), eq(activity.memberId, meId)))
    .orderBy(desc(activity.createdAt))
    .limit(15);
  const fb = await db.select().from(dashboardFeedback).orderBy(desc(dashboardFeedback.createdAt)).limit(60);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const [dq] = await db.select().from(modelMetrics).where(eq(modelMetrics.key, "data-quality"));
  return {
    quality: (dq?.data ?? null) as { ranAt: string; checks: { id: string; label: string; checked: number; found: number; fixed: number; needsHuman: number; examples: string[] }[] } | null,
    members: rows,
    feed: feed.map((f) => ({ ...f, at: f.at.toISOString(), who: f.memberId ? (names.get(f.memberId) ?? "Someone") : "Radar" })),
    mentions: mentions.map((m) => ({ ...m, at: m.at.toISOString() })),
    feedback: fb.map((f) => ({ ...f, createdAt: f.createdAt.toISOString(), resolvedAt: f.resolvedAt?.toISOString() ?? null, by: f.memberId ? (names.get(f.memberId) ?? "Someone") : "Someone" })),
  };
}

