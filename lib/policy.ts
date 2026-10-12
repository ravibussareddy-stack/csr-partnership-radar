/** Labels for regulatory items (shared by server and client components). */
export const POLICY_STATUS: Record<string, { label: string; help: string }> = {
  executed: { label: "Executed", help: "In force or already being implemented: notified with an effective date that has passed, or applied." },
  confirmed: { label: "Confirmed", help: "Officially announced, notified or published by the government or regulator (MCA, SEBI, a ministry, the Gazette), but not yet in effect." },
  inferred: { label: "Inferred", help: "Not official yet: a draft, consultation, committee recommendation, debate, expert view or a media report of what may happen." },
};
