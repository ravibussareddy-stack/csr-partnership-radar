/**
 * npm run notify -- --digest   Monday digest email (once per ISO week)
 * npm run notify -- --alerts   instant alert for Call-this-week items not alerted yet
 * add --preview=<file.html> to write the email to a file instead of sending it
 *
 * Sends through Gmail SMTP with an app password (NOTIFY_SMTP_USER / NOTIFY_SMTP_PASSWORD,
 * falling back to INTAKE_IMAP_USER / INTAKE_IMAP_PASSWORD) to NOTIFY_TO.
 * Subjects follow a fixed structure so they are easy to filter:
 *   [CSR Radar] Monday digest · W42 2026 · 7 to call · 22 to watch
 *   [CSR Radar] Call · Kotak Mahindra Bank · New initiative        (+N more when several)
 * Every send is recorded in `notifications`, so nothing is sent twice.
 */
import "../env";
import nodemailer from "nodemailer";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { activity, memberTime, notifications, relationshipAlerts, relationships, teamMembers } from "@/lib/db/schema";
import { loadRegulatory } from "@/lib/regulatory";
import { loadDigest, type DigestItem } from "@/lib/digest";
import { SIGNAL_LABELS, TIER_LABELS } from "@/lib/scoring";
import { loadWarmList, type WarmItem } from "@/lib/warm";

export const SUBJECT_TAG = "[CSR Radar]";
const SITE = process.env.SITE_URL ?? "https://csr-partnership-radar-two.vercel.app";

function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const TIER_COLOR = { call_this_week: "#c2462a", watch: "#8a6100", background: "#3f6a8a" } as const;

function itemHtml(i: DigestItem): string {
  const company = i.company && i.companyId ? `<a href="${SITE}/companies/${i.companyId}" style="color:#1f2a24">${esc(i.company)}</a>` : esc(i.company ?? "Company not identified");
  return `<tr><td style="padding:12px 14px;border-left:4px solid ${TIER_COLOR[i.tier]};background:#fffdf8;border-radius:10px">
    <div style="font-size:13px;color:#5f6a62"><strong style="color:#1f2a24">${company}</strong> · ${esc(SIGNAL_LABELS[i.signalType])} · ${dateFmt.format(i.date)}</div>
    <div style="font-size:15px;font-weight:600;margin:4px 0"><a href="${esc(i.url)}" style="color:#128a63;text-decoration:none">${esc(i.headline ?? i.title)}</a></div>
    ${i.worthIt || i.whyItMatters ? `<div style="font-size:14px;margin:2px 0 4px">${esc(i.worthIt ?? i.whyItMatters ?? "")}</div>` : ""}
    <div style="font-size:12px;color:#5f6a62"><strong>Why this tier:</strong> ${esc(i.reason)}</div>
  </td></tr><tr><td style="height:8px"></td></tr>`;
}

function warmHtml(w: WarmItem): string {
  return `<tr><td style="padding:8px 12px;border-left:4px solid ${TIER_COLOR[w.tier]};background:#fffdf8">
    <div style="font-size:14px"><a href="${SITE}/companies/${w.companyId}" style="color:#1f2a24;font-weight:600">${esc(w.company)}</a> · <span style="color:${TIER_COLOR[w.tier]}">${TIER_LABELS[w.tier]}</span></div>
    <div style="font-size:12px;color:#5f6a62">${esc(w.reason)}</div>
  </td></tr><tr><td style="height:6px"></td></tr>`;
}

const LEVEL_COLOR = { risk: "#c2462a", opportunity: "#128a63", watch: "#8a6100" } as const;
const STATUS_LABEL = { executed: "Executed", confirmed: "Confirmed", inferred: "Inferred" } as const;

function line(color: string, head: string, body: string): string {
  return `<tr><td style="padding:8px 12px;border-left:4px solid ${color};background:#fffdf8">
    <div style="font-size:14px">${head}</div>${body ? `<div style="font-size:12px;color:#5f6a62">${body}</div>` : ""}
  </td></tr><tr><td style="height:6px"></td></tr>`;
}

