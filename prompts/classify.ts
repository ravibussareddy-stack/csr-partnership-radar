import { z } from "zod";
import type { AppConfig } from "@/config/defaults";

/** Bump whenever the prompt or schema changes. Stored in classifications.model. */
export const PROMPT_VERSION = "classify-v1";

export const SIGNAL_TYPE_VALUES = [
  "new_initiative",
  "allocation_increase",
  "partner_search",
  "policy_change",
  "none",
] as const;

/**
 * Gemini `responseSchema` (OpenAPI 3.0 subset). Sector ids are injected from
 * config so the model can only return sectors we track.
 */
export function responseSchema(cfg: AppConfig) {
  return {
    type: "OBJECT",
    properties: {
      is_signal: { type: "BOOLEAN" },
      signal_type: { type: "STRING", enum: [...SIGNAL_TYPE_VALUES] },
      sectors: {
        type: "ARRAY",
        items: { type: "STRING", enum: cfg.sectors.map((s) => s.id) },
      },
      geographies: { type: "ARRAY", items: { type: "STRING" } },
      companies: { type: "ARRAY", items: { type: "STRING" } },
      why_it_matters: { type: "STRING" },
      confidence: { type: "NUMBER" },
    },
    required: [
      "is_signal",
      "signal_type",
      "sectors",
      "geographies",
      "companies",
      "why_it_matters",
      "confidence",
    ],
    propertyOrdering: [
      "is_signal",
      "signal_type",
      "sectors",
      "geographies",
      "companies",
      "why_it_matters",
      "confidence",
    ],
  };
}

/** zod validation of the model output. Unknown sector ids are a validation failure. */
export function classificationSchema(cfg: AppConfig) {
  const sectorIds = cfg.sectors.map((s) => s.id) as [string, ...string[]];
  return z
    .object({
      is_signal: z.boolean(),
      signal_type: z.enum(SIGNAL_TYPE_VALUES),
      sectors: z.array(z.enum(sectorIds)).max(10),
      geographies: z.array(z.string().trim().min(1).max(80)).max(10),
      companies: z.array(z.string().trim().min(1).max(120)).max(10),
      why_it_matters: z.string().trim().max(400),
      confidence: z.number().min(0).max(1),
    })
    .transform((v) => {
      // "none" and is_signal must agree; trust the stricter of the two.
      const isSignal = v.is_signal && v.signal_type !== "none";
      return { ...v, is_signal: isSignal, signal_type: isSignal ? v.signal_type : ("none" as const) };
    });
}

export type Classification = z.infer<ReturnType<typeof classificationSchema>>;

export function buildPrompt(
  item: { title: string; body: string; source: string; publishedAt: Date | null },
  cfg: AppConfig,
): string {
  const sectors = cfg.sectors.map((s) => `- ${s.id}: ${s.label}`).join("\n");
  const geos = cfg.geographies.map((g) => g.label).join(", ");
  return `You are a CSR (corporate social responsibility) intelligence analyst for an Indian education NGO based in Pune. The NGO runs skilling programmes for school dropouts and first-generation job seekers and is funded by corporate CSR partnerships.

Decide whether the news item below is a CSR partnership signal for this NGO.

A signal is one of:
- new_initiative: a company (or its foundation) announces a NEW CSR programme, project or commitment in one of the focus sectors.
- allocation_increase: a company signals more CSR budget or spend in the focus sectors (for example a bigger CSR outlay, a new multi-crore commitment, or annual report coverage of higher education/skilling spend).
- partner_search: a company or foundation is explicitly looking for NGO or implementation partners (RFPs, calls for proposals, EOIs, empanelment).
- policy_change: a policy, rule or regulatory change that affects how companies deploy CSR funds in India (Companies Act Section 135, Schedule VII, CSR rules, MCA or SEBI circulars, Social Stock Exchange).
Use "none" with is_signal=false for anything else: general business news, awards, opinion pieces, CSR outside the focus sectors, or a programme already running with nothing new.

Focus sectors (use only these ids):
${sectors}

Priority geographies: ${geos}.

Rules:
- Base every field only on the text below. Do not invent facts.
- companies: the companies or corporate foundations behind the CSR activity, as named in the text. Empty if none.
- geographies: Indian cities or states where the activity happens, as named in the text; "India" if national; empty if unknown.
- why_it_matters: one sentence (under 30 words) telling the NGO's partnerships head why this matters, or why it does not.
- confidence: 0 to 1, how sure you are about is_signal and signal_type.
- The text may be in Hindi or English. Write why_it_matters in English.

News item:
Source: ${item.source}
Published: ${item.publishedAt ? item.publishedAt.toISOString().slice(0, 10) : "unknown"}
Title: ${item.title}
Body: ${item.body}`;
}
