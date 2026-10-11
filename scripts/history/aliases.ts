/**
 * npm run history:aliases — sets companies.aliases for the top ALIAS_TOP companies:
 * manual aliases (config/aliases.ts) + short names proposed by Gemini (batched).
 * An alias is rejected if it collides with another company's name, base name or alias,
 * or if it is a bare group name. Re-runnable; generated aliases are recomputed each run.
 */
import "../env";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { MANUAL_ALIASES } from "@/config/aliases";
import { baseKey, nameKey } from "@/lib/companies";
import { closeDb, getDb } from "@/lib/db/client";
import { companies, companyStats, signals } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { aliasResponseSchema, aliasSchema, buildAliasPrompt } from "@/prompts/aliases";

const TOP = Number(process.env.ALIAS_TOP ?? 300);
const BATCH = 60;
// Shared by many companies; never a valid alias on their own.
const GROUP_WORDS = new Set(["tata", "reliance", "adani", "birla", "aditya birla", "bajaj", "mahindra", "jindal", "godrej", "vedanta", "hdfc", "icici", "kotak", "hinduja", "murugappa", "tvs", "jsw", "essar", "wipro group"]);

async function main() {
  const db = await getDb();
  const t0 = Date.now();
  const top = await db
    .select({ id: companyStats.companyId })
    .from(companyStats)
    .orderBy(desc(companyStats.predictedTotalCr))
    .limit(TOP);
  const topFocus = await db.select({ id: companyStats.companyId }).from(companyStats).orderBy(desc(companyStats.predictedFocusCr)).limit(TOP);
  const inDigest = await db.select({ id: signals.companyId }).from(signals).where(isNotNull(signals.companyId));
  const ids = [...new Set([...top, ...topFocus, ...inDigest].map((r) => r.id!))];
  const targets = await db.select({ id: companies.id, name: companies.canonicalName }).from(companies).where(inArray(companies.id, ids));

  // Collision index over ALL companies: name keys and base keys.
  const owners = new Map<string, Set<number>>();
  const own = (k: string, id: number) => k && (owners.get(k) ?? owners.set(k, new Set()).get(k)!).add(id);
  for (const c of await db.select({ id: companies.id, key: companies.nameKey, base: companies.baseKey, name: companies.canonicalName }).from(companies)) {
    own(c.key ?? nameKey(c.name), c.id);
    own(c.base ?? baseKey(c.name), c.id);
  }

  // Manual aliases by name key.
  const manualByKey = new Map(Object.entries(MANUAL_ALIASES).map(([n, a]) => [nameKey(n), a]));
  const targetKeys = new Set(targets.map((t) => nameKey(t.name)));
  const unmatched = [...manualByKey.keys()].filter((k) => !targetKeys.has(k));
  if (unmatched.length) console.warn(`manual aliases with no matching target company: ${unmatched.join("; ")}`);

  // Generated aliases (Gemini, batched).
  const generated = new Map<number, string[]>();
  let pool: GeminiPool | null = null;
  try {
    pool = new GeminiPool(undefined, undefined, () => {});
  } catch (err) {
    console.warn(`no Gemini: manual aliases only (${(err as Error).message})`);
  }
  for (let i = 0; pool && i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    try {
      const res = await pool.generateJson(buildAliasPrompt(chunk.map((t, j) => ({ i: j, name: t.name }))), aliasResponseSchema);
      const v = aliasSchema.safeParse(JSON.parse(res.text));
      if (!v.success) continue;
      for (const r of v.data) if (chunk[r.i]) generated.set(chunk[r.i].id, r.aliases);
    } catch (err) {
      if (err instanceof GeminiError && err.kind !== "transient") {
        console.warn(`aliases: Gemini stopped (${err.kind}); continuing with what we have`);
        break;
      }
    }
  }

  // First pass: count how many target companies claim each alias key (ambiguity check).
  const claims = new Map<string, number>();
  const proposed = new Map<number, string[]>();
  for (const t of targets) {
    const manual = manualByKey.get(nameKey(t.name)) ?? [];
    const blocked = new Set(manual.filter((a) => a.startsWith("!")).map((a) => nameKey(a.slice(1))));
    const list = [...manual.filter((a) => !a.startsWith("!")), ...(generated.get(t.id) ?? [])];
    const seen = new Set<string>([nameKey(t.name), baseKey(t.name)]);
    const keep: string[] = [];
    for (const a of list) {
      const k = nameKey(a);
      if (k.length < 2 || seen.has(k) || blocked.has(k) || GROUP_WORDS.has(k)) continue;
      seen.add(k);
      keep.push(a.trim());
      claims.set(k, (claims.get(k) ?? 0) + 1);
    }
    proposed.set(t.id, keep);
  }

  let set = 0;
  let rejected = 0;
  for (const t of targets) {
    const isManual = new Set((manualByKey.get(nameKey(t.name)) ?? []).map(nameKey));
    const final = (proposed.get(t.id) ?? []).filter((a) => {
      const k = nameKey(a);
      if (isManual.has(k)) return true; // manual always wins
      const owner = owners.get(k) ?? owners.get(baseKey(a));
      const clash = (owner && ![...owner].every((id) => id === t.id)) || (claims.get(k) ?? 0) > 1;
      if (clash) rejected++;
      return !clash;
    });
    await db.update(companies).set({ aliases: final }).where(eq(companies.id, t.id));
    if (final.length) set++;
  }
  console.log(`aliases: ${set}/${targets.length} companies have aliases, ${rejected} rejected as ambiguous, in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