/** Extra Monday sections: partner alerts (last 7 days), regulatory highlights, the team's week. */
async function mondayExtras(db: Awaited<ReturnType<typeof getDb>>): Promise<string[]> {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const out: string[] = [];
  const alerts = await db
    .select({ a: relationshipAlerts, company: relationships.companyName })
    .from(relationshipAlerts)
    .innerJoin(relationships, eq(relationships.id, relationshipAlerts.relationshipId))
    .where(and(eq(relationshipAlerts.dismissed, false), gte(relationshipAlerts.createdAt, weekAgo)))
    .orderBy(desc(relationshipAlerts.createdAt))
    .limit(10);
  if (alerts.length) {
    out.push(section(`Your partners: what changed (${alerts.length})`, alerts.map(({ a, company }) => line(LEVEL_COLOR[a.level], `<strong>${esc(company)}</strong> · <span style="color:${LEVEL_COLOR[a.level]}">${a.level === "risk" ? "At risk" : a.level === "opportunity" ? "Opportunity" : "Watch"}</span>: ${esc(a.title)}`, `${esc(a.impact)} <em>Why: ${esc(a.reasoning.slice(0, 220))}${a.reasoning.length > 220 ? "…" : ""}</em>`)).join("")));
  }
  const reg = await loadRegulatory(120).catch(() => null);
  if (reg?.summary) {
    out.push(section("Rules & regulation", [
      line("#3f6a8a", esc(reg.summary.overview), ""),
      ...reg.summary.highlights.slice(0, 3).map((h) => line("#3f6a8a", `<strong>${STATUS_LABEL[h.status]}</strong>: ${esc(h.text)}`, "")),
    ].join("")));
  }
  const members = await db.select().from(teamMembers).where(eq(teamMembers.active, true));
  if (members.length > 1) {
    const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(weekAgo);
    const times = await db.select().from(memberTime).where(gte(memberTime.day, from));
    const acts = await db.select({ memberId: activity.memberId, kind: activity.kind }).from(activity).where(gte(activity.createdAt, weekAgo));
    out.push(section("Team this week", members.map((m) => {
      const secs = times.filter((t) => t.memberId === m.id).reduce((x, t) => x + t.seconds, 0);
      const mine = acts.filter((a) => a.memberId === m.id && a.kind !== "mention");
      const c = (k: string) => mine.filter((a) => a.kind === k).length;
      return line("#128a63", `<strong>${esc(m.name)}</strong> · ${Math.round(secs / 60)} min active`, `${c("comment")} comments · ${c("question")} questions · ${c("read")} read · ${c("irrelevant")} not relevant · ${c("contact")} outreach updates`);
    }).join("")));
  }
  return out;
}

