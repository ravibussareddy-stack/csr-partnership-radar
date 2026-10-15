/** Dashboard feedback labels, shared by the Team page and the Feedback log (client-safe: no database). */
export const FB_STATUS: Record<string, string> = {
  new: "Waiting for Ananya",
  confirmed: "Confirmed · being triaged",
  declined: "Declined",
  applied: "Applied",
  routed: "Sent to developer / designer",
  failed: "Failed",
};

export const FB_KIND: Record<string, string> = { pro: "👍 Works well", con: "👎 Problem", idea: "💡 Idea" };

export interface FeedbackRow {
  id: number;
  page: string;
  kind: string;
  body: string;
  status: string;
  route: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  by: string;
}

/** One clear status line: "Sent to the designer" rather than "Sent to developer / designer · designer". */
export function statusLabel(f: Pick<FeedbackRow, "status" | "route">): string {
  if (f.status === "routed") return f.route === "designer" ? "Sent to the designer" : "Sent to the developer";
  if (f.status === "applied") return f.route === "config" ? "Applied by the Radar" : "Noted, no change needed";
  return FB_STATUS[f.status] ?? f.status;
}

/** Where a piece of feedback ended up, for the log's filters. */
export function outcome(f: Pick<FeedbackRow, "status" | "route" | "resolution">): "waiting" | "applied" | "developer" | "designer" | "declined" | "noted" | "in_progress" {
  if (f.status === "new") return "waiting";
  if (f.status === "confirmed") return "in_progress";
  if (f.status === "declined") return "declined";
  if (f.status === "routed") return f.route === "designer" ? "designer" : "developer";
  if (f.status === "applied") return f.route === "config" ? "applied" : "noted";
  return "in_progress";
}
