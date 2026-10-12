/** Exit quickly when nothing is waiting: pasted messages or team tasks (used by the 10-minute intake workflow). */
import "../env";
import { appendFileSync } from "node:fs";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { comments, config, dashboardFeedback, rawItems, relationships } from "@/lib/db/schema";

async function main() {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(rawItems)
    .where(and(eq(rawItems.source, "pasted"), or(isNull(rawItems.prefilterPassed), eq(rawItems.classifyStatus, "pending"))));
  const pending = Number(n);
  console.log(`intake: ${pending} pasted message(s) waiting`);
  // Team work queued from the app: open questions, sectors being set up, confirmed dashboard feedback.
  const [{ q }] = await db.select({ q: sql<number>`count(*)` }).from(comments).where(and(eq(comments.kind, "question"), eq(comments.status, "open")));
  const [{ f }] = await db.select({ f: sql<number>`count(*)` }).from(dashboardFeedback).where(eq(dashboardFeedback.status, "confirmed"));
  const [cfg] = await db.select({ sectors: config.sectors }).from(config);
  const sectorsPending = cfg?.sectors.filter((s) => s.status === "pending").length ?? 0;
  const [{ r }] = await db.select({ r: sql<number>`count(*)` }).from(relationships).where(isNull(relationships.lastCheckedAt));
  const tasks = Number(q) + Number(f) + sectorsPending + Number(r);
  console.log(`intake: ${tasks} team task(s) waiting (questions ${q}, feedback ${f}, sectors ${sectorsPending}, new relationships ${r})`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pending=${pending}\ntasks=${tasks}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
