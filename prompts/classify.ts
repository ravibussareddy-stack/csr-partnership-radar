import { z } from "zod";
import type { AppConfig } from "@/config/defaults";

/**
 * Bump whenever the prompt or schema changes. Stored in classifications.model.
 * Items classified under an older version are re-classified once (see scripts/ingest/classify.ts).
 *
 * v2: keeps ongoing programmes / spend reports (ongoing_programme) and CSR outside the
 *     focus sectors (other_sectors) instead of discarding them; adds programme age,
 *     NGO partnering status, partners, amount and financial year.
 */
export const PROMPT_VERSION = "classify-v2";

export const SIGNAL_TYPE_VALUES = [
  "new_initiative",
  "allocation_increase",
  "partner_search",
  "policy_change",
  "ongoing_programme",
  "none",
] as const;

export const PARTNERING_VALUES = ["yes", "no", "unknown"] as const;

/** CSR areas outside the configured focus sectors (roughly Schedule VII). */
export const OTHER_SECTORS = [
  { id: "health", label: "Health" },
  { id: "environment", label: "Environment" },
  { id: "rural_development", label: "Rural development" },
  { id: "women_empowerment", label: "Women empowerment" },
  { id: "livelihoods", label: "Livelihoods" },
  { id: "water_sanitation", label: "Water & sanitation" },
  { id: "sports", label: "Sports" },
  { id: "heritage_culture", label: "Heritage & culture" },
  { id: "disaster_relief", label: "Disaster relief" },
  { id: "animal_welfare", label: "Animal welfare" },
  { id: "other", label: "Other" },
] as const;

function otherSectorIds(cfg: AppConfig): [string, ...string[]] {
  const focus = new Set(cfg.sectors.map((s) => s.id));
  return OTHER_SECTORS.map((s) => s.id).filter((id) => !focus.has(id)) as [string, ...string[]];
}

const FIELDS = [
  "is_signal",
  "signal_type",
  "sectors",
  "other_sectors",
  "geographies",
  "companies",
  "partners",
  "actively_partnering",
  "programme_start_year",
  "amount_inr_crore",
  "financial_year",
  "why_it_matters",
  "confidence",
];

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
      sectors: { type: "ARRAY", items: { type: "STRING", enum: cfg.sectors.map((s) => s.id) } },
      other_sectors: { type: "ARRAY", items: { type: "STRING", enum: otherSectorIds(cfg) } },
      geographies: { type: "ARRAY", items: { type: "STRING" } },
      companies: { type: "ARRAY", items: { type: "STRING" } },
      actively_partnering: { type: "STRING", enum: [...PARTNERING_VALUES] },
      partners: { type: "ARRAY", items: { type: "STRING" } },
      programme_start_year: { type: "INTEGER", nullable: true },
      amount_inr_crore: { type: "NUMBER", nullable: true },
      financial_year: { type: "STRING", nullable: true },
      why_it_matters: { type: "STRING" },
      confidence: { type: "NUMBER" },
    },
    required: FIELDS,
    propertyOrdering: FIELDS,
  };
}

/** zod validation of the model output. Unknown sector ids are a validation failure. */
export function classificationSchema(cfg: AppConfig) {
  const sectorIds = cfg.sectors.map((s) => s.id) as [string, ...string[]];
  const thisYear = new Date().getFullYear();
  return z
    .object({
      is_signal: z.boolean(),
      signal_type: z.enum(SIGNAL_TYPE_VALUES),
      sectors: z.array(z.enum(sectorIds)).max(10),
      other_sectors: z.array(z.enum(otherSectorIds(cfg))).max(10),
      geographies: z.array(z.string().trim().min(1).max(80)).max(10),
      companies: z.array(z.string().trim().min(1).max(120)).max(10),
      actively_partnering: z.enum(PARTNERING_VALUES),
      partners: z.array(z.string().trim().min(1).max(120)).max(10),
      // Out-of-range years are dropped rather than failing the whole item.
      programme_start_year: z
        .number()
        .int()
        .nullable()
        .transform((y) => (y !== null && y >= 1950 && y <= thisYear ? y : null)),
      amount_inr_crore: z
        .number()
        .nullable()
        .transform((a) => (a !== null && a > 0 && a < 1_000_000 ? a : null)),
      financial_year: z.string().trim().max(20).nullable(),
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
  const others = OTHER_SECTORS.filter((o) => otherSectorIds(cfg).includes(o.id))
    .map((s) => `${s.id} (${s.label})`)
    .join(", ");
  const geos = cfg.geographies.map((g) => g.label).join(", ");
  return `You are a CSR (corporate social responsibility) intelligence analyst for an Indian education NGO based in Pune. The NGO runs skilling programmes for school dropouts and first-generation job seekers and is funded by corporate CSR partnerships. Its partnerships head reviews corporate CSR activity in ALL sectors (to plan expansion), but acts first on activity in the focus sectors.

Classify the news item below.

is_signal = true for any corporate CSR activity in India by a named company or corporate foundation, in ANY sector, plus CSR policy changes. is_signal = false only for items that are not about corporate CSR at all (general business news, lifestyle or tech articles, awards, opinion with no CSR activity, an NGO's own news with no corporate funder).

signal_type (pick the strongest that applies):
- partner_search: a company or foundation is explicitly looking for NGO or implementation partners (RFPs, calls for proposals, EOIs, empanelment).
- new_initiative: a NEW CSR programme, project, partnership or commitment, or a new expansion of one.
- allocation_increase: more CSR budget or spend (a bigger outlay, a new multi-crore commitment, a year-on-year increase).
- policy_change: a policy, rule or regulatory change affecting how companies deploy CSR funds in India (Companies Act Section 135, Schedule VII, CSR rules, MCA or SEBI circulars, Social Stock Exchange).
- ongoing_programme: an existing programme with nothing new announced, or a retrospective spend/impact report.
- none: not corporate CSR (is_signal = false).

Focus sectors (sectors: use only these ids):
${sectors}
Other CSR areas (other_sectors: use these ids for CSR outside the focus sectors): ${others}.
An item can have both.

Priority geographies: ${geos}.

Rules:
- Base every field only on the text below. Do not invent facts. Use null or empty when the text does not say.
- companies: the companies or corporate foundations funding the CSR activity, as named.
- geographies: Indian cities or states where the activity happens; "India" if national.
- partners: names of EXTERNAL NGOs or implementation partners working with the company on this activity. The company's own foundation, group trust or group-run institute is NOT a partner.
- actively_partnering: "yes" if partners is non-empty or the text says the company works through external NGOs / implementation partners; "no" if the text says it runs the activity itself (own foundation, group trust, staff); else "unknown".
- programme_start_year: the year the programme began, if stated or clearly derivable (e.g. "since 2016", "10th edition this year" → compute). Otherwise null.
- amount_inr_crore: the main CSR amount in crore rupees (1 crore = 100 lakh; convert lakh to crore), else null.
- financial_year: the financial year the amount or activity refers to, as "FY2025-26", else null.
- why_it_matters: one sentence (under 30 words) for the partnerships head: what happened and whether it is a near-term opportunity, a long-term relationship lead, or context only.
- confidence: 0 to 1, how sure you are about is_signal and signal_type.
- The text may be in Hindi or English. Write why_it_matters in English.

News item:
Source: ${item.source}
Published: ${item.publishedAt ? item.publishedAt.toISOString().slice(0, 10) : "unknown"}
Title: ${item.title}
Body: ${item.body}`;
}
