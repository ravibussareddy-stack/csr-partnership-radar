"use client";
/**
 * "Searched on Google this week". It sits inside the digest board so the same filters apply: with a
 * place, sector, tier, source or company filter on, a result is shown only if its card passes it
 * (results that weren't CSR have no card, so they drop out while a filter is active).
 */
import type { SearchRunSummary } from "@/lib/digest";
import { Icon } from "./illustrations";
import { InfoTip } from "./InfoTip";
import { SearchSuggestions } from "./SearchSuggestions";

export function SearchPanel({ searches, passing, filtered }: { searches: SearchRunSummary[]; passing: Set<string>; filtered: boolean }) {
  const runs = searches.map((r) => ({ ...r, results: filtered ? r.results.filter((x) => passing.has(x.url)) : r.results }));
  const withResults = runs.filter((r) => r.results.length > 0);
  if (searches.length === 0) return null;
  return (
    <section className="section" aria-labelledby="h-search">
      <h2 id="h-search" className="section-title">
        <Icon name="compass" /> Searched on Google this week{filtered && <span className="muted small"> · matching your filters</span>}
        <InfoTip text="Your saved searches, run every morning by Gemini with Google Search. A result counts only when Google returned a source for it; each one is then scored like any other item. The filters above apply here too. Google's own search chip under each search opens that search on Google, as Google requires." />
      </h2>
      {withResults.length === 0 ? (
        <p className="muted small">No search results match these filters this week.</p>
      ) : (
        <div className="search-grid">
          {withResults.map((r) => (
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
              {r.entryPointHtml && (
                <>
                  <SearchSuggestions html={r.entryPointHtml} label={`Google search suggestions for ${r.query}`} />
                  <p className="muted small gs-note">Google requires this chip on AI search results; it opens the same search on Google. The titles above open the articles.</p>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {!filtered && runs.some((r) => r.results.length === 0) && (
        <p className="muted small">Nothing new this week for: {runs.filter((r) => r.results.length === 0).map((r) => `“${r.query}”`).join(" · ")}</p>
      )}
    </section>
  );
}
