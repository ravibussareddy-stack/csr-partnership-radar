"use server";
// Team write actions. Feedback on insights ("read" / "not relevant" with a reason) feeds score
// learning (scripts/ingest/score.ts); comments and questions, contact moves, sectors, dashboard
// feedback and active time are attributed to the signed-in member and logged as team activity.
// No AI runs here: questions, new sectors and confirmed dashboard feedback are processed by the
// intake workflow (every 10 minutes, or right away when GITHUB_DISPATCH_TOKEN is set).
import { updateTag } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { RADAR_TAG } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { activity, comments, config, contacts, dashboardFeedback, feedback, memberTime, rawItems, signals, teamMembers } from "@/lib/db/schema";
import { currentMember, hashPasscode, hasSession, signOut, type Member } from "@/lib/session";

const SIGN_IN = "Sign in on the People messages page first.";

async function log(memberId: number | null, kind: string, summary: string, itemId?: number | null) {
  const db = await getDb();
  await db.insert(activity).values({ memberId, kind, summary: summary.slice(0, 300), itemId: itemId ?? null });
}

async function itemTitle(itemId: number): Promise<string> {
  const db = await getDb();
  const [r] = await db.select({ t: rawItems.title }).from(rawItems).where(eq(rawItems.id, itemId));
  return r?.t ?? `item ${itemId}`;
}

