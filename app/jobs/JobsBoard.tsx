"use client";
import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";
import { PlaceSelect } from "@/app/components/PlaceSelect";
import type { HiringPost } from "@/lib/history/queries";
import { placeKeys } from "@/lib/geo";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function JobsBoard({ posts, sourceNames }: { posts: HiringPost[]; sourceNames: Record<string, string> }) {
  const [place, setPlace] = useState("all");
  const keys = posts.map((p) => placeKeys(p.geographies));
  const shown = posts.filter((_, i) => place === "all" || keys[i].includes(place));
  const companies = new Map<string, number>();
  for (const p of posts) if (p.company) companies.set(p.company, (companies.get(p.company) ?? 0) + 1);
  return (
    <>
      <div className="filter-bar glass" role="search">
        <div className="selects">
          <PlaceSelect keys={keys} value={place} onChange={setPlace} />
          <span className="muted small">{shown.length} of {posts.length} postings</span>
        </div>
      </div>
      <div className="cue-grid">
        {shown.map((p) => {
          const company = p.company ?? "Company not identified";
          const multi = p.company ? (companies.get(p.company) ?? 1) : 1;
          return (
            <article key={p.itemId} className="cue tier-watch">
              <header className="cue-head">
                <Logo name={company} domain={p.domain} />
                <div className="cue-who">
                  {p.companyId ? <Link href={`/companies/${p.companyId}`} className="cue-company">{company}</Link> : <span className="cue-company">{company}</span>}
                  <span className="cue-type">Hiring for CSR{multi > 1 ? ` · ${multi} roles` : ""}</span>
                </div>
                <span className="tier-pill tier-watch">Watch</span>
              </header>
              <h3 className="cue-title">{p.title}</h3>
              <p className="cue-summary">{p.why}</p>
              <footer className="cue-meta">
                <span>{dateFmt.format(new Date(p.date))}</span>
                <span className="src src-search">{sourceNames[p.source] ?? p.source}</span>
                {p.geographies.slice(0, 2).map((g) => <span key={g} className="sector-dot">{g}</span>)}
              </footer>
              {p.url.startsWith("http") && (
                <div className="cue-links">
                  <a className="pill-link" href={p.url} target="_blank" rel="noopener noreferrer">View posting ↗</a>
                  {p.linkStatus === "unverified" && <span className="badge-warn" title="This job site doesn't allow automated checks; open the link to confirm it's still open">check link</span>}
                  {p.linkStatus === "ok" && <span className="fact fact-good">link verified</span>}
                </div>
              )}
            </article>
          );
        })}
        {shown.length === 0 && <p className="muted">No postings in this place.</p>}
      </div>
    </>
  );
}
