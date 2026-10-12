"use client";
import { useActionState } from "react";
import { dropMessages, unlock, type DropState } from "./actions";

const initial: DropState = { ok: false, message: "" };

export function UnlockForm() {
  const [state, action, pending] = useActionState(unlock, initial);
  return (
    <form action={action} className="unlock">
      <label htmlFor="who">Your name <span className="muted small">(teammates; the lead can leave it blank)</span></label>
      <input id="who" name="name" type="text" autoComplete="username" />
      <label htmlFor="passcode">Passcode</label>
      <div className="row">
        <input id="passcode" name="passcode" type="password" autoComplete="current-password" required />
        <button className="pill-link strong" disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
      </div>
      {state.message && <p className={state.ok ? "ok-msg" : "err-msg"} role="status">{state.message}</p>}
    </form>
  );
}

export function DropForm() {
  const [state, action, pending] = useActionState(dropMessages, initial);
  return (
    <form action={action} className="drop">
      <div className="row">
        <label htmlFor="channel">Where are these from?</label>
        <select id="channel" name="channel" defaultValue="whatsapp">
          <option value="whatsapp">WhatsApp</option>
          <option value="linkedin">LinkedIn messages</option>
          <option value="telegram">Telegram</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="other">Other</option>
        </select>
      </div>
      <textarea
        name="messages"
        required
        rows={14}
        placeholder={`Paste one or many messages. Separate them with a line of dashes, or start each with "Message 2:", or paste a WhatsApp "Export chat" as-is.\n\nBajaj Finance is inviting NGO proposals for youth skilling in Pune, deadline 30 Oct.\n-----------------------\nMessage 2: CSR head at Persistent Systems wants to meet skilling NGOs next week.`}
      />
      <div className="row">
        <button className="pill-link strong" disabled={pending}>{pending ? "Reading…" : "Drop messages"}</button>
        <span className="muted small">Sender names are not stored. Messages are classified and researched in a few minutes.</span>
      </div>
      {state.message && (
        <div className={state.ok ? "ok-msg" : "err-msg"} role="status">
          <p>{state.message}{state.duplicates ? ` (${state.duplicates} already dropped before)` : ""}</p>
          {state.preview && state.preview.length > 0 && (
            <ol className="preview">{state.preview.map((p, i) => <li key={i}>{p}</li>)}</ol>
          )}
        </div>
      )}
    </form>
  );
}
