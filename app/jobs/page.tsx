// Hiring radar: CSR / foundation / community job postings = companies building CSR teams (planning programmes).
import { Suspense } from "react";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { InfoTip } from "@/app/components/InfoTip";
import { Icon, PageBackdrop, PeopleFrames } from "@/app/components/illustrations";
import { getHiring } from "@/lib/data";
import { JobsBoard } from "./JobsBoard";

const SOURCE_NAMES = new Map(DEFAULT_CONFIG.sources.map((s) => [s.id, s.name]));
const PRIORITY = /pune|maharashtra|mumbai|thane|nashik|nagpur/i;

export default function Page() {
  return (
    <main className="wrap wide">
      <PageBackdrop variant="network" />
      <header className="hero-glass glass compact">
        <div className="hero-copy">
          <p className="eyebrow">Hiring radar</p>
          <h1 className="greeting page-title">Who&rsquo;s hiring for CSR</h1>
          <p className="lede">
            A company recruiting a CSR manager, foundation lead or community officer is building or expanding its CSR team, usually ahead
            of new programmes and new implementation partners. Postings come from LinkedIn job alerts and job sites found through Google
            search, from the last 60 days.
          </p>
        </div>
        <div className="hero-art small"><PeopleFrames /></div>
      </header>
      <Suspense fallback={<div className="glass card-pad">Loading postings…</div>}>
        <Hiring />
      </Suspense>
    </main>
  );
}

async function Hiring() {
  const posts = ((await getHiring()) ?? []).filter((p) => !["generic", "dead", "expired"].includes(p.linkStatus ?? ""));
  if (posts.length === 0) {
    return (
      <div className="notice glass">
        <h2>No CSR job postings yet</h2>
        <p>They appear here as LinkedIn job alerts arrive and the daily job searches find postings.</p>
      </div>
    );
  }
  const companies = new Map<string, number>();
  const cities = new Map<string, number>();
  for (const p of posts) {
    if (p.company) companies.set(p.company, (companies.get(p.company) ?? 0) + 1);
    for (const g of p.geographies) cities.set(g, (cities.get(g) ?? 0) + 1);
  }
  const topCities = [...cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sorted = [...posts].sort((a, b) => Number(b.geographies.some((g) => PRIORITY.test(g))) - Number(a.geographies.some((g) => PRIORITY.test(g))));

  return (
    <>
      <ul className="impact">
        <li className="glass-chip"><b>{posts.length}</b> posting{posts.length === 1 ? "" : "s"}</li>
        <li className="glass-chip"><b>{companies.size}</b> compan{companies.size === 1 ? "y" : "ies"} building CSR teams</li>
        {topCities.map(([c, n]) => <li key={c} className="glass-chip">{c} <b>{n}</b></li>)}
      </ul>
      <section className="section">
        <h2 className="section-title"><Icon name="people" /> Open roles <span className="muted">· Maharashtra first</span> <InfoTip text="Why hiring matters: a company recruiting a CSR manager or foundation lead is building or expanding its CSR team, usually ahead of new programmes and implementation partners. These are Watch-tier leads: note the company, then reach out once the role is filled." /></h2>
        <JobsBoard posts={sorted} sourceNames={Object.fromEntries(SOURCE_NAMES)} />
      </section>
    </>
  );
}
