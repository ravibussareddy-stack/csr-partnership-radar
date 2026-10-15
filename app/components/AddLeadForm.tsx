"use client";
// "Add a lead" (Self added): paste a link and what you know; the intake run reads the page, Gemini analyses
// and researches it, and it becomes a card on the Digest under Self added.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addLead, type LeadInput } from "@/app/actions";

const EMPTY: LeadInput = { link: "", company: "", headline: "", kind: "", details: "", location: "", deadline: "", amount: "", announced: "" };

export function AddLeadForm() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<LeadInput>(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; unlock?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof LeadInput, v: string) => setF((x) => ({ ...x, [k]: v }));

  // The "Add a lead" button in the header links to #add-lead: open the form when arriving that way.
  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#add-lead") setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  return (
    <section className="glass card-pad missed-form add-lead" aria-labelledby="h-add-lead" id="add-lead">
      <button type="button" className="fb-toggle" onClick={() => setOpen(!open)} aria-expanded={open} id="h-add-lead">
        <span>＋ Add a lead</span> <span className="muted small">Paste a link and what you know: Gemini builds the card, shown under Self added</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <form
          className="missed-grid"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addLead(f);
              setMsg({ ok: r.ok, text: r.message ?? "", unlock: r.needsUnlock });
              if (r.ok) setF(EMPTY);
            });
          }}
        >
          <label className="wide">Link<input type="url" value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://… (article, press release, RFP or LinkedIn post)" required /></label>
          <label>Company<input value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="e.g. Bajaj Finserv" /></label>
          <label>
            Type of lead
            <select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="">Let Gemini decide</option>
              <option value="open_call">Open call / RFP for NGO partners</option>
              <option value="funding">Funding or CSR budget announcement</option>
              <option value="new_programme">New CSR programme</option>
              <option value="partnership">Partnership announced</option>
              <option value="expansion">Expanding to a new region</option>
              <option value="hiring">CSR hiring</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="wide">Headline (optional)<input value={f.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Leave blank to use the page's own title" /></label>
          <label className="wide">Details<textarea rows={3} value={f.details} onChange={(e) => set("details", e.target.value)} placeholder="What you know: who is funding what, for whom, and why it fits us. e.g. Inviting NGO proposals for youth skilling centres in Pune; contact via CSR head" required /></label>
          <label>Location<input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Pune" /></label>
          <label>Amount<input value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="e.g. ₹5 crore" /></label>
          <label>Deadline<input value={f.deadline} onChange={(e) => set("deadline", e.target.value)} placeholder="e.g. 30 Nov 2026" /></label>
          <label>Date announced<input type="date" value={f.announced} onChange={(e) => set("announced", e.target.value)} /></label>
          <div className="row">
            <button className="pill-link strong" disabled={pending}>{pending ? "Adding…" : "Add lead"}</button>
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
