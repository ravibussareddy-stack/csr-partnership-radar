// Sectors: the four core focus sectors plus any Ananya's team adds. A new sector is expanded by the
// intake workflow (keywords in English/Hindi/Marathi, CSR Portal mapping, Google searches), then
// used by the pre-filter, the classifier, scoring and every sector filter.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import { InfoTip } from "@/app/components/InfoTip";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { getSavedSearches, getSectors } from "@/lib/data";
import { AddSectorForm, RemoveSector } from "./SectorForms";

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="seasons" />
      <Hero eyebrow="Sectors" title="What the Radar looks for" variant="planner" poster="sectors">
        Your focus sectors decide which articles are kept, how they score and what the sector filters show. Add a sector and the
        Radar learns it automatically.{" "}
        <InfoTip text="After you add a sector, the next team-tasks run (within a few minutes) asks Gemini for keywords in English, Hindi and Marathi, maps it to National CSR Portal categories where one fits, and adds two saved Google searches. At the next daily run, the last two weeks of articles are re-classified once with the new sector available, and new articles use it from then on." />
      </Hero>
      <div className="two-col">
        <AddSectorForm />
        <Suspense fallback={<div className="glass card-pad">Loading sectors…</div>}>
          <SectorList />
        </Suspense>
      </div>
    </main>
    </PageTransition>
  );
}

async function SectorList() {
  const [sectors, searches] = await Promise.all([getSectors(), getSavedSearches()]);
  return (
    <section className="glass card-pad" aria-labelledby="h-tracked">
      <h2 id="h-tracked" className="section-title">Tracked sectors <span className="muted">· {sectors.length}</span></h2>
      <ul className="sector-list">
        {sectors.map((s) => {
          const qs = searches.filter((q) => q.sectorId === s.id);
          return (
            <li key={s.id} className="sector-row">
              <div className="sector-head">
                <b>{s.label}</b>
                {s.custom ? (
                  <span className={s.status === "pending" ? "badge-warn" : "fact fact-good"}>{s.status === "pending" ? "setting up…" : "added"}{s.addedBy ? ` by ${s.addedBy}` : ""}</span>
                ) : (
                  <span className="fact">core</span>
                )}
                {s.custom && <RemoveSector id={s.id} label={s.label} />}
              </div>
              {s.description && <p className="small">{s.description}</p>}
              <p className="small muted">Keywords: {s.keywords.slice(0, 18).join(", ")}{s.keywords.length > 18 ? ` +${s.keywords.length - 18}` : ""}</p>
              <p className="small muted">CSR Portal categories: {s.portalSectors.length ? s.portalSectors.join(", ") : "none (counted from news only)"}</p>
              {qs.length > 0 && <p className="small muted">Google searches: {qs.map((q) => `“${q.query}”`).join(" · ")}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
