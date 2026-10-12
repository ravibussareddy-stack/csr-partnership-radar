"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { addSector, removeSector } from "@/app/actions";

export function AddSectorForm() {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; unlock?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addSector(label, description, keywords);
      setMsg({ ok: r.ok, text: r.message ?? "", unlock: r.needsUnlock });
      if (r.ok) {
        setLabel("");
        setDescription("");
        setKeywords("");
      }
    });
  };
  return (
    <form className="glass card-pad sector-form" onSubmit={submit}>
      <h2 className="section-title">Add a sector</h2>
      <label htmlFor="s-label">Sector name</label>
      <input id="s-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mental health for adolescents" required maxLength={60} />
      <label htmlFor="s-desc">What do you mean by it? <span className="muted small">(helps the AI judge articles)</span></label>
      <textarea id="s-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Counselling and wellbeing programmes for school and college students" maxLength={300} />
      <label htmlFor="s-kw">Keywords you already know <span className="muted small">(optional, comma separated)</span></label>
      <input id="s-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="mental health, counselling, wellbeing" />
      <button className="pill-link strong" disabled={pending || label.trim().length < 3}>{pending ? "Adding…" : "Add sector"}</button>
      {msg && <p className={msg.ok ? "ok-msg" : "err-msg"} role="status">{msg.unlock ? <><Link href="/inbox">Sign in</Link> first.</> : msg.text}</p>}
    </form>
  );
}

export function RemoveSector({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="chip"
        disabled={pending}
        onClick={() => confirm(`Stop tracking “${label}”? Its saved searches are removed; past articles keep their tags.`) && start(async () => {
          const r = await removeSector(id);
          setMsg(r.ok ? "Removed." : (r.message ?? "Couldn't remove."));
        })}
      >
        Remove
      </button>
      {msg && <span className="muted small"> {msg}</span>}
    </>
  );
}
