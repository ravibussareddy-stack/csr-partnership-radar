import { z } from "zod";

export const COMPANY_LINK_PROMPT_VERSION = "company-link-v1";

export const linkResponseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "INTEGER" },
      match: { type: "INTEGER", nullable: true },
      relation: { type: "STRING", enum: ["same_entity", "foundation_of", "none"] },
      confidence: { type: "NUMBER" },
      why: { type: "STRING" },
    },
    required: ["id", "match", "relation", "confidence", "why"],
  },
};

export const linkSchema = z.array(
  z.object({ id: z.number().int(), match: z.number().int().nullable(), relation: z.enum(["same_entity", "foundation_of", "none"]), confidence: z.number().min(0).max(1), why: z.string().trim().max(300) }),
);

export function buildLinkPrompt(items: { id: number; name: string; context: string; candidates: { id: number; name: string; origin: string }[] }[]): string {
  return `Match company names found in Indian CSR news to the right record. For each name, pick ONE candidate (by id) or none.

relation:
- "same_entity": the same company or legal entity (short name, brand or abbreviation of it, e.g. "AM/NS India" = "ArcelorMittal Nippon Steel India Limited", "MediaTek" = "MEDIATEK INDIA TECHNOLOGY PRIVATE LIMITED" when the news is about its India CSR).
- "foundation_of": the name is a corporate foundation or trust that runs the CSR of the candidate company (e.g. "Kotak Education Foundation" → Kotak Mahindra Bank Limited), so the company reports that CSR spend.
- "none": no candidate is clearly right (different companies that merely share a word, group vs. a single subsidiary when unclear).
Prefer National CSR Portal records (origin "portal"). Be conservative: confidence ≥ 0.8 only when you are sure. why: one short reason.

${items.map((i) => `[${i.id}] ${i.name}${i.context ? ` (news: ${i.context})` : ""}\n${i.candidates.map((c) => `  - ${c.id}: ${c.name} (${c.origin})`).join("\n")}`).join("\n\n")}`;
}
