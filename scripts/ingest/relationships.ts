/**
 * npm run relationships — the relationship watch. For each of Ananya's existing funders:
 *  - Deterministic checks (arithmetic on known data, no AI): renewal date vs the company's usual CSR
 *    announcement window; National CSR Portal spend trend (focus sectors, Pune, Maharashtra); new
 *    CSR hiring at the company.
 *  - Gemini Flash judges whether new company news and new regulatory items affect THIS contract,
 *    with a level (risk / watch / opportunity), the impact and the reasoning. Each item-relationship
 *    pair is read once (relationship_checks). An "inferred" (not yet official) rule is capped at Watch.
 * Runs daily in ingest.yml, and for newly added relationships in the 10-minute intake run.
 */
import "../env";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { closeDb, getDb, type DB } from "@/lib/db/client";
import { classifications, companies, companyStats, rawItems, relationshipAlerts, relationshipChecks, relationships, signals } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { truncate } from "@/lib/text";
import { buildRelImpactPrompt, RELATIONSHIP_PROMPT_VERSION, relImpactResponseSchema, relImpactSchema } from "@/prompts/relationships";

type Rel = typeof relationships.$inferSelect;
type AlertIn = Omit<typeof relationshipAlerts.$inferInsert, "relationshipId">;

const DAY = 86400_000;
const fmt = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const cr = (n: number) => `₹${n >= 10 ? n.toFixed(0) : n.toFixed(1)} cr`;

export async function runRelationshipWatch(db: DB, opts: { onlyNew?: boolean } = {}) {
  const rels = await db.select().from(relationships).where(opts.onlyNew ? isNull(relationships.lastCheckedAt) : sql`true`);
  if (rels.length === 0) return { relationships: 0, alerts: 0 };
  let pool: GeminiPool | null = null;
  try {
    pool = new GeminiPool(undefined, undefined, () => {});
  } catch {
    console.warn("relationships: Gemini not configured; deterministic checks only");
  }
  let alerts = 0;
  for (const rel of rels) {
    const out: AlertIn[] = [...(await deterministic(db, rel)), ...(pool ? await assessed(db, pool, rel) : [])];
    for (const a of out) {
      // Calculated alerts (renewal, spend) refresh their wording each run as dates and data move;
      // AI-assessed and hiring alerts keep their first text.
      const recalc = a.kind === "renewal" || a.kind === "spend_change";
      const q = db.insert(relationshipAlerts).values({ ...a, relationshipId: rel.id });
      const r = recalc
        ? await q.onConflictDoUpdate({ target: [relationshipAlerts.relationshipId, relationshipAlerts.key], set: { title: a.title, impact: a.impact, reasoning: a.reasoning, level: a.level } }).returning({ id: relationshipAlerts.id, at: relationshipAlerts.createdAt })
        : await q.onConflictDoNothing().returning({ id: relationshipAlerts.id, at: relationshipAlerts.createdAt });
      alerts += r.filter((x) => Date.now() - x.at.getTime() < 60_000).length;
    }
    await db.update(relationships).set({ lastCheckedAt: new Date() }).where(eq(relationships.id, rel.id));
  }
  console.log(`relationships: ${rels.length} checked, ${alerts} new alerts`);
  return { relationships: rels.length, alerts };
}

