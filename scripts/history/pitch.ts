/**
 * npm run pitch — pitch kits for the companies Ananya is most likely to contact (Call / Watch items in
 * the last 14 days, and her current relationships): what the company wants from CSR, recent news, and
 * published proof metrics. One Gemini + Google Search call per company; a line is kept only if a
 * grounding source supports it (its link is stored), so no metric is unsourced. Refreshed every 30 days.
 */
import "../env";
import { and, desc, gte, inArray, isNotNull } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { companies, pitchKits, relationships, signals, type PitchKit } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { isPublisher } from "@/lib/publishers";
import { pageMentions } from "@/lib/verify";
import { PoliteFetcher } from "../ingest/robots";
import { buildPitchPrompt, PITCH_PROMPT_VERSION } from "@/prompts/pitch";
import { parseGrounded, resolveRedirect } from "../ingest/search";

const MAX = Number(process.env.PITCH_MAX ?? 12);
const REFRESH_DAYS = 30;

async function main() {
  const db = await getDb();
  const recent = await db
    .selectDistinct({ id: signals.companyId, score: signals.score })
    .from(signals)
    .where(and(isNotNull(signals.companyId), inArray(signals.tier, ["call_this_week", "watch"]), gte(signals.updatedAt, new Date(Date.now() - 14 * 86400_000))))
    .orderBy(desc(signals.score));
  const rels = await db.select({ id: relationships.companyId }).from(relationships).where(isNotNull(relationships.companyId));
  const ids = [...new Set([...rels.map((r) => r.id!), ...recent.map((r) => r.id!)])];
  const existing = ids.length ? await db.select({ id: pitchKits.companyId, at: pitchKits.createdAt }).from(pitchKits).where(inArray(pitchKits.companyId, ids)) : [];
  const fresh = new Set(existing.filter((e) => Date.now() - e.at.getTime() < REFRESH_DAYS * 86400_000).map((e) => e.id));
  const todo = ids.filter((id) => !fresh.has(id)).slice(0, MAX);
  if (todo.length === 0) return console.log("pitch: all kits fresh");
  const rows = await db.select({ id: companies.id, name: companies.canonicalName, aliases: companies.aliases }).from(companies).where(inArray(companies.id, todo));
  const names = new Map(rows.map((c) => [c.id, c.name]));
  const aliasesOf = new Map(rows.map((c) => [c.id, c.aliases ?? []]));
  const pool = new GeminiPool(undefined, undefined, () => {});
  const fetcher = new PoliteFetcher(1200);
  let made = 0;
  for (const id of todo) {
    const name = names.get(id);
    if (!name || isPublisher(name)) continue;
    let res;
    try {
      res = await pool.generateGrounded(buildPitchPrompt(name, new Date()));
    } catch (err) {
      if (err instanceof GeminiError && err.kind !== "transient") break;
      continue;
    }
    const kit: PitchKit = { wants: [], recentNews: [], proof: [] };
    for (const { line, chunkUris } of parseGrounded(res.text, res.grounding)) {
      if (chunkUris.length === 0) continue; // unsourced: dropped
      const parts = line.split("||").map((p) => p.trim());
      const url = await resolveRedirect(chunkUris[0]);
      if (!url) continue;
      // The cited page must name the company (grounding sometimes attaches a page about someone else).
      if ((await pageMentions(url, [name, ...(aliasesOf.get(id) ?? [])], fetcher)) === false) continue;
      if (parts[0] === "WANTS" && parts[1]) kit.wants.push({ text: parts[1], url });
      else if (parts[0] === "NEWS" && parts[2]) kit.recentNews.push({ text: parts[2], url, date: /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : null });
      else if (parts[0] === "PROOF" && parts[1] && /\d/.test(parts[1])) kit.proof.push({ text: parts[1], url }); // proof must contain a number
    }
    kit.wants = kit.wants.slice(0, 4);
    kit.recentNews = kit.recentNews.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 4);
    kit.proof = kit.proof.slice(0, 4);
    kit.auditedAt = new Date().toISOString();
    if (!kit.wants.length && !kit.recentNews.length && !kit.proof.length) continue;
    await db
      .insert(pitchKits)
      .values({ companyId: id, data: kit, model: `${res.model}@${PITCH_PROMPT_VERSION}` })
      .onConflictDoUpdate({ target: pitchKits.companyId, set: { data: kit, model: `${res.model}@${PITCH_PROMPT_VERSION}`, createdAt: new Date() } });
    made++;
    console.log(`pitch: ${name}: ${kit.wants.length} wants, ${kit.recentNews.length} news, ${kit.proof.length} proof`);
  }
  console.log(`pitch: ${made} kits written`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
