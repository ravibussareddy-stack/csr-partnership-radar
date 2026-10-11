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
export async function fetchRssSource(src: SourceConfig, fetcher: PoliteFetcher): Promise<SourceResult> {
  try {
    const xml = await fetcher.get(src.url);
    if (xml === null) return { source: src.id, status: "robots_disallowed", items: [] };
    const feed = await parser.parseString(xml);
    const items: FetchedItem[] = [];
    for (const it of feed.items) {
      const link = it.link ?? it.guid;
      const title = stripHtml(it.title ?? "");
      if (!link || !title || !/^https?:/i.test(link)) continue;
      const rawBody =
        (it as { contentEncoded?: string }).contentEncoded ?? it.content ?? it.summary ?? it.contentSnippet ?? "";
      const body = truncate(stripHtml(rawBody), MAX_BODY);
      const date = it.isoDate ?? it.pubDate;
      const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date) : null;
      items.push({
        source: src.id,
        url: canonicalUrl(link),
        title,
        body,
        publishedAt,
        contentHash: contentHash(title, body),
      });
    }
    return { source: src.id, status: "ok", items };
  } catch (err) {
    return { source: src.id, status: "error", items: [], error: (err as Error).message };
  }
}
