/**
 * npm run regulatory — the highlight summary on top of the Regulatory page (and the Summary page):
 * one Gemini call over the policy items of the last 120 days. Each highlight cites the items it is
 * based on (ids validated) and keeps the weakest status they support. Stored in model_metrics.
 */
import "../env";

import { closeDb, getDb } from "@/lib/db/client";
import { modelMetrics } from "@/lib/db/schema";
import { GeminiPool } from "@/lib/gemini";
import { loadRegulatory, type RegulatorySummary } from "@/lib/regulatory";
import { truncate } from "@/lib/text";
import { buildRegulatoryPrompt, REGULATORY_PROMPT_VERSION, regulatoryResponseSchema, regulatorySchema } from "@/prompts/regulatory";

async function main() {
  const db = await getDb();
  const { items, summary } = await loadRegulatory(120);
  if (items.length === 0) {
    console.log("regulatory: no policy items yet");
    return;
  }
  const recent = items.slice(0, 40);
  const fingerprint = recent.map((i) => `${i.itemId}:${i.status}`).join(",");
  if (summary && (summary as RegulatorySummary & { fingerprint?: string }).fingerprint === fingerprint) {
    console.log("regulatory: no new policy items; summary unchanged");
    return;
  }
  const pool = new GeminiPool(undefined, undefined, () => {});
  const res = await pool.generateJson(
    buildRegulatoryPrompt(
      recent.map((i) => ({
        id: i.itemId,
        date: i.date.slice(0, 10),
        status: i.status,
        official: i.official,
        title: i.title,
        text: truncate([i.summary, ...i.keyPoints, ...i.quotes.map((q) => `${q.speaker} (${q.role}): "${q.quote}"`)].filter(Boolean).join(" · "), 900),
      })),
    ),
    regulatoryResponseSchema,
  );
  const v = regulatorySchema.safeParse(JSON.parse(res.text));
  if (!v.success) {
    console.warn("regulatory: invalid summary; keeping the previous one");
    return;
  }
  const ids = new Set(recent.map((i) => i.itemId));
  const rank = { inferred: 0, confirmed: 1, executed: 2 } as const;
  const statusOf = new Map(recent.map((i) => [i.itemId, i.status]));
  const highlights = v.data.highlights
    .map((h) => {
      const itemIds = h.item_ids.filter((id) => ids.has(id));
      // Never stronger than the strongest cited item says.
      const max = Math.max(...itemIds.map((id) => rank[statusOf.get(id)!]));
      const status = rank[h.status] > max ? (Object.keys(rank) as (keyof typeof rank)[])[max] : h.status;
      return { text: h.text, status, itemIds };
    })
    .filter((h) => h.itemIds.length > 0);
  const data: RegulatorySummary & { fingerprint: string; model: string } = {
    overview: v.data.overview,
    highlights,
    watchNext: v.data.watch_next,
    computedAt: new Date().toISOString(),
    items: recent.length,
    fingerprint,
    model: `${res.model}@${REGULATORY_PROMPT_VERSION}`,
  };
  await db.insert(modelMetrics).values({ key: "regulatory-summary", data }).onConflictDoUpdate({ target: modelMetrics.key, set: { data, updatedAt: new Date() } });
  console.log(`regulatory: summary of ${recent.length} items, ${highlights.length} highlights`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
