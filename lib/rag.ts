/**
 * Retrieval for "Ask the Radar": collects what the Radar already holds about one article (the article,
 * its analysis, researched sources, the same company's other items, CSR headlines and portal spend,
 * the team's discussion) as numbered snippets, and ranks them against the question with BM25.
 * No embeddings model is needed; the answer is then written by Gemini Flash from these snippets only.
 */
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { archiveHeadlines, classifications, comments, companies, companyNews, companyStats, itemResearch, rawItems, signals, teamMembers } from "@/lib/db/schema";

export interface Snippet {
  kind: "article" | "analysis" | "research" | "company_data" | "company_item" | "headline" | "team";
  title: string;
  url: string | null;
  date: string | null;
  text: string;
}

const STOP = new Set(
  "the a an and or of to in on for with by at from as is are was were be been this that these those it its their they them what which who whom how when where why do does did can could should would will has have had any about into than then there here our we you your i me my more most much many such not no yes also just only over under per via".split(" "),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/₹/g, " rs ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => t.replace(/(ies)$/, "y").replace(/(?<=[a-z]{3})s$/, ""));
}

/** Splits long text into ~700-character passages on sentence boundaries. */
export function chunk(text: string, size = 700): string[] {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?।])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > size) {
      out.push(cur.trim());
      cur = "";
    }
    cur += `${s} `;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((c) => c.slice(0, size + 200));
}

/** BM25 over the snippets. The analysis and the article's first passage are always kept. */
export function rank(snippets: Snippet[], question: string, k = 14): Snippet[] {
  const q = [...new Set(tokens(question))];
  const docs = snippets.map((s) => tokens(`${s.title} ${s.text}`));
  const N = docs.length || 1;
  const avg = docs.reduce((a, d) => a + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const scored = snippets.map((s, i) => {
    const d = docs[i];
    let score = 0;
    for (const t of q) {
      const tf = d.filter((x) => x === t).length;
      if (!tf) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.length / avg)));
    }
    // The article itself is the most relevant context for any question about it.
    if (s.kind === "article" || s.kind === "analysis") score += 1.5;
    return { s, score, i };
  });
  const must = scored.filter((x) => x.s.kind === "analysis" || (x.s.kind === "article" && x.i === snippets.findIndex((y) => y.kind === "article")));
  const rest = scored.filter((x) => !must.includes(x) && x.score > 0).sort((a, b) => b.score - a.score);
  return [...must, ...rest].slice(0, k).map((x) => x.s);
}