/** Wake the intake workflow now instead of waiting for its 10-minute schedule (optional). */
async function dispatchIntake() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return;
  try {
    await fetch(`https://api.github.com/repos/${repo}/actions/workflows/intake.yml/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      body: JSON.stringify({ ref: "main" }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // the schedule picks it up anyway
  }
}

export interface FeedbackResult {
  ok: boolean;
  needsUnlock?: boolean;
  message?: string;
}

const REASONS = new Set(["Not my sector", "Wrong company", "Old news", "Not CSR", "Not in our geography", "Other"]);

export async function giveFeedback(itemId: number, action: "read" | "irrelevant", reason?: string): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, message: SIGN_IN };
  if (!Number.isInteger(itemId) || (action !== "read" && action !== "irrelevant")) return { ok: false, message: "Invalid request." };
  const db = await getDb();
  const [row] = await db
    .select({ source: rawItems.source, companyId: signals.companyId, signalType: signals.signalType })
    .from(rawItems)
    .leftJoin(signals, eq(signals.itemId, rawItems.id))
    .where(eq(rawItems.id, itemId));
  if (!row) return { ok: false, message: "Item not found." };
  const values = {
    itemId,
    action,
    reason: action === "irrelevant" && reason && REASONS.has(reason) ? reason : null,
    companyId: row.companyId,
    source: row.source,
    signalType: row.signalType,
    memberId: me.id,
  };
  await db.insert(feedback).values(values).onConflictDoUpdate({ target: [feedback.itemId, feedback.action], set: { reason: values.reason, createdAt: new Date() } });
  // A rejected item leaves the digest right away; similar items are down-weighted at the next scoring run.
  if (action === "irrelevant") await db.delete(signals).where(eq(signals.itemId, itemId));
  await log(me.id, action, `${action === "read" ? "Read" : `Marked not relevant${values.reason ? ` (${values.reason})` : ""}`}: ${await itemTitle(itemId)}`, itemId);
  updateTag(RADAR_TAG);
  return { ok: true };
}

export async function undoRead(itemId: number): Promise<FeedbackResult> {
  if (!(await hasSession())) return { ok: false, needsUnlock: true };
  const db = await getDb();
  await db.delete(feedback).where(eq(feedback.itemId, itemId));
  updateTag(RADAR_TAG);
  return { ok: true };
}

const STATUSES = new Set(["new", "reached_out", "connected", "failed", "not_useful"]);

/** Community builder: update a contact's outreach status and notes. */
export async function updateContact(id: number, status: string, notes?: string): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, message: SIGN_IN };
  if (!Number.isInteger(id) || !STATUSES.has(status)) return { ok: false, message: "Invalid request." };
  const db = await getDb();
  await db
    .update(contacts)
    .set({ status: status as "new", statusUpdatedAt: new Date(), updatedBy: me.id, ...(notes !== undefined ? { notes: notes.slice(0, 1000) } : {}) })
    .where(eq(contacts.id, id));
  const [c] = await db.select({ name: contacts.name, company: contacts.companyName }).from(contacts).where(eq(contacts.id, id));
  const label: Record<string, string> = { new: "Moved back to To reach", reached_out: "Reached out to", connected: "Connected with", failed: "Marked failed", not_useful: "Hid" };
  await log(me.id, "contact", notes !== undefined ? `Updated notes on ${c?.name}` : `${label[status]} ${c?.name}${c?.company ? ` (${c.company})` : ""}`);
  updateTag(RADAR_TAG);
  return { ok: true };
}

// ---------- discussion: comments, @mentions and questions to the AI ----------

export interface ThreadEntry {
  id: number;
  parentId: number | null;
  kind: "comment" | "question" | "answer";
  body: string;
  author: string | null;
  mentions: string[];
  sources: { title: string; url: string }[];
  status: "open" | "answered" | "failed" | null;
  scope: "article" | "web";
  at: string;
}

export interface Thread {
  ok: boolean;
  needsUnlock?: boolean;
  me?: Member;
  members: { id: number; name: string }[];
  entries: ThreadEntry[];
}

async function activeMembers() {
  const db = await getDb();
  return db.select({ id: teamMembers.id, name: teamMembers.name }).from(teamMembers).where(eq(teamMembers.active, true)).orderBy(asc(teamMembers.name));
}

/** The discussion on one article (team only). */
export async function loadThread(itemId: number): Promise<Thread> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, members: [], entries: [] };
  const db = await getDb();
  const members = await activeMembers();
  const names = new Map(members.map((m) => [m.id, m.name]));
  const rows = await db.select().from(comments).where(eq(comments.itemId, itemId)).orderBy(asc(comments.createdAt));
  const allNames = rows.some((r) => r.memberId && !names.has(r.memberId))
    ? new Map((await db.select({ id: teamMembers.id, name: teamMembers.name }).from(teamMembers)).map((m) => [m.id, m.name]))
    : names;
  return {
    ok: true,
    me,
    members,
    entries: rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      kind: r.kind,
      body: r.body,
      author: r.kind === "answer" ? "Radar AI" : (r.memberId ? (allNames.get(r.memberId) ?? null) : null),
      mentions: r.mentions.map((m) => allNames.get(m) ?? "").filter(Boolean),
      sources: r.sources,
      status: r.status,
      scope: r.scope,
      at: r.createdAt.toISOString(),
    })),
  };
}

/** Post a comment (with @Name mentions) or ask the AI a question about the article. */
export async function postComment(itemId: number, body: string, ask: boolean, web = false): Promise<Thread> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, members: [], entries: [] };
  const text = body.trim().slice(0, 2000);
  if (!Number.isInteger(itemId) || text.length < 2) return loadThread(itemId);
  const db = await getDb();
  const members = await activeMembers();
  const lower = text.toLowerCase();
  const mentions = members.filter((m) => m.id !== me.id && lower.includes(`@${m.name.toLowerCase()}`)).map((m) => m.id);
  await db.insert(comments).values({ itemId, memberId: me.id, kind: ask ? "question" : "comment", body: text, mentions, status: ask ? "open" : null, scope: ask && web ? "web" : "article" });
  const title = await itemTitle(itemId);
  await log(me.id, ask ? "question" : "comment", `${ask ? "Asked" : "Commented"} on ${title}: “${text.slice(0, 120)}”`, itemId);
  for (const m of mentions) await log(m, "mention", `${me.name} mentioned you on ${title}`, itemId);
  if (ask) await dispatchIntake();
  return loadThread(itemId);
}

// ---------- active time ----------

const istDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Heartbeat from the browser while the tab is visible: adds up to 2 minutes per call. */
export async function trackTime(seconds: number, page: string): Promise<void> {
  const me = await currentMember();
  if (!me || !Number.isFinite(seconds) || seconds <= 0) return;
  const add = Math.min(120, Math.round(seconds));
  const key = (page.split("/")[1] || "summary").slice(0, 30);
  const db = await getDb();
  await db
    .insert(memberTime)
    .values({ memberId: me.id, day: istDay(), seconds: add, pages: { [key]: add } })
    .onConflictDoUpdate({
      target: [memberTime.memberId, memberTime.day],
      set: {
        seconds: sql`${memberTime.seconds} + ${add}`,
        pages: sql`${memberTime.pages} || jsonb_build_object(${key}::text, coalesce((${memberTime.pages}->>${key}::text)::int, 0) + ${add})`,
      },
    });
  await db.update(teamMembers).set({ lastSeenAt: new Date() }).where(eq(teamMembers.id, me.id));
}

// ---------- team ----------

export async function createMember(name: string, passcode: string): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, message: SIGN_IN };
  if (me.role !== "lead") return { ok: false, message: "Only the team lead can add teammates." };
  const n = name.trim().replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L} .'-]{1,40}$/u.test(n)) return { ok: false, message: "Use a first name or display name (letters only)." };
  if (passcode.length < 8) return { ok: false, message: "Passcodes need at least 8 characters." };
  const db = await getDb();
  const out = await db.insert(teamMembers).values({ name: n, role: "member", passcodeHash: hashPasscode(passcode) }).onConflictDoNothing().returning({ id: teamMembers.id });
  if (out.length === 0) return { ok: false, message: `${n} is already on the team.` };
  await log(me.id, "team", `Added ${n} to the team`);
  return { ok: true, message: `${n} can now sign in with their name and that passcode.` };
}

export async function setMemberActive(id: number, active: boolean): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me || me.role !== "lead") return { ok: false, message: "Only the team lead can do this." };
  if (id === me.id) return { ok: false, message: "You can't deactivate yourself." };
  const db = await getDb();
  await db.update(teamMembers).set({ active }).where(eq(teamMembers.id, id));
  return { ok: true };
}

export async function leaveSession(): Promise<void> {
  await signOut();
}

// ---------- dashboard feedback ----------

const PAGES = new Set(["summary", "digest", "inbox", "calendar", "funding", "jobs", "community", "regulatory", "team", "sectors", "companies", "general"]);

export async function sendDashboardFeedback(page: string, kind: string, body: string): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, message: SIGN_IN };
  const text = body.trim().slice(0, 1500);
  if (text.length < 5) return { ok: false, message: "Tell us a little more." };
  const k = kind === "pro" || kind === "con" ? kind : "idea";
  const db = await getDb();
  await db.insert(dashboardFeedback).values({ memberId: me.id, page: PAGES.has(page) ? page : "general", kind: k, body: text, status: me.role === "lead" ? "confirmed" : "new" });
  await log(me.id, "dashboard_feedback", `Dashboard feedback (${k}, ${page}): “${text.slice(0, 120)}”`);
  if (me.role === "lead") await dispatchIntake();
  return { ok: true, message: me.role === "lead" ? "Thanks! Confirmed: it will be triaged on the next intake run." : "Thanks! Ananya will review it." };
}

export async function reviewDashboardFeedback(id: number, decision: "confirmed" | "declined"): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me || me.role !== "lead") return { ok: false, message: "Only the team lead can confirm feedback." };
  const db = await getDb();
  await db.update(dashboardFeedback).set({ status: decision, resolvedAt: decision === "declined" ? new Date() : null }).where(and(eq(dashboardFeedback.id, id), inArray(dashboardFeedback.status, ["new", "confirmed", "declined"])));
  await log(me.id, "dashboard_feedback", `${decision === "confirmed" ? "Confirmed" : "Declined"} dashboard feedback #${id}`);
  if (decision === "confirmed") await dispatchIntake();
  return { ok: true };
}

// ---------- sectors ----------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

/** Add a sector to track. Keywords, portal mapping and Google searches are filled in by the next intake run. */
export async function addSector(label: string, description: string, keywords: string): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, message: SIGN_IN };
  const l = label.trim().replace(/\s+/g, " ").slice(0, 60);
  const id = slug(l);
  if (id.length < 3) return { ok: false, message: "Give the sector a name, e.g. “Mental health for adolescents”." };
  const db = await getDb();
  const [row] = await db.select().from(config).where(eq(config.id, 1));
  if (!row) return { ok: false, message: "Configuration not found." };
  if (row.sectors.some((s) => s.id === id)) return { ok: false, message: `${l} is already tracked.` };
  const kws = keywords.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter((k) => k.length > 2).slice(0, 30);
  const sectors = [...row.sectors, { id, label: l, keywords: kws.length ? kws : [l.toLowerCase()], portalSectors: [], description: description.trim().slice(0, 300), status: "pending" as const, custom: true, addedBy: me.name }];
  await db.update(config).set({ sectors, updatedAt: new Date() }).where(eq(config.id, 1));
  await log(me.id, "sector", `Added the sector “${l}”`);
  await dispatchIntake();
  updateTag(RADAR_TAG);
  return { ok: true, message: `Added. The next intake run expands its keywords (English, Hindi, Marathi), maps it to the CSR Portal and adds Google searches; then new and recent articles are classified with it.` };
}

export async function removeSector(id: string): Promise<FeedbackResult> {
  const me = await currentMember();
  if (!me) return { ok: false, needsUnlock: true, message: SIGN_IN };
  if (me.role !== "lead") return { ok: false, message: "Only the team lead can remove sectors." };
  const db = await getDb();
  const [row] = await db.select().from(config).where(eq(config.id, 1));
  const target = row?.sectors.find((s) => s.id === id);
  if (!row || !target) return { ok: false, message: "Sector not found." };
  if (!target.custom) return { ok: false, message: "The four core sectors can't be removed here." };
  await db
    .update(config)
    .set({ sectors: row.sectors.filter((s) => s.id !== id), searches: (row.searches ?? []).filter((q) => q.sectorId !== id), updatedAt: new Date() })
    .where(eq(config.id, 1));
  await log(me.id, "sector", `Removed the sector “${target.label}”`);
  updateTag(RADAR_TAG);
  return { ok: true };
}

export async function sessionInfo(): Promise<Member | null> {
  return (await hasSession()) ? currentMember() : null;
}
