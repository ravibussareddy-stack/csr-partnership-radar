/**
 * The weekly PDF report's content (app/api/report/route.tsx): the week's highlights from the same cached
 * data as the Summary and Digest pages. No AI calls; read-only. Public data only (no partner or team data).
 */
import { getHomeInsights, getImpactStats, getRegulatory, getSummary } from "@/lib/data";
import { CALL_TYPE_LABELS } from "@/lib/insights";

export interface ReportItem {
  company: string;
  title: string;
  why: string;
  url: string | null;
  tag: string;
}

export interface WeeklyReport {
  week: string;
  range: string;
  generatedAt: string;
  updatedAt: string | null;
  numbers: { label: string; value: string }[];
  calls: ReportItem[];
  introduce: ReportItem[];
  watch: ReportItem[];
  likelySoon: { company: string; detail: string }[];
  hiring: { title: string; detail: string; url: string }[];
  regulatory: { overview: string | null; highlights: { status: string; text: string }[]; items: { status: string; title: string; date: string; url: string }[] };
}

const ist = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...o });
const day = ist({ day: "numeric", month: "short", year: "numeric" });
const dayTime = ist({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `W${Math.ceil(((t.getTime() - start.getTime()) / 86400_000 + 1) / 7)} ${t.getUTCFullYear()}`;
}

const cr = (n: number) => `Rs ${n >= 100 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(1)} cr`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const STATUS: Record<string, string> = { executed: "Executed", confirmed: "Confirmed", inferred: "Inferred" };

export async function loadWeeklyReport(now = new Date()): Promise<WeeklyReport | null> {
  const [summary, home, reg, stats] = await Promise.all([getSummary(), getHomeInsights(), getRegulatory(), getImpactStats()]);
  if (!summary || home.status !== "ok") return null;

  const item = (i: (typeof summary.calls)[number], tag: string): ReportItem => ({
    company: i.company ?? "Company not named",
    title: i.title,
    why: clip(i.worthIt ?? i.summary, 260),
    url: i.url,
    tag,
  });
  const watch = home.signals
    .filter((s) => s.tier === "watch" && !s.isDemo && !summary.introduce.some((x) => x.key === s.key))
    .slice(0, 8)
    .map((s) => item(s, s.signalLabel));
  const sixMonthsAgo = now.getTime() - 183 * 86400_000;
  const regItems = reg.items.filter((i) => new Date(i.date).getTime() >= now.getTime() - 14 * 86400_000);

  return {
    week: isoWeek(now),
    range: `${day.format(new Date(now.getTime() - 7 * 86400_000))} – ${day.format(now)}`,
    generatedAt: dayTime.format(now),
    updatedAt: summary.lastUpdated ? dayTime.format(new Date(summary.lastUpdated)) : null,
    numbers: [
      { label: "to call this week", value: String(summary.calls.length) },
      { label: "to introduce soon", value: String(summary.introduce.length) },
      { label: "likely to fund Pune / MH in 30 days", value: String(summary.likelySoon.length) },
      { label: "companies hiring for CSR", value: String(summary.hiring.length) },
      { label: "rule updates (6 months)", value: String(reg.items.filter((i) => new Date(i.date).getTime() >= sixMonthsAgo).length) },
      ...(stats ? [{ label: "items read for you this week", value: stats.itemsThisWeek.toLocaleString("en-IN") }] : []),
    ],
    calls: summary.calls.map((c) => item(c, c.callType ? CALL_TYPE_LABELS[c.callType] : "Call")),
    introduce: summary.introduce.slice(0, 8).map((c) => item(c, "Introduce soon")),
    watch,
    likelySoon: summary.likelySoon.slice(0, 8).map((c) => ({
      company: c.name,
      detail: [
        c.inWindow ? `window ${c.window} open now` : `window opens in ${c.opensIn} days (${c.window})`,
        c.puneLastCr > 0 ? `Pune ${cr(c.puneLastCr)}` : `Maharashtra ${cr(c.maharashtraLastCr)}`,
        `${c.strength} cycle`,
        c.topSectors[0] ? `${c.topSectors[0].sector} ${c.topSectors[0].share}%` : "",
      ].filter(Boolean).join(" · "),
    })),
    hiring: summary.hiring.slice(0, 6).map((h) => ({ title: h.title, detail: [h.company, h.geographies[0]].filter(Boolean).join(" · "), url: h.url })),
    regulatory: {
      overview: reg.summary?.overview ?? null,
      highlights: (reg.summary?.highlights ?? []).slice(0, 4).map((h) => ({ status: STATUS[h.status] ?? h.status, text: h.text })),
      items: regItems.slice(0, 5).map((i) => ({ status: STATUS[i.status] ?? i.status, title: i.title, date: day.format(new Date(i.date)), url: i.url })),
    },
  };
}
