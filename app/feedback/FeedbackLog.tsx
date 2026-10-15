"use client";
import { useState } from "react";
import { FB_KIND, outcome, statusLabel, type FeedbackRow } from "@/lib/feedback";
import { ReviewFeedback } from "@/app/team/TeamForms";

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

const FILTERS = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting for Ananya" },
  { id: "applied", label: "Applied by the Radar" },
  { id: "developer", label: "Developer requests" },
  { id: "designer", label: "Designer requests" },
  { id: "declined", label: "Declined" },
  { id: "noted", label: "Noted, no change" },
  { id: "in_progress", label: "In progress" },
] as const;

export function FeedbackLog({ rows, lead }: { rows: FeedbackRow[]; lead: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const count = (id: string) => (id === "all" ? rows.length : rows.filter((r) => outcome(r) === id).length);
  const shown = filter === "all" ? rows : rows.filter((r) => outcome(r) === filter);
  return (
    <>
      <div className="filter-bar glass" role="group" aria-label="Filter feedback">
        <div className="chips">
          {FILTERS.filter((f) => f.id === "all" || count(f.id) > 0 || f.id === "waiting").map((f) => (
            <button key={f.id} className={filter === f.id ? "chip on" : "chip"} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <b>{count(f.id)}</b>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{rows.length === 0 ? "No feedback yet. Use the box at the bottom of any page." : "Nothing here."}</p>
      ) : (
        <ol className="fb-list fb-log">
          {shown.map((f) => (
            <li key={f.id} className={`glass card-pad fb fb-${f.status}`}>
              <p className="small">
                <b>#{f.id}</b> · <span className={`fb-kind fb-${f.kind}`}>{FB_KIND[f.kind] ?? f.kind}</span> · {f.page} page · {f.by} · {when.format(new Date(f.createdAt))}
              </p>
              <p>{f.body}</p>
              <p className="small">
                <b>{statusLabel(f)}</b>
                {f.resolvedAt && f.status !== "new" ? ` · ${when.format(new Date(f.resolvedAt))}` : ""}
              </p>
              {f.resolution && <p className="small fb-resolution">{f.resolution}</p>}
              {lead && f.status === "new" && <ReviewFeedback id={f.id} />}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
