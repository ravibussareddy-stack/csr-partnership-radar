/** Regulatory changes & news: policy items (any age up to `days`) and the stored highlight summary. */
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { classifications, modelMetrics, rawItems, type Quote } from "@/lib/db/schema";

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
}

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
  const items: PolicyItem[] = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    let host = "";
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
    items.push({
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
    });
  }
  const [m] = await db.select().from(modelMetrics).where(eq(modelMetrics.key, "regulatory-summary"));
  return { items, summary: (m?.data as RegulatorySummary) ?? null };
}
