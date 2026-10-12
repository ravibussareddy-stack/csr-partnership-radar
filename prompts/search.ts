/** Bump when the prompt changes. Stored in search_runs.model. */
export const SEARCH_PROMPT_VERSION = "search-v3";
export const POLICY_WINDOW_DAYS = 45;
export const SEARCH_WINDOW_DAYS = 14;
export const JOBS_WINDOW_DAYS = 14;

/**
 * Asks Gemini to run the saved search on Google (grounding tool) and list what it found,
 * one item per line. Each line is later matched to its grounding source; lines without a
 * source are dropped, so no URL ever comes from the model's own text.
 */
export function buildSearchPrompt(query: string, today: Date): string {
  return `Always run Google searches before answering (try a few phrasings). Search Google for recent Indian news matching: ${query}

Only include items published in the last ${SEARCH_WINDOW_DAYS} days (today is ${today.toISOString().slice(0, 10)}) that are about a company's or corporate foundation's CSR activity, a company looking for NGO partners, or a change to CSR rules in India.

List each item on its own line, exactly in this format, with nothing else before or after the list:
TITLE || PUBLISHER || YYYY-MM-DD || one-sentence summary

If nothing relevant was published in the window, reply with exactly: NONE`;
}

/** Job-posting variant: CSR / foundation / community roles at companies in India. */
export function buildJobsSearchPrompt(query: string, today: Date): string {
  return `Always run Google searches before answering (try a few phrasings, e.g. with "hiring", "job", "careers", the city names). Search Google for job postings in India matching: ${query}

Only include postings from the last ${JOBS_WINDOW_DAYS} days (today is ${today.toISOString().slice(0, 10)}) for CSR, corporate foundation, social impact, sustainability-CSR or community development roles at a company or its foundation (not at NGOs or government bodies). Job boards (LinkedIn Jobs, Naukri, Indeed, foundit) and company career pages are all fine.

List each posting on its own line, exactly in this format, with nothing else before or after the list:
ROLE at COMPANY || SITE || YYYY-MM-DD || city, and one sentence on what the role will do

If nothing relevant was posted in the window, reply with exactly: NONE`;
}

/**
 * Regulatory variant: official notifications, circulars and guidelines (MCA, SEBI, the Gazette, PIB)
 * plus debates and named officials' or experts' statements on CSR rules. Wider window: rules move slowly.
 */
export function buildPolicySearchPrompt(query: string, today: Date): string {
  return `Always run Google searches before answering (try a few phrasings; include official sites such as mca.gov.in, sebi.gov.in, egazette.gov.in, pib.gov.in). Search Google for: ${query}

Only include items from the last ${POLICY_WINDOW_DAYS} days (today is ${today.toISOString().slice(0, 10)}) about Indian CSR regulation: Companies Act Section 135, Schedule VII, CSR rules and amendments, MCA or SEBI notifications, circulars, FAQs, guidelines, the Social Stock Exchange, BRSR CSR disclosures, unspent CSR rules, or debates, consultations, parliamentary answers, court rulings and statements by officials or industry experts about them. Prefer the official source page when one exists.

List each item on its own line, exactly in this format, with nothing else before or after the list:
TITLE || PUBLISHER || YYYY-MM-DD || one-sentence summary saying whether it is official (notified / in force) or a proposal, debate or opinion

If nothing relevant was published in the window, reply with exactly: NONE`;
}
