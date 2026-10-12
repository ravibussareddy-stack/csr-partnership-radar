/** All "Ask the Radar" questions with their answers, for the Questions sheet (team-only, per request). */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { comments, rawItems, teamMembers } from "@/lib/db/schema";

export interface QuestionRow {
  id: number;
  askedAt: string;
  asker: string;
  question: string;
  scope: "article" | "web";
  status: "open" | "answered" | "failed";
  itemTitle: string;
  itemUrl: string;
  answer: string | null;
  answeredAt: string | null;
  sources: { title: string; url: string }[];
}

export async function loadQuestions(): Promise<QuestionRow[]> {
  const db = await getDb();
  const qs = await db
    .select({ q: comments, asker: teamMembers.name, itemTitle: rawItems.title, itemUrl: rawItems.url })
    .from(comments)
    .innerJoin(rawItems, eq(rawItems.id, comments.itemId))
    .leftJoin(teamMembers, eq(teamMembers.id, comments.memberId))
    .where(eq(comments.kind, "question"))
    .orderBy(desc(comments.createdAt))
    .limit(1000);
  const ids = qs.map((r) => r.q.id);
  const answers = ids.length ? await db.select().from(comments).where(and(eq(comments.kind, "answer"), inArray(comments.parentId, ids))).orderBy(asc(comments.createdAt)) : [];
  const first = new Map<number, (typeof answers)[number]>();
  for (const a of answers) if (a.parentId != null && !first.has(a.parentId)) first.set(a.parentId, a);
  return qs.map((r) => {
    const a = first.get(r.q.id);
    return {
      id: r.q.id,
      askedAt: r.q.createdAt.toISOString(),
      asker: r.asker ?? "Someone",
      question: r.q.body,
      scope: r.q.scope,
      status: r.q.status ?? "open",
      itemTitle: r.itemTitle,
      itemUrl: r.itemUrl,
      answer: a?.body ?? null,
      answeredAt: a?.createdAt.toISOString() ?? null,
      sources: a?.sources ?? [],
    };
  });
}
