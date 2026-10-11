import { z } from "zod";
import type { AppConfig } from "@/config/defaults";
import { HEADLINE_KINDS } from "@/lib/db/schema";
import { OTHER_SECTORS } from "@/prompts/classify";

/** Bump when the prompt or schema changes. Stored in company_news.model. */
export const HEADLINE_PROMPT_VERSION = "headlines-v1";

function sectorIds(cfg: AppConfig): [string, ...string[]] {
  const focus = cfg.sectors.map((s) => s.id);
  return [...focus, ...OTHER_SECTORS.map((o) => o.id).filter((id) => !focus.includes(id))] as [string, ...string[]];
}

export function headlineResponseSchema(cfg: AppConfig) {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        i: { type: "INTEGER" },
        kind: { type: "STRING", enum: [...HEADLINE_KINDS] },
        sector: { type: "STRING", enum: sectorIds(cfg) },
      },
      required: ["i", "kind", "sector"],
      propertyOrdering: ["i", "kind", "sector"],
    },
  };
}

export function headlineSchema(cfg: AppConfig) {
  return z.array(z.object({ i: z.number().int(), kind: z.enum(HEADLINE_KINDS), sector: z.enum(sectorIds(cfg)) }));
}

export function buildHeadlinePrompt(items: { i: number; company: string; title: string }[], cfg: AppConfig): string {
  const sectors = sectorIds(cfg).join(", ");
  const lines = items.map((x) => `${x.i}\t${x.company}\t${x.title}`).join("\n");
  return `Classify each Indian news headline about a company's CSR (corporate social responsibility).

kind:
- new_initiative: the company launches or expands a CSR programme, project, centre or campaign.
- partnership: the company (or its foundation) signs an MoU / partners with an NGO, government body or institution for CSR.
- allocation_or_spend: a CSR budget, commitment, or annual CSR spend figure.
- partner_search: the company seeks NGO / implementation partners (RFP, call for proposals, EOI).
- ongoing_activity: a one-off event or update within an existing CSR programme (camp, drive, award for CSR, impact milestone).
- not_csr: not about the company's CSR (business, products, results, legal, people news).

sector: the main CSR area, one of: ${sectors}. Use "other" if none fits or kind is not_csr.

Return one object per headline with its index i. Headlines (index, company, headline):
${lines}`;
}

/** Archive variant: no company is known up front, so the model also names it. */
export function archiveHeadlineResponseSchema(cfg: AppConfig) {
  const base = headlineResponseSchema(cfg);
  return {
    ...base,
    items: {
      ...base.items,
      properties: { ...base.items.properties, company: { type: "STRING" } },
      required: [...base.items.required, "company"],
      propertyOrdering: ["i", "company", "kind", "sector"],
    },
  };
}

export function archiveHeadlineSchema(cfg: AppConfig) {
  return z.array(
    z.object({ i: z.number().int(), company: z.string().trim().max(120), kind: z.enum(HEADLINE_KINDS), sector: z.enum(sectorIds(cfg)) }),
  );
}

export function buildArchiveHeadlinePrompt(items: { i: number; title: string }[], cfg: AppConfig): string {
  const lines = items.map((x) => `${x.i}\t${x.title}`).join("\n");
  return buildHeadlinePrompt([], cfg)
    .replace(
      "Return one object per headline with its index i. Headlines (index, company, headline):\n",
      `company: the company or corporate foundation whose CSR the headline is about, as named (e.g. "HDFC Bank Parivartan" → "HDFC Bank"). Empty string if it is not about a company's CSR (NGO-only, government-only, or not CSR).

Return one object per headline with its index i. Headlines (index, headline):
${lines}`,
    );
}
