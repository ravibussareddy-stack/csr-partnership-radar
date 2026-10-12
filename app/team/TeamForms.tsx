"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMember, leaveSession, reviewDashboardFeedback, setMemberActive } from "@/app/actions";

export function AddMember() {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="add-member"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createMember(name, pass);
          setMsg({ ok: r.ok, text: r.message ?? "" });
          if (r.ok) {
            setName("");
            setPass("");
            router.refresh();
          }
        });
      }}
    >
      <h3 className="small-title">Add a teammate</h3>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Rohan" aria-label="Teammate name" required />
      <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete="new-password" placeholder="Passcode (8+ characters)" aria-label="Passcode for the teammate" required minLength={8} />
      <button className="pill-link strong" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      <p className="muted small">Share the name and passcode with them yourself; they sign in on People messages. Only a hash of the passcode is stored.</p>
      {msg && <p className={msg.ok ? "ok-msg" : "err-msg"} role="status">{msg.text}</p>}
    </form>
  );
}

export function MemberToggle({ id, active }: { id: number; active: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" className="chip" disabled={pending} onClick={() => start(async () => { await setMemberActive(id, !active); router.refresh(); })}>
      {active ? "Deactivate" : "Reactivate"}
    </button>
  );
}

export function ReviewFeedback({ id }: { id: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (d: "confirmed" | "declined") => start(async () => { await reviewDashboardFeedback(id, d); router.refresh(); });
  return (
    <span className="review">
      <button type="button" className="chip on" disabled={pending} onClick={() => go("confirmed")}>Confirm</button>
      <button type="button" className="chip" disabled={pending} onClick={() => go("declined")}>Decline</button>
    </span>
  );
}

export function SignOut() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button type="button" className="chip" disabled={pending} onClick={() => start(async () => { await leaveSession(); router.refresh(); })}>Sign out</button>;
}
