import type { AppConfig, SourceConfig } from "@/config/defaults";
import { matchKeywords } from "@/lib/text";

export interface PrefilterResult {
  passed: boolean;
  csrHits: string[];
  impactHits: string[];
  sectorHits: string[]; // sector ids
  policyHits: string[];
  reason: string;
}

/**
 * Stage 1 (deterministic) before Gemini. Pass = CSR keyword OR CSR-policy keyword OR CSR-focused
 * source OR community-impact context (2+ impact phrases, or 1 plus a focus-sector keyword);
 * and, only when keywords.requireSectorMatch is on, also (sector keyword OR CSR-policy keyword).
 * Items that fail can still pass stage 2, the batched context screen (scripts/ingest/screen.ts).
 */
export function prefilter(
  item: { title: string; body: string },
  source: Pick<SourceConfig, "csrFocused"> | undefined,
  cfg: AppConfig,
): PrefilterResult {
  const text = `${item.title}\n${item.body}`;
  const csrHits = matchKeywords(text, cfg.keywords.csr);
  const policyHits = matchKeywords(text, cfg.keywords.policy);
  const sectorHits = cfg.sectors
    .filter((s) => matchKeywords(text, s.keywords).length > 0)
    .map((s) => s.id);

  const impactHits = matchKeywords(text, cfg.keywords.communityImpact ?? []);
  const impactOk = impactHits.length >= 2 || (impactHits.length >= 1 && sectorHits.length >= 1);
  const csrOk = csrHits.length > 0 || Boolean(source?.csrFocused) || policyHits.length > 0 || impactOk;
  const topicOk = !cfg.keywords.requireSectorMatch || sectorHits.length > 0 || policyHits.length > 0;
  const passed = csrOk && topicOk;
  const reason = passed
    ? `${source?.csrFocused ? "csr:source" : csrHits.length || policyHits.length ? `csr:${[...csrHits, ...policyHits].slice(0, 2).join("|")}` : `impact:${impactHits.slice(0, 3).join("|")}`} sectors:${sectorHits.join("|") || "-"}`
    : !csrOk
      ? "no CSR or community-impact keyword"
      : "no sector or policy keyword";
  return { passed, csrHits, impactHits, sectorHits, policyHits, reason };
}
