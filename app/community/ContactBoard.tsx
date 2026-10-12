"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { updateContact } from "@/app/actions";
import { Logo } from "@/app/components/Logo";
import { PlaceSelect } from "@/app/components/PlaceSelect";

export interface ContactCard {
  id: number;
  name: string;
  title: string | null;
  companyName: string | null;
  companyId: number | null;
  domain: string | null;
  kind: string;
  sourceUrl: string;
  sourceTitle: string | null;
  context: string | null;
  status: "new" | "reached_out" | "connected" | "failed" | "not_useful";
  notes: string | null;
  isDemo: boolean;
  places: string[];
  sourceCheck: "ok" | "mismatch" | "unreadable" | null;
}

const COLUMNS = [
  { id: "new", label: "To reach", hint: "Found in public CSR news or posts" },
  { id: "reached_out", label: "Reached out", hint: "Message or call sent" },
  { id: "connected", label: "Connected", hint: "In conversation" },
  { id: "failed", label: "Failed", hint: "No reply or not a fit" },
] as const;
const KIND: Record<string, string> = { spokesperson: "Quoted in an announcement", author: "Wrote a CSR post", manager: "Runs a programme", hiring_manager: "Hiring for CSR" };

function Card({ c, onMove }: { c: ContactCard; onMove: (id: number, status: ContactCard["status"], notes?: string) => void }) {
  const [notes, setNotes] = useState(c.notes ?? "");
  const [editing, setEditing] = useState(false);
  const linkedinSearch = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${c.name} ${c.companyName ?? ""}`.trim())}`;
  return (
    <li className="contact glass spot">
      <header className="cue-head">
        <Logo name={c.companyName ?? c.name} domain={c.domain} size={36} />
        <div className="cue-who">
          <span className="cue-company">{c.name}</span>
          <span className="cue-type">{[c.title, c.companyId ? null : c.companyName].filter(Boolean).join(" · ")}{c.companyId && <> · <Link href={`/companies/${c.companyId}`}>{c.companyName}</Link></>}</span>
        </div>
        {c.isDemo && <span className="badge-demo">Demo</span>}
      </header>
      <p className="small"><span className="fact">{KIND[c.kind] ?? c.kind}</span></p>
      {c.context && <p className="contact-context">&ldquo;{c.context}&rdquo;</p>}
      <p className="small muted"><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.sourceTitle ?? "Source"} ↗</a>{c.sourceCheck === "ok" && <span className="fact fact-good" title="The source page names this person (checked by the daily audit)"> ✓ source checked</span>}</p>
      <div className="contact-actions">
        <a className="chip" href={linkedinSearch} target="_blank" rel="noopener noreferrer">Find on LinkedIn ↗</a>
        {COLUMNS.filter((col) => col.id !== c.status).map((col) => (
          <button key={col.id} className="chip" onClick={() => onMove(c.id, col.id)}>{col.label}</button>
        ))}
        <button className="chip" onClick={() => onMove(c.id, "not_useful")} title="Hide this person">Not useful</button>
        <button className="chip" onClick={() => setEditing(!editing)}>{editing ? "Close notes" : c.notes ? "Notes ✎" : "Add notes"}</button>
      </div>
      {editing && (
        <div className="contact-notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Emailed 14 Oct via their CSR inbox; follow up after Diwali" />
          <button className="pill-link strong" onClick={() => { onMove(c.id, c.status, notes); setEditing(false); }}>Save notes</button>
        </div>
      )}
    </li>
  );
}

export function ContactBoard({ initial }: { initial: ContactCard[] }) {
  const [items, setItems] = useState(initial.filter((c) => c.status !== "not_useful"));
  const [q, setQ] = useState("");
  const [place, setPlace] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const move = (id: number, status: ContactCard["status"], notes?: string) =>
    start(async () => {
      const r = await updateContact(id, status, notes);
      if (!r.ok) return setMsg(r.needsUnlock ? "unlock" : (r.message ?? "Couldn't save."));
      setItems((xs) => (status === "not_useful" ? xs.filter((x) => x.id !== id) : xs.map((x) => (x.id === id ? { ...x, status, notes: notes ?? x.notes } : x))));
    });
  const shown = items.filter((c) => (place === "all" || c.places.includes(place)) && (!q || `${c.name} ${c.companyName ?? ""} ${c.title ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const count = (s: string) => items.filter((c) => c.status === s).length;
  const reached = count("reached_out") + count("connected") + count("failed");
  return (
    <>
      <ul className="impact">
        <li className="glass-chip"><b>{items.length}</b> people found</li>
        <li className="glass-chip"><b>{reached}</b> reached out</li>
        <li className="glass-chip"><b>{count("connected")}</b> connected{reached ? ` · ${Math.round((count("connected") / reached) * 100)}% of outreach` : ""}</li>
        <li className="search-inline"><PlaceSelect keys={items.map((c) => c.places)} value={place} onChange={setPlace} label="Where their company funds CSR" /></li>
        <li className="search-inline"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, company, title" aria-label="Filter contacts" /></li>
      </ul>
      {msg && <p className="cue-note">{msg === "unlock" ? <>Unlock first on <Link href="/inbox">People messages</Link> to save changes.</> : msg}</p>}
      <div className="kanban">
        {COLUMNS.map((col) => {
          const list = shown.filter((c) => c.status === col.id);
          return (
            <section key={col.id} className={`kcol kcol-${col.id}`} aria-labelledby={`kc-${col.id}`}>
              <h2 id={`kc-${col.id}`} className="kcol-title">{col.label} <span className="muted">{list.length}</span></h2>
              <p className="muted small">{col.hint}</p>
              <ul className="kcards">{list.map((c) => <Card key={c.id} c={c} onMove={move} />)}</ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
