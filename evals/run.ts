/**
 * npm run eval — runs pre-filter → Gemini classifier → scoring on evals/labelled.jsonl
 * and compares against hand labels. No database needed.
 *
 * Label format per line: "label": { "is_signal": true|false, "tier": "call_this_week"|"watch"|"background"|null }
 * Use tier null (or omit) when is_signal is false. Rows still labelled "TODO" are skipped.
 * Recency is computed against each row's `as_of`, so results don't drift as the file ages.
 * Bodies are short excerpts (≤600 chars) of the original articles, kept brief for copyright.
 * Uses config/defaults.ts unless --db-config is passed (then the live `config` row).
 */
import "../scripts/env";
import { readFileSync } from "node:fs";
import { loadConfig } from "@/lib/config";
import { DEFAULT_CONFIG, type AppConfig } from "@/config/defaults";
import { classifyItem } from "@/lib/classifier";
import { getDb, closeDb, hasDatabaseUrl } from "@/lib/db/client";
import { GeminiPool, loadKeys } from "@/lib/gemini";
import { prefilter } from "@/lib/prefilter";
import { scoreItem } from "@/lib/scoring";
import type { Tier } from "@/lib/db/schema";

interface Row {
  id: string;
  source: string;
  url: string;
  title: string;
  body: string;
  published_at: string | null;
  as_of: string;
  label: { is_signal: boolean | "TODO"; tier?: Tier | null | "TODO" };
}

type Predicted = { isSignal: boolean; tier: Tier | null; how: string };

async function predict(row: Row, cfg: AppConfig, pool: GeminiPool | null): Promise<Predicted> {
  const src = cfg.sources.find((s) => s.id === row.source);
  const pf = prefilter(row, src, cfg);
  if (!pf.passed) return { isSignal: false, tier: null, how: `prefilter: ${pf.reason}` };

  const publishedAt = row.published_at ? new Date(row.published_at) : null;
  let classification = null;
  let how = "rules-only";
  if (pool?.available) {
    const out = await classifyItem({ ...row, source: src?.name ?? row.source, publishedAt }, cfg, pool);
    if (out.ok) {
      how = `gemini/${out.keyLabel}`;
      if (!out.data.is_signal) return { isSignal: false, tier: null, how: `${how}: not a signal` };
      classification = {
        signalType: out.data.signal_type,
        sectors: out.data.sectors,
        geographies: out.data.geographies,
        confidence: out.data.confidence,
        otherSectors: out.data.other_sectors,
        activelyPartnering: out.data.actively_partnering,
        partners: out.data.partners,
        programmeStartYear: out.data.programme_start_year,
        amountInrCrore: out.data.amount_inr_crore,
        hasCompany: out.data.companies.length > 0,
      };
    } else {
      how = `rules-only (${out.reason})`;
    }
  }
  const asOf = new Date(row.as_of);
  const s = scoreItem({ title: row.title, body: row.body, publishedAt, fetchedAt: asOf, source: src, classification }, cfg, asOf);
  if (s.signalType === "none") return { isSignal: false, tier: null, how: `${how}: no signal type` };
  return { isSignal: true, tier: s.tier, how };
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--")) ?? "evals/labelled.jsonl";
  const rows: Row[] = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  const cfg = args.includes("--db-config") && hasDatabaseUrl() ? await loadConfig(await getDb()) : DEFAULT_CONFIG;
  let pool: GeminiPool | null = null;
  try {
    if (loadKeys().length) pool = new GeminiPool(undefined, undefined, () => {});
  } catch (err) {
    console.warn(`Gemini not configured: ${(err as Error).message}`);
  }
  if (!pool) console.warn("No Gemini keys/model: evaluating the rules-only path.\n");

  let tp = 0, fp = 0, fn = 0, tn = 0, tierHit = 0, tierN = 0, skipped = 0;
  for (const row of rows) {
    const p = await predict(row, cfg, pool);
    const lab = row.label;
    const labelled = lab.is_signal !== "TODO";
    const mark = labelled ? (p.isSignal === lab.is_signal ? "✓" : "✗") : "·";
    console.log(`${mark} ${row.id} pred=${p.isSignal ? p.tier : "no-signal"} (${p.how})  label=${labelled ? (lab.is_signal ? lab.tier : "no-signal") : "TODO"}  ${row.title.slice(0, 60)}`);
    if (!labelled) {
      skipped++;
      continue;
    }
    if (p.isSignal && lab.is_signal) tp++;
    else if (p.isSignal && !lab.is_signal) fp++;
    else if (!p.isSignal && lab.is_signal) fn++;
    else tn++;
    if (lab.tier !== "TODO") {
      const expected = lab.is_signal ? (lab.tier ?? null) : null;
      tierN++;
      if (expected === p.tier) tierHit++;
    }
  }

  const labelledN = rows.length - skipped;
  console.log(`\nitems: ${rows.length}, labelled: ${labelledN}, skipped (TODO): ${skipped}`);
  if (labelledN === 0) {
    console.log("No labels yet. Fill in label.is_signal / label.tier in evals/labelled.jsonl.");
    return;
  }
  console.log(`is_signal  precision ${pct(tp, tp + fp)}  recall ${pct(tp, tp + fn)}  (tp ${tp}, fp ${fp}, fn ${fn}, tn ${tn})`);
  console.log(`tier accuracy ${pct(tierHit, tierN)} (${tierHit}/${tierN}; non-signals count as tier "none")`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
