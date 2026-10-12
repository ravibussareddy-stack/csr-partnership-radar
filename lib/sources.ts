/** Source groups used for filtering insights in the UI. */
export const SOURCE_GROUPS = [
  { id: "news", label: "News feeds", hint: "RSS feeds and CSR news archives, collected automatically" },
  { id: "search", label: "Google search", hint: "Saved searches (Gemini + Google) and Google Alerts" },
  { id: "linkedin", label: "LinkedIn", hint: "LinkedIn alert and notification emails" },
  { id: "personal", label: "Personal messages", hint: "Pasted messages and forwards (WhatsApp, Telegram, email)" },
] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number]["id"];

export function sourceGroup(source: string): SourceGroup {
  if (source.startsWith("pasted") || source === "email-intake") return "personal";
  if (source === "gemini-search" || source === "google-alerts") return "search";
  if (source === "linkedin-email") return "linkedin";
  return "news";
}
