import { z } from "zod";

export const REGULATORY_PROMPT_VERSION = "regulatory-v1";

export const regulatoryResponseSchema = {
  type: "OBJECT",
  properties: {
    overview: { type: "STRING" },
    highlights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          status: { type: "STRING", enum: ["confirmed", "executed", "inferred"] },
          item_ids: { type: "ARRAY", items: { type: "INTEGER" } },
        },
        required: ["text", "status", "item_ids"],
      },
    },
    watch_next: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["overview", "highlights", "watch_next"],
};

export const regulatorySchema = z.object({
  overview: z.string().trim().max(600),
  highlights: z.array(z.object({ text: z.string().trim().max(400), status: z.enum(["confirmed", "executed", "inferred"]), item_ids: z.array(z.number().int()).max(6) })).max(6),
  watch_next: z.array(z.string().trim().max(250)).max(4),
});

export function buildRegulatoryPrompt(items: { id: number; date: string; status: string; official: boolean; title: string; text: string }[]): string {
  return `You brief the partnerships head of a Pune education/skilling NGO funded by corporate CSR on Indian CSR regulation. From the items below, write:
- overview: 2-3 sentences: what changed or is being debated in CSR rules recently and what it means for NGOs seeking CSR funds (e.g. timing of company spending, unspent funds, eligibility, impact-assessment or registration requirements).
- highlights: up to 5 points, most important first. Each must be backed by the item ids it is based on, and carry a status: "executed" (in force / implemented), "confirmed" (officially notified or announced, not yet in force) or "inferred" (draft, debate, expert view, media expectation). Never upgrade a status beyond what the items support; if items disagree, use the weaker status and say so.
- watch_next: up to 3 dated or expected events to watch (deadlines, consultations closing, effective dates), only if the items mention them.
Use only these items; do not add facts.

Items:
${items.map((i) => `[${i.id}] ${i.date} · ${i.status}${i.official ? " · OFFICIAL SOURCE" : ""} · ${i.title}\n${i.text}`).join("\n\n")}`;
}
