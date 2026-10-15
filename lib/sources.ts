/** Source groups used for filtering insights in the UI. */
export const SOURCE_GROUPS = [
  { id: "news", label: "News feeds", hint: "RSS feeds and CSR news archives, collected automatically" },
  { id: "search", label: "Google search", hint: "Saved searches (Gemini + Google) and Google Alerts" },
  { id: "linkedin", label: "LinkedIn", hint: "LinkedIn alert and notification emails (plus clearly labelled demo samples)" },
  { id: "personal", label: "Personal messages", hint: "Pasted messages and forwards (WhatsApp, Telegram, email)" },
  { id: "self", label: "Self added", hint: "Leads the team added by hand with \"Add a lead\" (link + details, analysed by Gemini)" },
] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number]["id"];

export function sourceGroup(source: string): SourceGroup {
  if (source === "manual") return "self";
  if (source.startsWith("pasted") || source === "email-intake") return "personal";
  if (source === "gemini-search" || source === "gemini-jobs" || source === "google-alerts") return "search";
  if (source === "linkedin-email" || source === "linkedin-demo") return "linkedin";
  return "news";
}
