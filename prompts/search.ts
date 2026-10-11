/** Bump when the prompt changes. Stored in search_runs.model. */
export const SEARCH_PROMPT_VERSION = "search-v1";
export const SEARCH_WINDOW_DAYS = 14;

/**
 * Asks Gemini to run the saved search on Google (grounding tool) and list what it found,
 * one item per line. Each line is later matched to its grounding source; lines without a
 * source are dropped, so no URL ever comes from the model's own text.
 */
export function buildSearchPrompt(query: string, today: Date): string {
  return `Search Google for recent Indian news matching: ${query}

Only include items published in the last ${SEARCH_WINDOW_DAYS} days (today is ${today.toISOString().slice(0, 10)}) that are about a company's or corporate foundation's CSR activity, a company looking for NGO partners, or a change to CSR rules in India.

List each item on its own line, exactly in this format, with nothing else before or after the list:
TITLE || PUBLISHER || YYYY-MM-DD || one-sentence summary

If nothing relevant was published in the window, reply with exactly: NONE`;
}
