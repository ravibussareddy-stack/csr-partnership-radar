import { z } from "zod";

export const RELATIONSHIP_PROMPT_VERSION = "relationship-v1";

export const relImpactResponseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "INTEGER" },
      relevant: { type: "BOOLEAN" },
      level: { type: "STRING", enum: ["risk", "watch", "opportunity"] },
      title: { type: "STRING" },
      impact: { type: "STRING" },
      reasoning: { type: "STRING" },
    },
    required: ["id", "relevant", "level", "title", "impact", "reasoning"],
  },
};

export const relImpactSchema = z.array(
  z.object({
    id: z.number().int(),
    relevant: z.boolean(),
    level: z.enum(["risk", "watch", "opportunity"]),
    title: z.string().trim().max(160),
    impact: z.string().trim().max(500),
    reasoning: z.string().trim().max(600),
  }),
);

export function buildRelImpactPrompt(rel: string, items: { id: number; kind: "company_news" | "regulatory"; date: string; title: string; text: string; status?: string | null }[]): string {
  return `You advise the partnerships head of a Pune education/skilling NGO on its EXISTING CSR funder relationships. For the relationship below, judge each item: does it change anything for THIS relationship (its renewal, budget, timing, scope, reporting, contacts or the chance to grow it)?

Relationship:
${rel}

For each item return:
- relevant: true only if it plausibly affects this specific relationship. Generic CSR news about other companies, or rules that don't touch this contract's budget, timing, eligibility or reporting, are NOT relevant.
- level: "risk" (could reduce, delay or end the funding, or add obligations), "opportunity" (could expand it: new money, new geography or sector match, new programme), or "watch" (relevant, direction unclear).
- title: under 14 words, what changed.
- impact: 1-2 sentences, what it means for this contract and what to do (e.g. raise it at the renewal meeting, update the impact report, propose an expansion).
- reasoning: why you chose this level, citing the concrete facts from the item and the relationship (amounts, dates, places, rule status). Regulatory items marked "inferred" are not official yet: say so and do not treat them as certain.
Use only the facts given. Do not invent.

Items:
${items.map((i) => `[${i.id}] ${i.kind === "regulatory" ? `REGULATORY (${i.status ?? "inferred"})` : "COMPANY NEWS"} · ${i.date} · ${i.title}\n${i.text}`).join("\n\n")}`;
}
