/** Pitch kit: what a company wants from CSR, its recent news, and published proof metrics, all sourced. */
export const PITCH_PROMPT_VERSION = "pitch-v1";

export function buildPitchPrompt(company: string, today: Date): string {
  return `Always run Google searches (the company's CSR / sustainability pages, annual or BRSR reports, foundation website, recent news). Today is ${today.toISOString().slice(0, 10)}. Company: ${company} (India).

A Pune NGO that runs education and skilling programmes for school dropouts and first-generation job seekers wants to pitch a CSR partnership to this company. Find:
1. WANTS: what the company says it wants from its CSR: stated focus areas, goals or targets, beneficiaries, geographies, SDGs, or business benefits it links to CSR (talent pipeline, community trust, brand, local licence to operate). Up to 4 lines.
2. NEWS: recent news (last 12 months) relevant to a partnership: new CSR programmes, budgets, expansions, new plants or offices, leadership statements. Up to 4 lines, each with its date.
3. PROOF: published numbers the company or its partners report about CSR outcomes or benefits (beneficiaries reached, placement or completion rates, survey or trust scores, spend). Only numbers that appear in a source; never estimate. Up to 4 lines.

Output one item per line, exactly in these formats, nothing else:
WANTS || what they want, in one sentence
NEWS || YYYY-MM-DD || what happened, in one sentence
PROOF || the metric with its number and what it measures, in one sentence

If you find nothing for a section, output no lines for it.`;
}
