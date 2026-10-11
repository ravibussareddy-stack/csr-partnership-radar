import Parser from "rss-parser";
import type { SourceConfig } from "@/config/defaults";
import { contentHash } from "@/lib/hash";
import { canonicalUrl, stripHtml, truncate } from "@/lib/text";
import type { PoliteFetcher } from "./robots";

export interface FetchedItem {
  source: string;
  url: string;
  title: string;
  body: string;
  publishedAt: Date | null;
  contentHash: string;
}

export type SourceResult =
  | { source: string; status: "ok"; items: FetchedItem[] }
  | { source: string; status: "robots_disallowed" | "error"; items: []; error?: string };

const parser = new Parser({ customFields: { item: [["content:encoded", "contentEncoded"]] } });
const MAX_BODY = 4000;

/** Generic RSS/Atom adapter. Uses only what the feed publishes (no article scraping). */
function pageUrl(base: string, page: number): string {
  if (page === 1) return base;
  const u = new URL(base);
  u.searchParams.set("paged", String(page));
  return u.toString();
}

export async function fetchRssSource(src: SourceConfig, fetcher: PoliteFetcher): Promise<SourceResult> {
  const items: FetchedItem[] = [];
  const seen = new Set<string>();
  const pages = Math.max(1, Math.min(src.pages ?? 1, 10));
  try {
    for (let page = 1; page <= pages; page++) {
      let xml: string | null;
      try {
        xml = await fetcher.get(pageUrl(src.url, page));
      } catch (err) {
        // Page 1 failing is a source error; a later page failing (e.g. 404 past the end) just stops paging.
        if (page === 1) throw err;
        break;
      }
      if (xml === null) {
        if (page === 1) return { source: src.id, status: "robots_disallowed", items: [] };
        break;
      }
      const before = items.length;
      parseInto(await parser.parseString(xml), src, items, seen);
      if (items.length === before) break; // no new items: past the end
    }
    return { source: src.id, status: "ok", items };
  } catch (err) {
    return { source: src.id, status: "error", items: [], error: (err as Error).message };
  }
}

function parseInto(
  feed: Awaited<ReturnType<typeof parser.parseString>>,
  src: SourceConfig,
  items: FetchedItem[],
  seen: Set<string>,
): void {
  for (const it of feed.items) {
    const link = it.link ?? it.guid;
    const title = stripHtml(it.title ?? "");
    if (!link || !title || !/^https?:/i.test(link)) continue;
    const url = canonicalUrl(link);
    if (seen.has(url)) continue;
    seen.add(url);
    const rawBody =
      (it as { contentEncoded?: string }).contentEncoded ?? it.content ?? it.summary ?? it.contentSnippet ?? "";
    const body = truncate(stripHtml(rawBody), MAX_BODY);
    const date = it.isoDate ?? it.pubDate;
    const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date) : null;
    items.push({ source: src.id, url, title, body, publishedAt, contentHash: contentHash(title, body) });
  }
}
