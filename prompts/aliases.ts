import { z } from "zod";

/** Bump when the prompt or schema changes. */
export const ALIAS_PROMPT_VERSION = "aliases-v1";

export const aliasResponseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      i: { type: "INTEGER" },
      aliases: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["i", "aliases"],
    propertyOrdering: ["i", "aliases"],
  },
};

export const aliasSchema = z.array(z.object({ i: z.number().int(), aliases: z.array(z.string().trim().min(2).max(60)).max(5) }));

export function buildAliasPrompt(items: { i: number; name: string }[]): string {
  return `For each Indian company below (official registered name), list the short names Indian business and CSR news commonly use for it: acronyms (e.g. "TCS"), shortened names (e.g. "Bajaj Finance"), or the company's CSR foundation name if news uses it for the company's CSR (e.g. "Infosys Foundation").

Rules:
- Only names that unambiguously mean THIS company. Never a bare group name shared by many companies ("Tata", "Reliance", "Adani", "Birla", "Bajaj", "Mahindra").
- Don't repeat the official name, and don't just drop "Limited"/"Private Limited" (that is matched already).
- Return an empty list when you are not sure.

Companies (index, official name):
${items.map((x) => `${x.i}\t${x.name}`).join("\n")}`;
}
