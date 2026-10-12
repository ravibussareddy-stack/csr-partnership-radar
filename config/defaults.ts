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
  | "ongoing_programme"
  | "csr_hiring"
  | "regional_expansion";

export interface SectorConfig {
  id: string;
  label: string;
  keywords: string[];
  /** National CSR Portal development-sector names (lowercase) that count as this sector. */
  portalSectors?: string[];
  /** Sectors added in the app: what she means by it, and setup state (pending → ready after the intake run). */
  description?: string;
  status?: "pending" | "ready";
  custom?: boolean;
  addedBy?: string;
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
  type: "rss" | "search" | "email";
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

export interface SearchConfig {
  id: string;
  /** What Ananya would type into Google. Gemini runs it with Google Search grounding. */
  query: string;
  enabled: boolean;
  /** "news" (default): CSR news. "jobs": job postings for CSR / foundation / community roles. */
  kind?: "news" | "jobs" | "policy";
  /** Set on searches generated for a sector added in the app (removed with the sector). */
  sectorId?: string;
}

/** Saved-search ids replaced by better queries; dropped from stored configs on load. */
export const RETIRED_SEARCH_IDS = new Set(["policy-mca", "policy-sebi"]);

export interface AppConfig {
  /** Saved Google searches, run daily by scripts/ingest/search.ts. */
  searches: SearchConfig[];
  sectors: SectorConfig[];
  geographies: GeographyConfig[];
  keywords: {
    /** At least one must appear (unless the source is csrFocused). */
    csr: string[];
    /** CSR policy/regulation terms. These pass the pre-filter on their own. */
    policy: string[];
    /**
     * Community-impact phrases that signal social good without saying "CSR" ("villages",
     * "underprivileged", "donated"…), incl. Hindi and Marathi. Pass with 2+ hits, or 1 hit plus a
     * focus-sector keyword, so business uses ("rural demand") alone don't qualify.
     */
    communityImpact?: string[];
    /**
     * Second stage for items that fail the keyword check: Gemini reads headline + first lines,
     * BATCH per call, and lets through anything plausibly about social good by a company or
     * foundation in India. Only those reach full classification.
     */
    contextScreen?: { enabled: boolean; maxCalls: number };
    /**
     * true: items must also mention a focus-sector keyword to reach Gemini.
     * false (default): CSR in any sector reaches Gemini; outside-sector items are kept "for review".
     */
    requireSectorMatch?: boolean;
    /**
     * LinkedIn pages / organisations you follow (NGOs, CSR foundations, networks). LinkedIn
     * emails that name one of these are kept even without a CSR keyword.
     */
    followedPages?: string[];
    /** Used only for rules-only typing of unclassified items. */
    signalHints: Record<SignalTypeKey, string[]>;
  };
  sources: SourceConfig[];
  scoringWeights: {
    signalType: Record<SignalTypeKey | "none", number>;
    /** Ordered by maxAgeDays ascending; first match wins. */
    recency: { maxAgeDays: number; points: number }[];
    /** Points for fitting ANY focus sector. Flat: all four sectors are equal, and an item tagged with two
     * sectors (e.g. education + digital literacy) does not outrank a pure education or skilling item. */
    sectorFit: number;
    /** Legacy (per-sector additive); ignored when sectorFit is set. */
    sectorPerMatch?: number;
    sectorMax?: number;
    /** Subtracted when model confidence is below lowConfidenceThreshold. */
    lowConfidencePenalty: number;
    lowConfidenceThreshold: number;
    thresholds: { callThisWeek: number; watch: number };
    /** Highest tier an unclassified (rules-only) item can reach. */
    unclassifiedMaxTier: "call_this_week" | "watch" | "background";
    /** Highest tier for CSR job posts (a growing CSR team is a lead, not a reason to call this week). */
    hiringMaxTier: "call_this_week" | "watch" | "background";
    /** Highest tier for companies expanding into a region (future CSR funder, no budget yet). */
    expansionMaxTier: "call_this_week" | "watch" | "background";
    /** Highest tier for CSR entirely outside the focus sectors (kept for review). */
    outsideSectorMaxTier: "call_this_week" | "watch" | "background";
    /** Added when the company is working with NGO / implementation partners. */
    activelyPartneringBonus: number;
    /** Items older than this are not re-scored and do not appear in the digest window. */
    lookbackDays: number;
    /**
     * Learning from "Not relevant" feedback (last `days` days). Penalties apply to NEW items that
     * share a company / source / signal type with items Ananya rejected, once `minCount` is reached.
     */
    feedback: { days: number; minCount: number; companyPenalty: number; perSimilar: number; sourceMax: number; typeMax: number };
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
  searches: [
    { id: "edu-partner", query: "company CSR education programme NGO implementation partner India", enabled: true },
    { id: "skilling-mh", query: "CSR skill development initiative Maharashtra Pune", enabled: true },
    { id: "rfp", query: "CSR call for proposals OR expression of interest NGO education skilling India", enabled: true },
    { id: "digital-literacy", query: "CSR digital literacy programme launched India company", enabled: true },
    { id: "youth-employability", query: "CSR youth employability first-generation job seekers programme India", enabled: true },
    { id: "allocation", query: "company increases CSR budget education skilling crore", enabled: true },
    { id: "policy", query: "CSR rules amendment Ministry of Corporate Affairs Schedule VII", enabled: true },
    { id: "pune-schools", query: "CSR school dropouts Pune company foundation", enabled: true },
    // Hiring radar: companies building CSR teams are planning programmes.
    { id: "jobs-csr-manager", kind: "jobs", query: "CSR manager job India company foundation", enabled: true },
    { id: "jobs-csr-mh", kind: "jobs", query: "CSR executive OR CSR lead job Pune Mumbai Maharashtra", enabled: true },
    { id: "jobs-csr-south", kind: "jobs", query: "CSR programme manager job Bengaluru Hyderabad", enabled: true },
    { id: "jobs-community", kind: "jobs", query: "community development OR social impact manager job corporate foundation India", enabled: true },
    // Regulatory page. Official MCA/SEBI pages are rarely dated or indexed for recent-news queries
    // (the first site-focused queries found nothing), so these target news coverage of official
    // notices, parliamentary replies and the debate; the classifier labels each item's status.
    { id: "policy-mca-news", kind: "policy", query: "MCA CSR rules amendment OR notification OR clarification news India", enabled: true },
    { id: "policy-unspent", kind: "policy", query: "unspent CSR funds rules OR CSR spending compliance companies news India", enabled: true },
    { id: "policy-parliament", kind: "policy", query: "Lok Sabha OR Rajya Sabha CSR question Ministry of Corporate Affairs reply CSR expenditure", enabled: true },
    { id: "policy-sse-brsr", kind: "policy", query: "Social Stock Exchange NGO listing OR BRSR CSR disclosure SEBI news", enabled: true },
    { id: "policy-debate", kind: "policy", query: "CSR rules India debate OR consultation OR committee recommendation OR expert view", enabled: true },
  ],
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
    communityImpact: [
      "community", "communities", "underprivileged", "underserved", "marginalised", "marginalized",
      "disadvantaged", "low-income", "rural youth", "villages", "villagers", "tribal", "slum",
      "beneficiaries", "beneficiary", "empower", "empowers", "empowering", "empowerment",
      "upliftment", "welfare", "outreach", "volunteer", "volunteers", "volunteering", "donated",
      "donates", "donation", "donations", "sponsored", "adopted", "adopts", "free of cost",
      "free training", "scholarship", "scholarships", "giving back", "philanthropic", "charitable",
      "trust", "impact report", "sustainability report", "inclusive", "first-generation learners",
      "girls' education", "anganwadi", "zilla parishad", "government schools", "civic",
      // Hindi
      "सीएसआर", "सामाजिक", "समुदाय", "ग्रामीण", "कौशल", "छात्रवृत्ति", "दान", "युवाओं",
      // Marathi
      "सामाजिक बांधिलकी", "कौशल्य", "शिष्यवृत्ती", "ग्रामीण", "समाज", "स्वयंसेवी", "युवकांसाठी",
    ],
    contextScreen: { enabled: true, maxCalls: 6 },
    followedPages: ["Youth Seva", "India CSR", "The CSR Journal", "CSRBOX", "Sattva", "Dasra", "GuideStar India", "NSDC"],
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
      csr_hiring: [
        "hiring", "we are hiring", "job opening", "vacancy", "apply now", "CSR Manager",
        "CSR Lead", "Head of CSR", "CSR Executive", "CSR Programme Manager",
      ],
      regional_expansion: [
        "new plant", "manufacturing facility", "sets up", "to invest", "investment of",
        "MoU with Maharashtra", "greenfield", "new campus", "expansion",
      ],
      policy_change: [
        "CSR rules", "amendment", "notification", "circular", "Schedule VII",
        "Section 135", "Ministry of Corporate Affairs", "SEBI", "Social Stock Exchange",
      ],
    },
  },
  // Non-RSS sources: their items get these weights and the CSR-focused flag.
  // "gemini-search": Gemini + Google Search grounding over `searches`. "google-alerts" / "email-intake": the intake inbox.
  // (Kept disabled for the RSS fetcher by type.)
  // Verified with `npm run sources:check` on 2026-10-11 (reachable, robots.txt allows, fresh).
  // Rejected: Google News RSS (robots.txt), Business Standard + PIB (403), thecsrupdates.com
  // (timeout), education-news feeds (no CSR items pass the pre-filter).
  sources: [
    { id: "gemini-search", name: "Google Search (via Gemini)", url: "https://www.google.com/", type: "search", weight: 5, csrFocused: true, enabled: true },
    // Demo items (scripts/demo/seed.ts): labelled samples built from real public news, for demonstration only.
    { id: "linkedin-demo", name: "LinkedIn (demo sample)", url: "https://www.linkedin.com/", type: "email", weight: 3, csrFocused: true, enabled: true },
    { id: "gemini-jobs", name: "Job sites (via Google search)", url: "https://www.google.com/", type: "search", weight: 4, csrFocused: true, enabled: true },
    { id: "google-alerts", name: "Google Alerts", url: "imap://intake", type: "email", weight: 5, csrFocused: true, enabled: true },
    { id: "linkedin-email", name: "LinkedIn (email notifications)", url: "imap://intake", type: "email", weight: 4, csrFocused: false, enabled: true },
    { id: "email-intake", name: "Forwarded to the intake inbox", url: "imap://intake", type: "email", weight: 6, csrFocused: true, enabled: true },
    { id: "pasted", name: "Pasted messages", url: "app://inbox", type: "email", weight: 6, csrFocused: true, enabled: true },
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
      csr_hiring: 20,
      regional_expansion: 15,
      none: 0,
    },
    recency: [
      { maxAgeDays: 3, points: 15 },
      { maxAgeDays: 7, points: 10 },
      { maxAgeDays: 14, points: 3 },
    ],
    sectorFit: 20,
    lowConfidencePenalty: 10,
    lowConfidenceThreshold: 0.5,
    thresholds: { callThisWeek: 60, watch: 35 },
    unclassifiedMaxTier: "watch",
    hiringMaxTier: "watch",
    expansionMaxTier: "watch",
    outsideSectorMaxTier: "watch",
    activelyPartneringBonus: 10,
    lookbackDays: 14,
    feedback: { days: 90, minCount: 2, companyPenalty: 25, perSimilar: 4, sourceMax: 16, typeMax: 16 },
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
