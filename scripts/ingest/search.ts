/**
 * Saved Google searches (config.searches), run with Gemini's Google Search grounding.
 * Each listed item must be backed by a grounding source; its redirect URL is resolved to the
 * real article URL. Items become raw_items (source "gemini-search") and go through the same
 * pre-filter → classify → score pipeline. Google's Search Suggestions HTML is kept per run
 * (search_runs) so the digest can display it, as the grounding terms require.
 */
import type { AppConfig } from "@/config/defaults";
import type { DB } from "@/lib/db/client";
import { rawItems, searchRuns } from "@/lib/db/schema";
import { GeminiError, GeminiPool, type GroundingMetadata } from "@/lib/gemini";
import { contentHash } from "@/lib/hash";
import { canonicalUrl, truncate } from "@/lib/text";
import { buildJobsSearchPrompt, buildSearchPrompt, JOBS_WINDOW_DAYS, SEARCH_PROMPT_VERSION, SEARCH_WINDOW_DAYS } from "@/prompts/search";

interface Found {
  title: string;
  publisher: string;
  date: Date | null;
  summary: string;
  url: string;
}

/** grounding-api-redirect → the publisher's URL (one HEAD request, no page download). */
export async function resolveRedirect(uri: string): Promise<string | null> {
  try {
    const res = await fetch(uri, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(15000) });
    const loc = res.headers.get("location");
    return loc && /^https?:/i.test(loc) ? loc : res.ok ? uri : null;
  } catch {
    return null;
  }
}

export function parseGrounded(text: string, g: GroundingMetadata | null): { line: string; chunkUris: string[] }[] {
  const chunks = g?.groundingChunks ?? [];
  const supports = g?.groundingSupports ?? [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("||"))
    .map((line) => {
      // A support backs this line if its segment text overlaps the line.
      const idx = new Set<number>();
      for (const s of supports) {
        const seg = s.segment?.text?.trim();
        if (seg && (line.includes(seg.slice(0, 60)) || seg.includes(line.slice(0, 60)))) {
          for (const i of s.groundingChunkIndices ?? []) idx.add(i);
        }
      }
      return { line, chunkUris: [...idx].map((i) => chunks[i]?.web?.uri).filter((u): u is string => Boolean(u)) };
    });
}

export async function runSearches(db: DB, cfg: AppConfig, now = new Date()) {
  const searches = cfg.searches.filter((s) => s.enabled);
  if (searches.length === 0) return { runs: 0, found: 0, inserted: 0 };
  let pool: GeminiPool;
  try {
    pool = new GeminiPool(undefined, undefined, () => {});
  } catch (err) {
    console.warn(`search: Gemini not configured (${(err as Error).message}); skipping`);
    return { runs: 0, found: 0, inserted: 0 };
  }
  const minNews = new Date(now.getTime() - (SEARCH_WINDOW_DAYS + 2) * 86400_000);
  const minJobs = new Date(now.getTime() - (JOBS_WINDOW_DAYS + 2) * 86400_000);
  let found = 0;
  let inserted = 0;
  let runs = 0;
  for (const s of searches) {
    let res;
    try {
      res = await pool.generateGrounded(s.kind === "jobs" ? buildJobsSearchPrompt(s.query, now) : buildSearchPrompt(s.query, now));
    } catch (err) {
      const stop = err instanceof GeminiError && err.kind !== "transient";
      console.warn(`search ${s.id}: failed (${(err as Error).message})${stop ? "; stopping searches for this run" : ""}`);
      if (stop) break;
      continue;
    }
    runs++;
    const items: Found[] = [];
    if (res.text.trim() !== "NONE") {
      for (const { line, chunkUris } of parseGrounded(res.text, res.grounding)) {
        if (chunkUris.length === 0) continue; // unsupported by a source: drop
        const [title, publisher, date, ...rest] = line.split("||").map((p) => p.trim());
        const url = await resolveRedirect(chunkUris[0]);
        if (!title || !url) continue;
        const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
        if (d && d < (s.kind === "jobs" ? minJobs : minNews)) continue; // outside the window
        items.push({ title, publisher: publisher ?? "", date: d, summary: rest.join(" ").trim(), url: canonicalUrl(url) });
      }
    }
    let fresh = 0;
    for (const it of items) {
      const body = truncate(`${s.kind === "jobs" ? "Job posting: " : ""}${it.summary}${it.publisher ? ` (${it.publisher})` : ""}`, 1000);
      const out = await db
        .insert(rawItems)
        .values({ source: s.kind === "jobs" ? "gemini-jobs" : "gemini-search", url: it.url, title: it.title, body, publishedAt: it.date, contentHash: contentHash(it.title, body) })
        .onConflictDoNothing({ target: rawItems.url })
        .returning({ id: rawItems.id });
      fresh += out.length;
    }
    await db.insert(searchRuns).values({
      searchId: s.id,
      query: s.query,
      ranAt: now,
      webQueries: res.grounding?.webSearchQueries ?? [],
      itemsFound: items.length,
      itemsNew: fresh,
      entryPointHtml: res.grounding?.searchEntryPoint?.renderedContent ?? null,
      keyLabel: res.keyLabel,
      model: `${res.model}@${SEARCH_PROMPT_VERSION}`,
    });
    found += items.length;
    inserted += fresh;
    console.log(`search ${s.id}: ${items.length} sourced items, ${fresh} new (key=${res.keyLabel})`);
  }
  return { runs, found, inserted };
}
