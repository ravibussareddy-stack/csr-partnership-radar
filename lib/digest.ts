import { and, desc, eq, gte, inArray, isNull, max, or } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import { classifications, companies, feedback, itemResearch, pitchKits, rawItems, searchRuns, signals, type PitchKit, type Quote, type SignalType, type Tier } from "@/lib/db/schema";
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
  recommendedAction: "reach_out_now" | "prepare" | "monitor" | "context" | null;
  geographies: string[];
  policyStatus: "confirmed" | "executed" | "inferred" | null;
  quotes: Quote[];
  /** Sourced pitch material for the company (scripts/history/pitch.ts), if any. */
  pitch: PitchKit | null;
  /** the same story from other outlets (merged into this card) */
  alsoReported: { title: string; url: string; source: string }[];
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
        recommendedAction: classifications.recommendedAction,
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
    const coIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is number => x != null))];
    const kits = coIds.length ? await db.select().from(pitchKits).where(inArray(pitchKits.companyId, coIds)) : [];
    const kitBy = new Map(kits.map((k) => [k.companyId, k.data]));
    const researchBy = new Map<number, { url: string; title: string; publisher: string | null }[]>();
    for (const r of research) (researchBy.get(r.itemId) ?? researchBy.set(r.itemId, []).get(r.itemId)!).push(r);
    return {
      status: "ok",
      lastUpdated: last ? new Date(last) : null,
      items: mergeSameStory(rows.map(({ sectors, keyPoints, nextStep, headline, worthIt, recommendedAction, geographies, policyStatus, quotes, clsDomain, coDomain, itemId, ...r }) => {
        const c = r.classified;
        return {
          ...r,
          sectors: c ? (sectors ?? []) : [],
          keyPoints: c ? (keyPoints ?? []) : [],
          nextStep: c ? (nextStep ?? null) : null,
          headline: c ? (headline ?? null) : null,
          recommendedAction: c ? (recommendedAction ?? null) : null,
          worthIt: c ? (worthIt ?? null) : null,
          geographies: c ? (geographies ?? []) : [],
          policyStatus: c ? (policyStatus ?? null) : null,
          quotes: c ? (quotes ?? []) : [],
          pitch: r.companyId ? (kitBy.get(r.companyId) ?? null) : null,
          alsoReported: [],
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
      })),
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

/**
 * One card per story: same company, same initiative (same signal type, or headlines sharing most of
 * their distinctive words), within 3 days. Real articles stay primary; other outlets, alerts and
 * pasted or demo copies become "also reported by", so every source is kept.
 */
const STOP = new Set(["the", "and", "for", "with", "to", "of", "in", "on", "a", "an", "its", "launches", "launch", "csr", "india", "limited", "ltd", "foundation"]);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
function sameInitiative(a: DigestItem, b: DigestItem): boolean {
  if (a.signalType === b.signalType) return true;
  const x = words(a.headline ?? a.title);
  const y = words(b.headline ?? b.title);
  const common = [...x].filter((w) => y.has(w)).length;
  return common / Math.max(1, Math.min(x.size, y.size)) >= 0.5;
}

function mergeSameStory(items: DigestItem[]): DigestItem[] {
  const out: DigestItem[] = [];
  // Real items first (by score), then demo / pasted copies, so a copy never becomes the primary card.
  const ordered = [...items.filter((i) => !i.isDemo), ...items.filter((i) => i.isDemo)];
  for (const it of ordered) {
    const twin =
      it.companyId != null
        ? out.find((o) => o.companyId === it.companyId && Math.abs(new Date(o.date).getTime() - new Date(it.date).getTime()) <= 3 * 86400_000 && sameInitiative(o, it))
        : undefined;
    if (twin) twin.alsoReported.push({ title: it.isDemo ? `${it.title} (demo copy)` : it.title, url: it.url, source: it.source });
    else out.push(it);
  }
  return out.sort((a, b) => b.score - a.score);
}
