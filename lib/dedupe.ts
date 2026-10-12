/**
 * Same-story grouping for the supporting pages (regulatory, company profile, hiring), matching the
 * digest's "one card per story" rule: headlines that share most of their distinctive words, close in
 * time, are one story. Words that every CSR / policy headline uses don't count as evidence.
 */
const STOP = new Set([
  "the", "and", "for", "with", "to", "of", "in", "on", "at", "by", "a", "an", "its", "from", "as", "is", "under",
  "csr", "india", "indian", "limited", "ltd", "pvt", "private", "foundation", "company", "companies",
  "launches", "launched", "launch", "releases", "released", "release", "unveils", "announces", "announced",
  "government", "ministry", "minister", "union", "new", "first", "ever", "2025", "2026", "2027",
]);

export function storyWords(title: string): Set<string> {
  return new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

export interface Match {
  /** distinctive words the two headlines must share */
  minCommon: number;
  /** share of the shorter headline's distinctive words */
  minShare: number;
}
/** Default: at least 3 distinctive words in common, covering half of the shorter headline. */
export const STRICT: Match = { minCommon: 3, minShare: 0.5 };

export function sameStory(a: string, b: string, m: Match = STRICT): boolean {
  const x = storyWords(a);
  const y = storyWords(b);
  const common = [...x].filter((w) => y.has(w)).length;
  return common >= m.minCommon && common / Math.max(1, Math.min(x.size, y.size)) >= m.minShare;
}

/** The same page under different tracking parameters (PIB adds &reg= / &lang=) is one URL. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const prid = u.searchParams.get("PRID");
    if (host.endsWith("pib.gov.in") && prid) return `pib:${prid}`;
    return `${host}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url;
  }
}

/**
 * Groups items into stories (first item of each group is kept as primary, so pass them in priority
 * order). An item joins a group when it matches any member within `days` of it.
 */
export function groupStories<T>(items: T[], title: (t: T) => string | string[], date: (t: T) => Date, days: number, m: Match = STRICT): { primary: T; copies: T[] }[] {
  const groups: { primary: T; copies: T[] }[] = [];
  const titles = (t: T) => [title(t)].flat().filter(Boolean);
  // Any headline version (AI headline or the original) matching counts.
  const near = (a: T, b: T) =>
    Math.abs(date(a).getTime() - date(b).getTime()) <= days * 86400_000 && titles(a).some((x) => titles(b).some((y) => sameStory(x, y, m)));
  for (const it of items) {
    const g = groups.find((g) => [g.primary, ...g.copies].some((o) => near(o, it)));
    if (g) g.copies.push(it);
    else groups.push({ primary: it, copies: [] });
  }
  return groups;
}
