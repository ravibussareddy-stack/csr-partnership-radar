// Regulatory changes & news: an AI highlight summary on top (each point cites its articles and keeps
// the weakest status they support), then the articles, labelled Executed / Confirmed / Inferred.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import { InfoTip } from "@/app/components/InfoTip";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { getRegulatory } from "@/lib/data";
import { RegulatoryHighlights } from "@/app/components/RegulatoryHighlights";
import { RegulatoryList } from "./RegulatoryList";

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="gazette" />
      <Hero eyebrow="Regulatory" title="CSR rules: what changed, what's coming" variant="planner" poster="regulatory">
        Official notifications, circulars and guidelines (MCA, SEBI, the Gazette, PIB), plus the debate around them and what officials and
        experts are saying.{" "}
        <InfoTip text="Found by three saved Google searches that favour official sites, plus CSR news feeds and alerts. Every article is labelled Executed (in force), Confirmed (officially notified, not yet in force) or Inferred (draft, debate, expert view or media expectation). Quotes are shown only when they appear word for word in the source." />
      </Hero>
      <Suspense fallback={<div className="glass card-pad">Loading regulatory news…</div>}>
        <Body />
      </Suspense>
    </main>
    </PageTransition>
  );
}

async function Body() {
  const { items, summary } = await getRegulatory();
  return (
    <>
      <RegulatoryHighlights summary={summary} titles={new Map(items.flatMap((i) => [[i.itemId, i.title] as const, ...i.coverage.map((c) => [c.itemId, i.title] as const)]))} anchor />
      <section className="section" aria-labelledby="h-reg-items">
        <h2 id="h-reg-items" className="section-title">Articles <span className="muted">· last 6 months</span></h2>
        <RegulatoryList items={items} />
      </section>
    </>
  );
}
