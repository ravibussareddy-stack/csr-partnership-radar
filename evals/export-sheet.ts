/**
 * npm run eval:sheet — exports ~30 recent real digest items (no demo samples) to a labelling sheet:
 *   evals/sheet.csv   (open in Excel / Google Sheets and fill the label_* columns)
 *   evals/sheet.json  (same rows, for scripts)
 * The label columns are left empty on purpose: a person fills them, never the system.
 *   label_tier       call | watch | background
 *   label_call_type  open | warm     (only when label_tier is call)
 *   label_notes      free text (why)
 * The sheet mixes tiers (up to 10 calls, 10 watch, the rest background, newest first) so Call
 * precision and the Watch / Background boundary are both measured. Then run `npm run eval`.
 *
 * Options: --n=30 (rows), --out=evals/sheet (path prefix), --force (overwrite a sheet that has labels).
 */
import "../scripts/env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { closeDb } from "@/lib/db/client";
import { loadDigest, type DigestItem } from "@/lib/digest";
import { callType } from "@/lib/insights";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { SHEET_COLUMNS, fromCsv, toCsv, type SheetRow } from "./sheet";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const n = Number(arg("n") ?? 30);
  const out = arg("out") ?? "evals/sheet";
  if (existsSync(`${out}.csv`) && !process.argv.includes("--force") && fromCsv(readFileSync(`${out}.csv`, "utf8")).some((r) => r.label_tier.trim())) {
    console.error(`${out}.csv already has labels; pass --force to overwrite it, or --out=evals/sheet-2 for a new sheet.`);
    process.exitCode = 1;
    return;
  }
  const d = await loadDigest(new Date());
  if (d.status !== "ok") {
    console.error(`digest unavailable (${d.status}); set DATABASE_URL`);
    process.exitCode = 1;
    return;
  }
  const real = d.items.filter((i) => !i.isDemo && /^https?:\/\//.test(i.url));
  const newest = (a: DigestItem, b: DigestItem) => new Date(b.date).getTime() - new Date(a.date).getTime();
  const byTier = (t: DigestItem["tier"]) => real.filter((i) => i.tier === t).sort(newest);
  const pools = { call: byTier("call_this_week"), watch: byTier("watch"), background: byTier("background") };
  // Up to 10 calls and 10 watch, background for the rest; top up from watch, then calls, if short.
  const take = { call: Math.min(10, pools.call.length), watch: Math.min(10, pools.watch.length), background: 0 };
  take.background = Math.min(Math.max(0, n - take.call - take.watch), pools.background.length);
  let spare = n - take.call - take.watch - take.background;
  const more = Math.min(spare, pools.watch.length - take.watch);
  take.watch += more;
  spare -= more;
  take.call += Math.min(spare, pools.call.length - take.call);
  const picked = [...pools.call.slice(0, take.call), ...pools.watch.slice(0, take.watch), ...pools.background.slice(0, take.background)].sort(newest);
  const sourceNames = new Map(DEFAULT_CONFIG.sources.map((s) => [s.id, s.name]));
  const TIER = { call_this_week: "call", watch: "watch", background: "background" } as const;

  const rows: SheetRow[] = picked.map((i) => ({
    item_id: String(i.itemId),
    date: new Date(i.date).toISOString().slice(0, 10),
    company: i.company ?? "",
    title: i.headline ?? i.title,
    url: i.url,
    source: sourceNames.get(i.source) ?? i.source,
    summary: (i.worthIt ?? i.whyItMatters ?? "").replace(/\s+/g, " ").slice(0, 400),
    system_tier: TIER[i.tier],
    system_call_type: i.tier === "call_this_week" ? callType(i.signalType) : "",
    system_reason: i.reason,
    label_tier: "",
    label_call_type: "",
    label_notes: "",
  }));
  writeFileSync(`${out}.csv`, toCsv(rows));
  writeFileSync(`${out}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), columns: SHEET_COLUMNS, rows }, null, 2) + "\n");
  const count = (t: string) => rows.filter((r) => r.system_tier === t).length;
  console.log(`wrote ${out}.csv and ${out}.json: ${rows.length} items (${count("call")} call, ${count("watch")} watch, ${count("background")} background)`);
  console.log("Fill label_tier (call / watch / background), label_call_type (open / warm, calls only) and label_notes, then run npm run eval.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
