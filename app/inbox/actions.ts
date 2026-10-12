"use server";
// Message drop: the only write path in the web app. It stores pasted messages (no AI call here);
// the intake workflow (every 10 min) classifies and researches them.
import { updateTag } from "next/cache";
import { RADAR_TAG } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { rawItems } from "@/lib/db/schema";
import { contentHash } from "@/lib/hash";
import { splitMessages } from "@/lib/paste";
import { hasSession, signIn } from "@/lib/session";
import { dispatchWorkflow } from "@/app/actions";

export interface DropState {
  ok: boolean;
  message: string;
  added?: number;
  duplicates?: number;
  preview?: string[];
}

const CHANNELS = new Set(["whatsapp", "linkedin", "telegram", "email", "sms", "other"]);

export async function unlock(_: DropState, form: FormData): Promise<DropState> {
  const pass = String(form.get("passcode") ?? "");
  const member = await signIn(String(form.get("name") ?? ""), pass);
  if (!member) return { ok: false, message: "That name and passcode don't match." };
  return { ok: true, message: `Signed in as ${member.name}.` };
}

export async function dropMessages(_: DropState, form: FormData): Promise<DropState> {
  if (!(await hasSession())) return { ok: false, message: "Please unlock with the passcode first." };
  const text = String(form.get("messages") ?? "");
  const channelRaw = String(form.get("channel") ?? "other").toLowerCase();
  const channel = CHANNELS.has(channelRaw) ? channelRaw : "other";
  const msgs = splitMessages(text);
  if (msgs.length === 0) return { ok: false, message: "No messages found. Separate them with ----- or start each with “Message 2:”." };

  const db = await getDb();
  let added = 0;
  for (const m of msgs) {
    const hash = contentHash(m.text.slice(0, 120), m.text);
    const firstLine = m.text.split("\n").find((l) => l.trim()) ?? m.text;
    const out = await db
      .insert(rawItems)
      .values({
        source: "pasted",
        channel,
        url: `paste:${hash.slice(0, 32)}`,
        title: firstLine.length > 140 ? `${firstLine.slice(0, 139)}…` : firstLine,
        body: m.text,
        publishedAt: m.date ?? new Date(),
        contentHash: hash,
      })
      .onConflictDoNothing({ target: rawItems.url })
      .returning({ id: rawItems.id });
    added += out.length;
  }
  updateTag(RADAR_TAG);
  if (added) await dispatchWorkflow("intake.yml");
  return {
    ok: true,
    message: `${added} message${added === 1 ? "" : "s"} queued. They'll be read, classified and researched in a few minutes.`,
    added,
    duplicates: msgs.length - added,
    preview: msgs.slice(0, 5).map((m) => (m.text.length > 90 ? `${m.text.slice(0, 89)}…` : m.text)),
  };
}
