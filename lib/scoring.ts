import type { AppConfig, SignalTypeKey, SourceConfig } from "@/config/defaults";
import type { SignalType, Tier } from "@/lib/db/schema";
import { matchKeywords } from "@/lib/text";

export const SIGNAL_LABELS: Record<SignalType, string> = {
  new_initiative: "New initiative",
  allocation_increase: "Allocation increase",
  partner_search: "Partner search",
  policy_change: "Policy change",
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
  const order: SignalTypeKey[] = ["partner_search", "policy_change", "allocation_increase", "new_initiative"];
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

  // 6. Model confidence
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
  if (!c && TIER_RANK[tier] > TIER_RANK[w.unclassifiedMaxTier]) {
    tier = w.unclassifiedMaxTier;
    parts.push(`capped at ${TIER_LABELS[tier]} (unclassified)`);
  }

  return { score, tier, reason: `${parts.join(" · ")} = ${score}`, signalType, classified: Boolean(c) };
}
