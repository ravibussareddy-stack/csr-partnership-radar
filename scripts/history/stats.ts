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
import { companies, companyNews, companyStats, csrSpend, signals } from "@/lib/db/schema";
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
  const allNews = await db.select({ m: sql<number>`extract(month from ${companyNews.publishedAt})`, n: sql<number>`count(*)` })
    .from(companyNews)
    .groupBy(sql`1`);
  const sectorMonths = new Array(12).fill(0);
  for (const r of allNews) sectorMonths[Number(r.m) - 1] = Number(r.n);

  let written = 0;
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
        .select({ companyId: companyNews.companyId, at: companyNews.publishedAt })
        .from(companyNews)
        .where(and(inArray(companyNews.companyId, page), lte(companyNews.publishedAt, now))),
      db.select({ id: companies.id, isPsu: companies.isPsu }).from(companies).where(inArray(companies.id, page)),
    ]);
    const psu = new Map(meta.map((m) => [m.id, m.isPsu]));
    const byCo = new Map<number, typeof spend>();
    for (const r of spend) (byCo.get(r.companyId) ?? byCo.set(r.companyId, []).get(r.companyId)!).push(r);
    const newsBy = new Map<number, Date[]>();
    for (const n of news) (newsBy.get(n.companyId) ?? newsBy.set(n.companyId, []).get(n.companyId)!).push(n.at);

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
        timing: timingFrom(newsBy.get(companyId) ?? [], sectorMonths, now),
      };
      const last = years.get(lastFy);
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
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
