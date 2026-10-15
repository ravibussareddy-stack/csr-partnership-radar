"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRelationship, dismissAlert, saveRelationship, type RelationshipInput } from "@/app/actions";
import type { RelationshipView } from "@/lib/relationships";

const STATUSES = [
  { id: "active", label: "Active" },
  { id: "renewal_due", label: "Renewal due" },
  { id: "prospect", label: "In discussion" },
  { id: "lapsed", label: "Lapsed" },
];

export function RelationshipForm({ initial, sectors, onDone }: { initial?: RelationshipView; sectors: { id: string; label: string }[]; onDone?: () => void }) {
  const [f, setF] = useState<RelationshipInput>({
    id: initial?.id,
    companyName: initial?.companyName ?? "",
    programme: initial?.programme ?? "",
    sectors: initial?.sectors ?? [],
    districts: initial?.districts ?? [],
    valueLakh: initial?.valueLakh ?? null,
    startDate: initial?.startDate ?? "",
    renewalDate: initial?.renewalDate ?? "",
    status: initial?.status ?? "active",
    contactRole: initial?.contactRole ?? "",
    notes: initial?.notes ?? "",
    radarHelped: initial?.radarHelped ?? false,
    radarNote: initial?.radarNote ?? "",
  });
  const [districts, setDistricts] = useState((initial?.districts ?? []).join(", "));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof RelationshipInput>(k: K, v: RelationshipInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleSector = (id: string) => set("sectors", f.sectors?.includes(id) ? f.sectors.filter((s) => s !== id) : [...(f.sectors ?? []), id]);
  return (
    <form
      className="rel-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveRelationship({ ...f, districts: districts.split(",").map((d) => d.trim()).filter(Boolean) });
          setMsg({ ok: r.ok, text: r.needsUnlock ? "Sign in first (People messages page)." : (r.message ?? "") });
          if (r.ok) {
            if (!initial) {
              setF({ companyName: "", programme: "", sectors: [], status: "active", valueLakh: null, startDate: "", renewalDate: "", contactRole: "", notes: "", radarHelped: false, radarNote: "" });
              setDistricts("");
            }
            router.refresh();
            onDone?.();
          }
        });
      }}
    >
      <div className="rel-grid">
        <label>Company or foundation<input value={f.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="e.g. Bajaj Finance" required /></label>
        <label>Programme<input value={f.programme ?? ""} onChange={(e) => set("programme", e.target.value)} placeholder="e.g. Youth BFSI skilling, Hadapsar centre" /></label>
        <label>Status
          <select value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
        <label>Contract value (₹ lakh)<input type="number" min={0} step="0.5" value={f.valueLakh ?? ""} onChange={(e) => set("valueLakh", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label>Start date<input type="date" value={f.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} /></label>
        <label>Renewal / end date<input type="date" value={f.renewalDate ?? ""} onChange={(e) => set("renewalDate", e.target.value)} /></label>
        <label>Districts / cities<input value={districts} onChange={(e) => setDistricts(e.target.value)} placeholder="Pune, Pimpri-Chinchwad" /></label>
        <label>Their contact (role only)<input value={f.contactRole ?? ""} onChange={(e) => set("contactRole", e.target.value)} placeholder="e.g. CSR Manager, West" /></label>
      </div>
      <fieldset className="chips"><legend className="small">Sectors</legend>
        {sectors.map((s) => <button type="button" key={s.id} className={f.sectors?.includes(s.id) ? "chip on" : "chip"} aria-pressed={f.sectors?.includes(s.id)} onClick={() => toggleSector(s.id)}>{s.label}</button>)}
      </fieldset>
      <label>Notes<textarea rows={2} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Year 2 of 3; they want placement rates in the annual report" /></label>
      <label className="check-row">
        <input type="checkbox" checked={Boolean(f.radarHelped)} onChange={(e) => set("radarHelped", e.target.checked)} />
        The Radar helped us find or win this partnership
      </label>
      {f.radarHelped && (
        <label>How it helped<input value={f.radarNote ?? ""} onChange={(e) => set("radarNote", e.target.value)} placeholder="e.g. Call this week card on their skilling RFP led to the first meeting" /></label>
      )}
      <div className="row">
        <button className="pill-link strong" disabled={pending}>{pending ? "Saving…" : initial ? "Save changes" : "Add relationship"}</button>
        {onDone && <button type="button" className="chip" onClick={onDone}>Cancel</button>}
      </div>
      {msg && <p className={msg.ok ? "ok-msg" : "err-msg"} role="status">{msg.text}</p>}
    </form>
  );
}

export function RelationshipActions({ rel, sectors }: { rel: RelationshipView; sectors: { id: string; label: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (editing) return <RelationshipForm initial={rel} sectors={sectors} onDone={() => setEditing(false)} />;
  return (
    <div className="row">
      <button type="button" className="chip" onClick={() => setEditing(true)}>Edit</button>
      <button
        type="button"
        className="chip"
        disabled={pending}
        onClick={() => confirm(`Remove ${rel.companyName} and its alerts?`) && start(async () => { await deleteRelationship(rel.id); router.refresh(); })}
      >
        Remove
      </button>
    </div>
  );
}

export function DismissAlert({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="chip" disabled={pending} onClick={() => start(async () => { await dismissAlert(id); router.refresh(); })}>Dismiss</button>;
}
