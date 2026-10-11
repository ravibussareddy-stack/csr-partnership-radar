import { and, desc, eq, gte, isNull, max, or } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { classifications, companies, rawItems, signals, type SignalType, type Tier } from "@/lib/db/schema";

export const DIGEST_WINDOW_DAYS = 7;

export interface DigestItem {
  id: number;
  tier: Tier;
  score: number;
  signalType: SignalType;
  reason: string;
  classified: boolean;
  title: string;
  url: string;
  source: string;
  date: Date;
  company: string | null;
  whyItMatters: string | null;
  keyLabel: string | null;
}

export type DigestData =
  | { status: "no_database" }
  | { status: "error"; message: string }
  | { status: "ok"; items: DigestItem[]; lastUpdated: Date | null };

/** Read-only. Signals from the last 7 days, highest score first. */
export async function loadDigest(now = new Date()): Promise<DigestData> {
  if (!hasDatabaseUrl()) return { status: "no_database" };
  try {
    const db = await getDb();
    const since = new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86400_000);
    const rows = await db
      .select({
        id: signals.id,
        tier: signals.tier,
        score: signals.score,
        signalType: signals.signalType,
        reason: signals.reason,
        classified: signals.classified,
        title: rawItems.title,
        url: rawItems.url,
        source: rawItems.source,
        publishedAt: rawItems.publishedAt,
        fetchedAt: rawItems.fetchedAt,
        company: companies.canonicalName,
        whyItMatters: classifications.whyItMatters,
        keyLabel: classifications.keyLabel,
      })
      .from(signals)
      .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
      .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
      .leftJoin(companies, eq(companies.id, signals.companyId))
      .where(or(gte(rawItems.publishedAt, since), and(isNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since))))
      .orderBy(desc(signals.score));
    const [{ last }] = await db.select({ last: max(signals.updatedAt) }).from(signals);
    return {
      status: "ok",
      lastUpdated: last ? new Date(last) : null,
      items: rows.map((r) => ({
        ...r,
        date: r.publishedAt ?? r.fetchedAt,
        whyItMatters: r.classified ? r.whyItMatters : null,
        keyLabel: r.classified ? r.keyLabel : null,
      })),
    };
  } catch (err) {
    console.error("loadDigest failed", err);
    return { status: "error", message: "Could not read from the database." };
  }
}
