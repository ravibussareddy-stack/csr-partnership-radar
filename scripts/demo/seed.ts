/**
 * npm run demo:seed — clearly labelled demo items so the Personal messages and LinkedIn views can be
 * shown with 10-20 items each before real ones arrive. Every item is built from a REAL recent CSR
 * article the Radar already found (its link is kept), is stored with is_demo = true, carries a
 * "Demo" badge in the app, and can be hidden with "Hide demo" or removed with npm run demo:clear.
 * No people, quotes or facts are invented: the text only restates the article's own headline and
 * summary. They then go through the normal pipeline (pre-filter → classify → score).
 */
import "../env";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { classifications, companies, rawItems, signals } from "@/lib/db/schema";
import { contentHash } from "@/lib/hash";

const MESSAGES = 15;
const LINKEDIN = 12;

const MSG_TEMPLATES: { channel: string; text: (h: string, s: string, url: string) => string }[] = [
  { channel: "whatsapp", text: (h, s, url) => `Fwd from an NGO network group: ${h}. ${s} Worth a call? ${url}` },
  { channel: "whatsapp", text: (h, s, url) => `Saw this today, could fit our skilling work: ${h}\n${url}` },
  { channel: "telegram", text: (h, s, url) => `CSR update shared in the funders channel: ${h}. ${s} ${url}` },
  { channel: "sms", text: (h, _s, url) => `FYI ${h} ${url}` },
  { channel: "email", text: (h, s, url) => `Hi, forwarding this in case it is useful for your partnerships pipeline.\n\n${h}\n${s}\n\nLink: ${url}` },
  { channel: "linkedin", text: (h, s, url) => `(LinkedIn message) Thought of your organisation when I read this: ${h}. ${s} ${url}` },
];

async function main() {
  const db = await getDb();
  const rows = await db
    .select({
      id: rawItems.id,
      url: rawItems.url,
      title: rawItems.title,
      headline: classifications.headline,
      why: classifications.whyItMatters,
      company: companies.canonicalName,
      at: rawItems.publishedAt,
    })
    .from(signals)
    .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
    .innerJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
    .leftJoin(companies, eq(companies.id, signals.companyId))
    .where(and(eq(rawItems.isDemo, false), isNotNull(signals.companyId), sql`${rawItems.url} like 'http%'`, gte(rawItems.fetchedAt, new Date(Date.now() - 30 * 86400_000))))
    .orderBy(desc(signals.score))
    .limit(80);
  // One item per company, so the demo views show variety.
  const seen = new Set<string>();
  const picks = rows.filter((r) => r.company && !seen.has(r.company) && (seen.add(r.company), true));
  if (picks.length < 10) console.warn(`demo: only ${picks.length} distinct recent companies available`);
  let msgs = 0;
  let posts = 0;
  for (const [k, r] of picks.slice(0, MESSAGES).entries()) {
    const t = MSG_TEMPLATES[k % MSG_TEMPLATES.length];
    const text = `[Demo] ${t.text(r.headline ?? r.title, r.why ?? "", r.url)}`;
    const hash = contentHash(text.slice(0, 120), text);
    const out = await db
      .insert(rawItems)
      .values({ source: "pasted", channel: t.channel, url: `paste:demo-${hash.slice(0, 26)}`, title: text.split("\n")[0].slice(0, 140), body: text, publishedAt: r.at ?? new Date(), contentHash: hash, isDemo: true })
      .onConflictDoNothing({ target: rawItems.url })
      .returning({ id: rawItems.id });
    msgs += out.length;
  }
  for (const r of [...picks.slice(MESSAGES), ...picks.slice(0, MESSAGES)].slice(0, LINKEDIN)) {
    const title = `[Demo] LinkedIn alert: ${r.headline ?? r.title}`.slice(0, 160);
    const body = `Demo sample of a LinkedIn notification email, built from public news (not a real LinkedIn post). ${r.why ?? ""} Source article: ${r.url}`;
    const out = await db
      .insert(rawItems)
      .values({ source: "linkedin-demo", url: `${r.url}#demo-linkedin`, title, body, publishedAt: r.at ?? new Date(), contentHash: contentHash(title, body), isDemo: true })
      .onConflictDoNothing({ target: rawItems.url })
      .returning({ id: rawItems.id });
    posts += out.length;
  }
  console.log(`demo: ${msgs} personal messages and ${posts} LinkedIn samples added (labelled Demo). Run npm run ingest -- --no-fetch to classify them.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
