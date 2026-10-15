"use client";
// "We missed this": report an opportunity the Radar didn't show (link + what was missed). It is read,
// analysed and scored like a dropped message, and counted as a miss on the Results page.
import { useState, useTransition } from "react";
import Link from "next/link";
import { reportMissed } from "@/app/actions";

export function MissedForm({ open: startOpen = false }: { open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [link, setLink] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; unlock?: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="glass card-pad missed-form" aria-labelledby="h-missed" id="missed">
      <button type="button" className="fb-toggle" onClick={() => setOpen(!open)} aria-expanded={open} id="h-missed">
        <span>Did the Radar miss something?</span> <span className="muted small">Paste the link: it&rsquo;s analysed, added to the Digest and counted as a miss</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <form
          className="missed-grid"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await reportMissed(link, company, note);
              setMsg({ ok: r.ok, text: r.message ?? "", unlock: r.needsUnlock });
              if (r.ok) {
                setLink("");
                setCompany("");
                setNote("");
              }
            });
          }}
        >
          <label>Link<input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" required /></label>
          <label>Company (optional)<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Infosys Foundation" /></label>
          <label className="wide">What was missed<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Open call for NGO partners for digital literacy in Pune schools, deadline 30 Nov" required /></label>
          <div className="row">
            <button className="pill-link strong" disabled={pending}>{pending ? "Sending…" : "Report miss"}</button>
          </div>
          {msg && (
            <p className={msg.ok ? "ok-msg" : "err-msg"} role="status">
              {msg.unlock ? <>Sign in first on <Link href="/inbox">People messages</Link>.</> : msg.text}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
