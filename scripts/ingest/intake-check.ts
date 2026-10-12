/** Exit quickly when no pasted messages are waiting (used by the 10-minute intake workflow). */
import "../env";
import { appendFileSync } from "node:fs";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { rawItems } from "@/lib/db/schema";

async function main() {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(rawItems)
    .where(and(eq(rawItems.source, "pasted"), or(isNull(rawItems.prefilterPassed), eq(rawItems.classifyStatus, "pending"))));
  const pending = Number(n);
  console.log(`intake: ${pending} pasted message(s) waiting`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pending=${pending}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