async function deterministic(db: DB, rel: Rel): Promise<AlertIn[]> {
  const out: AlertIn[] = [];
  const [st] = rel.companyId ? await db.select().from(companyStats).where(eq(companyStats.companyId, rel.companyId)) : [];

  // 1. Renewal vs the company's announcement cycle.
  if (rel.renewalDate && rel.status !== "lapsed") {
    const days = Math.round((new Date(rel.renewalDate).getTime() - Date.now()) / DAY);
    if (days <= 180 && days >= -60) {
      const bucket = days < 0 ? "past" : days <= 60 ? "60" : "180";
      const t = st?.data.timing;
      // nextWindowStart is the current window's start while inside it (see lib/history/predict.ts).
      const winStart = t?.nextWindowStart ? new Date(t.nextWindowStart).getTime() : null;
      const windowOpen = winStart != null && winStart <= Date.now() && Date.now() < winStart + 92 * DAY;
      const own = t?.basis === "company";
      const windowText = !t?.window || winStart == null
        ? ""
        : own
          ? ` Their CSR announcements cluster in ${t.window} (in ${t.recurrence.yearsHit.length} of ${t.recurrence.activeYears.length} active years; ${t.strength} cycle)${windowOpen ? ", and that window is open now, so next-cycle decisions are being made now" : `, next opening ${fmt(t.nextWindowStart!)}`}.`
          : ` The company has too few dated announcements for its own cycle; across companies the busiest window is ${t.window}.`;
      const deadline = Math.min(new Date(rel.renewalDate).getTime() - 90 * DAY, ...(winStart != null && !windowOpen ? [winStart - 30 * DAY] : []));
      const startNow = windowOpen || deadline <= Date.now();
      const startBy = startNow ? "now" : `by ${fmt(new Date(deadline).toISOString())}`;
      out.push({
        key: `renewal:${rel.renewalDate}:${bucket}`,
        kind: "renewal",
        level: days <= 60 ? "risk" : "watch",
        title: days < 0 ? `Renewal date passed ${-days} days ago` : `Renewal due in ${days} days (${fmt(rel.renewalDate)})`,
        impact: days < 0 ? "Confirm whether the contract was renewed; update its status here so the Radar stops flagging it." : `Start the renewal conversation ${startBy}, with the latest outcomes and a proposal for the next cycle.`,
        reasoning: `Renewal is ${days < 0 ? "overdue" : `${days} days away`}, ${days <= 60 ? "inside the 60-day risk zone where budgets are usually already committed" : "within the 6-month planning horizon"}.${windowText} Companies decide next-cycle partners before they announce, so the talk should start 30 days before the window opens or 90 days before renewal, whichever is earlier${startNow ? "; both points have passed or the window is open, hence now" : ""}.`,
      });
    }
  }

  // 2. Spend trend from the National CSR Portal (last two reported years).
  const by = st?.data.byYear ?? [];
  const last = by.at(-1);
  const prev = by.at(-2);
  if (last && prev) {
    const fyl = `FY${last.fy}-${String(last.fy + 1).slice(2)}`;
    const checks: [string, number, number, number][] = [
      ["focus-sector (education, skilling, livelihoods)", last.focus, prev.focus, 0.5],
      ["Pune district", last.pune, prev.pune, 0.2],
      ["Maharashtra", last.maharashtra, prev.maharashtra, 0.5],
    ];
    for (const [label, now, before, min] of checks) {
      if (before < min && now < min) continue;
      const change = before > 0 ? (now - before) / before : 1;
      if (Math.abs(change) < 0.25) continue;
      const down = change < 0;
      out.push({
        key: `spend:${last.fy}:${label.split(" ")[0]}`,
        kind: "spend_change",
        level: down ? "risk" : "opportunity",
        title: `${label[0].toUpperCase()}${label.slice(1)} CSR spend ${down ? "fell" : "rose"} ${Math.abs(Math.round(change * 100))}% in ${fyl}`,
        impact: down
          ? "Less money in this area can mean smaller renewals or fewer partners. Bring outcome evidence and cost-per-learner figures to the next conversation, and ask about their plans early."
          : "More money in this area: a good moment to propose expanding the programme (more learners, a new centre or district).",
        reasoning: `National CSR Portal: ${label} spend ${cr(before)} in FY${prev.fy}-${String(prev.fy + 1).slice(2)} → ${cr(now)} in ${fyl} (${down ? "" : "+"}${Math.round(change * 100)}%). A change of 25% or more is flagged; smaller moves are normal year-to-year noise.${st?.data.prediction ? ` The Radar's forecast for next year is ${cr(st.data.prediction.focus.mid)} in focus sectors (range ${cr(st.data.prediction.focus.low)}–${cr(st.data.prediction.focus.high)}).` : ""}`,
      });
    }
  }

  // 3. CSR hiring at the company (a new CSR head or manager often reviews the partner portfolio).
  if (rel.companyId) {
    const hires = await db
      .select({ id: rawItems.id, title: rawItems.title, url: rawItems.url, at: rawItems.publishedAt })
      .from(signals)
      .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
      .where(and(eq(signals.companyId, rel.companyId), eq(signals.signalType, "csr_hiring"), gte(rawItems.fetchedAt, new Date(Date.now() - 45 * DAY))));
    for (const h of hires) {
      out.push({
        key: `item:${h.id}`,
        kind: "hiring",
        level: "watch",
        title: `Hiring for CSR: ${truncate(h.title, 90)}`,
        impact: "A new CSR hire usually reviews existing partners in their first months. Introduce your programme and results to them early.",
        reasoning: "The company posted a CSR / foundation role in the last 45 days. New programme owners commonly re-tender or consolidate partners, which is both a risk to an existing contract and a chance to expand it, so it is Watch rather than Risk.",
        sourceUrl: h.url,
        itemId: h.id,
      });
    }
  }
  return out;
}

