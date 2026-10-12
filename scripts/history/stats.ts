/**
 * npm run history:stats — recomputes company_stats (history + predictions) from csr_spend
 * and company_news. Covers companies with ≥ MIN_RECENT_CR spent over the last 3 reported
 * FYs, plus every company that appears in the digest. Safe to re-run any time.
 */
import "../env";
import { and, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import { loadConfig } from "@/lib/config";
import { closeDb, getDb, type DB } from "@/lib/db/client";
import { ANNOUNCEMENT_KINDS, companies, companyNews, companyStats, csrSpend, modelMetrics, signals } from "@/lib/db/schema";
import { backtestForecast, backtestTiming, pearson, strength } from "@/lib/history/metrics";
import { forecastAmount, round, sectorOdds, timingFrom } from "@/lib/history/predict";
import type { CompanyStatsData, YearRow } from "@/lib/history/types";

const MIN_RECENT_CR = Number(process.env.HISTORY_MIN_RECENT_CR ?? 1);
const PAGE = 1500;
const ODDS_WINDOW = 5;

function focusLookup(cfg: AppConfig): (sector: string) => string | null {
  const map = new Map<string, string>();
  for (const s of cfg.sectors) for (const p of s.portalSectors ?? []) map.set(p.toLowerCase(), s.id);
  return (sector) => map.get(sector.toLowerCase()) ?? null;
}

async function targetCompanyIds(db: DB, fromFy: number): Promise<number[]> {
  const big = await db
    .select({ id: csrSpend.companyId })
    .from(csrSpend)
    .where(gte(csrSpend.fyStart, fromFy))
    .groupBy(csrSpend.companyId)
    .having(sql`sum(${csrSpend.amountCr}) >= ${MIN_RECENT_CR}`);
  const inDigest = await db.select({ id: signals.companyId }).from(signals).where(isNotNull(signals.companyId));
  return [...new Set([...big.map((r) => r.id), ...inDigest.map((r) => r.id!)])].sort((a, b) => a - b);
}

async function main() {
  const db = await getDb();
  const cfg = await loadConfig(db);
  const focusOf = focusLookup(cfg);
  const now = new Date();
  const t0 = Date.now();

  const [{ maxFy }] = await db.select({ maxFy: sql<number>`max(${csrSpend.fyStart})` }).from(csrSpend);
  if (!maxFy) {
    console.log("csr_spend is empty. Run npm run history:import first.");
    return;
  }
  const lastFy = Number(maxFy);
  const recentFrom = lastFy - 2;
  const ids = await targetCompanyIds(db, recentFrom);
  console.log(`stats: last reported FY ${lastFy}, ${ids.length} companies (≥ ₹${MIN_RECENT_CR} cr since FY${recentFrom} or in digest)`);

  // Sector-wide announcement seasonality from all dated news (fallback for sparse companies).
  const allNews = await db
    .select({ m: sql<number>`extract(month from ${companyNews.publishedAt})`, n: sql<number>`count(*)` })
    .from(companyNews)
    .where(inArray(companyNews.kind, ANNOUNCEMENT_KINDS))
    .groupBy(sql`1`);
  const sectorMonths = new Array(12).fill(0);
  for (const r of allNews) sectorMonths[Number(r.m) - 1] = Number(r.n);

  let written = 0;
  // Collected across pages for back-tests and correlations.
  const allYears: YearRow[][] = [];
  const allDates: Date[][] = [];
  const corr = { annCount: [] as number[], growth: [] as number[], logSpend: [] as number[], focusShare: [] as number[], growthPrev: [] as number[], growthLast: [] as number[], mhShare: [] as number[], focusShareMh: [] as number[] };
  for (let i = 0; i < ids.length; i += PAGE) {
    const page = ids.slice(i, i + PAGE);
    const [spend, news, meta] = await Promise.all([
      db
        .select({
          companyId: csrSpend.companyId,
          fy: csrSpend.fyStart,
          sector: csrSpend.sector,
          state: csrSpend.state,
          district: csrSpend.district,
          amount: sql<number>`sum(${csrSpend.amountCr})`,
          lines: sql<number>`count(*)`,
        })
        .from(csrSpend)
        .where(inArray(csrSpend.companyId, page))
        .groupBy(csrSpend.companyId, csrSpend.fyStart, csrSpend.sector, csrSpend.state, csrSpend.district),
      db
        .select({ companyId: companyNews.companyId, at: companyNews.publishedAt, kind: companyNews.kind })
        .from(companyNews)
        .where(and(inArray(companyNews.companyId, page), lte(companyNews.publishedAt, now))),
      db.select({ id: companies.id, isPsu: companies.isPsu }).from(companies).where(inArray(companies.id, page)),
    ]);
    const psu = new Map(meta.map((m) => [m.id, m.isPsu]));
    const byCo = new Map<number, typeof spend>();
    for (const r of spend) (byCo.get(r.companyId) ?? byCo.set(r.companyId, []).get(r.companyId)!).push(r);
    // Timing counts announcements once headlines are classified; until then, every headline.
    const newsBy = new Map<number, { all: Date[]; ann: Date[]; classified: boolean }>();
    for (const n of news) {
      const e = newsBy.get(n.companyId) ?? newsBy.set(n.companyId, { all: [], ann: [], classified: false }).get(n.companyId)!;
      e.all.push(n.at);
      if (n.kind) e.classified = true;
      if (n.kind && ANNOUNCEMENT_KINDS.includes(n.kind)) e.ann.push(n.at);
    }

    const values = page.map((companyId) => {
      const rows = byCo.get(companyId) ?? [];
      const years = new Map<number, YearRow>();
      const sectorRecent = new Map<string, number>();
      const sectorYears = new Map<string, Set<number>>();
      const states = new Map<string, number>();
      const districts = new Map<string, { state: string; amount: number }>();
      let mhFocusLast = 0;
      for (const r of rows) {
        const amt = Number(r.amount);
        const fid = focusOf(r.sector);
        const y = years.get(r.fy) ?? { fy: r.fy, total: 0, focus: 0, projects: 0, maharashtra: 0, pune: 0 };
        y.total += amt;
        y.projects += Number(r.lines);
        if (fid) y.focus += amt;
        if (r.state === "Maharashtra") y.maharashtra += amt;
        if (/^pune$/i.test(r.district.trim())) y.pune += amt;
        years.set(r.fy, y);
        if (r.fy >= recentFrom) {
          sectorRecent.set(r.sector, (sectorRecent.get(r.sector) ?? 0) + amt);
          states.set(r.state, (states.get(r.state) ?? 0) + amt);
          const dk = `${r.district}|${r.state}`;
          districts.set(dk, { state: r.state, amount: (districts.get(dk)?.amount ?? 0) + amt });
        }
        if (r.fy > lastFy - ODDS_WINDOW) (sectorYears.get(r.sector) ?? sectorYears.set(r.sector, new Set()).get(r.sector)!).add(r.fy);
        if (r.fy === lastFy && fid && r.state === "Maharashtra") mhFocusLast += amt;
      }
      const byYear = [...years.values()]
        .sort((a, b) => a.fy - b.fy)
        .map((y) => ({ ...y, total: round(y.total), focus: round(y.focus), maharashtra: round(y.maharashtra), pune: round(y.pune) }));
      const yr = (fy: number) => years.get(fy) ?? { total: 0, focus: 0, projects: 0 };
      const l3 = [lastFy - 2, lastFy - 1, lastFy].map(yr);
      const total = forecastAmount([l3[0].total, l3[1].total, l3[2].total]);
      const focus = forecastAmount([l3[0].focus, l3[1].focus, l3[2].focus]);
      const projects = Math.round(0.2 * l3[0].projects + 0.3 * l3[1].projects + 0.5 * l3[2].projects);

      const data: CompanyStatsData = {
        isPsu: psu.get(companyId) ?? null,
        byYear,
        sectorsRecent: [...sectorRecent.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([sector, amount]) => ({ sector, focusId: focusOf(sector), amount: round(amount) })),
        sectorOdds: [...sectorYears.entries()]
          .map(([sector, ys]) => ({ sector, focusId: focusOf(sector), p: sectorOdds(ys.size, ODDS_WINDOW) }))
          .sort((a, b) => b.p - a.p)
          .slice(0, 8),
        topStates: [...states.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([state, amount]) => ({ state, amount: round(amount) })),
        topDistricts: [...districts.entries()]
          .sort((a, b) => b[1].amount - a[1].amount)
          .slice(0, 5)
          .map(([k, v]) => ({ district: k.split("|")[0], state: v.state, amount: round(v.amount) })),
        prediction: {
          fy: lastFy + 1,
          total,
          focus,
          projects,
          method:
            "Weighted average of the last 3 reported FYs (20/30/50) adjusted by their growth rate (capped ±25%); range = lowest–highest of those 3 years, widened to include the estimate.",
        },
        timing: (() => {
          const e = newsBy.get(companyId);
          if (!e) return timingFrom([], sectorMonths, now);
          return e.classified ? timingFrom(e.ann, sectorMonths, now, "announcements") : timingFrom(e.all, sectorMonths, now, "all_headlines");
        })(),
      };
      const last = years.get(lastFy);
      allYears.push(byYear);
      const ann = newsBy.get(companyId);
      if (ann?.ann.length) allDates.push(ann.ann);
      const t = (fy: number) => years.get(fy)?.total ?? 0;
      const f = (fy: number) => years.get(fy)?.focus ?? 0;
      const sum3 = t(lastFy) + t(lastFy - 1) + t(lastFy - 2);
      if (t(lastFy - 2) >= 1 && t(lastFy) >= 1) {
        const recentAnn = (ann?.ann ?? []).filter((d) => d.getUTCFullYear() >= now.getUTCFullYear() - 3).length;
        corr.annCount.push(recentAnn);
        corr.growth.push(Math.log(t(lastFy) / t(lastFy - 2)));
      }
      if (sum3 >= 1) {
        corr.logSpend.push(Math.log10(sum3));
        corr.focusShare.push((f(lastFy) + f(lastFy - 1) + f(lastFy - 2)) / sum3);
        const mh = [lastFy, lastFy - 1, lastFy - 2].reduce((a, fy) => a + (years.get(fy)?.maharashtra ?? 0), 0);
        corr.mhShare.push(mh / sum3);
        corr.focusShareMh.push((f(lastFy) + f(lastFy - 1) + f(lastFy - 2)) / sum3);
      }
      if (t(lastFy - 2) >= 1 && t(lastFy - 1) >= 1 && t(lastFy) >= 1) {
        corr.growthPrev.push(Math.log(t(lastFy - 1) / t(lastFy - 2)));
        corr.growthLast.push(Math.log(t(lastFy) / t(lastFy - 1)));
      }
      return {
        companyId,
        lastFy: byYear.at(-1)?.fy ?? null,
        yearsActive: byYear.length,
        totalLastCr: round(last?.total ?? 0),
        focusLastCr: round(last?.focus ?? 0),
        maharashtraFocusLastCr: round(mhFocusLast),
        puneLastCr: round(last?.pune ?? 0),
        predictedTotalCr: total.mid,
        predictedFocusCr: focus.mid,
        data,
        updatedAt: now,
      };
    });

    for (let j = 0; j < values.length; j += 300) {
      const chunk = values.slice(j, j + 300);
      await db
        .insert(companyStats)
        .values(chunk)
        .onConflictDoUpdate({
          target: companyStats.companyId,
          set: {
            lastFy: sql`excluded.last_fy`,
            yearsActive: sql`excluded.years_active`,
            totalLastCr: sql`excluded.total_last_cr`,
            focusLastCr: sql`excluded.focus_last_cr`,
            maharashtraFocusLastCr: sql`excluded.maharashtra_focus_last_cr`,
            puneLastCr: sql`excluded.pune_last_cr`,
            predictedTotalCr: sql`excluded.predicted_total_cr`,
            predictedFocusCr: sql`excluded.predicted_focus_cr`,
            data: sql`excluded.data`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
      written += chunk.length;
    }
    console.log(`  ${written}/${ids.length}`);
  }
  // Forecast accuracy (back-test) and correlations, stored for the Funding insights page.
  const forecast = backtestForecast(allYears, lastFy);
  const timing = backtestTiming(allDates);
  const pairs = [
    {
      id: "announcements_growth",
      label: "More CSR announcements ↔ faster spend growth",
      detail: "Dated CSR announcements in the last 3 years vs growth in CSR spend over the last 2 reported years.",
      r: pearson(corr.annCount, corr.growth),
      n: corr.annCount.length,
    },
    {
      id: "size_focus",
      label: "Bigger CSR budgets ↔ larger share to your sectors",
      detail: "Size of CSR spend (last 3 FYs, log scale) vs the share going to education, skilling and livelihoods.",
      r: pearson(corr.logSpend, corr.focusShare),
      n: corr.logSpend.length,
    },
    {
      id: "growth_momentum",
      label: "Spend growth persists year to year",
      detail: "Growth from FY-2 to FY-1 vs growth from FY-1 to the last FY.",
      r: pearson(corr.growthPrev, corr.growthLast),
      n: corr.growthPrev.length,
    },
    {
      id: "mh_focus",
      label: "Maharashtra-heavy funders ↔ focus on your sectors",
      detail: "Share of CSR spent in Maharashtra vs share going to your sectors (last 3 FYs).",
      r: pearson(corr.mhShare, corr.focusShareMh),
      n: corr.mhShare.length,
    },
  ].map((p) => ({ ...p, strength: strength(p.r) }));
  await db
    .insert(modelMetrics)
    .values({ key: "insights", data: { forecast, timing, correlations: pairs, computedAt: now.toISOString() }, updatedAt: now })
    .onConflictDoUpdate({ target: modelMetrics.key, set: { data: sql`excluded.data`, updatedAt: now } });
  console.log(`accuracy: forecast median error ${forecast.medianAbsPctError}% (baseline ${forecast.baselineMedianAbsPctError}%), within range ${forecast.withinRangePct}%, timing hit ${timing.hitRatePct}% vs ${timing.baselinePct}% baseline`);
  for (const p of pairs) console.log(`corr ${p.id}: r=${p.r} (n=${p.n}, ${p.strength})`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
