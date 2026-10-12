import { z } from "zod";
import type { AppConfig } from "@/config/defaults";

/**
 * Bump whenever the prompt or schema changes. Stored in classifications.model.
 * Items classified under an older version are re-classified once (see scripts/ingest/classify.ts).
 *
 * v2: keeps ongoing programmes / spend reports (ongoing_programme) and CSR outside the
 *     focus sectors (other_sectors) instead of discarding them; adds programme age,
 *     NGO partnering status, partners, amount and financial year.
 * v3: adds csr_hiring (job posts for CSR / foundation roles = a growing CSR team) and
 *     regional_expansion (a company investing / setting up operations in India: a future CSR
 *     funder there, since s.135(5) prefers local areas of operation); any Indian language.
 * v4: adds key_points (3-5 bullets), next_step (the job to be done for the partnerships head)
 *     and company_domain (official website domain, for logos).
 * v5: never take the news publisher / website (e.g. from Google Alerts snippets) for the company.
 * v6: specific headline (who · what · where · how much), worth_it (why it deserves her time, with
 *     the concrete facts), denser key points; for policy items a status (confirmed / executed /
 *     inferred) and verbatim quotes from officials and experts.
 */
export const PROMPT_VERSION = "classify-v6";

/**
 * The stored version also carries a short hash of the tracked sector ids, so adding a sector in the
 * app re-classifies the lookback window once with the new sector available.
 */
