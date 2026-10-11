/**
 * Default configuration. Seeded into the `config` table by `npm run db:seed`.
 * After seeding, the DB row is the source of truth (so sectors, geographies and
 * weights can change without a deploy). Re-seed with `npm run db:seed -- --force`.
 */

export type SignalTypeKey =
  | "new_initiative"
  | "allocation_increase"
  | "partner_search"
  | "policy_change"
  | "ongoing_programme";

export interface SectorConfig {
  id: string;
  label: string;
  keywords: string[];
  /** National CSR Portal development-sector names (lowercase) that count as this sector. */
  portalSectors?: string[];
}

export interface GeographyConfig {
  id: string;
  label: string;
  /** Points added when an item matches this geography. Highest match wins. */
  weight: number;
  keywords: string[];
}

export interface SourceConfig {
  id: string;
  name: string;
  url: string;
  type: "rss";
  /** 0–10, added to the score. Higher for sources that are mostly on-topic. */
  weight: number;
  /** Every item is CSR-related, so the pre-filter skips the CSR-keyword check. */
  csrFocused: boolean;
  enabled: boolean;
  /**
   * WordPress feeds only show the newest ~10 posts. pages > 1 also fetches
   * ?paged=2..pages so a daily run covers the full day (or a backlog on first run).
   */
  pages?: number;
}