const d10 = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function buildCorpus(db: DB, itemId: number, excludeCommentId?: number): Promise<{ snippets: Snippet[]; companyName: string | null }> {
  const [item] = await db.select().from(rawItems).where(eq(rawItems.id, itemId));
  if (!item) return { snippets: [], companyName: null };
  const out: Snippet[] = [];
  const date = d10(item.publishedAt ?? item.fetchedAt);
  for (const c of chunk(`${item.title}. ${item.body}`)) out.push({ kind: "article", title: item.title, url: item.url, date, text: c });

  const [cls] = await db.select().from(classifications).where(eq(classifications.contentHash, item.contentHash));
  const [sig] = await db.select({ companyId: signals.companyId, tier: signals.tier, reason: signals.reason }).from(signals).where(eq(signals.itemId, itemId));
  if (cls) {
    out.push({
      kind: "analysis",
      title: "Radar's analysis of this article",
      url: item.url,
      date,
      text: [
        cls.headline,
        cls.whyItMatters,
        cls.worthIt,
        ...cls.keyPoints,
        cls.companies.length ? `Companies: ${cls.companies.join(", ")}` : "",
        cls.partners.length ? `NGO partners: ${cls.partners.join(", ")}` : "",
        cls.geographies.length ? `Where: ${cls.geographies.join(", ")}` : "",
        cls.amountInrCrore ? `Amount: ₹${cls.amountInrCrore} crore${cls.financialYear ? ` (${cls.financialYear})` : ""}` : "",
        cls.programmeStartYear ? `Programme running since ${cls.programmeStartYear}` : "",
        ...cls.quotes.map((q) => `${q.speaker} (${q.role}) said: "${q.quote}"`),
        sig ? `Radar tier: ${sig.tier}. ${sig.reason}` : "",
      ].filter(Boolean).join(" · "),
    });
  }
  for (const r of await db.select().from(itemResearch).where(eq(itemResearch.itemId, itemId))) {
    out.push({ kind: "research", title: r.title, url: r.url, date: d10(r.publishedAt), text: r.summary ?? r.title });
  }

  let companyName: string | null = null;
  const companyId = sig?.companyId ?? null;
  if (companyId) {
    const [co] = await db.select({ name: companies.canonicalName }).from(companies).where(eq(companies.id, companyId));
    companyName = co?.name ?? null;
    const [st] = await db.select().from(companyStats).where(eq(companyStats.companyId, companyId));
    if (st) {
      const t = st.data.timing;
      out.push({
        kind: "company_data",
        title: `${companyName}: National CSR Portal spend and forecast`,
        url: null,
        date: st.lastFy ? `FY${st.lastFy}` : null,
        text: `${companyName} reported CSR spend in FY${st.lastFy}-${String((st.lastFy ?? 0) + 1).slice(2)}: ₹${st.totalLastCr.toFixed(1)} crore in total, ₹${st.focusLastCr.toFixed(1)} crore on education, skilling and livelihoods, ₹${st.maharashtraFocusLastCr.toFixed(1)} crore of that in Maharashtra and ₹${st.puneLastCr.toFixed(1)} crore in Pune district. Active ${st.yearsActive} years. Forecast next year ₹${st.predictedTotalCr.toFixed(1)} crore (₹${st.predictedFocusCr.toFixed(1)} crore in focus sectors).${t?.window ? ` Usual CSR announcement window: ${t.window}.` : ""}`,
      });
    }
    const others = await db
      .select({ id: rawItems.id, title: rawItems.title, url: rawItems.url, at: rawItems.publishedAt, why: classifications.whyItMatters, headline: classifications.headline, kp: classifications.keyPoints })
      .from(signals)
      .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
      .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
      .where(and(eq(signals.companyId, companyId), ne(rawItems.id, itemId), gte(rawItems.fetchedAt, new Date(Date.now() - 400 * 86400_000))))
      .orderBy(desc(rawItems.publishedAt))
      .limit(15);
    for (const o of others) out.push({ kind: "company_item", title: o.headline ?? o.title, url: o.url, date: d10(o.at), text: [o.why, ...(o.kp ?? [])].filter(Boolean).join(" · ") || o.title });
    const news = await db.select().from(companyNews).where(eq(companyNews.companyId, companyId)).orderBy(desc(companyNews.publishedAt)).limit(40);
    const seen = new Set(out.map((s) => s.url));
    for (const n of news) if (!seen.has(n.url)) { seen.add(n.url); out.push({ kind: "headline", title: n.title, url: n.url, date: d10(n.publishedAt), text: `${n.title}${n.kind ? ` (${n.kind.replace(/_/g, " ")}${n.sector ? `, ${n.sector}` : ""})` : ""}` }); }
    const arch = await db.select().from(archiveHeadlines).where(eq(archiveHeadlines.companyId, companyId)).orderBy(desc(archiveHeadlines.publishedAt)).limit(30);
    for (const a of arch) if (!seen.has(a.url)) { seen.add(a.url); out.push({ kind: "headline", title: a.title, url: a.url, date: d10(a.publishedAt), text: a.title }); }
  }

  const thread = await db
    .select({ id: comments.id, body: comments.body, kind: comments.kind, name: teamMembers.name, at: comments.createdAt })
    .from(comments)
    .leftJoin(teamMembers, eq(teamMembers.id, comments.memberId))
    .where(and(eq(comments.itemId, itemId), excludeCommentId ? sql`${comments.id} <> ${excludeCommentId}` : sql`true`));
  for (const t of thread.filter((x) => x.kind === "comment")) out.push({ kind: "team", title: `Team comment by ${t.name ?? "a teammate"}`, url: null, date: d10(t.at), text: t.body });
  return { snippets: out, companyName };
}
