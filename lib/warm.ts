/**
 * Warm list: companies with CSR activity in the focus sectors within the last 12 months
 * (config scoringWeights.warm.days), each with a deterministic Call / Watch / Background
 * decision and a reason built from the rules that fired. Read-only (used by the digest page).
 */
import { and, desc, gt, gte, inArray } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import { fyLabel } from "@/lib/companies";
import { loadConfig } from "@/lib/config";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { ANNOUNCEMENT_KINDS, companies, companyNews, companyStats, type Tier } from "@/lib/db/schema";
import type { Timing } from "@/lib/history/types";

export interface WarmActivity {
  count: number;
  last: { title: string; url: string; at: Date; kind: string; sector: string | null } | null;
  lastPartnerSearch: Date | null;
}

export interface WarmInput {
  activity: WarmActivity;
  timing: Timing | null;
  maharashtraFocusLastCr: number;
  puneLastCr: number;
  lastFy: number | null;
}

export interface WarmScore {
  score: number;
  tier: Tier;
  reason: string;
}

const DAY = 86400_000;
const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function cr(n: number): string {
  if (n >= 10) return `₹${Math.round(n).toLocaleString("en-IN")} cr`;
  if (n >= 1) return `₹${n.toFixed(1)} cr`;
  return `₹${Math.round(n * 100)} lakh`;
}

function tierPoints(tiers: { minCr: number; points: number }[], value: number): number {
  return [...tiers].sort((a, b) => b.minCr - a.minCr).find((t) => value >= t.minCr)?.points ?? 0;
}

/** Deterministic: same input + config + `now` → same output. */
export function scoreWarm(input: WarmInput, cfg: AppConfig, now: Date): WarmScore {
  const w = cfg.scoringWeights.warm;
  const parts: string[] = [];
  let score = 0;
  const a = input.activity;

  if (a.last) {
    const age = Math.max(0, Math.floor((now.getTime() - a.last.at.getTime()) / DAY));
    const pts = w.recency.find((r) => age <= r.maxAgeDays)?.points ?? 0;
    score += pts;
    parts.push(`last announcement ${shortDate.format(a.last.at)} (${age}d ago) +${pts}`);
    const counted = Math.min(a.count, w.maxAnnouncementsCounted);
    if (a.count > 1) {
      score += counted * w.perAnnouncement;
      parts.push(`${a.count} in 12 mo +${counted * w.perAnnouncement}`);
    }
  } else {
    parts.push("no focus-sector news in 12 mo");
  }

  if (a.lastPartnerSearch && now.getTime() - a.lastPartnerSearch.getTime() <= w.partnerSearchDays * DAY) {
    score += w.partnerSearch;
    parts.push(`sought NGO partners ${shortDate.format(a.lastPartnerSearch)} +${w.partnerSearch}`);
  }

  const t = input.timing;
  if (t?.window && t.nextWindowStart) {
    const days = Math.round((new Date(t.nextWindowStart).getTime() - now.getTime()) / DAY);
    if (days <= w.windowSoonDays) {
      const pts = t.basis === "company" ? w.windowCompany : w.windowSectorPattern;
      score += pts;
      parts.push(`${t.basis === "company" ? "usual" : "sector"} window ${t.window} ${days <= 0 ? "open now" : `in ${days}d`} +${pts}`);
    }
  }

  const fy = input.lastFy ? fyLabel(input.lastFy) : "last FY";
  const mh = tierPoints(w.maharashtraFocusSpend, input.maharashtraFocusLastCr);
  if (mh > 0) {
    score += mh;
    parts.push(`${cr(input.maharashtraFocusLastCr)} focus spend in Maharashtra ${fy} +${mh}`);
  }
  const pune = tierPoints(w.puneSpend, input.puneLastCr);
  if (pune > 0) {
    score += pune;
    parts.push(`${cr(input.puneLastCr)} in Pune ${fy} +${pune}`);
  }

  let tier: Tier = score >= w.thresholds.callThisWeek ? "call_this_week" : score >= w.thresholds.watch ? "watch" : "background";
  // Calling needs a live reason: recent news or a partner search, not spend history alone.
  if (tier === "call_this_week" && !a.last && !a.lastPartnerSearch) {
    tier = "watch";
    parts.push("capped at Watch (no recent news)");
  }
  return { score, tier, reason: `${parts.join(" · ")} = ${score}` };
}

export interface WarmItem extends WarmScore {
  companyId: number;
  company: string;
  domain: string | null;
  activity: WarmActivity;
  timing: Timing | null;
}

export async function loadWarmList(now = new Date()): Promise<WarmItem[] | null> {
  if (!hasDatabaseUrl()) return null;
  const db = await getDb();
  const cfg = await loadConfig(db);
  const w = cfg.scoringWeights.warm;
  const focus = cfg.sectors.map((s) => s.id);
  const since = new Date(now.getTime() - w.days * DAY);

  const news = await db
    .select({
      companyId: companyNews.companyId,
      title: companyNews.title,
      url: companyNews.url,
      at: companyNews.publishedAt,
      kind: companyNews.kind,
      sector: companyNews.sector,
    })
    .from(companyNews)
    .where(and(gte(companyNews.publishedAt, since), inArray(companyNews.kind, ANNOUNCEMENT_KINDS), inArray(companyNews.sector, focus)))
    .orderBy(desc(companyNews.publishedAt));

  const activity = new Map<number, WarmActivity>();
  for (const n of news) {
    const a = activity.get(n.companyId) ?? { count: 0, last: null, lastPartnerSearch: null };
    a.count++;
    if (!a.last) a.last = { title: n.title, url: n.url, at: n.at, kind: n.kind ?? "", sector: n.sector };
    if (n.kind === "partner_search" && !a.lastPartnerSearch) a.lastPartnerSearch = n.at;
    activity.set(n.companyId, a);
  }

  const spenders = await db
    .select({ id: companyStats.companyId })
    .from(companyStats)
    .where(gt(companyStats.maharashtraFocusLastCr, 0))
    .orderBy(desc(companyStats.maharashtraFocusLastCr))
    .limit(w.spendCandidates);
  const ids = [...new Set([...activity.keys(), ...spenders.map((s) => s.id)])];
  if (ids.length === 0) return [];

  const [names, stats] = await Promise.all([
    db.select({ id: companies.id, name: companies.canonicalName, domain: companies.domain }).from(companies).where(inArray(companies.id, ids)),
    db.select().from(companyStats).where(inArray(companyStats.companyId, ids)),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const domainOf = new Map(names.map((n) => [n.id, n.domain]));
  const statsOf = new Map(stats.map((s) => [s.companyId, s]));
  const order: Record<Tier, number> = { call_this_week: 0, watch: 1, background: 2 };

  return ids
    .map((id) => {
      const s = statsOf.get(id);
      const act = activity.get(id) ?? { count: 0, last: null, lastPartnerSearch: null };
      const timing = s?.data.timing ?? null;
      const sc = scoreWarm(
        { activity: act, timing, maharashtraFocusLastCr: s?.maharashtraFocusLastCr ?? 0, puneLastCr: s?.puneLastCr ?? 0, lastFy: s?.lastFy ?? null },
        cfg,
        now,
      );
      return { companyId: id, company: nameOf.get(id) ?? "Unknown", domain: domainOf.get(id) ?? null, activity: act, timing, ...sc };
    })
    .sort((a, b) => order[a.tier] - order[b.tier] || b.score - a.score)
    .slice(0, w.maxItems);
}
