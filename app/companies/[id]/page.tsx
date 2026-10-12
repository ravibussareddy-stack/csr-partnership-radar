// Company profile: 11-year CSR history (National CSR Portal), forecasts and announcement timing.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import Link from "next/link";
import { InfoTip } from "@/app/components/InfoTip";
import { fmtCr, StackedYearBars, YearMonthCalendar } from "@/app/components/charts";
import { Hero, Icon, PageBackdrop } from "@/app/components/illustrations";
import { fyLabel } from "@/lib/companies";
import { getCachedNow, getCompany, getPitchKit } from "@/lib/data";
import { PitchKitView } from "@/app/components/PitchKitView";
import { SIGNAL_LABELS, TIER_LABELS } from "@/lib/scoring";

const KIND_LABELS: Record<string, string> = {
  new_initiative: "New initiative",
  partnership: "Partnership",
  allocation_or_spend: "Spend / allocation",
  partner_search: "Partner search",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageTransition>
    <main className="wrap">
      <PageBackdrop variant="skyline" />
      <Suspense fallback={<p className="muted">Loading company…</p>}>
        {params.then(({ id }) => <Company id={Number(id)} />)}
      </Suspense>
    </main>
    </PageTransition>
  );
}

async function Company({ id }: { id: number }) {
  const [data, nowIso, pitch] = await Promise.all([getCompany(id), getCachedNow(), getPitchKit(id)]);
  const now = new Date(nowIso);
  if (!data) {
    return (
      <div className="notice">
        <h2>Company not found</h2>
        <p><Link href="/funding">Back to funding insights</Link></p>
      </div>
    );
  }
  const { company, stats, recentSignals, announcements, spend, people } = data;
  const d = stats?.data;
  const p = d?.prediction;
  const t = d?.timing;
  const windowStart = t?.window ? MONTHS.indexOf(t.window.slice(0, 3)) : null;

  return (
    <>
      <Hero eyebrow={`Company profile${d?.isPsu ? " · PSU" : ""}`} title={company.canonicalName} variant="company">
        {stats
          ? `Reported CSR in ${stats.yearsActive} of the last 11 financial years (National CSR Portal, FY2014-15 to ${fyLabel(stats.lastFy ?? 2024)}).`
          : "No National CSR Portal history for this company (it may report under a different legal name, or spend under ₹1 cr)."}
        {company.aliases.length > 0 && ` Also known as ${company.aliases.join(", ")}.`}
      </Hero>

      {d && d.sectorsRecent.length > 0 && (() => {
        const total = d.sectorsRecent.reduce((a, x) => a + x.amount, 0) || 1;
        const focus = d.sectorsRecent.filter((x) => x.focusId).reduce((a, x) => a + x.amount, 0);
        return (
          <section className="sector-focus glass card-pad" aria-label="Sector focus">
            <p className="small">
              <b>Sector focus</b> (share of CSR spend, last 3 reported years) · <b>{Math.round((focus / total) * 100)}%</b> in your sectors{" "}
              <InfoTip text="From the National CSR Portal: how this company's reported CSR money split across development sectors over its last three reported financial years. Green chips are your focus sectors." />
            </p>
            <ul className="facts">
              {d.sectorsRecent.slice(0, 8).map((x) => (
                <li key={x.sector} className={x.focusId ? "fact fact-good" : "fact"}>{x.sector} {Math.round((x.amount / total) * 100)}%</li>
              ))}
            </ul>
          </section>
        );
      })()}

      {pitch && (
        <section className="section glass card-pad" aria-labelledby="h-pitch">
          <h2 id="h-pitch" className="section-title">Pitch kit <span className="muted small">· researched {new Date(pitch.at).toISOString().slice(0, 10)}, every line sourced</span></h2>
          <PitchKitView kit={pitch.kit} />
        </section>
      )}

      {d && p && (
        <>
          <div className="grid2">
            <div className="card">
              <h3>Forecast {fyLabel(p.fy)}: all sectors</h3>
              <p className="big">{fmtCr(p.total.mid)}</p>
              <p className="muted small">likely range {fmtCr(p.total.low)} – {fmtCr(p.total.high)} · ~{p.projects} project lines</p>
            </div>
            <div className="card">
              <h3>Forecast {fyLabel(p.fy)}: your focus sectors</h3>
              <p className="big">{fmtCr(p.focus.mid)}</p>
              <p className="muted small">likely range {fmtCr(p.focus.low)} – {fmtCr(p.focus.high)}</p>
            </div>
            <div className="card">
              <h3>Next announcement window</h3>
              {t && t.window ? (
                <>
                  <p className="big">{t.window}</p>
                  <p className="muted small">
                    {t.basis === "company"
                      ? `Announced in ${t.window} in ${t.recurrence?.yearsHit.length ?? 0} of ${t.recurrence?.activeYears.length ?? 0} active years (${t.strength === "clear" ? "clear cycle" : t.strength === "mild" ? "mild cycle" : "no steady cycle yet"}).`
                      : `Too few company announcements (${t.events}); showing the pattern across all companies.`}
                    {t.nextWindowStart && ` Next window starts ${dateFmt.format(new Date(t.nextWindowStart))}.`}
                  </p>
                  {t.basis === "company" && t.recurrence && (
                    <p className="years" style={{ marginTop: 6 }}>
                      {t.recurrence.activeYears.map((y) => (
                        <span key={y} className={`yr${t.recurrence.yearsHit.includes(y) ? " hit" : ""}`}>{y}</span>
                      ))}
                    </p>
                  )}
                </>
              ) : (
                <p className="muted">No dated announcements yet.</p>
              )}
            </div>
          </div>

          <section className="section">
            <StackedYearBars
              title="CSR spent per year (₹ crore)"
              rows={d.byYear.map((y) => ({
                label: fyLabel(y.fy),
                short: `${String(y.fy % 100).padStart(2, "0")}-${String((y.fy + 1) % 100).padStart(2, "0")}`,
                focus: y.focus,
                other: Math.max(0, y.total - y.focus),
              }))}
              predicted={{
                short: `${String(p.fy % 100).padStart(2, "0")}-${String((p.fy + 1) % 100).padStart(2, "0")}`,
                label: fyLabel(p.fy),
                focus: p.focus.mid,
                total: p.total.mid,
              }}
            />
            <p className="method">Forecast method: {p.method}</p>
          </section>

          <div className="grid2">
            <div className="card">
              <h3>Chance of funding next year, by sector</h3>
              <ul className="kv">
                {d.sectorOdds.map((o) => (
                  <li key={o.sector}>
                    <span>{o.sector}{o.focusId ? " ★" : ""}</span>
                    <span>{Math.round(o.p * 100)}%</span>
                  </li>
                ))}
              </ul>
              <p className="method">★ = your focus sector. From the number of the last 5 FYs with spend in that sector.</p>
            </div>
            <div className="card">
              <h3>Where the money went (last 3 FYs)</h3>
              <ul className="kv">
                {d.sectorsRecent.slice(0, 6).map((s) => (
                  <li key={s.sector}><span>{s.sector}{s.focusId ? " ★" : ""}</span><span>{fmtCr(s.amount)}</span></li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>Top districts (last 3 FYs)</h3>
              <ul className="kv">
                {d.topDistricts.map((x) => (
                  <li key={x.district + x.state}><span>{x.district === "District not classified elsewhere" ? `${x.state} (unspecified)` : `${x.district}, ${x.state}`}</span><span>{fmtCr(x.amount)}</span></li>
                ))}
              </ul>
              <p className="method">Pune district, all sectors, {fyLabel(stats!.lastFy ?? 2024)}: {fmtCr(stats!.puneLastCr)}</p>
            </div>
          </div>

          {t && (
            <section className="section">
              <h2 className="section-title"><Icon name="calendar" /> The recurring cycle</h2>
              <YearMonthCalendar
                grid={t.grid ?? []}
                windowStart={t.basis === "company" ? windowStart : null}
                yearsHit={t.recurrence?.yearsHit ?? []}
                nextWindowStart={t.basis === "company" ? t.nextWindowStart : null}
                now={now}
                title={`${t.events} dated ${t.counted === "announcements" ? "announcements" : "headlines"} by month and year (CSR news archives since 2009)`}
              />
            </section>
          )}
        </>
      )}

      {!stats && spend.length > 0 && (
        <section className="section glass card-pad">
          <h2 className="section-title">CSR reported to the National CSR Portal</h2>
          <p className="muted small">Below the ₹1 cr threshold used for forecasts, so no prediction is made; the reported history is shown as is.</p>
          <ul className="kv">{spend.map((r) => <li key={r.fy}><span>{fyLabel(r.fy)} · {r.sectors}</span><span>{fmtCr(r.total)}</span></li>)}</ul>
        </section>
      )}

      {people.length > 0 && (
        <section className="section">
          <h2>People publicly named here</h2>
          <ul className="kv">
            {people.map((p) => <li key={p.name}><span>{p.name}{p.title ? ` · ${p.title}` : ""}</span><span><a href={p.url} target="_blank" rel="noopener noreferrer">source ↗</a></span></li>)}
          </ul>
          <p className="more-link"><Link href="/community">Community builder →</Link></p>
        </section>
      )}

      <section className="section">
        <h2>In the digest</h2>
        {recentSignals.length === 0 ? (
          <p className="muted small">No recent digest items for this company.</p>
        ) : (
          <ul className="kv">
            {recentSignals.map((s) => (
              <li key={s.id}>
                <span><a className="company-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></span>
                <span>{TIER_LABELS[s.tier]} · {SIGNAL_LABELS[s.signalType]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Recent announcements</h2>
        {announcements.length === 0 ? (
          <p className="muted small">None found in the CSR news archives yet.</p>
        ) : (
          <ul className="kv">
            {announcements.map((a) => (
              <li key={a.url}>
                <span><a className="company-link" href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a></span>
                <span>{dateFmt.format(a.at)} · {KIND_LABELS[a.kind ?? ""] ?? a.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
