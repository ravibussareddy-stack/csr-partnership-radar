import type { AppConfig, SourceConfig } from "@/config/defaults";
import { matchKeywords } from "@/lib/text";

export interface PrefilterResult {
  passed: boolean;
  csrHits: string[];
  sectorHits: string[]; // sector ids
  policyHits: string[];
  reason: string;
}

/**
 * Deterministic gate before Gemini. Pass = (CSR keyword OR CSR-focused source)
 * AND (sector keyword OR CSR-policy keyword).
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

  const csrOk = csrHits.length > 0 || Boolean(source?.csrFocused);
  const topicOk = sectorHits.length > 0 || policyHits.length > 0;
  const passed = csrOk && topicOk;
  const reason = passed
    ? `csr:${source?.csrFocused ? "source" : csrHits.slice(0, 2).join("|")} topic:${[...sectorHits, ...policyHits].slice(0, 3).join("|")}`
    : !csrOk
      ? "no CSR keyword"
      : "no sector or policy keyword";
  return { passed, csrHits, sectorHits, policyHits, reason };
}
