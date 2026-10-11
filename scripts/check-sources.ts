/**
 * npm run sources:check [-- <feed-url> ...]
 * Verifies feeds before relying on them: robots.txt, reachability, item count,
 * freshness, and how many items in the last 7 days pass the pre-filter.
 * With no URLs, checks every source in config/defaults.ts.
 */
import "./env";
import { DEFAULT_CONFIG, type SourceConfig } from "@/config/defaults";
import { prefilter } from "@/lib/prefilter";
import { PoliteFetcher } from "./ingest/robots";
import { fetchRssSource } from "./ingest/rss";

async function main() {
  const urls = process.argv.slice(2).filter((a) => /^https?:/.test(a));
  const pages = Number(process.argv.find((a) => a.startsWith("--pages="))?.slice(8) ?? 1);
  const csrFocused = process.argv.includes("--csr-focused");
  const sources: SourceConfig[] = urls.length
    ? urls.map((url, i) => ({ id: `candidate-${i + 1}`, name: url, url, type: "rss", weight: 0, csrFocused, enabled: true, pages }))
    : DEFAULT_CONFIG.sources.filter((s) => s.type === "rss");

  const fetcher = new PoliteFetcher();
  const weekAgo = Date.now() - 7 * 86400_000;
  for (const src of sources) {
    const res = await fetchRssSource(src, fetcher);
    if (res.status !== "ok") {
      console.log(`✗ ${src.id}  ${res.status}${res.error ? ` (${res.error})` : ""}  ${src.url}`);
      continue;
    }
    const dated = res.items.filter((i) => i.publishedAt);
    const newest = dated.length ? new Date(Math.max(...dated.map((i) => i.publishedAt!.getTime()))) : null;
    const recent = res.items.filter((i) => (i.publishedAt?.getTime() ?? Date.now()) >= weekAgo);
    const passing = recent.filter((i) => prefilter(i, src, DEFAULT_CONFIG).passed);
    console.log(
      `✓ ${src.id}  items ${res.items.length}, last 7d ${recent.length}, pass prefilter ${passing.length}, newest ${newest?.toISOString().slice(0, 10) ?? "?"}  ${src.url}`,
    );
    for (const p of passing.slice(0, 4)) console.log(`     · ${p.title.slice(0, 100)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
