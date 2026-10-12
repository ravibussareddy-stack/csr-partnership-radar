"use server";
// Feedback on insights: "read" and "not relevant" (with a reason). Stored for score learning
// (scripts/ingest/score.ts) and shown on the summary page as recent engagement.
import { updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { RADAR_TAG } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { contacts, feedback, rawItems, signals } from "@/lib/db/schema";
import { hasSession } from "@/lib/session";

export interface FeedbackResult {
  ok: boolean;
  needsUnlock?: boolean;
  message?: string;
}

const REASONS = new Set(["Not my sector", "Wrong company", "Old news", "Not CSR", "Not in our geography", "Other"]);

export async function giveFeedback(itemId: number, action: "read" | "irrelevant", reason?: string): Promise<FeedbackResult> {
  if (!(await hasSession())) return { ok: false, needsUnlock: true, message: "Unlock with the passcode on the People messages page first." };
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
  };
  await db.insert(feedback).values(values).onConflictDoUpdate({ target: [feedback.itemId, feedback.action], set: { reason: values.reason, createdAt: new Date() } });
  // A rejected item leaves the digest right away; similar items are down-weighted at the next scoring run.
  if (action === "irrelevant") await db.delete(signals).where(eq(signals.itemId, itemId));
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
  if (!(await hasSession())) return { ok: false, needsUnlock: true, message: "Unlock with the passcode on the People messages page first." };
  if (!Number.isInteger(id) || !STATUSES.has(status)) return { ok: false, message: "Invalid request." };
  const db = await getDb();
  await db
    .update(contacts)
    .set({ status: status as "new", statusUpdatedAt: new Date(), ...(notes !== undefined ? { notes: notes.slice(0, 1000) } : {}) })
    .where(eq(contacts.id, id));
  updateTag(RADAR_TAG);
  return { ok: true };
}
