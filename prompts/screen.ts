import { z } from "zod";

/** Bump when the prompt or schema changes. Stored in raw_items.prefilter_note. */
export const SCREEN_PROMPT_VERSION = "screen-v1";

export const screenResponseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      i: { type: "INTEGER" },
      relevant: { type: "BOOLEAN" },
      why: { type: "STRING" },
    },
    required: ["i", "relevant", "why"],
    propertyOrdering: ["i", "relevant", "why"],
  },
};

export const screenSchema = z.array(z.object({ i: z.number().int(), relevant: z.boolean(), why: z.string().max(200) }));

/**
 * Cheap, recall-oriented screen on headline + first lines (no CSR keyword matched). It lets through
 * anything a CSR partnerships head might want a closer look at; full classification decides later.
 */
export function buildScreenPrompt(items: { i: number; text: string }[]): string {
  return `You screen news items for a CSR (corporate social responsibility) partnerships team at an Indian education and skilling NGO. None of these items used the word "CSR", so judge from context.

Mark relevant = true if the item could plausibly be about any of these, even if not stated outright:
- a company, its foundation or trust doing social good in India: helping communities, schools, students, youth, women, villages, health camps, donations, scholarships, volunteering, infrastructure for the public, skilling or livelihoods;
- a company partnering with an NGO, government body or institution for community benefit;
- a company hiring for CSR, foundation or community roles;
- a company announcing a new plant, campus, office or major investment in India (a future CSR funder there);
- a change to CSR rules or funding in India.
Mark relevant = false for ordinary business news (results, products, deals, markets, appointments), politics, crime, sports and entertainment with no such angle.
When unsure, prefer true. why: under 12 words.

Items (index, headline and first lines):
${items.map((x) => `${x.i}\t${x.text}`).join("\n")}`;
}