export interface AppConfig {
  sectors: SectorConfig[];
  geographies: GeographyConfig[];
  keywords: {
    /** At least one must appear (unless the source is csrFocused). */
    csr: string[];
    /** CSR policy/regulation terms. These pass the pre-filter on their own. */
    policy: string[];
    /**
     * true: items must also mention a focus-sector keyword to reach Gemini.
     * false (default): CSR in any sector reaches Gemini; outside-sector items are kept "for review".
     */
    requireSectorMatch?: boolean;
    /** Used only for rules-only typing of unclassified items. */
    signalHints: Record<SignalTypeKey, string[]>;
  };
  sources: SourceConfig[];
  scoringWeights: {
    signalType: Record<SignalTypeKey | "none", number>;
    /** Ordered by maxAgeDays ascending; first match wins. */
    recency: { maxAgeDays: number; points: number }[];
    sectorPerMatch: number;
    sectorMax: number;
    /** Subtracted when model confidence is below lowConfidenceThreshold. */
    lowConfidencePenalty: number;
    lowConfidenceThreshold: number;
    thresholds: { callThisWeek: number; watch: number };
    /** Highest tier an unclassified (rules-only) item can reach. */
    unclassifiedMaxTier: "call_this_week" | "watch" | "background";
    /** Highest tier for CSR entirely outside the focus sectors (kept for review). */
    outsideSectorMaxTier: "call_this_week" | "watch" | "background";
    /** Added when the company is working with NGO / implementation partners. */
    activelyPartneringBonus: number;
    /** Items older than this are not re-scored and do not appear in the digest window. */
    lookbackDays: number;
    /** Warm list: companies with focus-sector CSR activity in the last `days` days. */
    warm: {
      days: number;
      maxItems: number;
      /** points by age of the latest focus-sector announcement; first match wins */
      recency: { maxAgeDays: number; points: number }[];
      perAnnouncement: number;
      maxAnnouncementsCounted: number;
      partnerSearchDays: number;
      partnerSearch: number;
      /** announcement window starting within this many days (or already open) */
      windowSoonDays: number;
      windowCompany: number;
      windowSectorPattern: number;
      /** points by last-FY ₹ crore; first tier whose minCr is met wins */
      maharashtraFocusSpend: { minCr: number; points: number }[];
      puneSpend: { minCr: number; points: number }[];
      /** companies added from portal spend even without recent news (top N by Maharashtra focus spend) */
      spendCandidates: number;
      thresholds: { callThisWeek: number; watch: number };
    };
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  sectors: [
    {
      id: "education",
      label: "Education",
      portalSectors: ["education", "special education"],
      keywords: [
        "education", "school", "schools", "scholarship", "scholarships", "classroom",
        "teacher training", "STEM", "foundational literacy", "numeracy", "dropout",
        "dropouts", "learning outcomes", "girl child education",
      ],
    },
    {
      id: "skill_development",
      label: "Skill development",
      portalSectors: ["vocational skills"],
      keywords: [
        "skill development", "skilling", "upskilling", "reskilling", "vocational",
        "ITI", "apprenticeship", "apprenticeships", "skill centre", "skill center",
        "training programme", "training program", "NSDC",
      ],
    },
    {
      id: "digital_literacy",
      label: "Digital literacy",
      // The portal has no digital-literacy sector; such projects are reported under Education.
      portalSectors: [],
      keywords: [
        "digital literacy", "digital skills", "digital skilling", "computer literacy",
        "coding", "computer lab", "digital classroom", "smart classroom", "AI skilling",
      ],
    },
    {
      id: "youth_employment",
      label: "Youth employment",
      portalSectors: ["livelihood enhancement projects"],
      keywords: [
        "youth employment", "employability", "job seekers", "first-generation",
        "placement", "placements", "livelihood", "livelihoods", "entrepreneurship",
        "jobs for youth", "career readiness",
      ],
    },
  ],
  geographies: [
    { id: "pune", label: "Pune", weight: 20, keywords: ["Pune", "Pimpri", "Chinchwad", "PCMC"] },
    {
      id: "maharashtra",
      label: "Maharashtra",
      weight: 12,
      keywords: [
        "Maharashtra", "Mumbai", "Thane", "Nashik", "Nagpur", "Aurangabad",
        "Chhatrapati Sambhajinagar", "Kolhapur", "Satara", "Solapur", "Navi Mumbai",
      ],
    },
    {
      id: "india",
      label: "India (national)",
      weight: 4,
      keywords: ["India", "pan-India", "nationwide", "across the country"],
    },
  ],
  keywords: {
    csr: [
      "CSR", "corporate social responsibility", "foundation", "philanthropy",
      "social impact", "NGO", "NGOs", "non-profit", "nonprofit", "implementation partner",
      "implementing agency", "community development", "Schedule VII", "Section 135",
    ],
    policy: [
      "CSR rules", "CSR amendment", "Schedule VII", "Section 135", "Companies Act",
      "Ministry of Corporate Affairs", "MCA", "CSR-1", "CSR-2", "unspent CSR",
      "Social Stock Exchange", "BRSR", "SEBI",
    ],
    requireSectorMatch: false,
    signalHints: {
      partner_search: [
        "seeks NGO", "seeking NGO", "invites proposals", "inviting proposals",
        "call for proposals", "request for proposal", "RFP", "expression of interest",
        "EOI", "implementation partner", "implementing partner", "partner NGOs",
        "empanelment",
      ],
      allocation_increase: [
        "increase CSR", "increased CSR", "higher CSR", "CSR spend rises", "CSR budget",
        "crore", "allocates", "allocated", "earmarks", "earmarked", "commits",
        "committed", "pledges",
      ],
      new_initiative: [
        "launches", "launched", "inaugurates", "inaugurated", "unveils", "introduces",
        "new initiative", "new programme", "new program", "partners with", "signs MoU",
        "MoU",
      ],
      ongoing_programme: [
        "continues", "continued", "edition", "spent", "spends", "impact report",
        "annual report", "so far", "has reached", "benefited",
      ],
      policy_change: [
        "CSR rules", "amendment", "notification", "circular", "Schedule VII",
        "Section 135", "Ministry of Corporate Affairs", "SEBI", "Social Stock Exchange",
      ],
    },
  },
  // Verified with `npm run sources:check` on 2026-10-11 (reachable, robots.txt allows, fresh).
  // Rejected: Google News RSS (robots.txt), Business Standard + PIB (403), thecsrupdates.com
  // (timeout), education-news feeds (no CSR items pass the pre-filter).
  sources: [
    {
      id: "indiacsr",
      name: "India CSR",
      url: "https://indiacsr.in/feed/",
      type: "rss",
      weight: 6,
      csrFocused: true,
      enabled: true,
      // ~17 posts/day but the feed shows only 10.
      pages: 5,
    },
    {
      id: "thecsrjournal",
      name: "The CSR Journal — CSR",
      // The site-wide feed is mostly general news; this category feed is CSR-only.
      url: "https://thecsrjournal.in/category/corporate-social-responsibility/feed/",
      type: "rss",
      weight: 6,
      csrFocused: true,
      enabled: true,
      pages: 2,
    },
    {
      id: "csrmandate",
      name: "CSR Mandate",
      url: "https://csrmandate.org/feed/",
      type: "rss",
      weight: 6,
      csrFocused: true,
      enabled: true,
    },
    {
      id: "csrtimes",
      name: "CSR Times",
      url: "https://www.csrtimes.org/feed/",
      type: "rss",
      weight: 5,
      csrFocused: true,
      enabled: true,
    },
    {
      id: "hbl-companies",
      name: "Hindu BusinessLine — Companies",
      url: "https://www.thehindubusinessline.com/companies/feeder/default.rss",
      type: "rss",
      weight: 4,
      csrFocused: false,
      enabled: true,
    },
    {
      id: "mint-companies",
      name: "Mint — Companies",
      url: "https://www.livemint.com/rss/companies",
      type: "rss",
      weight: 4,
      csrFocused: false,
      enabled: true,
    },
    {
      id: "et-corporate-trends",
      name: "Economic Times — Corporate Trends",
      url: "https://economictimes.indiatimes.com/news/company/corporate-trends/rssfeeds/2143429.cms",
      type: "rss",
      weight: 4,
      csrFocused: false,
      enabled: true,
    },
  ],
  scoringWeights: {
    signalType: {
      partner_search: 45,
      new_initiative: 35,
      allocation_increase: 30,
      policy_change: 25,
      ongoing_programme: 10,
      none: 0,
    },
    recency: [
      { maxAgeDays: 3, points: 15 },
      { maxAgeDays: 7, points: 10 },
      { maxAgeDays: 14, points: 3 },
    ],
    sectorPerMatch: 10,
    sectorMax: 20,
    lowConfidencePenalty: 10,
    lowConfidenceThreshold: 0.5,
    thresholds: { callThisWeek: 60, watch: 35 },
    unclassifiedMaxTier: "watch",
    outsideSectorMaxTier: "watch",
    activelyPartneringBonus: 10,
    lookbackDays: 14,
    warm: {
      days: 365,
      maxItems: 40,
      recency: [
        { maxAgeDays: 30, points: 30 },
        { maxAgeDays: 90, points: 20 },
        { maxAgeDays: 180, points: 10 },
        { maxAgeDays: 365, points: 5 },
      ],
      perAnnouncement: 5,
      maxAnnouncementsCounted: 4,
      partnerSearchDays: 180,
      partnerSearch: 25,
      windowSoonDays: 30,
      windowCompany: 20,
      windowSectorPattern: 5,
      maharashtraFocusSpend: [
        { minCr: 10, points: 15 },
        { minCr: 1, points: 8 },
        { minCr: 0.01, points: 3 },
      ],
      puneSpend: [
        { minCr: 1, points: 10 },
        { minCr: 0.01, points: 4 },
      ],
      spendCandidates: 30,
      thresholds: { callThisWeek: 60, watch: 30 },
    },
  },
};
