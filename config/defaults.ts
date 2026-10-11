/**
 * Default configuration. Seeded into the `config` table by `npm run db:seed`.
 * After seeding, the DB row is the source of truth (so sectors, geographies and
 * weights can change without a deploy). Re-seed with `npm run db:seed -- --force`.
 */

export type SignalTypeKey =
  | "new_initiative"
  | "allocation_increase"
  | "partner_search"
  | "policy_change";

export interface SectorConfig {
  id: string;
  label: string;
  keywords: string[];
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
}

export interface AppConfig {
  sectors: SectorConfig[];
  geographies: GeographyConfig[];
  keywords: {
    /** At least one must appear (unless the source is csrFocused). */
    csr: string[];
    /** CSR policy/regulation terms. These pass the sector check on their own. */
    policy: string[];
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
    /** Items older than this are not re-scored and do not appear in the digest window. */
    lookbackDays: number;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  sectors: [
    {
      id: "education",
      label: "Education",
      keywords: [
        "education", "school", "schools", "scholarship", "scholarships", "classroom",
        "teacher training", "STEM", "foundational literacy", "numeracy", "dropout",
        "dropouts", "learning outcomes", "girl child education",
      ],
    },
    {
      id: "skill_development",
      label: "Skill development",
      keywords: [
        "skill development", "skilling", "upskilling", "reskilling", "vocational",
        "ITI", "apprenticeship", "apprenticeships", "skill centre", "skill center",
        "training programme", "training program", "NSDC",
      ],
    },
    {
      id: "digital_literacy",
      label: "Digital literacy",
      keywords: [
        "digital literacy", "digital skills", "digital skilling", "computer literacy",
        "coding", "computer lab", "digital classroom", "smart classroom", "AI skilling",
      ],
    },
    {
      id: "youth_employment",
      label: "Youth employment",
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
      policy_change: [
        "CSR rules", "amendment", "notification", "circular", "Schedule VII",
        "Section 135", "Ministry of Corporate Affairs", "SEBI", "Social Stock Exchange",
      ],
    },
  },
  // Verified reachable and allowed by robots.txt on 2026-10-11.
  sources: [
    {
      id: "indiacsr",
      name: "India CSR",
      url: "https://indiacsr.in/feed/",
      type: "rss",
      weight: 6,
      csrFocused: true,
      enabled: true,
    },
    {
      id: "thecsrjournal",
      name: "The CSR Journal",
      url: "https://thecsrjournal.in/feed/",
      type: "rss",
      weight: 6,
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
    lookbackDays: 14,
  },
};