function shell(title: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#fbf7ee;font-family:Nunito,Segoe UI,Arial,sans-serif;color:#1f2a24">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">
    <tr><td style="background:linear-gradient(180deg,#8fd0f2,#e9f6fb);border-radius:18px;padding:22px 24px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#128a63;font-weight:700">CSR Partnership Radar</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px">${esc(title)}</div>
    </td></tr>
    <tr><td style="height:14px"></td></tr>
    ${inner}
    <tr><td style="padding:18px 4px;font-size:12px;color:#5f6a62">Open the summary, digest, relationships and regulatory pages: <a href="${SITE}" style="color:#128a63">${SITE.replace(/^https:\/\//, "")}</a></td></tr>
  </table></td></tr></table></body></html>`;
}

function section(title: string, rows: string): string {
  return `<tr><td style="font-size:17px;font-weight:700;padding:10px 2px 8px">${esc(title)}</td></tr><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`;
}

function transport() {
  const user = process.env.NOTIFY_SMTP_USER ?? process.env.INTAKE_IMAP_USER;
  const pass = process.env.NOTIFY_SMTP_PASSWORD ?? process.env.INTAKE_IMAP_PASSWORD;
  if (!user || !pass) return null;
  return { from: user, t: nodemailer.createTransport({ host: process.env.NOTIFY_SMTP_HOST ?? "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } }) };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const to = process.env.NOTIFY_TO;
  const preview = process.argv.find((a) => a.startsWith("--preview="))?.slice("--preview=".length);
  const tr = preview
    ? { from: "preview@local", t: { sendMail: async (m: { subject: string; html: string }) => { (await import("node:fs")).writeFileSync(preview, m.html); console.log(`preview written: ${preview} (subject: ${m.subject})`); } } }
    : transport();
  if ((!to && !preview) || !tr) {
    console.log("notify: not configured (NOTIFY_TO and a Gmail app password); nothing sent");
    return;
  }
  const db = await getDb();
  const now = new Date();
  const digest = await loadDigest(now);
  if (digest.status !== "ok") {
    console.warn(`notify: digest unavailable (${digest.status})`);
    return;
  }
  // Demo items (labelled samples) never go out by email.
  const real = digest.items.filter((i) => !i.isDemo);
  const calls = real.filter((i) => i.tier === "call_this_week");
  const watch = real.filter((i) => i.tier === "watch");

  if (args.has("--digest")) {
    const { year, week } = isoWeek(now);
    const key = `digest:${year}-W${week}`;
    const done = await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.key, [key]));
    if (done.length && !args.has("--force")) {
      console.log(`notify: ${key} already sent`);
    } else {
      const warm = ((await loadWarmList(now).catch(() => null)) ?? []).filter((w) => w.tier !== "background").slice(0, 10);
      const subject = `${SUBJECT_TAG} Monday digest · W${week} ${year} · ${calls.length} to call · ${watch.length} to watch`;
      const html = shell(`Monday digest · week ${week}`, [
        calls.length ? section(`Call this week (${calls.length})`, calls.map(itemHtml).join("")) : section("Call this week", `<tr><td style="font-size:14px;color:#5f6a62">Nothing new to call this week.</td></tr>`),
        watch.length ? section(`Watch (${watch.length}, top 8)`, watch.slice(0, 8).map(itemHtml).join("")) : "",
        ...(await mondayExtras(db)),
        warm.length ? section("Warm list: active in your sectors this year", warm.map(warmHtml).join("")) : "",
      ].join(""));
      const text = [subject, "", ...calls.map((c) => `CALL: ${c.company ?? "?"}: ${c.title}\n  ${c.url}\n  ${c.reason}`), "", `Full digest: ${SITE}`].join("\n");
      await tr.t.sendMail({ from: `CSR Radar <${tr.from}>`, to: to ?? "", subject, html, text });
      if (!preview) await db.insert(notifications).values({ kind: "monday_digest", key, subject }).onConflictDoNothing();
      console.log(`notify: ${preview ? "previewed" : "sent"} "${subject}"`);
    }
  }

  if (args.has("--alerts")) {
    const keys = calls.map((c) => `call:${c.id}`);
    const sent = keys.length ? await db.select({ key: notifications.key }).from(notifications).where(inArray(notifications.key, keys)) : [];
    const sentSet = new Set(sent.map((s) => s.key));
    const fresh = calls.filter((c) => !sentSet.has(`call:${c.id}`));
    if (fresh.length === 0) {
      console.log("notify: no new Call-this-week items");
    } else {
      const first = fresh[0];
      const subject = `${SUBJECT_TAG} Call · ${first.company ?? "New opportunity"}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ""} · ${SIGNAL_LABELS[first.signalType]}`;
      const html = shell(fresh.length > 1 ? `${fresh.length} new to call this week` : "New: call this week", section("Call this week", fresh.map(itemHtml).join("")));
      const text = [subject, "", ...fresh.map((c) => `${c.company ?? "?"}: ${c.title}\n  ${c.url}\n  ${c.reason}`)].join("\n");
      await tr.t.sendMail({ from: `CSR Radar <${tr.from}>`, to: to ?? "", subject, html, text });
      if (!preview) await db.insert(notifications).values(fresh.map((c) => ({ kind: "call_alert" as const, key: `call:${c.id}`, subject }))).onConflictDoNothing();
      console.log(`notify: ${preview ? "previewed" : "sent"} "${subject}"`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
