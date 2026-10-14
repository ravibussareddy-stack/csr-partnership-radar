/**
 * Research step for personal and forwarded items (pasted messages, intake-inbox forwards, LinkedIn):
 * once classified as a signal, Gemini with Google Search grounding looks for public sources that
 * corroborate or add detail (official page, press release, news). Sources must come from grounding
 * metadata; each item is researched once (raw_items.researched_at).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { classifications, itemResearch, rawItems } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { canonicalUrl } from "@/lib/text";
import { parseGrounded, resolveRedirect } from "./search";

const RESEARCH_SOURCES = ["pasted", "email-intake", "linkedin-email"];
const MAX_PER_RUN = Number(process.env.RESEARCH_MAX_PER_RUN ?? 15);

function researchPrompt(title: string, company: string, why: string): string {
  return `Search Google for public, recent sources (official company pages, press releases, news) about this CSR lead from India:
Company: ${company || "unknown"}
Lead: ${title}
Context: ${why}

List up to 3 sources that confirm it or add useful detail (programme name, budget, partners, location, contact route), one per line, exactly:
TITLE || PUBLISHER || YYYY-MM-DD || one-sentence summary of what this source adds

If you find nothing relevant, reply with exactly: NONE`;
}

/** `deadline` (epoch ms): stop starting new lookups after it; the rest are researched next run. */
export async function runResearch(db: DB, deadline = Infinity): Promise<{ researched: number; sources: number; status: string }> {
  const todo = await db
    .select({ id: rawItems.id, title: rawItems.title, companies: classifications.companies, why: classifications.whyItMatters })
    .from(rawItems)
    .innerJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
    .where(and(inArray(rawItems.source, RESEARCH_SOURCES), eq(classifications.isSignal, true), isNull(rawItems.researchedAt)))
    .limit(MAX_PER_RUN);
  if (todo.length === 0) return { researched: 0, sources: 0, status: "nothing to research" };
  let pool: GeminiPool;
  try {
    pool = new GeminiPool(undefined, undefined, () => {});
  } catch (err) {
    return { researched: 0, sources: 0, status: `no Gemini (${(err as Error).message})` };
  }
  let researched = 0;
  let sources = 0;
  for (const it of todo) {
    if (Date.now() >= deadline) return { researched, sources, status: `time budget reached, ${todo.length - researched} left for the next run` };
    try {
      const res = await pool.generateGrounded(researchPrompt(it.title, it.companies.join(", "), it.why));
      if (res.text.trim() !== "NONE") {
        for (const { line, chunkUris } of parseGrounded(res.text, res.grounding)) {
          if (!chunkUris.length) continue;
          const [title, publisher, date, ...rest] = line.split("||").map((p) => p.trim());
          const url = await resolveRedirect(chunkUris[0]);
          if (!title || !url) continue;
          const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
          const out = await db
            .insert(itemResearch)
            .values({ itemId: it.id, url: canonicalUrl(url), title, publisher: publisher || null, publishedAt: d, summary: rest.join(" ").trim() || null })
            .onConflictDoNothing()
            .returning({ id: itemResearch.id });
          sources += out.length;
        }
      }
      await db.update(rawItems).set({ researchedAt: new Date() }).where(eq(rawItems.id, it.id));
      researched++;
    } catch (err) {
      if (err instanceof GeminiError && err.kind !== "transient") return { researched, sources, status: `stopped (${err.kind})` };
    }
  }
  return { researched, sources, status: "ok" };
}
