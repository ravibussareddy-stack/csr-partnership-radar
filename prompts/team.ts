/**
 * Prompts for the team features processed by the intake workflow: setting up a sector added in the
 * app, answering a question about an article, and triaging confirmed dashboard feedback.
 */
import { z } from "zod";

export const TEAM_PROMPT_VERSION = "team-v2";

// ---------- sector setup ----------

export const sectorSetupResponseSchema = {
  type: "OBJECT",
  properties: {
    keywords: { type: "ARRAY", items: { type: "STRING" } },
    portal_sectors: { type: "ARRAY", items: { type: "STRING" } },
    searches: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["keywords", "portal_sectors", "searches"],
};

export const sectorSetupSchema = z.object({
  keywords: z.array(z.string().trim().min(2).max(60)).max(40),
  portal_sectors: z.array(z.string().trim()).max(6),
  searches: z.array(z.string().trim().min(5).max(160)).max(3),
});

export function buildSectorSetupPrompt(label: string, description: string, known: string[], portalSectors: string[]): string {
  return `An Indian NGO's partnerships team tracks corporate CSR news. They added a new sector to track: "${label}".
${description ? `What they mean by it: ${description}\n` : ""}${known.length ? `Keywords they gave: ${known.join(", ")}\n` : ""}
Return:
- keywords: 15 to 30 lowercase words or short phrases that would appear in Indian CSR news about this sector, including common synonyms, programme names and 4-8 Hindi and Marathi terms (in Devanagari). Avoid words so generic they match unrelated news (e.g. "development", "support").
- portal_sectors: which of these National CSR Portal development-sector names fit this sector (copy exactly; empty if none fit well): ${portalSectors.join("; ")}
- searches: 2 Google search queries a CSR partnerships head would type to find NEW corporate CSR announcements, funding or partner calls in this sector in India, ideally Maharashtra/Pune.`;
}

// ---------- answering a question about an article ----------

export function buildAnswerPrompt(ctx: {
  question: string;
  asker: string;
  article: { title: string; body: string; url: string; date: string | null };
  analysis: string;
  company: string;
  thread: string;
}): string {
  return `You are the research assistant inside "CSR Partnership Radar", used by the partnerships team of a Pune education NGO (skilling for school dropouts and first-generation job seekers, funded by corporate CSR). ${ctx.asker} asked a question about the article below. Run Google searches when the answer needs facts beyond the article (company CSR history, CSR heads, amounts, past NGO partners, policy details).

Answer rules:
- Answer the question directly first, in 2-6 short sentences or bullets. Be specific: names, ₹ amounts, years, places, programme names.
- Only state facts found in the article, the data below or your search results. If something isn't known, say so and suggest how to find out. Never invent people, numbers or contact details; never give personal emails or phone numbers.
- End with one line starting "Next step:" when there is a useful action for the partnerships head.
- Plain text, no markdown headings.

Question: ${ctx.question}

Article (${ctx.article.date ?? "date unknown"}): ${ctx.article.title}
${ctx.article.url}
${ctx.article.body}

Radar's analysis: ${ctx.analysis}

Company data (National CSR Portal and CSR news archive): ${ctx.company}
${ctx.thread ? `\nEarlier discussion:\n${ctx.thread}` : ""}`;
}

// ---------- answering from retrieved sources only (RAG) ----------

export const ragAnswerResponseSchema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    cited: { type: "ARRAY", items: { type: "INTEGER" } },
    found: { type: "STRING", enum: ["yes", "partly", "no"] },
  },
  required: ["answer", "cited", "found"],
};

export const ragAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(3000),
  cited: z.array(z.number().int()).max(20),
  found: z.enum(["yes", "partly", "no"]),
});

