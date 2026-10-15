// Message drop: paste many messages at once (WhatsApp, LinkedIn, Telegram, SMS…), no integrations needed.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import { Icon, PageBackdrop, PeopleFrames } from "@/app/components/illustrations";
import { getRecentPasted } from "@/lib/data";
import { hasSession, passcodeConfigured } from "@/lib/session";
import { DropForm, UnlockForm } from "./forms";

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const STATUS: Record<string, string> = { pending: "queued", classified: "read", unclassified: "retrying", filtered_out: "not CSR" };
const TIER: Record<string, string> = { call_this_week: "Call this week", watch: "Watch", background: "Background" };

/** What became of a dropped message: queued, not a CSR lead, or its tier on the Digest. */
function outcome(r: { status: string; passed: boolean | null; isSignal: boolean | null; tier: string | null }): string {
  if (r.passed === false) return "not CSR";
  if (r.status !== "classified") return STATUS[r.status] ?? r.status;
  if (r.isSignal === false) return "read · not a CSR lead, so not added to the Digest";
  if (r.tier) return `read · on the Digest as ${TIER[r.tier] ?? r.tier}`;
  return "read";
}

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="messages" />
      <header className="hero-glass glass compact">
        <div className="hero-copy">
          <p className="eyebrow">3 · People messages</p>
          <h1 className="greeting">Messages people sent you</h1>
          <p className="lede">
            WhatsApp forwards, LinkedIn DMs, Telegram, SMS: paste them all in one go. The Radar splits them, works out which company and
            programme each is about, looks up public sources, and puts the good ones in your digest.
          </p>
        </div>
        <div className="hero-art small"><PeopleFrames /></div>
      </header>
      <Suspense fallback={<div className="glass card-pad">Loading…</div>}>
        <Drop />
      </Suspense>
    </main>
    </PageTransition>
  );
}

async function Drop() {
  if (!passcodeConfigured()) {
    return (
      <div className="notice glass">
        <h2>Message drop is not switched on yet</h2>
        <p>Set an <code>INTAKE_PASSCODE</code> environment variable in Vercel (Project → Settings → Environment Variables), then redeploy.</p>
      </div>
    );
  }
  const [unlocked, recent] = await Promise.all([hasSession(), getRecentPasted()]);
  return (
    <div className="drop-grid">
      <section className="glass card-pad">
        <h2 className="section-title"><Icon name="people" /> {unlocked ? "Paste messages" : "Unlock"}</h2>
        {unlocked ? <DropForm /> : <UnlockForm />}
      </section>
      <aside className="glass card-pad">
        <h2 className="section-title"><Icon name="spark" /> Recently dropped</h2>
        {recent.length === 0 ? (
          <p className="muted small">Nothing yet.</p>
        ) : (
          <ul className="kv">
            {recent.map((r) => (
              <li key={r.id}>
                <span>{r.title}</span>
                <span>{r.channel === "missed" ? "missed report" : (r.channel ?? "other")} · {when.format(r.fetchedAt)} · {outcome(r)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="method">
          Tip: in WhatsApp, open a chat → ⋮ → More → Export chat → Without media, then paste the text here. Telegram Desktop exports work the same way.
        </p>
      </aside>
    </div>
  );
}
