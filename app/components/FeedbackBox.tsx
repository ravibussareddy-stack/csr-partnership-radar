"use client";
/**
 * Feedback on the dashboard itself, at the bottom of every page. Teammates' feedback waits for the
 * lead to confirm; the lead's own is confirmed straight away. Confirmed feedback is triaged by the
 * intake workflow (a safe settings change, or a request to the developer / designer).
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sendDashboardFeedback } from "@/app/actions";

const KINDS = [
  { id: "pro", label: "👍 Works well" },
  { id: "con", label: "👎 Problem" },
  { id: "idea", label: "💡 Idea" },
] as const;

export function FeedbackBox() {
  const path = usePathname();
  const page = path === "/" ? "summary" : (path.split("/")[1] || "general");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"pro" | "con" | "idea">("idea");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; unlock?: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <footer className="feedback-box glass" aria-labelledby="fb-title">
      <button type="button" className="fb-toggle" onClick={() => setOpen(!open)} aria-expanded={open} id="fb-title">
        <span>How is this page working for you?</span> <span className="muted small">Feedback on the dashboard: what works, what doesn&rsquo;t, ideas</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await sendDashboardFeedback(page, kind, body);
              setMsg({ ok: r.ok, text: r.message ?? "", unlock: r.needsUnlock });
              if (r.ok) setBody("");
            });
          }}
        >
          <div className="chips" role="radiogroup" aria-label="Type of feedback">
            {KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={kind === k.id ? "chip on" : "chip"} onClick={() => setKind(k.id)}>{k.label}</button>
            ))}
            <span className="muted small">about the <b>{page}</b> page</span>
          </div>
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. The hiring cards should show salary when known · Add 'mental health' keywords · The calendar is hard to read on my phone" maxLength={1500} />
          <button className="pill-link strong" disabled={pending || body.trim().length < 5}>{pending ? "Sending…" : "Send feedback"}</button>
          {msg && <p className={msg.ok ? "ok-msg" : "err-msg"} role="status">{msg.unlock ? <><Link href="/inbox">Sign in</Link> so we know who it&rsquo;s from.</> : msg.text}</p>}
          <p className="muted small">Ananya confirms each item. Settings-level fixes (keywords, searches, scoring) are applied automatically; anything else goes to the developer or designer. Follow it on the <Link href="/team">Team</Link> page.</p>
        </form>
      )}
    </footer>
  );
}
