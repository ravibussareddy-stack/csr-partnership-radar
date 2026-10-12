/**
 * Source checks for the data-quality audit: does a cited page actually mention the company or person
 * it is cited for? Google grounding sometimes attaches a source about a different company (e.g. a
 * MediaTek pitch line citing a Tata Elxsi page), which this catches.
 *   true  = the page text names it
 *   false = the page was read and does not name it (the citation is wrong)
 *   null  = the page could not be read (blocked, robots.txt, timeout): left as is
 */
import { visibleText } from "@/lib/joblinks";

const GENERIC = new Set(["india", "limited", "ltd", "private", "pvt", "foundation", "trust", "group", "company", "the", "and", "of", "technologies", "services", "industries", "enterprises", "corporation"]);

export function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !GENERIC.has(t));
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function pageMentions(url: string, names: string[], fetcher: { get(url: string): Promise<string | null> }): Promise<boolean | null> {
  // The company's own website counts (e.g. amns.in for "AM/NS India").
  let host = "";
  try {
    host = compact(new URL(url).hostname.replace(/^www\./, "").split(".")[0]);
  } catch {
    return null;
  }
  const short = names.map((n) => compact(n.replace(/\b(india|limited|ltd|private|pvt|foundation|group)\b/gi, ""))).filter((c) => c.length >= 3);
  if (host.length >= 3 && short.some((c) => c.startsWith(host) || host.startsWith(c))) return true;
  let html: string | null;
  try {
    html = await fetcher.get(url);
  } catch {
    return null;
  }
  if (!html) return null;
  const text = visibleText(html.slice(0, 600_000)).toLowerCase();
  if (text.length < 300) return null; // a script-only shell: can't judge
  const flat = compact(text);
  let judged = false;
  for (const n of names) {
    const t = nameTokens(n);
    if (t.length > 0) {
      judged = true;
      // All distinctive words of a short name, or most of a long one.
      const hits = t.filter((w) => text.includes(w)).length;
      if (hits >= Math.min(t.length, Math.max(1, Math.ceil(t.length * 0.6)))) return true;
    }
    // Names made of short parts ("AM/NS", "L&T", "BT"): match the joined form.
    const c = compact(n.replace(/\b(india|limited|ltd|private|pvt)\b/gi, ""));
    if (c.length >= 3) {
      judged = true;
      if (flat.includes(c)) return true;
    }
  }
  return judged ? false : null;
}