export function buildRagAnswerPrompt(ctx: { question: string; asker: string; articleTitle: string; snippets: { n: number; kind: string; title: string; date: string | null; text: string }[]; thread: string }): string {
  return `You are the research assistant inside "CSR Partnership Radar", used by the partnerships team of a Pune education NGO (skilling for school dropouts and first-generation job seekers, funded by corporate CSR). ${ctx.asker} asked a question about the article "${ctx.articleTitle}".

Answer ONLY from the numbered sources below (the article, the Radar's analysis of it, researched sources, the same company's other CSR news and National CSR Portal data, and the team's comments). Do not use outside knowledge.

Rules:
- Answer directly first, in 2-6 short sentences or bullets, with specifics (names, ₹ amounts, years, places, programmes). Put the source number after each fact, like [3].
- If the sources don't contain the answer, say so plainly ("The Radar's sources for this article don't say …") and suggest what to check; set found to "no". If they answer only part of it, set found to "partly" and say what is missing.
- Never invent people, numbers, dates or contact details; never give personal emails or phone numbers.
- End with one line starting "Next step:" when there is a useful action for the partnerships head.
- Plain text, no markdown headings.
- cited: the numbers of the sources you actually used.

Question: ${ctx.question}
${ctx.thread ? `\nEarlier discussion (for context):\n${ctx.thread}\n` : ""}
Sources:
${ctx.snippets.map((s) => `[${s.n}] (${s.kind.replace("_", " ")}${s.date ? `, ${s.date}` : ""}) ${s.title}\n${s.text}`).join("\n\n")}`;
}

// ---------- dashboard feedback triage ----------

export const triageResponseSchema = {
  type: "OBJECT",
  properties: {
    route: { type: "STRING", enum: ["config", "developer", "designer", "none"] },
    summary: { type: "STRING" },
    ops: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          op: { type: "STRING", enum: ["add_keyword", "remove_keyword", "add_search", "disable_search", "set_weight", "add_followed_page", "set_display"] },
          target: { type: "STRING" },
          value: { type: "STRING" },
        },
        required: ["op", "target", "value"],
      },
    },
    request: { type: "STRING" },
  },
  required: ["route", "summary", "ops", "request"],
};

export const triageSchema = z.object({
  route: z.enum(["config", "developer", "designer", "none"]),
  summary: z.string().trim().max(400),
  ops: z.array(z.object({ op: z.string(), target: z.string().trim().max(120), value: z.string().trim().max(200) })).max(8),
  request: z.string().trim().max(1500),
});

export function buildTriagePrompt(fb: { page: string; kind: string; body: string; by: string }, settings: string): string {
  return `You maintain "CSR Partnership Radar", a CSR intelligence dashboard for an NGO partnerships team. A team member left feedback that the team lead confirmed. Decide how to act on it.

route:
- "config": it can be fully handled by changing the Radar's settings below (including the site's text size), without code, new API keys, paid services or human work. Then give ops.
- "developer": it needs code, data-pipeline, integration or infrastructure changes. Write request: a clear ticket for a developer (problem, expected behaviour, acceptance criteria).
- "designer": it is about layout, visuals, wording, navigation or usability that the settings cannot change. Write request: a clear brief for a designer.
- "none": praise or nothing actionable. Write a one-line summary.

Allowed ops (only these; be conservative, small changes):
- add_keyword / remove_keyword: target is one of "csr", "policy", "communityImpact", or "sector:<sector id>"; value is the keyword.
- add_followed_page: value is an organisation or LinkedIn page name to keep in LinkedIn alerts.
- add_search: target is "news", "jobs" or "policy"; value is a Google search query.
- disable_search: target is a search id from the settings.
- set_weight: target is one of "signalType.<type>", "sectorFit", "activelyPartneringBonus", "thresholds.callThisWeek", "thresholds.watch"; value is a number. Change by at most 30% from the current value.
- set_display: target "fontScale" (text size across the whole site); value is the new size, either relative like "+2%" / "-5%" or absolute like "102%". Allowed range 90%–125%, at most 10 percentage points per change. Text that is too small or too large is a settings change, not a designer request.

summary: one sentence saying what you did or why it went to the developer/designer.

Feedback (${fb.kind} about the ${fb.page} page, from ${fb.by}): ${fb.body}

Current settings:
${settings}`;
}
