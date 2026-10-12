import { z } from "zod";

export const CONTACTS_PROMPT_VERSION = "contacts-v1";

export const contactsResponseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      i: { type: "INTEGER" },
      name: { type: "STRING" },
      title: { type: "STRING" },
      company: { type: "STRING" },
      kind: { type: "STRING", enum: ["spokesperson", "author", "manager", "hiring_manager"] },
      context: { type: "STRING" },
    },
    required: ["i", "name", "title", "company", "kind", "context"],
    propertyOrdering: ["i", "name", "title", "company", "kind", "context"],
  },
};

export const contactsSchema = z.array(
  z.object({
    i: z.number().int(),
    name: z.string().trim().min(3).max(80),
    title: z.string().trim().max(120),
    company: z.string().trim().max(120),
    kind: z.enum(["spokesperson", "author", "manager", "hiring_manager"]),
    context: z.string().trim().max(300),
  }),
);

export function buildContactsPrompt(items: { i: number; title: string; body: string }[]): string {
  return `From each Indian CSR news item or public post below, list the PEOPLE who are named in a professional capacity and would be useful contacts for an education/skilling NGO's partnerships head: CSR heads, foundation leaders, sustainability or community managers, company executives announcing CSR programmes, authors of public CSR posts, hiring managers for CSR roles.

Rules:
- Only people explicitly named in the text, with their role and organisation as stated. Never guess or invent names, titles or organisations.
- Skip politicians and government officials unless they lead a CSR body, skip celebrities, journalists and the NGO's beneficiaries.
- Do not output email addresses, phone numbers or any personal details beyond name, title and organisation.
- kind: spokesperson (quoted in an announcement), author (wrote the post/article), manager (named as running the programme), hiring_manager (named on a CSR job post).
- context: up to 25 words from the text showing why they are relevant.
- Return an empty array if nobody qualifies.

Items (index, title, text):
${items.map((x) => `### ${x.i}\n${x.title}\n${x.body}`).join("\n\n")}`;
}

/** Grounded Google search for people who publicly lead CSR at one company. One line per person. */
export function buildPeopleSearchPrompt(company: string): string {
  return `Always run Google searches. Find people who publicly lead or manage CSR, the corporate foundation, sustainability or community programmes at ${company} in India (e.g. Head of CSR, CSR Manager, Foundation CEO/Director, Chief Sustainability Officer), as named on company websites, annual/BRR reports, news articles or public posts from the last three years.

Output one line per person and nothing else, in this exact format:
Full Name || Title || Organisation || kind || why relevant (max 20 words)

Rules:
- kind is one of: spokesperson, author, manager, hiring_manager.
- Only people explicitly named on a page you found, with the title stated there. Never guess or invent.
- No email addresses, phone numbers or personal details.
- At most 5 people. Output nothing if you find nobody.`;
}
