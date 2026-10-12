// Monday digest (home). Served from cache (lib/data.ts); filters run in the browser.
import { Suspense } from "react";
import Link from "next/link";
import { Greeting } from "@/app/components/Greeting";
import { InsightBoard } from "@/app/components/InsightBoard";
import { ClassroomScene, Icon, PageBackdrop } from "@/app/components/illustrations";
import { InfoTip } from "@/app/components/InfoTip";
import { KeepUp } from "@/app/components/KeepUp";
import { SearchSuggestions } from "@/app/components/SearchSuggestions";
import { fmtCr } from "@/app/components/charts";
import { getHomeInsights, getImpactStats, getSearches, getSectors } from "@/lib/data";
import { SOURCE_GROUPS } from "@/lib/sources";
import { fyLabel } from "@/lib/companies";

const dateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function Page() {
  return (
    <main className="wrap wide">
      <PageBackdrop variant="classroom" />
      <Suspense fallback={<div className="hero-glass glass skeleton" />}>
        <Home />
      </Suspense>
    </main>
  );
}

async function Home() {
  const [home, stats, searches, sectorRows] = await Promise.all([getHomeInsights(), getImpactStats(), getSearches(), getSectors()]);
  const SECTORS = sectorRows.map((s) => ({ id: s.id, label: s.label }));
  if (home.status !== "ok") {
    return (
      <div className="notice glass">
        <h2>{home.status === "no_database" ? "No database configured" : "Digest unavailable"}</h2>
        <p>{home.status === "no_database" ? "Set DATABASE_URL and run npm run ingest." : "The next ingestion run will retry."}</p>
      </div>
    );
  }
  const { signals, warm: warmCards } = home;
  const digest = { lastUpdated: home.lastUpdated };
  const calls = signals.filter((s) => s.tier === "call_this_week").length;
  const watch = signals.filter((s) => s.tier === "watch").length;

  return (
    <>
      <header className="hero-glass glass">
        <div className="hero-copy">
          <p className="eyebrow">2 · Monday digest · {digest.lastUpdated ? `updated ${dateTime.format(digest.lastUpdated)}` : "CSR Partnership Radar"}</p>
          <Greeting name="Ananya" />
          <p className="lede">
            Small steps, big impact. Every partnership you close puts a school dropout or a first-generation job seeker into a skilling
            classroom. Here is who to call this week.
          </p>
          <ul className="impact">
            <li className="glass-chip"><b>{calls}</b> to call · <b>{watch}</b> to watch <InfoTip text="Call this week: a company is allocating money or seeking partners right now. Watch: relevant but not urgent, or an early sign (hiring CSR staff, a new plant nearby). Tap any card's tier for its reason." /></li>
            {stats && (
              <li className="glass-chip">
                Read <b>{stats.itemsThisWeek.toLocaleString("en-IN")}</b> articles, alerts &amp; messages for you this week ≈ <b>{stats.hoursSaved} h</b> of searching saved
                <InfoTip text="Everything the Radar fetched in the last 7 days: news feeds, your Google searches and alerts, LinkedIn emails and dropped messages. Hours saved assumes about 40 seconds to find, open and skim each one by hand." />
              </li>
            )}
            {stats?.puneFocusCr != null && (
              <li className="glass-chip">
                <b>{fmtCr(stats.puneFocusCr)}</b> went to education &amp; skilling in Pune in {fyLabel(stats.lastFy ?? 2024)}, from {stats.puneCompanies?.toLocaleString("en-IN")} companies
                <InfoTip text="National CSR Portal (Ministry of Corporate Affairs): CSR spent in Pune district on education, special education, vocational skills and livelihoods in the latest reported year. This is the pool your programmes compete for." />
              </li>
            )}
            {stats && <li className="glass-chip"><b>{stats.companiesTracked.toLocaleString("en-IN")}</b> funders tracked across 11 years <InfoTip text="Companies that spent at least ₹1 crore on CSR in the last 3 reported years, with history back to FY2014-15 and forecasts on their profile pages." /></li>}
          </ul>
          {stats && <KeepUp name="Ananya" dropsThisWeek={stats.dropsThisWeek} />}
          <p className="time-note muted small">
            Your time this week: about 15 minutes with this digest, instead of {stats ? `~${Math.max(1, Math.round(stats.hoursSaved))} hours` : "hours"} of searching and reading.
          </p>
          <div className="hero-actions">
            <Link href="/inbox" className="pill-link strong"><Icon name="people" /> Drop in messages</Link>
            <Link href="/calendar" className="pill-link"><Icon name="calendar" /> CSR calendar</Link>
          </div>
        </div>
        <div className="hero-art classroom-art"><ClassroomScene /></div>
      </header>


      <InsightBoard signals={signals} warm={warmCards} groups={SOURCE_GROUPS} sectors={SECTORS} />

      {searches.length > 0 && (
        <section className="section" aria-labelledby="h-search">
          <h2 id="h-search" className="section-title">
            <Icon name="compass" /> Searched on Google this week
            <InfoTip text="Your saved searches, run every morning by Gemini with Google Search. A result counts only when Google returned a source for it; each one is then scored like any other item. Google's own search chips are shown under each search, as Google requires." />
          </h2>
          <div className="search-grid">
            {searches.filter((r) => r.results.length > 0).map((r) => (
              <article key={r.searchId} className="glass card-pad search-card spot">
                <p className="search-q">{r.query}</p>
                <p className="muted small">{r.results.length} result{r.results.length === 1 ? "" : "s"} this week</p>
                <ul className="search-results">
                  {r.results.slice(0, 4).map((x) => (
                    <li key={x.url}>
                      <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a>
                      <span className="muted small">{x.company ? `${x.company} · ` : ""}{x.tier ? <span className={`tier-pill tier-${x.tier} mini-pill`}>{x.tier === "call_this_week" ? "Call" : x.tier === "watch" ? "Watch" : "Background"}</span> : "not CSR"}</span>
                    </li>
                  ))}
                </ul>
                {r.entryPointHtml && <SearchSuggestions html={r.entryPointHtml} label={`Google search suggestions for ${r.query}`} />}
              </article>
            ))}
          </div>
          {searches.some((r) => r.results.length === 0) && (
            <p className="muted small">Nothing new this week for: {searches.filter((r) => r.results.length === 0).map((r) => `“${r.query}”`).join(" · ")}</p>
          )}
        </section>
      )}
    </>
  );
}
