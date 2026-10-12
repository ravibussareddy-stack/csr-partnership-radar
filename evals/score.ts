/**
 * npm run eval — scores the system's tiers against a person's labels in the labelling sheet
 * (evals/sheet.csv from `npm run eval:sheet`; pass another .csv or .json path to use that).
 * No AI calls and no database needed: the sheet carries the system's tier from export time.
 * --live re-reads the current tiers from the database (DATABASE_URL), e.g. after a scoring change.
 *
 * Reports: Call precision and recall, tier agreement (and Cohen's kappa), the confusion matrix,
 * contradictions (Call vs Background either way) and Open / Warm call-type agreement.
 * Rows without a valid label_tier are skipped, so a half-filled sheet still scores.
 */
import "../scripts/env";
import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { closeDb, getDb, hasDatabaseUrl } from "@/lib/db/client";
import { signals } from "@/lib/db/schema";
import { callType } from "@/lib/insights";
import { fromCsv, type SheetRow } from "./sheet";

type T = "call" | "watch" | "background";
const TIERS: T[] = ["call", "watch", "background"];
const RANK: Record<T, number> = { background: 0, watch: 1, call: 2 };

export function normTier(v: string): T | null {
  const s = v.trim().toLowerCase();
  if (/^(call|call this week|call_this_week|c)$/.test(s)) return "call";
  if (/^(watch|w)$/.test(s)) return "watch";
  if (/^(background|bg|b)$/.test(s)) return "background";
  return null;
}
export function normType(v: string): "open" | "warm" | null {
  const s = v.trim().toLowerCase();
  if (/^(open|open opportunity|o)$/.test(s)) return "open";
  if (/^(warm|warm lead|w)$/.test(s)) return "warm";
  return null;
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(0)}% (${n}/${d})`);

export interface EvalResult {
  labelled: number;
  skipped: number;
  matrix: Record<T, Record<T, number>>;
  callPrecision: [number, number];
  callRecall: [number, number];
  agreement: [number, number];
  kappa: number | null;
  contradictions: { row: SheetRow; system: T; human: T }[];
  typeAgreement: [number, number];
  typeMismatches: SheetRow[];
}

export function evaluate(rows: SheetRow[]): EvalResult {
  const matrix = Object.fromEntries(TIERS.map((s) => [s, Object.fromEntries(TIERS.map((h) => [h, 0]))])) as EvalResult["matrix"];
  const pairs: { row: SheetRow; system: T; human: T }[] = [];
  let skipped = 0;
  for (const row of rows) {
    const system = normTier(row.system_tier);
    const human = normTier(row.label_tier);
    if (!system || !human) {
      skipped++;
      continue;
    }
    matrix[system][human]++;
    pairs.push({ row, system, human });
  }
  const n = pairs.length;
  const sysCalls = pairs.filter((p) => p.system === "call");
  const humanCalls = pairs.filter((p) => p.human === "call");
  const bothCall = sysCalls.filter((p) => p.human === "call");
  const agree = pairs.filter((p) => p.system === p.human).length;
  // Cohen's kappa: agreement beyond what the two label distributions would give by chance.
  const chance = n ? TIERS.reduce((s, t) => s + (pairs.filter((p) => p.system === t).length / n) * (pairs.filter((p) => p.human === t).length / n), 0) : 0;
  const kappa = n && chance < 1 ? (agree / n - chance) / (1 - chance) : null;
  const typed = bothCall.filter((p) => normType(p.row.label_call_type) && normType(p.row.system_call_type));
  const typeMismatches = typed.filter((p) => normType(p.row.label_call_type) !== normType(p.row.system_call_type)).map((p) => p.row);
  return {
    labelled: n,
    skipped,
    matrix,
    callPrecision: [bothCall.length, sysCalls.length],
    callRecall: [bothCall.length, humanCalls.length],
    agreement: [agree, n],
    kappa,
    contradictions: pairs.filter((p) => Math.abs(RANK[p.system] - RANK[p.human]) === 2),
    typeAgreement: [typed.length - typeMismatches.length, typed.length],
    typeMismatches,
  };
}

function load(path: string): SheetRow[] {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".json") ? (JSON.parse(text) as { rows: SheetRow[] }).rows : fromCsv(text);
}

/** Replace the exported system tiers with the current ones from the database. */
async function live(rows: SheetRow[]): Promise<void> {
  const ids = rows.map((r) => Number(r.item_id)).filter(Number.isInteger);
  if (!ids.length) return;
  const db = await getDb();
  const cur = await db.select({ itemId: signals.itemId, tier: signals.tier, signalType: signals.signalType }).from(signals).where(inArray(signals.itemId, ids));
  const by = new Map(cur.map((c) => [String(c.itemId), c]));
  const TIER = { call_this_week: "call", watch: "watch", background: "background" } as const;
  for (const r of rows) {
    const c = by.get(r.item_id);
    r.system_tier = c ? TIER[c.tier] : "removed";
    r.system_call_type = c?.tier === "call_this_week" ? callType(c.signalType) : "";
  }
}

async function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith("--")) ?? "evals/sheet.csv";
  let rows: SheetRow[];
  try {
    rows = load(path);
  } catch (err) {
    console.error(`Cannot read ${path} (${(err as Error).message}). Export it first: npm run eval:sheet`);
    process.exitCode = 1;
    return;
  }
  if (args.includes("--live")) {
    if (!hasDatabaseUrl()) {
      console.error("--live needs DATABASE_URL");
      process.exitCode = 1;
      return;
    }
    await live(rows);
  }
  const r = evaluate(rows);
  console.log(`${path}: ${rows.length} rows, ${r.labelled} labelled, ${r.skipped} skipped (no valid label_tier${args.includes("--live") ? " or no longer scored" : ""})`);
  if (r.labelled === 0) {
    console.log("No labels yet. Fill label_tier (call / watch / background) and, for calls, label_call_type (open / warm).");
    return;
  }
  console.log(`\nCall precision   ${pct(...r.callPrecision)}   of the system's Calls, how many a person also calls`);
  console.log(`Call recall      ${pct(...r.callRecall)}   of the person's Calls, how many the system calls`);
  console.log(`Tier agreement   ${pct(...r.agreement)}${r.kappa != null ? `   Cohen's kappa ${r.kappa.toFixed(2)}` : ""}`);
  console.log(`Call type        ${pct(...r.typeAgreement)}   Open / Warm agreement where both say Call`);
  console.log("\nConfusion matrix (rows: system, columns: person)");
  console.log(`${"".padEnd(12)}${["call", "watch", "background"].map((t) => t.padStart(12)).join("")}`);
  for (const s of TIERS) console.log(`${s.padEnd(12)}${TIERS.map((h) => String(r.matrix[s][h]).padStart(12)).join("")}`);
  console.log(`\nContradictions (Call vs Background): ${r.contradictions.length}`);
  for (const c of r.contradictions) console.log(`  #${c.row.item_id} system ${c.system}, person ${c.human}: ${c.row.company || "?"}: ${c.row.title.slice(0, 70)}${c.row.label_notes ? ` (${c.row.label_notes})` : ""}`);
  if (r.typeMismatches.length) {
    console.log(`\nCall type mismatches: ${r.typeMismatches.length}`);
    for (const m of r.typeMismatches) console.log(`  #${m.item_id} system ${m.system_call_type}, person ${m.label_call_type}: ${m.company || "?"}: ${m.title.slice(0, 70)}`);
  }
}

if (process.argv[1]?.endsWith("score.ts")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
