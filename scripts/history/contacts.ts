/**
 * npm run contacts — Community builder: extracts publicly named professionals (CSR heads, foundation
 * leads, post authors, hiring managers) from recent signal items, 12 items per Gemini call. Each item
 * is scanned once (contact_scans). Then a grounded Google search per priority company (recent signals and
 * the biggest Pune / Maharashtra CSR spenders) finds who publicly leads CSR there; a person is kept only
 * when a grounding source backs the line. Stores name, title, company and the public source link only.
 */
import "../env";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { baseKey, nameKey } from "@/lib/companies";
import { closeDb, getDb } from "@/lib/db/client";
import { contactScans, contacts, csrSpend, companies, modelMetrics, rawItems, signals } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { loadCompanyIndex } from "@/lib/resolve";
import { truncate } from "@/lib/text";
import { buildContactsPrompt, buildPeopleSearchPrompt, contactsResponseSchema, contactsSchema } from "@/prompts/contacts";
import { parseGrounded, resolveRedirect } from "../ingest/search";

const BATCH = 12;
const MAX_ITEMS = Number(process.env.CONTACTS_MAX_ITEMS ?? 120);
const DAYS = Number(process.env.CONTACTS_DAYS ?? 45);
const PEOPLE_COMPANIES = Number(process.env.CONTACTS_PEOPLE_COMPANIES ?? 10);
const PEOPLE_REFRESH_DAYS = 60;
const KINDS = new Set(["spokesperson", "author", "manager", "hiring_manager"]);

async function main() {
  const db = await getDb();
  const since = new Date(Date.now() - DAYS * 86400_000);
  const todo = await db
    .select({ id: rawItems.id, title: rawItems.title, body: rawItems.body, url: rawItems.url, isDemo: rawItems.isDemo })
    .from(rawItems)
    .innerJoin(signals, eq(signals.itemId, rawItems.id))
    .leftJoin(contactScans, eq(contactScans.itemId, rawItems.id))
    .where(and(isNull(contactScans.itemId), gte(rawItems.fetchedAt, since)))
    .orderBy(sql`${rawItems.id} desc`)
    .limit(MAX_ITEMS);
  const pool = new GeminiPool(undefined, undefined, () => {});
  const idx = await loadCompanyIndex(db);
  let added = 0;
  for (let k = 0; k < todo.length; k += BATCH) {
    const chunk = todo.slice(k, k + BATCH);
    let people: ReturnType<typeof contactsSchema.parse> = [];
    try {
      const res = await pool.generateJson(
        buildContactsPrompt(chunk.map((c, i) => ({ i, title: c.title, body: truncate(c.body.replace(/\s+/g, " "), 1500) }))),
        contactsResponseSchema,
      );
      const v = contactsSchema.safeParse(JSON.parse(res.text));
      if (v.success) people = v.data;
    } catch (err) {
      if (err instanceof GeminiError && err.kind !== "transient") {
        console.warn(`contacts: stopped (${err.kind})`);
        break;
      }
      continue;
    }
    const foundBy = new Map<number, number>();
    for (const p of people) {
      const item = chunk[p.i];
      if (!item || !/\s/.test(p.name) || /@|\d{5,}/.test(p.name + p.title)) continue; // full names only; no contact details
      const companyId = p.company ? (idx.byKey.get(nameKey(p.company)) ?? idx.byBase.get(baseKey(p.company)) ?? null) : null;
      const out = await db
        .insert(contacts)
        .values({
          name: p.name,
          nameKey: nameKey(p.name),
          title: p.title || null,
          companyName: p.company || null,
          companyKey: p.company ? baseKey(p.company) : "",
          companyId,
          kind: p.kind,
          sourceUrl: item.url,
          sourceTitle: item.title,
          context: p.context || null,
          isDemo: item.isDemo,
        })
        .onConflictDoNothing()
        .returning({ id: contacts.id });
      added += out.length;
      foundBy.set(item.id, (foundBy.get(item.id) ?? 0) + out.length);
    }
    for (const c of chunk) await db.insert(contactScans).values({ itemId: c.id, found: foundBy.get(c.id) ?? 0 }).onConflictDoNothing();
  }
  console.log(`contacts: scanned ${todo.length} items, ${added} new people`);
  await searchPeople(db, pool);
}

/** Grounded people search for priority companies, each re-searched at most every 60 days. */
async function searchPeople(db: Awaited<ReturnType<typeof getDb>>, pool: GeminiPool) {
  const [state] = await db.select().from(modelMetrics).where(eq(modelMetrics.key, "people-search"));
  const done = (state?.data ?? {}) as Record<string, string>;
  const fresh = (id: number) => done[id] && Date.now() - new Date(done[id]).getTime() < PEOPLE_REFRESH_DAYS * 86400_000;
  const recent = await db
    .selectDistinct({ id: companies.id, name: companies.canonicalName })
    .from(signals)
    .innerJoin(companies, eq(companies.id, signals.companyId))
    .where(gte(signals.createdAt, new Date(Date.now() - 30 * 86400_000)));
  const [{ fy }] = await db.select({ fy: sql<number>`max(${csrSpend.fyStart})` }).from(csrSpend);
  const spenders = await db
    .select({ id: companies.id, name: companies.canonicalName, cr: sql<number>`sum(${csrSpend.amountCr})` })
    .from(csrSpend)
    .innerJoin(companies, eq(companies.id, csrSpend.companyId))
    .where(and(eq(csrSpend.fyStart, fy ?? 0), sql`(${csrSpend.district} ilike 'pune%' or ${csrSpend.state} ilike 'maharashtra%')`))
    .groupBy(companies.id, companies.canonicalName)
    .orderBy(sql`sum(${csrSpend.amountCr}) desc`)
    .limit(40);
  const seen = new Set<number>();
  const queue = [...recent, ...spenders].filter((c) => !seen.has(c.id) && (seen.add(c.id), true) && !fresh(c.id)).slice(0, PEOPLE_COMPANIES);
  let added = 0;
  for (const c of queue) {
    let res;
    try {
      res = await pool.generateGrounded(buildPeopleSearchPrompt(c.name));
    } catch (err) {
      if (err instanceof GeminiError && err.kind !== "transient") break;
      continue;
    }
    for (const { line, chunkUris } of parseGrounded(res.text, res.grounding)) {
      const [name, title, org, kind, why] = line.split("||").map((x) => x.trim());
      if (!name || !/\s/.test(name) || name.length > 80 || /@|\d{5,}/.test(line) || chunkUris.length === 0) continue; // sourced lines only
      const url = (await resolveRedirect(chunkUris[0])) ?? null;
      if (!url) continue;
      const out = await db
        .insert(contacts)
        .values({
          name,
          nameKey: nameKey(name),
          title: title?.slice(0, 120) || null,
          companyName: org || c.name,
          companyKey: baseKey(org || c.name),
          companyId: c.id,
          kind: (KINDS.has(kind) ? kind : "manager") as "manager",
          sourceUrl: url,
          sourceTitle: `Google search: ${c.name} CSR leadership`,
          context: why?.slice(0, 300) || null,
        })
        .onConflictDoNothing()
        .returning({ id: contacts.id });
      added += out.length;
    }
    done[c.id] = new Date().toISOString();
  }
  await db
    .insert(modelMetrics)
    .values({ key: "people-search", data: done })
    .onConflictDoUpdate({ target: modelMetrics.key, set: { data: done, updatedAt: new Date() } });
  console.log(`contacts: people search for ${queue.length} companies, ${added} new people`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
