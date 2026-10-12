"use client";
import { useMemo, useState } from "react";
import type { QuestionRow } from "@/lib/questions";

const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const RANGES = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom range" },
] as const;

/** Start of today / this week (Monday) / this month in IST, as epoch ms. */
function rangeStart(id: string, now: number): number {
  const ist = new Date(now + 5.5 * 3600_000);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), d = ist.getUTCDate();
  const midnight = Date.UTC(y, m, d) - 5.5 * 3600_000;
  if (id === "today") return midnight;
  if (id === "week") return midnight - ((ist.getUTCDay() + 6) % 7) * 86400_000;
  if (id === "month") return Date.UTC(y, m, 1) - 5.5 * 3600_000;
  return 0;
}

const mins = (a: string, b: string | null) => (b ? Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)) : null);

export function QuestionsSheet({ rows }: { rows: QuestionRow[] }) {
  const [now] = useState(() => Date.now());
  const [range, setRange] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [asker, setAsker] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const askers = useMemo(() => [...new Set(rows.map((r) => r.asker))].sort(), [rows]);
  const shown = rows.filter((r) => {
    const t = new Date(r.askedAt).getTime();
    if (range === "custom") {
      if (from && t < new Date(`${from}T00:00:00+05:30`).getTime()) return false;
      if (to && t > new Date(`${to}T23:59:59+05:30`).getTime()) return false;
    } else if (range !== "all" && t < rangeStart(range, now)) return false;
    if (asker !== "all" && r.asker !== asker) return false;
    if (status !== "all" && r.status !== status) return false;
    if (q && !`${r.question} ${r.answer ?? ""} ${r.itemTitle}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const times = shown.map((r) => mins(r.askedAt, r.answeredAt)).filter((x): x is number => x != null).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;

  const csv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [["Asked", "Asked by", "Article", "Article link", "Question", "Search", "Status", "Answer", "Answered", "Minutes to answer", "Sources"].join(",")];
    for (const r of shown) lines.push([fmt.format(new Date(r.askedAt)), r.asker, r.itemTitle, r.itemUrl, r.question, r.scope === "web" ? "web" : "article sources", r.status, r.answer ?? "", r.answeredAt ? fmt.format(new Date(r.answeredAt)) : "", String(mins(r.askedAt, r.answeredAt) ?? ""), r.sources.map((s) => s.url || s.title).join(" | ")].map((x) => esc(String(x))).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `radar-questions-${new Date(now).toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="filter-bar glass" role="search">
        <div className="chips">
          {RANGES.map((r) => <button key={r.id} className={range === r.id ? "chip on" : "chip"} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
        <div className="selects">
          {range === "custom" && (
            <>
              <label className="small">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="small">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </>
          )}
          <select value={asker} onChange={(e) => setAsker(e.target.value)} aria-label="Asked by">
            <option value="all">Everyone</option>
            {askers.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="all">Any status</option>
            <option value="answered">Answered</option>
            <option value="open">Waiting</option>
            <option value="failed">Failed</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions, answers, articles" aria-label="Search" />
          <button className="chip" onClick={csv} disabled={shown.length === 0}>Download CSV</button>
        </div>
      </div>
      <p className="muted small">{shown.length} question{shown.length === 1 ? "" : "s"}{median != null ? ` · median time to answer ${median} min` : ""}</p>
      {shown.length === 0 ? <p className="muted">No questions match.</p> : (
        <div className="sheet glass">
          <table>
            <thead>
              <tr><th>Asked</th><th>By</th><th>Question</th><th>Article</th><th>Status</th><th>Answer</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={open === r.id ? "open" : undefined}>
                  <td className="nowrap">{fmt.format(new Date(r.askedAt))}</td>
                  <td>{r.asker}</td>
                  <td>{r.question}{r.scope === "web" && <span className="muted small"> (web)</span>}</td>
                  <td><a href={r.itemUrl.startsWith("http") ? r.itemUrl : undefined} target="_blank" rel="noopener noreferrer">{r.itemTitle.slice(0, 90)}</a></td>
                  <td><span className={`q-status q-${r.status}`}>{r.status === "answered" ? `Answered${mins(r.askedAt, r.answeredAt) ? ` · ${mins(r.askedAt, r.answeredAt)} min` : ""}` : r.status === "open" ? "Waiting" : "Failed"}</span></td>
                  <td>
                    {r.answer ? (
                      <>
                        <p className={open === r.id ? "q-answer" : "q-answer clamp"}>{r.answer}</p>
                        {open === r.id && r.sources.length > 0 && (
                          <ul className="research">{r.sources.map((s) => <li key={s.title + s.url}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}</li>)}</ul>
                        )}
                        <button className="chip" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Less" : "Full answer"}</button>
                      </>
                    ) : <span className="muted small">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
