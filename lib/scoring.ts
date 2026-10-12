import type { AppConfig, SignalTypeKey, SourceConfig } from "@/config/defaults";
import type { SignalType, Tier } from "@/lib/db/schema";
import { matchKeywords } from "@/lib/text";
import { OTHER_SECTORS } from "@/prompts/classify";

export const SIGNAL_LABELS: Record<SignalType, string> = {
  new_initiative: "New initiative",
  allocation_increase: "Allocation increase",
  partner_search: "Partner search",
  policy_change: "Policy change",
  ongoing_programme: "Ongoing programme",
  csr_hiring: "Hiring for CSR",
  regional_expansion: "Expansion in region",
  none: "No clear signal",
};

export const TIER_LABELS: Record<Tier, string> = {
  call_this_week: "Call this week",
  watch: "Watch",
  background: "Background",
};

const TIER_RANK: Record<Tier, number> = { background: 0, watch: 1, call_this_week: 2 };

export interface ScoreInput {
  title: string;
  body: string;
  publishedAt: Date | null;
  fetchedAt: Date;
  source: SourceConfig | undefined;
  /** null = unclassified → rules-only scoring */
  classification: {
    signalType: SignalType;
    sectors: string[];
    geographies: string[];
    confidence: number;
    otherSectors?: string[];
    activelyPartnering?: "yes" | "no" | "unknown";
    partners?: string[];
    programmeStartYear?: number | null;
    amountInrCrore?: number | null;
    /** false when the model found no company or foundation behind the item */
    hasCompany?: boolean;
  } | null;
}

export interface ScoreResult {
  score: number;
  tier: Tier;
  reason: string;
  signalType: SignalType;
  classified: boolean;
}

/** Keyword fallback used only when the model did not classify the item. */
export function inferSignalType(title: string, body: string, cfg: AppConfig): SignalType {
  const hints = cfg.keywords.signalHints;
  const text = `${title}\n${body}`;
  const order: SignalTypeKey[] = [
    "partner_search", "policy_change", "csr_hiring", "allocation_increase", "new_initiative", "ongoing_programme", "regional_expansion",
  ];
  for (const t of order) {
    // Policy terms show up in passing in lots of CSR stories; require one in the headline.
    if (t === "policy_change" && matchKeywords(title, cfg.keywords.policy).length === 0) continue;
    if (matchKeywords(text, hints[t]).length > 0) return t;
  }
  return "none";
}

function geoMatch(cfg: AppConfig, values: string[]) {
  const joined = values.join(" | ");
  return cfg.geographies
    .filter((g) => matchKeywords(joined, [g.label, ...g.keywords]).length > 0)
    .sort((a, b) => b.weight - a.weight)[0];
}

function formatCrore(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(n < 1 ? 2 : 1).replace(/\.0$/, "");
}

