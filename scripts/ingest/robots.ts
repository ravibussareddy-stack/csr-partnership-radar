import robotsParser from "robots-parser";

// TODO: replace the URL with the public GitHub repo once it exists.
export const USER_AGENT =
  "CSRPartnershipRadar/0.1 (+https://github.com/; weekly CSR digest for an education NGO)";
const BOT_TOKEN = "CSRPartnershipRadar";

type RobotsEntry = ReturnType<typeof robotsParser> | "deny-all" | "allow-all";

/**
 * Per-host politeness: robots.txt (cached per run) + a minimum interval between
 * requests to the same host (max of our default and the site's Crawl-delay).
 */
export class PoliteFetcher {
  private robots = new Map<string, RobotsEntry>();
  private lastHit = new Map<string, number>();

  constructor(private minIntervalMs = 2000, private timeoutMs = 20000) {}

  private async wait(host: string, extraDelayMs = 0) {
    const interval = Math.max(this.minIntervalMs, extraDelayMs);
    const last = this.lastHit.get(host) ?? 0;
    const delay = last + interval - Date.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    this.lastHit.set(host, Date.now());
  }

  private async rawGet(url: string): Promise<Response> {
    return fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "follow",
    });
  }

  private async loadRobots(origin: string, host: string): Promise<RobotsEntry> {
    if (this.robots.has(origin)) return this.robots.get(origin)!;
    await this.wait(host);
    let entry: RobotsEntry;
    try {
      const res = await this.rawGet(`${origin}/robots.txt`);
      if (res.ok) entry = robotsParser(`${origin}/robots.txt`, await res.text());
      // RFC 9309: 4xx means no restrictions; 5xx/unreachable means assume full disallow.
      else entry = res.status >= 500 ? "deny-all" : "allow-all";
    } catch {
      entry = "deny-all";
    }
    this.robots.set(origin, entry);
    return entry;
  }

  /** Returns null if robots.txt disallows the URL. Throws on HTTP errors. */
  async get(url: string): Promise<string | null> {
    const { origin, host } = new URL(url);
    const robots = await this.loadRobots(origin, host);
    if (robots === "deny-all") return null;
    let crawlDelayMs = 0;
    if (robots !== "allow-all") {
      if (robots.isAllowed(url, BOT_TOKEN) === false) return null;
      crawlDelayMs = (robots.getCrawlDelay(BOT_TOKEN) ?? 0) * 1000;
    }
    await this.wait(host, crawlDelayMs);
    const res = await this.rawGet(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
}
