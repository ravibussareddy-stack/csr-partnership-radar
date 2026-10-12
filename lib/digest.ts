import { and, desc, eq, gte, inArray, isNull, max, or } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { classifications, companies, feedback, itemResearch, rawItems, searchRuns, signals, type Quote, type SignalType, type Tier } from "@/lib/db/schema";
import { sourceGroup, type SourceGroup } from "@/lib/sources";

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
  sectors: string[];
  keyPoints: string[];
  nextStep: string | null;
  headline: string | null;
  worthIt: string | null;
  geographies: string[];
  policyStatus: "confirmed" | "executed" | "inferred" | null;
  quotes: Quote[];
  domain: string | null;
  sourceGroup: SourceGroup;
  channel: string | null;
  research: { url: string; title: string; publisher: string | null }[];
  itemId: number;
  read: boolean;
  isDemo: boolean;
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
        keyPoints: classifications.keyPoints,
        nextStep: classifications.nextStep,
        headline: classifications.headline,
        worthIt: classifications.worthIt,
        geographies: classifications.geographies,
        policyStatus: classifications.policyStatus,
        quotes: classifications.quotes,
        clsDomain: classifications.companyDomain,
        coDomain: companies.domain,
        channel: rawItems.channel,
        itemId: rawItems.id,
        isDemo: rawItems.isDemo,
      })
      .from(signals)
      .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
      .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
      .leftJoin(companies, eq(companies.id, signals.companyId))
      .where(or(gte(rawItems.publishedAt, since), and(isNull(rawItems.publishedAt), gte(rawItems.fetchedAt, since))))
      .orderBy(desc(signals.score));
    const [{ last }] = await db.select({ last: max(signals.updatedAt) }).from(signals);
    const itemIds = rows.map((r) => r.itemId);
    const research = itemIds.length
      ? await db
          .select({ itemId: itemResearch.itemId, url: itemResearch.url, title: itemResearch.title, publisher: itemResearch.publisher })
          .from(itemResearch)
          .where(inArray(itemResearch.itemId, itemIds))
      : [];
    const readRows = itemIds.length
      ? await db.select({ itemId: feedback.itemId }).from(feedback).where(and(inArray(feedback.itemId, itemIds), eq(feedback.action, "read")))
      : [];
    const readSet = new Set(readRows.map((r) => r.itemId));
    const researchBy = new Map<number, { url: string; title: string; publisher: string | null }[]>();
    for (const r of research) (researchBy.get(r.itemId) ?? researchBy.set(r.itemId, []).get(r.itemId)!).push(r);
    return {
      status: "ok",
      lastUpdated: last ? new Date(last) : null,
      items: rows.map(({ sectors, keyPoints, nextStep, headline, worthIt, geographies, policyStatus, quotes, clsDomain, coDomain, itemId, ...r }) => {
        const c = r.classified;
        return {
          ...r,
          sectors: c ? (sectors ?? []) : [],
          keyPoints: c ? (keyPoints ?? []) : [],
          nextStep: c ? (nextStep ?? null) : null,
          headline: c ? (headline ?? null) : null,
          worthIt: c ? (worthIt ?? null) : null,
          geographies: c ? (geographies ?? []) : [],
          policyStatus: c ? (policyStatus ?? null) : null,
          quotes: c ? (quotes ?? []) : [],
          domain: coDomain ?? clsDomain ?? null,
          sourceGroup: sourceGroup(r.source),
          research: researchBy.get(itemId) ?? [],
          itemId,
          read: readSet.has(itemId),
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
  runs: number;
  /** results found this week (all runs), newest first, with their digest tier if scored */
  results: { title: string; url: string; date: Date | null; company: string | null; tier: Tier | null }[];
  entryPointHtml: string | null;
}

/** Saved searches run in the last 7 days, with the results each one actually found. */
export async function loadRecentSearches(now = new Date()): Promise<SearchRunSummary[]> {
  if (!hasDatabaseUrl()) return [];
  const db = await getDb();
  const since = new Date(now.getTime() - DIGEST_WINDOW_DAYS * 86400_000);
  const runs = await db.select().from(searchRuns).where(gte(searchRuns.ranAt, since)).orderBy(desc(searchRuns.ranAt));
  const latest = new Map<string, SearchRunSummary>();
  for (const r of runs) {
    const prev = latest.get(r.searchId);
    if (prev) {
      prev.runs++;
      continue;
    }
    latest.set(r.searchId, { searchId: r.searchId, query: r.query, ranAt: r.ranAt, runs: 1, results: [], entryPointHtml: r.entryPointHtml });
  }
  if (latest.size === 0) return [];
  const found = await db
    .select({ searchId: rawItems.searchId, title: rawItems.title, url: rawItems.url, date: rawItems.publishedAt, company: companies.canonicalName, tier: signals.tier })
    .from(rawItems)
    .leftJoin(signals, eq(signals.itemId, rawItems.id))
    .leftJoin(companies, eq(companies.id, signals.companyId))
    .where(and(inArray(rawItems.searchId, [...latest.keys()]), gte(rawItems.fetchedAt, since)))
    .orderBy(desc(rawItems.fetchedAt));
  for (const f of found) {
    const s = f.searchId ? latest.get(f.searchId) : undefined;
    if (s) s.results.push({ title: f.title, url: f.url, date: f.date, company: f.company, tier: f.tier });
  }
  return [...latest.values()].sort((a, b) => b.results.length - a.results.length);
}