/** Deterministic: same input + config + `now` → same output. */
export function scoreItem(input: ScoreInput, cfg: AppConfig, now: Date = new Date()): ScoreResult {
  const w = cfg.scoringWeights;
  const text = `${input.title}\n${input.body}`;
  const c = input.classification;
  const parts: string[] = [];
  let score = 0;

  // 1. Signal type
  const signalType: SignalType = c ? c.signalType : inferSignalType(input.title, input.body, cfg);
  const typePts = w.signalType[signalType] ?? 0;
  score += typePts;
  parts.push(`${SIGNAL_LABELS[signalType]}${c ? "" : " (keywords)"} +${typePts}`);

  // 2. Recency
  const when = input.publishedAt ?? input.fetchedAt;
  const ageDays = Math.max(0, (now.getTime() - when.getTime()) / 86400_000);
  const rec = w.recency.find((r) => ageDays <= r.maxAgeDays);
  const recPts = rec?.points ?? 0;
  score += recPts;
  parts.push(`${Math.floor(ageDays)}d old +${recPts}`);

  // 3. Sector fit
  const sectorIds = c
    ? c.sectors
    : cfg.sectors.filter((s) => matchKeywords(text, s.keywords).length > 0).map((s) => s.id);
  const sectorLabels = cfg.sectors.filter((s) => sectorIds.includes(s.id)).map((s) => s.label);
  const sectorPts = Math.min(w.sectorMax, sectorLabels.length * w.sectorPerMatch);
  score += sectorPts;
  if (sectorLabels.length) parts.push(`${sectorLabels.join(", ")} +${sectorPts}`);
  const outsideLabels = (c?.otherSectors ?? []).map((id) => OTHER_SECTORS.find((o) => o.id === id)?.label ?? id);
  const outsideOnly = Boolean(c) && sectorLabels.length === 0 && signalType !== "policy_change" && signalType !== "csr_hiring" && signalType !== "regional_expansion";
  if (outsideOnly) parts.push(`outside focus${outsideLabels.length ? `: ${outsideLabels.join(", ")}` : ""}`);

  // 4. Geography fit (highest-weighted match only)
  const geo = c && c.geographies.length > 0 ? geoMatch(cfg, c.geographies) : geoMatch(cfg, [text]);
  if (geo) {
    score += geo.weight;
    parts.push(`${geo.label} +${geo.weight}`);
  }

  // 5. Source weight
  const srcPts = input.source?.weight ?? 0;
  score += srcPts;
  if (srcPts) parts.push(`source +${srcPts}`);

  // 6. NGO partnering (from the model)
  if (c?.activelyPartnering === "yes") {
    score += w.activelyPartneringBonus;
    const names = (c.partners ?? []).slice(0, 2).join(", ");
    parts.push(`works with NGOs${names ? ` (${names})` : ""} +${w.activelyPartneringBonus}`);
  } else if (c?.activelyPartnering === "no") {
    parts.push("runs it in-house");
  }

  // Context only, no points: programme age and amount
  if (c?.programmeStartYear) {
    const yrs = now.getFullYear() - c.programmeStartYear;
    parts.push(`running since ${c.programmeStartYear}${yrs > 0 ? ` (${yrs} yr${yrs === 1 ? "" : "s"})` : ""}`);
  }
  if (c?.amountInrCrore) parts.push(`₹${formatCrore(c.amountInrCrore)} cr`);

  // 7. Model confidence
  if (c && c.confidence < w.lowConfidenceThreshold) {
    score -= w.lowConfidencePenalty;
    parts.push(`low confidence −${w.lowConfidencePenalty}`);
  }

  let tier: Tier =
    score >= w.thresholds.callThisWeek ? "call_this_week" : score >= w.thresholds.watch ? "watch" : "background";
  if (signalType === "none" && tier !== "background") {
    tier = "background";
    parts.push("no signal type → Background");
  }
  if (signalType === "regional_expansion" && TIER_RANK[tier] > TIER_RANK[w.expansionMaxTier]) {
    tier = w.expansionMaxTier;
    parts.push(`capped at ${TIER_LABELS[tier]} (future CSR funder)`);
  }
  if (signalType === "csr_hiring" && TIER_RANK[tier] > TIER_RANK[w.hiringMaxTier]) {
    tier = w.hiringMaxTier;
    parts.push(`capped at ${TIER_LABELS[tier]} (job post)`);
  }
  // Nobody to call: without a named company (policy news aside) the best tier is Watch.
  if (c && c.hasCompany === false && signalType !== "policy_change" && tier === "call_this_week") {
    tier = "watch";
    parts.push("capped at Watch (no company named)");
  }
  if (outsideOnly && TIER_RANK[tier] > TIER_RANK[w.outsideSectorMaxTier]) {
    tier = w.outsideSectorMaxTier;
    parts.push(`capped at ${TIER_LABELS[tier]} (outside focus)`);
  }
  if (!c && TIER_RANK[tier] > TIER_RANK[w.unclassifiedMaxTier]) {
    tier = w.unclassifiedMaxTier;
    parts.push(`capped at ${TIER_LABELS[tier]} (unclassified)`);
  }

  return { score, tier, reason: `${parts.join(" · ")} = ${score}`, signalType, classified: Boolean(c) };
}
