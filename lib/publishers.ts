/**
 * News, media and platform names that must not be resolved as the company funding a CSR activity
 * when they are only the outlet that reported it. The classifier is told this too (prompt v5+), but a
 * deterministic guard is the reliable one: one missed item (e.g. "Sportskeeda" named on its own
 * article) otherwise becomes a "call", an alert and a pitch kit.
 *
 * A publisher can also be a genuine funder ("Sportskeeda sets up a STEM lab" reported by India CSR),
 * so the guard applies only when the name is the outlet that reported the item: the item's URL host
 * or its source matches the name. Wire agencies and aggregators never fund, so they always count.
 */
const PUBLISHERS = [
  "sportskeeda", "times of india", "the times of india", "hindustan times", "economic times", "the economic times", "et now",
  "business standard", "mint", "livemint", "the hindu", "hindu businessline", "the hindu businessline", "indian express",
  "the indian express", "financial express", "ndtv", "news18", "india today", "zee news", "republic", "deccan herald",
  "deccan chronicle", "dna", "outlook", "the print", "theprint", "scroll", "the wire", "firstpost", "moneycontrol", "yourstory",
  "inc42", "the better india", "the logical indian", "pti", "press trust of india", "ani", "ians", "business wire", "pr newswire",
  "india csr", "indiacsr", "the csr journal", "csr journal", "csr times", "csr mandate", "csr universe", "the csr universe",
  "lokmat", "loksatta", "maharashtra times", "sakal", "pudhari", "dainik bhaskar", "amar ujala", "dainik jagran",
  "youtube", "instagram", "facebook", "linkedin", "twitter", "x", "google", "google news", "google alerts", "msn", "yahoo",
];

/** Wire agencies and aggregators: credited in the text of other outlets' stories, never a funder. */
const ALWAYS = ["pti", "press trust of india", "ani", "ians", "business wire", "pr newswire", "google news", "google alerts"];

const KEYS = new Set(PUBLISHERS.map((p) => norm(p)));
const ALWAYS_KEYS = new Set(ALWAYS.map((p) => norm(p)));

function norm(s: string): string {
  return s.toLowerCase().replace(/\.(com|in|org|net)\b/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function key(name: string): string | null {
  const k = norm(name);
  for (const v of [k, k.replace(/^the /, ""), k.replace(/ (news|media|online|digital)$/, "")]) if (KEYS.has(v)) return v;
  return null;
}

/** The name is a known news outlet, wire or platform (whatever its role in the item). */
export function isPublisher(name: string | null | undefined): boolean {
  return Boolean(name && key(name));
}

export interface ReportedBy {
  /** the item's URL (the outlet's own article, for feeds, alerts and searches) */
  url?: string | null;
  /** source id and display name from config (e.g. "indiacsr", "India CSR") */
  source?: string | null;
  sourceName?: string | null;
}

const compact = (s: string) => norm(s).replace(/ /g, "").replace(/^the/, "");

/**
 * True when the name is a publisher AND it is the outlet that reported this item (or a wire /
 * aggregator), so it must not be treated as the funder. A publisher named in someone else's
 * article as funding something is a real funder. The channel an item arrived through (Google
 * Alerts, a LinkedIn email) is not its outlet: only the article's host or a feed source counts.
 */
export function isReportingOutlet(name: string | null | undefined, by: ReportedBy): boolean {
  const k = name ? key(name) : null;
  if (!k) return false;
  if (ALWAYS_KEYS.has(k)) return true;
  const c = compact(k);
  let host = "";
  try {
    host = by.url && /^https?:\/\//.test(by.url) ? new URL(by.url).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  // Short names ("x", "dna", "mint") must equal a host label; longer ones may sit inside one
  // ("timesofindia.indiatimes.com", "thehindubusinessline.com").
  const labels = host.split(".").filter((l) => l && l !== "www");
  if (labels.some((l) => l === c || (c.length >= 5 && l.includes(c)) || l === `live${c}`)) return true;
  return [by.source, by.sourceName].some((s) => s != null && s !== "" && compact(s) === c);
}
