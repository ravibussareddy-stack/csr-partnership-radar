/**
 * npm run team:tasks — team work queued from the web app, run by the 10-minute intake workflow
 * (never inside Vercel):
 *  1. Sector setup: a sector added in the app gets keywords (English/Hindi/Marathi), a National CSR
 *     Portal mapping and two saved Google searches, then is marked ready.
 *  2. Questions: "Ask the Radar" questions on an article are answered by retrieval (RAG) from what
 *     the Radar already holds about that article (lib/rag.ts), Gemini Flash writing only from the
 *     retrieved, numbered snippets and citing them. Questions marked "also search the web" use
 *     Gemini + Google Search grounding instead; sources come only from grounding metadata.
 *  3. Dashboard feedback the lead confirmed: Gemini triages it into a safe settings change (applied
 *     here, from a fixed list of operations with bounds) or a developer / designer request (emailed
 *     to NOTIFY_TO with a "[CSR Radar] Dev request" / "Design request" subject).
 *  4. Relationships added in the app get their first relationship-watch check right away.
 */
import "../env";
import nodemailer from "nodemailer";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import { loadConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";
import {
  activity,
  classifications,
  comments,
  companies,
  companyNews,
  companyStats,
  config,
  csrSpend,
  dashboardFeedback,
  itemResearch,
  rawItems,
  signals,
  teamMembers,
} from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { truncate } from "@/lib/text";
import { buildCorpus, rank } from "@/lib/rag";
import {
  buildAnswerPrompt,
  buildRagAnswerPrompt,
  ragAnswerResponseSchema,
  ragAnswerSchema,
  buildSectorSetupPrompt,
  buildTriagePrompt,
  sectorSetupResponseSchema,
  sectorSetupSchema,
  TEAM_PROMPT_VERSION,
  triageResponseSchema,
  triageSchema,
} from "@/prompts/team";
import { runRelationshipWatch } from "./relationships";
import { resolveRedirect } from "./search";

type DB = Awaited<ReturnType<typeof getDb>>;

async function main() {
  const db = await getDb();
  let pool: GeminiPool;
  try {
    pool = new GeminiPool(undefined, undefined, () => {});
  } catch (err) {
    console.warn(`team: Gemini not configured (${(err as Error).message})`);
    return;
  }
  const newRelationships = async (d: DB) => {
    await runRelationshipWatch(d, { onlyNew: true });
  };
  for (const [name, fn] of [["sectors", setupSectors], ["answers", answerQuestions], ["feedback", triageFeedback], ["relationships", newRelationships]] as const) {
    try {
      await fn(db, pool);
    } catch (err) {
      console.warn(`team ${name}: failed (${(err as Error).message})`);
    }
  }
}

// ---------- 1. sector setup ----------

async function setupSectors(db: DB, pool: GeminiPool) {
  const [row] = await db.select().from(config).where(eq(config.id, 1));
  const pending = row?.sectors.filter((s) => s.status === "pending") ?? [];
  if (!row || pending.length === 0) return;
  const portal = (await db.selectDistinct({ s: csrSpend.sector }).from(csrSpend)).map((r) => r.s.toLowerCase());
  const sectors = [...row.sectors];
  const searches = [...(row.searches ?? [])];
  for (const s of pending) {
    const res = await pool.generateJson(buildSectorSetupPrompt(s.label, s.description ?? "", s.keywords, portal), sectorSetupResponseSchema);
    const v = sectorSetupSchema.safeParse(JSON.parse(res.text));
    if (!v.success) continue;
    const keywords = [...new Set([...s.keywords, ...v.data.keywords.map((k) => k.toLowerCase())])].slice(0, 40);
    const portalSectors = v.data.portal_sectors.map((p) => p.toLowerCase()).filter((p) => portal.includes(p));
    sectors[sectors.findIndex((x) => x.id === s.id)] = { ...s, keywords, portalSectors, status: "ready" };
    v.data.searches.slice(0, 2).forEach((query, k) => searches.push({ id: `sector-${s.id}-${k + 1}`, query, enabled: true, kind: "news", sectorId: s.id }));
    console.log(`team sectors: ${s.label} ready (${keywords.length} keywords, portal: ${portalSectors.join(", ") || "none"})`);
  }
  await db.update(config).set({ sectors, searches, updatedAt: new Date() }).where(eq(config.id, 1));
}

// ---------- 2. answers ----------

async function answerQuestions(db: DB, pool: GeminiPool) {
  const open = await db.select().from(comments).where(and(eq(comments.kind, "question"), eq(comments.status, "open"))).orderBy(asc(comments.createdAt)).limit(10);
  let answered = 0;
  for (const q of open) {
    if (q.scope !== "web") {
      const r = await answerFromSources(db, pool, q);
      if (r === "stop") break;
      if (r) answered++;
      continue;
    }
    const [item] = await db
      .select({ title: rawItems.title, body: rawItems.body, url: rawItems.url, publishedAt: rawItems.publishedAt, contentHash: rawItems.contentHash })
      .from(rawItems)
      .where(eq(rawItems.id, q.itemId));
    if (!item) continue;
    const [cls] = await db.select().from(classifications).where(eq(classifications.contentHash, item.contentHash));
    const [sig] = await db.select({ companyId: signals.companyId, tier: signals.tier, reason: signals.reason }).from(signals).where(eq(signals.itemId, q.itemId));
    const research = await db.select({ title: itemResearch.title, url: itemResearch.url, summary: itemResearch.summary }).from(itemResearch).where(eq(itemResearch.itemId, q.itemId));
    const company = sig?.companyId ? await companyContext(db, sig.companyId) : "no company identified";
    const thread = await db
      .select({ body: comments.body, kind: comments.kind, name: teamMembers.name })
      .from(comments)
      .leftJoin(teamMembers, eq(teamMembers.id, comments.memberId))
      .where(and(eq(comments.itemId, q.itemId), sql`${comments.id} <> ${q.id}`))
      .orderBy(asc(comments.createdAt));
    const [asker] = q.memberId ? await db.select({ name: teamMembers.name }).from(teamMembers).where(eq(teamMembers.id, q.memberId)) : [];
    const analysis = cls
      ? [
          cls.headline,
          cls.whyItMatters,
          cls.worthIt,
          cls.keyPoints.join(" / "),
          cls.partners.length ? `NGO partners: ${cls.partners.join(", ")}` : "",
          sig ? `Tier: ${sig.tier} (${sig.reason})` : "",
          research.map((r) => `${r.title}: ${r.summary ?? ""} (${r.url})`).join(" | "),
        ].filter(Boolean).join("\n")
      : "not analysed";
    let res;
    try {
      res = await pool.generateGrounded(
        buildAnswerPrompt({
          question: q.body,
          asker: asker?.name ?? "A teammate",
          article: { title: item.title, body: truncate(item.body, 4000), url: item.url, date: item.publishedAt?.toISOString().slice(0, 10) ?? null },
          analysis,
          company,
          thread: thread.slice(-8).map((t) => `${t.kind === "answer" ? "Radar" : (t.name ?? "Teammate")}: ${truncate(t.body, 400)}`).join("\n"),
        }),
      );
    } catch (err) {
      if (err instanceof GeminiError && err.kind !== "transient") {
        console.warn(`team answers: stopped (${err.kind})`);
        break;
      }
      continue;
    }
    const text = res.text.trim();
    if (!text) continue;
    const sources: { title: string; url: string }[] = [];
    for (const c of (res.grounding?.groundingChunks ?? []).slice(0, 6)) {
      const uri = c.web?.uri;
      if (!uri) continue;
      const url = await resolveRedirect(uri);
      if (url && !sources.some((s) => s.url === url)) sources.push({ title: c.web?.title ?? new URL(url).hostname, url });
      if (sources.length >= 4) break;
    }
    await db.insert(comments).values({ itemId: q.itemId, parentId: q.id, kind: "answer", body: text.slice(0, 4000), sources, model: `${res.model}@${TEAM_PROMPT_VERSION}` });
    await db.update(comments).set({ status: "answered" }).where(eq(comments.id, q.id));
    await db.insert(activity).values({ memberId: q.memberId, kind: "answer", itemId: q.itemId, summary: `Radar answered: “${truncate(q.body, 100)}”` });
    answered++;
  }
  if (open.length) console.log(`team answers: ${answered} of ${open.length} questions answered`);
}

/** RAG answer: retrieve and rank the Radar's own snippets for the article, answer only from them. */
async function answerFromSources(db: DB, pool: GeminiPool, q: typeof comments.$inferSelect): Promise<boolean | "stop"> {
  const { snippets } = await buildCorpus(db, q.itemId, q.id);
  if (snippets.length === 0) return false;
  const top = rank(snippets, q.body, 14);
  const [asker] = q.memberId ? await db.select({ name: teamMembers.name }).from(teamMembers).where(eq(teamMembers.id, q.memberId)) : [];
  const thread = await db
    .select({ body: comments.body, kind: comments.kind })
    .from(comments)
    .where(and(eq(comments.itemId, q.itemId), sql`${comments.id} <> ${q.id}`, sql`${comments.kind} <> 'comment'`))
    .orderBy(asc(comments.createdAt));
  let res;
  try {
    res = await pool.generateJson(
      buildRagAnswerPrompt({
        question: q.body,
        asker: asker?.name ?? "A teammate",
        articleTitle: top.find((s) => s.kind === "article")?.title ?? "",
        snippets: top.map((s, i) => ({ n: i + 1, kind: s.kind, title: s.title, date: s.date, text: truncate(s.text, 900) })),
        thread: thread.slice(-6).map((t) => `${t.kind === "answer" ? "Radar" : "Question"}: ${truncate(t.body, 300)}`).join("\n"),
      }),
      ragAnswerResponseSchema,
    );
  } catch (err) {
    return err instanceof GeminiError && err.kind !== "transient" ? "stop" : false;
  }
  const v = ragAnswerSchema.safeParse(JSON.parse(res.text));
  if (!v.success) return false;
  // Citations map back to the retrieved snippets; only real links are listed as sources.
  const sources: { title: string; url: string }[] = [];
  for (const n of v.data.cited) {
    const s = top[n - 1];
    if (!s) continue;
    const label = `[${n}] ${s.title}${s.date ? ` · ${s.date}` : ""}`;
    if (s.url && !sources.some((x) => x.url === s.url)) sources.push({ title: label, url: s.url });
    else if (!s.url && !sources.some((x) => x.title === label)) sources.push({ title: label, url: "" });
  }
  const note = v.data.found === "no" ? "\n\n(Not found in the Radar's sources for this article. Ask again with “Also search the web” to look further.)" : "";
  await db.insert(comments).values({ itemId: q.itemId, parentId: q.id, kind: "answer", body: `${v.data.answer}${note}`.slice(0, 4000), sources, model: `${res.model}@${TEAM_PROMPT_VERSION}:rag` });
  await db.update(comments).set({ status: "answered" }).where(eq(comments.id, q.id));
  await db.insert(activity).values({ memberId: q.memberId, kind: "answer", itemId: q.itemId, summary: `Radar answered from ${top.length} sources: “${truncate(q.body, 100)}”` });
  return true;
}

async function companyContext(db: DB, companyId: number): Promise<string> {
  const [co] = await db.select({ name: companies.canonicalName }).from(companies).where(eq(companies.id, companyId));
  const [st] = await db.select().from(companyStats).where(eq(companyStats.companyId, companyId));
  const news = await db
    .select({ title: companyNews.title, at: companyNews.publishedAt })
    .from(companyNews)
    .where(eq(companyNews.companyId, companyId))
    .orderBy(desc(companyNews.publishedAt))
    .limit(6);
  const parts = [co?.name ?? ""];
  if (st) {
    parts.push(
      `CSR spend FY${st.lastFy}: ₹${st.totalLastCr.toFixed(1)} cr total, ₹${st.focusLastCr.toFixed(1)} cr in education/skilling, ₹${st.maharashtraFocusLastCr.toFixed(1)} cr of that in Maharashtra, ₹${st.puneLastCr.toFixed(1)} cr in Pune district; forecast next FY ₹${st.predictedTotalCr.toFixed(1)} cr (₹${st.predictedFocusCr.toFixed(1)} cr focus).`,
    );
    const t = st.data.timing;
    if (t?.window) parts.push(`Usual CSR announcement window: ${t.window}.`);
  }
  if (news.length) parts.push(`Recent CSR headlines: ${news.map((n) => `${n.at?.toISOString().slice(0, 10) ?? ""} ${n.title}`).join(" | ")}`);
  return parts.join(" ");
}

// ---------- 3. dashboard feedback ----------

const WEIGHT_TARGETS = /^(signalType\.[a-z_]+|sectorFit|activelyPartneringBonus|thresholds\.(callThisWeek|watch))$/;

async function triageFeedback(db: DB, pool: GeminiPool) {
  const queue = await db
    .select({ f: dashboardFeedback, by: teamMembers.name })
    .from(dashboardFeedback)
    .leftJoin(teamMembers, eq(teamMembers.id, dashboardFeedback.memberId))
    .where(eq(dashboardFeedback.status, "confirmed"))
    .orderBy(asc(dashboardFeedback.createdAt))
    .limit(10);
  for (const { f, by } of queue) {
    const cfg = await loadConfig(db);
    const res = await pool.generateJson(buildTriagePrompt({ page: f.page, kind: f.kind, body: f.body, by: by ?? "a teammate" }, settingsText(cfg)), triageResponseSchema);
    const v = triageSchema.safeParse(JSON.parse(res.text));
    if (!v.success) continue;
    const t = v.data;
    if (t.route === "config") {
      const changes = await applyOps(db, cfg, t.ops);
      await db
        .update(dashboardFeedback)
        .set({ status: changes.length ? "applied" : "routed", route: changes.length ? "config" : "developer", resolution: changes.length ? `${t.summary} Changes: ${changes.join("; ")}` : `${t.summary} (No safe settings change was possible, so it was passed to the developer.)`, resolvedAt: new Date() })
        .where(eq(dashboardFeedback.id, f.id));
      if (!changes.length) await sendRequest("developer", f, t.request || f.body, by);
      console.log(`team feedback #${f.id}: ${changes.length ? `applied ${changes.length} change(s)` : "no safe change; routed"}`);
    } else if (t.route === "none") {
      await db.update(dashboardFeedback).set({ status: "applied", route: null, resolution: t.summary || "Noted, nothing to change.", resolvedAt: new Date() }).where(eq(dashboardFeedback.id, f.id));
    } else {
      const sent = await sendRequest(t.route, f, t.request || f.body, by);
      await db
        .update(dashboardFeedback)
        .set({ status: "routed", route: t.route, resolution: `${t.summary}${sent ? ` Emailed to the ${t.route}.` : ` Waiting for the ${t.route} (shown on the Team page).`}\n\n${t.request}`, resolvedAt: new Date() })
        .where(eq(dashboardFeedback.id, f.id));
      console.log(`team feedback #${f.id}: routed to ${t.route}`);
    }
  }
}

function settingsText(cfg: AppConfig): string {
  const w = cfg.scoringWeights;
  return [
    `Sectors: ${cfg.sectors.map((s) => `${s.id} (${s.label}; keywords: ${s.keywords.slice(0, 12).join(", ")})`).join(" | ")}`,
    `Keyword lists: csr = ${cfg.keywords.csr.slice(0, 20).join(", ")}; policy = ${cfg.keywords.policy.slice(0, 15).join(", ")}; communityImpact = ${(cfg.keywords.communityImpact ?? []).slice(0, 15).join(", ")}`,
    `Followed pages: ${(cfg.keywords.followedPages ?? []).join(", ")}`,
    `Saved searches: ${cfg.searches.map((s) => `${s.id} [${s.kind ?? "news"}${s.enabled ? "" : ", disabled"}] "${s.query}"`).join(" | ")}`,
    `Weights: signalType ${JSON.stringify(w.signalType)}, sectorFit ${w.sectorFit}, activelyPartneringBonus ${w.activelyPartneringBonus}, thresholds ${JSON.stringify(w.thresholds)}`,
  ].join("\n");
}

async function applyOps(db: DB, cfg: AppConfig, ops: { op: string; target: string; value: string }[]): Promise<string[]> {
  const [row] = await db.select().from(config).where(eq(config.id, 1));
  if (!row) return [];
  const keywords = structuredClone(row.keywords);
  const sectors = structuredClone(row.sectors);
  const searches = structuredClone(row.searches?.length ? row.searches : cfg.searches);
  const weights = structuredClone(row.scoringWeights);
  const done: string[] = [];
  for (const { op, target, value } of ops) {
    const val = value.trim();
    if (!val) continue;
    if (op === "add_keyword" || op === "remove_keyword") {
      const kw = val.toLowerCase();
      let list: string[] | undefined;
      if (target.startsWith("sector:")) list = sectors.find((s) => s.id === target.slice(7))?.keywords;
      else if (target === "csr" || target === "policy") list = keywords[target];
      else if (target === "communityImpact") list = keywords.communityImpact ??= [];
      if (!list) continue;
      if (op === "add_keyword" && !list.includes(kw) && kw.length > 2) {
        list.push(kw);
        done.push(`added keyword “${kw}” to ${target}`);
      } else if (op === "remove_keyword" && list.includes(kw)) {
        list.splice(list.indexOf(kw), 1);
        done.push(`removed keyword “${kw}” from ${target}`);
      }
    } else if (op === "add_followed_page") {
      const pages = (keywords.followedPages ??= []);
      if (!pages.includes(val)) {
        pages.push(val);
        done.push(`now following “${val}” in LinkedIn alerts`);
      }
    } else if (op === "add_search" && ["news", "jobs", "policy"].includes(target) && val.length > 5 && searches.length < 30) {
      searches.push({ id: `fb-${Date.now().toString(36)}-${searches.length}`, query: val, enabled: true, kind: target as "news" });
      done.push(`added a ${target} Google search “${val}”`);
    } else if (op === "disable_search") {
      const s = searches.find((x) => x.id === target);
      if (s?.enabled) {
        s.enabled = false;
        done.push(`paused the search “${s.query}”`);
      }
    } else if (op === "set_weight" && WEIGHT_TARGETS.test(target)) {
      const n = Number(val);
      const [a, b] = target.split(".");
      const holder = (b ? (weights as unknown as Record<string, Record<string, number>>)[a] : (weights as unknown as Record<string, number>)) as Record<string, number> | undefined;
      const key = b ?? a;
      const cur = holder?.[key];
      if (holder && typeof cur === "number" && Number.isFinite(n) && Math.abs(n - cur) <= Math.max(3, Math.abs(cur) * 0.3) && n >= 0) {
        holder[key] = Math.round(n);
        done.push(`${target} ${cur} → ${Math.round(n)}`);
      }
    }
  }
  if (done.length) await db.update(config).set({ keywords, sectors, searches, scoringWeights: weights, updatedAt: new Date() }).where(eq(config.id, 1));
  return done;
}

async function sendRequest(route: string, f: typeof dashboardFeedback.$inferSelect, request: string, by: string | null): Promise<boolean> {
  const to = process.env.NOTIFY_TO;
  const user = process.env.NOTIFY_SMTP_USER || process.env.INTAKE_IMAP_USER;
  const pass = process.env.NOTIFY_SMTP_PASSWORD || process.env.INTAKE_IMAP_PASSWORD;
  if (!to || !user || !pass) return false;
  const t = nodemailer.createTransport({ host: process.env.NOTIFY_SMTP_HOST ?? "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  const subject = `[CSR Radar] ${route === "designer" ? "Design" : "Dev"} request · ${f.page} · #${f.id}`;
  const text = `${request}\n\n---\nOriginal feedback (${f.kind}, ${f.page} page, from ${by ?? "a teammate"}, confirmed by the team lead):\n${f.body}`;
  try {
    await t.sendMail({ from: user, to, subject, text });
    return true;
  } catch (err) {
    console.warn(`team feedback: email failed (${(err as Error).message})`);
    return false;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
