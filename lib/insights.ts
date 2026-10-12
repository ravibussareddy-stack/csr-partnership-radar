/** One cue card's data (serialisable; built on the server, rendered/filtered on the client). */
import type { DigestItem } from "@/lib/digest";
import { sourceGroup, type SourceGroup } from "@/lib/sources";
import type { WarmItem } from "@/lib/warm";
import type { PitchKit, Quote, Tier } from "@/lib/db/schema";
import { placeKeys } from "@/lib/geo";
import { SIGNAL_LABELS } from "@/lib/scoring";
import { OTHER_SECTORS } from "@/prompts/classify";

export interface Insight {
  key: string;
  kind: "signal" | "warm";
  tier: Tier;
  company: string | null;
  companyId: number | null;
  domain: string | null;
  title: string;
  /** The original article title when a more specific AI headline is shown as the title. */
  originalTitle: string | null;
  url: string | null;
  summary: string;
  /** Why it is worth her time, with the concrete facts. */
  worthIt: string | null;
  /** the analysis's recommendation (v7): only reach_out_now can be Call this week */
  action: "reach_out_now" | "prepare" | "monitor" | "context" | null;
  /** "state:Maharashtra", "city:Pune" (for the geography filter). */
  places: string[];
  geographies: string[];
  policyStatus: "confirmed" | "executed" | "inferred" | null;
  quotes: Quote[];
  pitch: PitchKit | null;
  alsoReported: { title: string; url: string; source: string }[];
  /** every channel this story arrived through (primary + merged copies), for the source filter */
  groups: SourceGroup[];
  date: string | null; // ISO
  sourceGroup: SourceGroup;
  sourceLabel: string;
  signalLabel: string;
  sectors: string[]; // focus sector ids
  keyPoints: string[];
  nextStep: string | null;
  facts: { text: string; tone?: "good" | "review" }[];
  reason: string;
  research: { url: string; title: string; publisher: string | null }[];
  classified: boolean;
  itemId: number | null;
  read: boolean;
  isDemo: boolean;
}

const OTHER_LABELS = new Map<string, string>(OTHER_SECTORS.map((o) => [o.id, o.label]));

export function fromDigest(i: DigestItem, sourceNames: Map<string, string>): Insight {
  const facts: Insight["facts"] = [];
  if (i.outsideFocus) {
    const labels = i.otherSectors.map((id) => OTHER_LABELS.get(id) ?? id);
    facts.push({ text: `Outside focus${labels.length ? `: ${labels.join(", ")}` : ""} · for review`, tone: "review" });
  }
  if (i.activelyPartnering === "yes") facts.push({ text: `Works with NGOs${i.partners.length ? `: ${i.partners.slice(0, 2).join(", ")}` : ""}`, tone: "good" });
  else if (i.activelyPartnering === "no") facts.push({ text: "Runs it in-house" });
  if (i.programmeStartYear) {
    const yrs = new Date().getUTCFullYear() - i.programmeStartYear;
    facts.push({ text: `Since ${i.programmeStartYear}${yrs > 0 ? ` · ${yrs} yr${yrs === 1 ? "" : "s"}` : " · new"}` });
  }
  if (i.amountInrCrore) facts.push({ text: `₹${i.amountInrCrore.toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr${i.financialYear ? ` · ${i.financialYear}` : ""}` });
  if (i.channel) facts.push({ text: `via ${i.channel}` });
  if (i.reason.includes("pitch a Pune programme")) facts.push({ text: "Outside your region · pitch a Pune programme", tone: "good" });
  return {
    key: `s${i.id}`,
    kind: "signal",
    tier: i.tier,
    company: i.company,
    companyId: i.companyId,
    domain: i.domain,
    title: i.headline || i.title,
    originalTitle: i.headline && i.headline !== i.title ? i.title : null,
    url: i.url.startsWith("http") ? i.url : null,
    summary: i.whyItMatters ?? i.reason,
    worthIt: i.worthIt,
    action: i.recommendedAction,
    places: placeKeys(i.geographies),
    geographies: i.geographies,
    policyStatus: i.policyStatus,
    quotes: i.quotes,
    pitch: i.pitch,
    alsoReported: i.alsoReported.map((a) => ({ ...a, source: sourceNames.get(a.source) ?? a.source })),
    groups: [...new Set([i.sourceGroup, ...i.alsoReported.map((a) => sourceGroup(a.source))])],
    date: new Date(i.date).toISOString(),
    sourceGroup: i.sourceGroup,
    sourceLabel: sourceNames.get(i.source) ?? i.source,
    signalLabel: SIGNAL_LABELS[i.signalType],
    sectors: i.sectors,
    keyPoints: i.keyPoints,
    nextStep: i.nextStep,
    facts,
    reason: i.reason,
    research: i.research,
    classified: i.classified,
    itemId: i.itemId,
    read: i.read,
    isDemo: i.isDemo,
  };
}

const KIND_LABELS: Record<string, string> = {
  new_initiative: "New initiative",
  partnership: "Partnership",
  allocation_or_spend: "Spend / allocation",
  partner_search: "Partner search",
};

export function fromWarm(w: WarmItem): Insight {
  const t = w.timing;
  const windowText = t?.window && t.nextWindowStart ? `Usual announcement window ${t.window}${t.basis === "company" ? "" : " (sector pattern)"}` : null;
  return {
    key: `w${w.companyId}`,
    kind: "warm",
    tier: w.tier,
    company: w.company,
    companyId: w.companyId,
    domain: w.domain,
    title: w.activity.last?.title ?? `${w.company}: active in your sectors`,
    originalTitle: null,
    worthIt: null,
    action: null,
    places: [],
    geographies: [],
    policyStatus: null,
    quotes: [],
    pitch: null,
    alsoReported: [],
    groups: ["news"],
    url: w.activity.last?.url ?? null,
    summary: w.activity.last
      ? `${w.activity.count} announcement${w.activity.count === 1 ? "" : "s"} in your sectors in the last 12 months.${windowText ? ` ${windowText}.` : ""}`
      : `Spends on your sectors in Maharashtra.${windowText ? ` ${windowText}.` : ""}`,
    date: w.activity.last ? new Date(w.activity.last.at).toISOString() : null,
    sourceGroup: "news",
    sourceLabel: "CSR news archives + National CSR Portal",
    signalLabel: w.activity.last ? (KIND_LABELS[w.activity.last.kind] ?? "Warm") : "Warm (spend)",
    sectors: w.activity.last?.sector ? [w.activity.last.sector] : [],
    keyPoints: [],
    nextStep: windowText ? `${windowText}: plan the outreach before it opens, and open the company profile for spend history and districts.` : "Open the company profile for spend history and districts before reaching out.",
    facts: [],
    reason: w.reason,
    research: [],
    classified: true,
    itemId: null,
    read: false,
    isDemo: false,
  };
}