async function assessed(db: DB, pool: GeminiPool, rel: Rel): Promise<AlertIn[]> {
  const since = new Date(Date.now() - 45 * DAY);
  const checked = db.select({ id: relationshipChecks.itemId }).from(relationshipChecks).where(eq(relationshipChecks.relationshipId, rel.id));
  // Company news: items tied to this company, or naming it, in the last 45 days (hiring handled above).
  const companyMatch = rel.companyId
    ? eq(signals.companyId, rel.companyId)
    : sql`exists (select 1 from unnest(${classifications.companies}) c where lower(c) like ${`%${rel.companyName.toLowerCase().split(" ")[0]}%`})`;
  const news = await db
    .select({ id: rawItems.id, title: rawItems.title, url: rawItems.url, at: rawItems.publishedAt, fetched: rawItems.fetchedAt, headline: classifications.headline, why: classifications.whyItMatters, kp: classifications.keyPoints })
    .from(signals)
    .innerJoin(rawItems, eq(rawItems.id, signals.itemId))
    .leftJoin(classifications, eq(classifications.contentHash, rawItems.contentHash))
    .where(and(companyMatch, sql`${signals.signalType} <> 'csr_hiring'`, gte(rawItems.fetchedAt, since), sql`${rawItems.id} not in (${checked})`))
    .orderBy(desc(rawItems.fetchedAt))
    .limit(10);
  const regs = await db
    .select({ id: rawItems.id, title: rawItems.title, url: rawItems.url, at: rawItems.publishedAt, fetched: rawItems.fetchedAt, headline: classifications.headline, why: classifications.whyItMatters, kp: classifications.keyPoints, status: classifications.policyStatus })
    .from(classifications)
    .innerJoin(rawItems, eq(rawItems.contentHash, classifications.contentHash))
    .where(and(eq(classifications.signalType, "policy_change"), eq(classifications.isSignal, true), gte(rawItems.fetchedAt, new Date(Date.now() - 60 * DAY)), sql`${rawItems.id} not in (${checked})`))
    .orderBy(desc(rawItems.fetchedAt))
    .limit(8);
  const items = [
    ...news.map((n) => ({ id: n.id, kind: "company_news" as const, date: (n.at ?? n.fetched).toISOString().slice(0, 10), title: n.headline ?? n.title, text: truncate([n.why, ...(n.kp ?? [])].filter(Boolean).join(" · "), 700), url: n.url })),
    ...regs.map((r) => ({ id: r.id, kind: "regulatory" as const, date: (r.at ?? r.fetched).toISOString().slice(0, 10), title: r.headline ?? r.title, text: truncate([r.why, ...(r.kp ?? [])].filter(Boolean).join(" · "), 700), status: r.status, url: r.url })),
  ];
  if (items.length === 0) return [];
  const [co] = rel.companyId ? await db.select({ name: companies.canonicalName }).from(companies).where(eq(companies.id, rel.companyId)) : [];
  const relText = [
    `Funder: ${rel.companyName}${co ? ` (CSR Portal name: ${co.name})` : ""}`,
    rel.programme ? `Programme: ${rel.programme}` : "",
    rel.sectors.length ? `Sectors: ${rel.sectors.join(", ")}` : "",
    rel.districts.length ? `Where: ${rel.districts.join(", ")}` : "",
    rel.valueLakh ? `Contract value: ₹${rel.valueLakh} lakh` : "",
    rel.startDate ? `Started: ${rel.startDate}` : "",
    rel.renewalDate ? `Renewal: ${rel.renewalDate}` : "",
    `Status: ${rel.status}`,
  ].filter(Boolean).join("\n");
  let res;
  try {
    res = await pool.generateJson(buildRelImpactPrompt(relText, items), relImpactResponseSchema);
  } catch (err) {
    if (err instanceof GeminiError) console.warn(`relationships: Gemini failed for ${rel.companyName} (${err.kind})`);
    return [];
  }
  const v = relImpactSchema.safeParse(JSON.parse(res.text));
  if (!v.success) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: AlertIn[] = [];
  const seen = new Set<number>();
  for (const a of v.data) {
    const it = byId.get(a.id);
    if (!it || seen.has(a.id)) continue;
    seen.add(a.id);
    await db.insert(relationshipChecks).values({ relationshipId: rel.id, itemId: a.id, relevant: a.relevant }).onConflictDoNothing();
    if (!a.relevant) continue;
    // A rule that is not official yet can't be a certain risk or opportunity.
    const capped = it.kind === "regulatory" && (it.status ?? "inferred") === "inferred" && a.level !== "watch";
    out.push({
      key: `item:${a.id}`,
      kind: it.kind,
      level: capped ? "watch" : a.level,
      title: a.title || it.title,
      impact: a.impact,
      reasoning: capped ? `${a.reasoning} (Shown as Watch, not ${a.level === "risk" ? "Risk" : "Opportunity"}, because this rule change is inferred, not yet official.)` : a.reasoning,
      sourceUrl: it.url,
      itemId: a.id,
      model: `${res.model}@${RELATIONSHIP_PROMPT_VERSION}`,
    });
  }
  // Items Gemini skipped are still marked as read so they are not sent again.
  for (const i of items) if (!seen.has(i.id)) await db.insert(relationshipChecks).values({ relationshipId: rel.id, itemId: i.id, relevant: false }).onConflictDoNothing();
  return out;
}

if (process.argv[1]?.endsWith("relationships.ts")) {
  getDb()
    .then((db) => runRelationshipWatch(db))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(closeDb);
}

