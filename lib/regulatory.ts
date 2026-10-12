/** Regulatory changes & news: policy items (any age up to `days`) and the stored highlight summary. */
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { classifications, modelMetrics, rawItems, type Quote } from "@/lib/db/schema";
import { canonicalUrl, groupStories } from "@/lib/dedupe";

export const OFFICIAL_HOSTS = /(^|\.)(gov\.in|nic\.in|sebi\.gov\.in|mca\.gov\.in|egazette\.gov\.in|pib\.gov\.in|rbi\.org\.in|sansad\.in|indiacode\.nic\.in)$/i;

export type PolicyStatus = "confirmed" | "executed" | "inferred";

export interface PolicyItem {
  itemId: number;
  title: string;
  originalTitle: string | null;
  url: string;
  host: string;
  official: boolean;
  date: string;
  status: PolicyStatus;
  summary: string | null;
  worthIt: string | null;
  keyPoints: string[];
  quotes: Quote[];
  /** Later articles about the same event (one card per event; the date is the event's, not the coverage's). */
  coverage: { itemId: number; title: string; url: string; host: string; date: string }[];
}

const STATUS_RANK: Record<PolicyStatus, number> = { inferred: 0, confirmed: 1, executed: 2 };

export interface RegulatorySummary {
  overview: string;
  highlights: { text: string; status: PolicyStatus; itemIds: number[] }[];
  watchNext: string[];
  computedAt: string;
  items: number;
}

export async function loadRegulatory(days = 180): Promise<{ items: PolicyItem[]; summary: RegulatorySummary | null }> {
  if (!hasDatabaseUrl()) return { items: [], summary: null };
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      itemId: rawItems.id,
      title: rawItems.title,
      url: rawItems.url,
      publishedAt: rawItems.publishedAt,
      fetchedAt: rawItems.fetchedAt,
      headline: classifications.headline,
      status: classifications.policyStatus,
      summary: classifications.whyItMatters,
      worthIt: classifications.worthIt,
      keyPoints: classifications.keyPoints,
      quotes: classifications.quotes,
    })
    .from(classifications)
    .innerJoin(rawItems, eq(rawItems.contentHash, classifications.contentHash))
    .where(
      and(
        eq(classifications.signalType, "policy_change"),
        eq(classifications.isSignal, true),
        or(gte(rawItems.publishedAt, since), and(isNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since))),
      ),
    )
    .orderBy(desc(rawItems.publishedAt));
  const seen = new Set<string>();
  const all: PolicyItem[] = [];
  for (const r of rows) {
    const key = canonicalUrl(r.url);
    if (seen.has(key)) continue;
    seen.add(key);
    let host = "";
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
    all.push({
      itemId: r.itemId,
      title: r.headline || r.title,
      originalTitle: r.headline && r.headline !== r.title ? r.title : null,
      url: r.url,
      host,
      official: OFFICIAL_HOSTS.test(host),
      date: (r.publishedAt ?? r.fetchedAt).toISOString(),
      // Items classified before v6 have no status: treat as not yet official.
      status: (r.status ?? "inferred") as PolicyStatus,
      summary: r.summary,
      worthIt: r.worthIt,
      keyPoints: r.keyPoints ?? [],
      quotes: r.quotes ?? [],
      coverage: [],
    });
  }
  // One card per event: articles about the same development within 45 days are grouped. The primary is
  // the official source if there is one, else the earliest report, so a later article revisiting an
  // announcement never shows it as new. The status is the official source's (else the most advanced).
  const ordered = [...all].sort((a, b) => Number(b.official) - Number(a.official) || a.date.localeCompare(b.date));
  const items = groupStories(ordered, (i) => i.originalTitle ?? i.title, (i) => new Date(i.date), 45, { minCommon: 2, minShare: 0.4 })
    .map(({ primary, copies }) => {
      const members = [primary, ...copies];
      const official = members.filter((i) => i.official);
      const status = (official.length ? official : members).reduce<PolicyStatus>((s, i) => (STATUS_RANK[i.status] > STATUS_RANK[s] ? i.status : s), "inferred");
      const earliest = members.reduce((d, i) => (i.date < d ? i.date : d), primary.date);
      return {
        ...primary,
        status,
        date: earliest,
        quotes: primary.quotes.length ? primary.quotes : (copies.find((c) => c.quotes.length)?.quotes ?? []),
        coverage: copies.sort((a, b) => b.date.localeCompare(a.date)).map((c) => ({ itemId: c.itemId, title: c.title, url: c.url, host: c.host, date: c.date })),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const [m] = await db.select().from(modelMetrics).where(eq(modelMetrics.key, "regulatory-summary"));
  return { items, summary: (m?.data as RegulatorySummary) ?? null };
}
