import { and, desc, eq, gte, isNull, max, or } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { classifications, companies, rawItems, searchRuns, signals, type SignalType, type Tier } from "@/lib/db/schema";

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
  companyId: number | null;
  whyItMatters: string | null;
  keyLabel: string | null;
  otherSectors: string[];
  outsideFocus: boolean;
  activelyPartnering: "yes" | "no" | "unknown" | null;
  partners: string[];
  programmeStartYear: number | null;
  amountInrCrore: number | null;
  financialYear: string | null;
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
        companyId: signals.companyId,
        whyItMatters: classifications.whyItMatters,
        keyLabel: classifications.keyLabel,
        sectors: classifications.sectors,
        otherSectors: classifications.otherSectors,
        activelyPartnering: classifications.activelyPartnering,
        partners: classifications.partners,
        programmeStartYear: classifications.programmeStartYear,
        amountInrCrore: classifications.amountInrCrore,
        financialYear: classifications.financialYear,
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
      items: rows.map(({ sectors, ...r }) => {
        const c = r.classified;
        return {
          ...r,
          date: r.publishedAt ?? r.fetchedAt,
          whyItMatters: c ? r.whyItMatters : null,
          keyLabel: c ? r.keyLabel : null,
          otherSectors: c ? (r.otherSectors ?? []) : [],
          outsideFocus: c && (sectors ?? []).length === 0 && r.signalType !== "policy_change",
          activelyPartnering: c ? r.activelyPartnering : null,
          partners: c ? (r.partners ?? []) : [],
          programmeStartYear: c ? r.programmeStartYear : null,
          amountInrCrore: c ? r.amountInrCrore : null,
          financialYear: c ? r.financialYear : null,
        };
      }),
    };
  } catch (err) {
    console.error("loadDigest failed", err);
    return { status: "error", message: "Could not read from the database." };
  }
}

export interface SearchRunSummary {
  searchId: string;
  query: string;
  ranAt: Date;
  itemsFound: number;
  itemsNew: number;
  entryPointHtml: string | null;
}

/** Latest grounded-search run per saved search in the last 7 days (for the digest's search panel). */
export async function loadRecentSearches(now = new Date()): Promise<SearchRunSummary[]> {
  if (!hasDatabaseUrl()) return [];
  const db = await getDb();
  const since = new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86400_000);
  const rows = await db.select().from(searchRuns).where(gte(searchRuns.ranAt, since)).orderBy(desc(searchRuns.ranAt));
  const latest = new Map<string, SearchRunSummary>();
  for (const r of rows) {
    const prev = latest.get(r.searchId);
    if (prev) {
      prev.itemsFound = Math.max(prev.itemsFound, r.itemsFound);
      prev.itemsNew += r.itemsNew;
      continue;
    }
    latest.set(r.searchId, { searchId: r.searchId, query: r.query, ranAt: r.ranAt, itemsFound: r.itemsFound, itemsNew: r.itemsNew, entryPointHtml: r.entryPointHtml });
  }
  return [...latest.values()];
}
