// Feedback log: every piece of dashboard feedback and what happened to it (applied settings change,
// developer / designer request with its full text, declined, waiting for Ananya). Team-only, never
// cached; a developer or designer gets a teammate login to read it.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { InfoTip } from "@/app/components/InfoTip";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { currentMember } from "@/lib/session";
import { loadFeedbackLog } from "@/lib/team";
import { FeedbackLog } from "./FeedbackLog";

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="team" />
      <Hero eyebrow="Feedback log" title="Every piece of feedback, and what was done" variant="planner" poster="team">
        Feedback from the box at the bottom of every page: what the Radar changed by itself, what went to the developer or designer, and what is waiting for Ananya.{" "}
        <InfoTip text="Ananya confirms or declines teammates' feedback here; her own is confirmed straight away. The Radar acts on confirmed feedback within a few minutes: a settings change it is allowed to make (keywords, saved searches, followed pages, scoring weights within ±30%, the site's text size between 90% and 125%) is applied and listed with exactly what changed; anything else becomes a developer or designer request, written out here in full and emailed." />
      </Hero>
      <Suspense fallback={<div className="glass card-pad">Loading feedback…</div>}>
        <Body />
      </Suspense>
    </main>
    </PageTransition>
  );
}

async function Body() {
  await connection();
  const me = await currentMember();
  if (!me) {
    return <div className="notice glass"><h2>Sign in to see the feedback log</h2><p><Link href="/inbox">Sign in on People messages</Link> with your name and passcode. Developers and designers: ask Ananya to add you on the Team page.</p></div>;
  }
  const rows = await loadFeedbackLog();
  return <FeedbackLog rows={rows} lead={me.role === "lead"} />;
}