export function promptVersion(cfg: AppConfig): string {
  const ids = cfg.sectors.map((s) => s.id).sort().join(",");
  let h = 0;
  for (const ch of ids) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${PROMPT_VERSION}.s${h.toString(36)}`;
}

export const POLICY_STATUS_VALUES = ["confirmed", "executed", "inferred"] as const;

export const SIGNAL_TYPE_VALUES = [
  "new_initiative",
  "allocation_increase",
  "partner_search",
  "policy_change",
  "ongoing_programme",
  "csr_hiring",
  "regional_expansion",
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
  "key_points",
  "next_step",
  "company_domain",
  "headline",
  "worth_it",
  "policy_status",
  "quotes",
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
      key_points: { type: "ARRAY", items: { type: "STRING" } },
      next_step: { type: "STRING" },
      company_domain: { type: "STRING", nullable: true },
      headline: { type: "STRING" },
      worth_it: { type: "STRING" },
      policy_status: { type: "STRING", enum: [...POLICY_STATUS_VALUES], nullable: true },
      quotes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { speaker: { type: "STRING" }, role: { type: "STRING" }, quote: { type: "STRING" } },
          required: ["speaker", "role", "quote"],
        },
      },
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
      key_points: z.array(z.string().trim().min(1).max(240)).max(6).default([]),
      next_step: z.string().trim().max(300).default(""),
      company_domain: z
        .string()
        .trim()
        .toLowerCase()
        .nullable()
        .transform((d) => (d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")) ? d.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") : null)),
      headline: z.string().trim().max(200).default(""),
      worth_it: z.string().trim().max(400).default(""),
      policy_status: z.enum(POLICY_STATUS_VALUES).nullable().default(null),
      quotes: z
        // Long quotes are trimmed at a word boundary rather than failing the item; the trimmed text
        // is still a prefix of the original, so the verbatim check in classify.ts still applies.
        .array(
          z.object({
            speaker: z.string().trim().min(2).transform((x) => x.slice(0, 100)),
            role: z.string().trim().transform((x) => x.slice(0, 150)),
            quote: z.string().trim().min(10).transform((q) => (q.length <= 600 ? q : q.slice(0, q.lastIndexOf(" ", 600)))),
          }),
        )
        .transform((qs) => qs.slice(0, 5))
        .default([]),
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

is_signal = true for any corporate CSR activity in India by a named company or corporate foundation, in ANY sector, plus CSR policy changes, CSR job posts, and companies expanding operations in India (see below). is_signal = false only for items that are not about corporate CSR at all (general business news, lifestyle or tech articles, awards, opinion with no CSR activity, an NGO's own news with no corporate funder).

signal_type (pick the strongest that applies):
- partner_search: a company or foundation is explicitly looking for NGO or implementation partners (RFPs, calls for proposals, EOIs, empanelment).
- new_initiative: a NEW CSR programme, project, partnership or commitment, or a new expansion of one.
- allocation_increase: more CSR budget or spend (a bigger outlay, a new multi-crore commitment, a year-on-year increase).
- policy_change: a policy, rule or regulatory change affecting how companies deploy CSR funds in India (Companies Act Section 135, Schedule VII, CSR rules, MCA or SEBI circulars, Social Stock Exchange).
- ongoing_programme: an existing programme with nothing new announced, or a retrospective spend/impact report.
- csr_hiring: a company or corporate foundation is hiring for CSR, foundation, social impact or community roles (job posts, job alerts). Put the hiring company in companies and the job location in geographies.
- regional_expansion: a company (Indian or foreign) announces a new plant, campus, office or major investment in India. Not CSR yet, but a future CSR funder in that area, because Indian CSR law prefers the local areas where a company operates. Put the investing company in companies and the Indian city/state in geographies; sectors and other_sectors may be empty.
- none: not corporate CSR (is_signal = false).

Focus sectors (sectors: use only these ids):
${sectors}
Other CSR areas (other_sectors: use these ids for CSR outside the focus sectors): ${others}.
An item can have both.

Priority geographies: ${geos}.

Rules:
- Base every field only on the text below. Do not invent facts. Use null or empty when the text does not say.
- companies: the companies or corporate foundations funding the CSR activity, written in English (Latin script) as commonly used, e.g. "Tata Trusts" even if the text is in Marathi. NEVER use the news publisher, website or channel that reported the story (e.g. Sportskeeda, Times of India, India CSR, YouTube) as the company. If the text says "with CSR support" without naming the funder, leave companies empty.
- geographies: Indian cities or states where the activity happens; "India" if national.
- partners: names of EXTERNAL NGOs or implementation partners working with the company on this activity. The company's own foundation, group trust or group-run institute is NOT a partner.
- actively_partnering: "yes" if partners is non-empty or the text says the company works through external NGOs / implementation partners; "no" if the text says it runs the activity itself (own foundation, group trust, staff); else "unknown".
- programme_start_year: the year the programme began, if stated or clearly derivable (e.g. "since 2016", "10th edition this year" → compute). Otherwise null.
- amount_inr_crore: the main CSR amount in crore rupees (1 crore = 100 lakh; convert lakh to crore), else null.
- financial_year: the financial year the amount or activity refers to, as "FY2025-26", else null.
- why_it_matters: one sentence (under 30 words) for the partnerships head: what happened and whether it is a near-term opportunity, a long-term relationship lead, or context only.
- headline: a specific headline in English, under 20 words: who · what · where · how much / how many. Example: "Bajaj Finance commits ₹12 cr to train 5,000 Pune youth in BFSI skills with 3 NGOs". Never generic ("Company launches CSR initiative").
- worth_it: 1-2 sentences on why this deserves her time, citing the concrete facts that make it so: the amount, the scale (beneficiaries, schools, districts), the location vs Pune/Maharashtra, whether they fund external NGOs, a deadline, a named contact, a funding cycle. If it is weak or context only, say plainly why (e.g. "Health CSR in Odisha by an own foundation: no partner opening").
- key_points: 3 to 5 bullet facts, each carrying at least one SPECIFIC detail from the text (a number, ₹ amount, place, date, programme name, partner, beneficiary group, eligibility, deadline, contact role). Do not write generic points like "focuses on education" or "aims to empower communities". No speculation; fewer points if the text has fewer facts.
- policy_status (policy_change items only, else null): "executed" = in force or being implemented (notified with an effective date that has passed, or already applied); "confirmed" = officially announced, notified or published by the government or regulator (MCA, SEBI, a ministry, the Gazette) but not yet in effect; "inferred" = a draft, consultation, committee recommendation, budget speech hint, debate, expert opinion or media report of what may happen.
- quotes: up to 3 statements by officials, regulators, ministers, CSR heads or industry experts, copied WORD FOR WORD from the text (verbatim, no paraphrase), with the speaker's name and role as given. Empty if the text has no direct quotes.
- next_step: the job to be done this week, one concrete sentence addressed to the partnerships head (e.g. "Email the Bajaj Finance CSR team this week with the Pune youth-skilling outcomes deck; ask about their FY27 partner intake."). For context-only items, say what to watch for.
- company_domain: the main company's official website domain (e.g. "bajajfinserv.in"), only if you are confident; otherwise null.
- confidence: 0 to 1, how sure you are about is_signal and signal_type.
- The text may be in English, Hindi, Marathi or any other language. Write why_it_matters in English.

News item:
Source: ${item.source}
Published: ${item.publishedAt ? item.publishedAt.toISOString().slice(0, 10) : "unknown"}
Title: ${item.title}
Body: ${item.body}`;
}
