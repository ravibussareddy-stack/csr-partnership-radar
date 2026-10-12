/**
 * News, media and platform names that must never be resolved as the company funding a CSR activity.
 * The classifier is told this too (prompt v5+), but a deterministic list is the reliable guard: one
 * missed item (e.g. "Sportskeeda" from a Google Alert) otherwise becomes a "call", an alert and a pitch kit.
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

const KEYS = new Set(PUBLISHERS.map((p) => norm(p)));

function norm(s: string): string {
  return s.toLowerCase().replace(/\.(com|in|org|net)\b/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isPublisher(name: string | null | undefined): boolean {
  if (!name) return false;
  const k = norm(name);
  return KEYS.has(k) || KEYS.has(k.replace(/^the /, "")) || KEYS.has(k.replace(/ (news|media|online|digital)$/, ""));
}
