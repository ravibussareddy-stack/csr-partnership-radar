const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Drops tracking params and fragments so the same article maps to one URL. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|from$)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw.trim();
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive whole-word/phrase matches. Returns the keywords that matched. */
export function matchKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter((kw) => {
    // Short all-caps acronyms (CSR, ITI, MCA) match case-sensitively to avoid noise.
    const caseSensitive = kw.length <= 4 && kw === kw.toUpperCase() && /[A-Z]/.test(kw);
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(kw)}($|[^\\p{L}\\p{N}])`, caseSensitive ? "u" : "iu");
    return re.test(text);
  });
}
