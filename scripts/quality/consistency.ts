/**
 * End-to-end consistency checks on the live digest (npm run test:consistency; also part of the daily
 * audit). Each check states a rule the digest must satisfy and lists any violations:
 *  1. A Call agrees with its own analysis (recommended action = reach out now).
 *  2. A location bonus matches a place the analysis extracted (no bonus from stray text).
 *  3. A Call names a real funder (not "no company", not a news publisher).
 *  4. A Call has an NGO partner route (works with NGOs, or an open partner call).
 *  5. A Call outside Pune/Maharashtra is backed by the company's CSR spend in Maharashtra.
 *  6. One card per story: no two Calls for the same company within 3 days.
 *  7. Every company link resolves (directly or via a merge redirect).
 */
import "../env";
import { inArray, sql } from "drizzle-orm";
import { closeDb, getDb, type DB } from "@/lib/db/client";
import { companies, modelMetrics } from "@/lib/db/schema";
import { loadDigest } from "@/lib/digest";
import { isPublisher } from "@/lib/publishers";

export interface ConsistencyCheck {
  id: string;
  rule: string;
  checked: number;
  violations: string[];
}

export async function runConsistency(db: DB): Promise<ConsistencyCheck[]> {
  const d = await loadDigest(new Date());
  if (d.status !== "ok") return [];
  const items = d.items.filter((i) => !i.isDemo);
  const calls = items.filter((i) => i.tier === "call_this_week");
  const actions = await db.execute(sql`select r.id, c.recommended_action a from raw_items r join classifications c on c.content_hash = r.content_hash where r.id in (${sql.join(items.map((i) => sql`${i.itemId}`).concat(sql`0`), sql`, `)})`);
  const actionOf = new Map((((actions as { rows?: unknown[] }).rows ?? (actions as unknown as unknown[])) as { id: number; a: string | null }[]).map((r) => [r.id, r.a]));
  const mh = await db.execute(sql`select company_id from company_stats where (data->'byYear'->-1->>'maharashtra')::float > 0 or pune_last_cr > 0`);
  const inMh = new Set((((mh as { rows?: unknown[] }).rows ?? (mh as unknown as unknown[])) as { company_id: number }[]).map((r) => r.company_id));
  const label = (i: { company: string | null; title: string }) => `${i.company ?? "?"}: ${(i.title).slice(0, 70)}`;
  const isPlace = (g: string, re: RegExp) => re.test(g);
  const PUNE = /pune|pimpri|chinchwad|pcmc|hinjewadi|chakan/i;
  const MH = /maharashtra|mumbai|thane|nashik|nagpur|aurangabad|sambhajinagar|kolhapur|satara|solapur|navi mumbai|raigad|palghar|ratnagiri|amravati|latur|nanded|ahmednagar|ahilyanagar|pune/i;
  const national = (g: string) => /^(india|pan[- ]india|nationwide|national|across india|all india|multiple states)$/i.test(g.trim());

  const out: ConsistencyCheck[] = [];
  out.push({
    id: "action",
    rule: "A Call agrees with its own analysis (recommended action is reach out now)",
    checked: calls.length,
    violations: calls.filter((c) => { const a = actionOf.get(c.itemId); return a != null && a !== "reach_out_now"; }).map((c) => `${label(c)} (analysis says ${actionOf.get(c.itemId)})`),
  });
  out.push({
    id: "geo_bonus",
    rule: "A location bonus matches a place the analysis extracted",
    checked: items.length,
    violations: items
      .filter((i) => i.classified && ((/ Pune \+\d+/.test(` ${i.reason}`) && !i.geographies.some((g) => isPlace(g, PUNE))) || (/ Maharashtra \+\d+/.test(` ${i.reason}`) && !i.geographies.some((g) => isPlace(g, MH)))))
      .map((i) => `${label(i)} (places: ${i.geographies.join(", ") || "none"})`),
  });
  out.push({
    id: "funder",
    rule: "A Call names a real funder (not missing, not a news publisher)",
    checked: calls.length,
    violations: calls.filter((c) => !c.companyId || isPublisher(c.company)).map(label),
  });
  out.push({
    id: "route",
    rule: "A Call has an NGO partner route (works with NGOs, or an open partner call)",
    checked: calls.length,
    violations: calls.filter((c) => c.activelyPartnering !== "yes" && c.signalType !== "partner_search").map(label),
  });
  out.push({
    id: "region",
    rule: "A Call outside Pune/Maharashtra is backed by the company's CSR spend in Maharashtra",
    checked: calls.length,
    violations: calls
      .filter((c) => c.geographies.length > 0 && !c.geographies.some((g) => isPlace(g, MH)) && !c.geographies.some(national) && !(c.companyId && inMh.has(c.companyId)))
      .map((c) => `${label(c)} (${c.geographies.join(", ")})`),
  });
  const dupes: string[] = [];
  calls.forEach((a, k) => calls.slice(k + 1).forEach((b) => {
    if (a.companyId && a.companyId === b.companyId && Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) <= 3 * 86400_000) dupes.push(`${a.company}: “${a.title.slice(0, 50)}” and “${b.title.slice(0, 50)}”`);
  }));
  out.push({ id: "duplicates", rule: "One card per story (no two Calls for the same company within 3 days)", checked: calls.length, violations: dupes });
  const ids = [...new Set(items.map((i) => i.companyId).filter((x): x is number => x != null))];
  const found = ids.length ? new Set((await db.select({ id: companies.id }).from(companies).where(inArray(companies.id, ids))).map((r) => r.id)) : new Set<number>();
  const [redir] = await db.select().from(modelMetrics).where(sql`${modelMetrics.key} = 'company-redirects'`);
  const redirects = (redir?.data ?? {}) as Record<string, number>;
  out.push({
    id: "links",
    rule: "Every company link resolves",
    checked: ids.length,
    violations: ids.filter((id) => !found.has(id) && !redirects[String(id)]).map((id) => `company ${id}`),
  });
  return out;
}

if (process.argv[1]?.endsWith("consistency.ts")) {
  (async () => {
    const db = await getDb();
    const res = await runConsistency(db);
    let bad = 0;
    for (const c of res) {
      bad += c.violations.length;
      console.log(`${c.violations.length ? "FAIL" : "PASS"}  ${c.rule} (${c.checked} checked${c.violations.length ? `, ${c.violations.length} violations` : ""})`);
      for (const v of c.violations.slice(0, 8)) console.log(`        - ${v}`);
    }
    console.log(bad ? `\n${bad} violation(s)` : "\nAll consistency checks passed.");
    process.exitCode = bad ? 1 : 0;
    await closeDb();
  })();
}
