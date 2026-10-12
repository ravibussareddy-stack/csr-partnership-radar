/**
 * How much a cited page can be trusted as evidence for an NGO deciding whether to approach a funder.
 *   official: the company's own site, a government / regulator site, a stock-exchange filing
 *   news:     recognised news organisations, wire services and CSR news outlets
 *   low:      review, listing, broker, aggregator, forum, social or self-publishing sites
 *   other:    anything else
 * Proof metrics in pitch kits must come from official or news sources.
 */
export type SourceTier = "official" | "news" | "low" | "other";

const OFFICIAL = /(^|\.)(gov\.in|nic\.in|sebi\.gov\.in|mca\.gov\.in|rbi\.org\.in|nseindia\.com|bseindia\.com|csr\.gov\.in|pib\.gov\.in)$/i;
const NEWS = /(^|\.)(thehindu\.com|thehindubusinessline\.com|livemint\.com|economictimes\.indiatimes\.com|indiatimes\.com|business-standard\.com|financialexpress\.com|hindustantimes\.com|indianexpress\.com|ndtv\.com|news18\.com|indiatoday\.in|deccanherald\.com|deccanchronicle\.com|moneycontrol\.com|reuters\.com|ptinews\.com|aninews\.in|ians\.in|businesswire\.com|prnewswire\.com|yourstory\.com|thebetterindia\.com|indiacsr\.in|thecsrjournal\.in|csrmandate\.org|csrtimes\.org|thecsruniverse\.com|ngobox\.org|devex\.com|cxotoday\.com|outlookindia\.com|theprint\.in|scroll\.in|firstpost\.com|lokmat\.com|loksatta\.com|maharashtratimes\.com|esakal\.com|punemirror\.com|timesofindia\.com)$/i;
const LOW = /(review|listing|broker|compare|forum|quora|reddit|medium\.com|blogspot|wordpress\.com|scribd|slideshare|facebook\.com|instagram\.com|x\.com|twitter\.com|youtube\.com|pinterest|glassdoor|ambitionbox|justdial|indiamart|tracxn|zaubacorp|tofler|crunchbase|wikipedia)/i;

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function sourceTier(url: string, companyNames: string[] = []): SourceTier {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "low";
  }
  if (OFFICIAL.test(host)) return "official";
  // Any label of the host can be the company (bajajauto.com, investors.bajajauto.com, amns.in).
  const labels = host.split(".").slice(0, -1).map(compact).filter((l) => l.length >= 3 && !["www", "investors", "investor", "ir", "csr", "about", "media", "news"].includes(l));
  const own = companyNames
    .map((n) => compact(n.replace(/\b(india|limited|ltd|private|pvt|foundation|group)\b/gi, "")))
    .some((c) => c.length >= 3 && labels.some((b) => c.startsWith(b) || b.startsWith(c)));
  if (own) return "official";
  if (LOW.test(host)) return "low";
  if (NEWS.test(host)) return "news";
  return "other";
}
