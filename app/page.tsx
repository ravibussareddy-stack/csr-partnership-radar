// Monday digest (home). Served from cache (lib/data.ts); filters run in the browser.
import { Suspense } from "react";
import Link from "next/link";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { Greeting } from "@/app/components/Greeting";
import { InsightBoard } from "@/app/components/InsightBoard";
import { Icon, PeopleFrames } from "@/app/components/illustrations";
import { fmtCr } from "@/app/components/charts";
import { getHomeInsights, getImpactStats, getSearches } from "@/lib/data";
import { SOURCE_GROUPS } from "@/lib/sources";
import { fyLabel } from "@/lib/companies";

const SECTORS = DEFAULT_CONFIG.sectors.map((s) => ({ id: s.id, label: s.label }));
const dateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function Page() {
  return (
    <main className="wrap wide">
      <Suspense fallback={<div className="hero-glass glass skeleton" />}>
        <Home />
      </Suspense>
    </main>
  );
}

async function Home() {
  const [home, stats, searches] = await Promise.all([getHomeInsights(), getImpactStats(), getSearches()]);
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
          <p className="eyebrow">Monday digest · {digest.lastUpdated ? `updated ${dateTime.format(digest.lastUpdated)}` : "CSR Partnership Radar"}</p>
          <Greeting name="Ananya" />
          <p className="lede">
            Small steps, big impact. Every partnership you close puts a school dropout or a first-generation job seeker into a skilling
            classroom. Here is who to call this week.
          </p>
          <ul className="impact">
            <li className="glass-chip"><b>{calls}</b> to call · <b>{watch}</b> to watch</li>
            {stats && (
              <li className="glass-chip">
                Read <b>{stats.itemsThisWeek.toLocaleString("en-IN")}</b> articles, alerts &amp; messages for you this week ≈ <b>{stats.hoursSaved} h</b> of searching saved
              </li>
            )}
            {stats?.puneFocusCr != null && (
              <li className="glass-chip">
                <b>{fmtCr(stats.puneFocusCr)}</b> went to education &amp; skilling in Pune in {fyLabel(stats.lastFy ?? 2024)}, from {stats.puneCompanies?.toLocaleString("en-IN")} companies
              </li>
            )}
            {stats && <li className="glass-chip"><b>{stats.companiesTracked.toLocaleString("en-IN")}</b> funders tracked across 11 years</li>}
          </ul>
          <p className="time-note muted small">
            Your time this week: about 15 minutes with this digest, instead of {stats ? `~${Math.max(1, Math.round(stats.hoursSaved))} hours` : "hours"} of searching and reading.
          </p>
          <div className="hero-actions">
            <Link href="/inbox" className="pill-link strong"><Icon name="people" /> Drop in messages</Link>
            <Link href="/calendar" className="pill-link"><Icon name="calendar" /> CSR calendar</Link>
          </div>
        </div>
        <div className="hero-art"><PeopleFrames /></div>
      </header>

      <InsightBoard signals={signals} warm={warmCards} groups={SOURCE_GROUPS} sectors={SECTORS} />

      {searches.length > 0 && (
        <section className="section" aria-labelledby="h-search">
          <h2 id="h-search" className="section-title"><Icon name="compass" /> Searched on Google this week</h2>
          <p className="muted small">Saved searches run daily by Gemini with Google Search grounding; results count only when Google returned a source.</p>
          <ul className="search-runs">
            {searches.map((r) => (
              <li key={r.searchId} className="glass card-pad">
                <p><strong>{r.query}</strong></p>
                <p className="muted small">{r.itemsFound} sourced result{r.itemsFound === 1 ? "" : "s"} · {r.itemsNew} new this week</p>
                {r.entryPointHtml && (
                  <iframe className="search-suggestions" title={`Google Search suggestions for ${r.query}`} srcDoc={r.entryPointHtml} sandbox="allow-popups allow-popups-to-escape-sandbox" loading="lazy" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
