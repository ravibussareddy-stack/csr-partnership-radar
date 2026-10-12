// Questions sheet: every question asked to the Radar, with its answer, sources and time to answer.
// Team-only and read per request.
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { InfoTip } from "@/app/components/InfoTip";
import { PageTransition } from "@/app/components/PageTransition";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { loadQuestions } from "@/lib/questions";
import { currentMember } from "@/lib/session";
import { QuestionsSheet } from "./QuestionsSheet";

export default function Page() {
  return (
    <PageTransition>
      <main className="wrap wide">
        <PageBackdrop variant="messages" />
        <Hero eyebrow="Ask the Radar" title="Questions & answers" variant="planner" poster="community">
          Every question your team asked about an article, with the Radar&rsquo;s answer and sources.{" "}
          <InfoTip text="Filter by time (today, this week, this month or a custom range), by who asked, by status, or search the text. Download CSV exports exactly what is shown. Ask new questions from any card's breakdown." />
        </Hero>
        <Suspense fallback={<div className="glass card-pad">Loading questions…</div>}>
          <Body />
        </Suspense>
      </main>
    </PageTransition>
  );
}

async function Body() {
  await connection();
  const me = await currentMember();
  if (!me) return <div className="notice glass"><h2>Team only</h2><p><Link href="/inbox">Sign in on People messages</Link> to see questions.</p></div>;
  const rows = await loadQuestions();
  return <QuestionsSheet rows={rows} />;
}
