import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AppConfig } from "@/config/defaults";
import type { CompanyStatsData } from "@/lib/history/types";

export const SIGNAL_TYPES = [
  "new_initiative",
  "allocation_increase",
  "partner_search",
  "policy_change",
  "ongoing_programme",
  "csr_hiring",
  "regional_expansion",
  "none",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const TIERS = ["call_this_week", "watch", "background"] as const;
export type Tier = (typeof TIERS)[number];

export const HEADLINE_KINDS = [
  "new_initiative",
  "partnership",
  "allocation_or_spend",
  "partner_search",
  "ongoing_activity",
  "not_csr",
] as const;
export type HeadlineKind = (typeof HEADLINE_KINDS)[number];
/** Headline kinds that count as an "announcement" for timing. */
export const ANNOUNCEMENT_KINDS: HeadlineKind[] = ["new_initiative", "partnership", "allocation_or_spend", "partner_search"];

export type ClassifyStatus = "pending" | "filtered_out" | "classified" | "unclassified";

export const rawItems = pgTable("raw_items", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  url: text("url").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  contentHash: text("content_hash").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  // Pipeline state (not in the original brief; needed so failed items are retried next run).
  prefilterPassed: boolean("prefilter_passed"),
  // Why it passed/failed: "keywords: …" (stage 1) or "context: …" (stage 2 Gemini screen).
  prefilterNote: text("prefilter_note"),
  // Pasted messages: where the message came from (whatsapp, linkedin, telegram, email, other).
  channel: text("channel"),
  // Personal/forwarded items: when Gemini + Google Search last looked for corroborating sources.
  researchedAt: timestamp("researched_at", { withTimezone: true }),
  // Saved-search results: which config.searches entry found this item.
  searchId: text("search_id"),
  // Sample data for demos (clearly labelled in the UI, can be hidden).
  isDemo: boolean("is_demo").notNull().default(false),
  // Job postings: link check result ("ok" | "generic" | "dead" | "expired" | "unverified").
  linkStatus: text("link_status"),
  classifyStatus: text("classify_status").$type<ClassifyStatus>().notNull().default("pending"),
});

export const classifications = pgTable("classifications", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => rawItems.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull().unique(),
  isSignal: boolean("is_signal").notNull(),
  signalType: text("signal_type").$type<SignalType>().notNull(),
  sectors: text("sectors").array().notNull().default([]),
  geographies: text("geographies").array().notNull().default([]),
  companies: text("companies").array().notNull().default([]),
  // v2 fields (prompt classify-v2+)
  otherSectors: text("other_sectors").array().notNull().default([]),
  activelyPartnering: text("actively_partnering").$type<"yes" | "no" | "unknown">().notNull().default("unknown"),
  partners: text("partners").array().notNull().default([]),
  programmeStartYear: integer("programme_start_year"),
  amountInrCrore: real("amount_inr_crore"),
  financialYear: text("financial_year"),
  // v4 fields
  keyPoints: text("key_points").array().notNull().default([]),
  nextStep: text("next_step"),
  companyDomain: text("company_domain"),
  // v6: a specific headline (who · what · where · how much) and why it is worth her time.
  headline: text("headline"),
  worthIt: text("worth_it"),
  // v6, policy items: confirmed (officially notified), executed (in force), inferred (draft, debate, expectation).
  policyStatus: text("policy_status").$type<"confirmed" | "executed" | "inferred">(),
  // Verbatim quotes from officials / experts, kept only if found word for word in the text.
  quotes: jsonb("quotes").$type<Quote[]>().notNull().default([]),
  whyItMatters: text("why_it_matters").notNull().default(""),
  confidence: real("confidence").notNull(),
  // "<GEMINI_MODEL>@<PROMPT_VERSION>"
  model: text("model").notNull(),
  keyLabel: text("key_label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    canonicalName: text("canonical_name").notNull().unique(),
    aliases: text("aliases").array().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    // Normalised name ("abc private limited"), see lib/companies.ts. Unique when set.
    nameKey: text("name_key").unique(),
    // Name without legal suffixes ("abc"), for loose matching of news names. Not unique.
    baseKey: text("base_key"),
    isPsu: boolean("is_psu"),
    // Official website domain (from classification), used for logos.
    domain: text("domain"),
    // "portal" = National CSR Portal import, "news" = first seen in news.
    origin: text("origin").$type<"portal" | "news">().notNull().default("news"),
  },
  (t) => [index("companies_base_key_idx").on(t.baseKey)],
);

/** National CSR Portal "Dynamic CSR Report": one row per company × FY × state × district × sector project line. */
export const csrSpend = pgTable(
  "csr_spend",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // FY 2024-25 → 2024
    fyStart: smallint("fy_start").notNull(),
    state: text("state").notNull(),
    district: text("district").notNull(),
    sector: text("sector").notNull(),
    subSector: text("sub_sector").notNull(),
    amountCr: real("amount_cr").notNull(),
  },
  (t) => [index("csr_spend_company_idx").on(t.companyId), index("csr_spend_district_idx").on(t.district)],
);

/** Dated news mentions of a company from CSR news archives (for announcement timing). */
export const companyNews = pgTable(
  "company_news",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    // Headline classification (prompts/headlines.ts); null = not classified yet.
    kind: text("kind").$type<HeadlineKind>(),
    sector: text("sector"),
    model: text("model"),
  },
  (t) => [uniqueIndex("company_news_company_url_idx").on(t.companyId, t.url)],
);

/**
 * Every headline from the CSR news archives in the warm window (last ~12 months), fetched by
 * date rather than by company. Gemini (batched) names the company, kind and sector; resolved
 * company headlines are then copied into company_news.
 */
export const archiveHeadlines = pgTable("archive_headlines", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  url: text("url").notNull().unique(),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  company: text("company"),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  kind: text("kind").$type<HeadlineKind>(),
  sector: text("sector"),
  model: text("model"),
});

/** Precomputed per-company history + predictions (scripts/history/stats.ts). Read by the app. */
export const companyStats = pgTable(
  "company_stats",
  {
    companyId: integer("company_id")
      .primaryKey()
      .references(() => companies.id, { onDelete: "cascade" }),
    lastFy: smallint("last_fy"),
    yearsActive: smallint("years_active").notNull(),
    totalLastCr: real("total_last_cr").notNull(),
    focusLastCr: real("focus_last_cr").notNull(),
    maharashtraFocusLastCr: real("maharashtra_focus_last_cr").notNull(),
    puneLastCr: real("pune_last_cr").notNull(),
    predictedTotalCr: real("predicted_total_cr").notNull(),
    predictedFocusCr: real("predicted_focus_cr").notNull(),
    data: jsonb("data").$type<CompanyStatsData>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("company_stats_focus_idx").on(t.predictedFocusCr)],
);

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .unique()
    .references(() => rawItems.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  signalType: text("signal_type").$type<SignalType>().notNull(),
  score: real("score").notNull(),
  tier: text("tier").$type<Tier>().notNull(),
  reason: text("reason").notNull(),
  classified: boolean("classified").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single-row table (id = 1). The DB row is the source of truth; config/defaults.ts seeds it.
export const config = pgTable("config", {
  id: integer("id").primaryKey().default(1),
  searches: jsonb("searches").$type<AppConfig["searches"]>().notNull().default([]),
  sectors: jsonb("sectors").$type<AppConfig["sectors"]>().notNull(),
  geographies: jsonb("geographies").$type<AppConfig["geographies"]>().notNull(),
  keywords: jsonb("keywords").$type<AppConfig["keywords"]>().notNull(),
  sources: jsonb("sources").$type<AppConfig["sources"]>().notNull(),
  scoringWeights: jsonb("scoring_weights").$type<AppConfig["scoringWeights"]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per grounded Google search run (keeps Google's Search Suggestions HTML for display). */
export const searchRuns = pgTable("search_runs", {
  id: serial("id").primaryKey(),
  searchId: text("search_id").notNull(),
  query: text("query").notNull(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  webQueries: text("web_queries").array().notNull().default([]),
  itemsFound: integer("items_found").notNull(),
  itemsNew: integer("items_new").notNull(),
  entryPointHtml: text("entry_point_html"),
  keyLabel: text("key_label"),
  model: text("model"),
});

/** Emails sent by scripts/notify (dedupe: one Monday digest per ISO week, one alert per signal). */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"monday_digest" | "call_alert">().notNull(),
  key: text("key").notNull().unique(),
  subject: text("subject").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Public sources Gemini (Google Search grounding) found to corroborate a personal/forwarded item. */
export const itemResearch = pgTable(
  "item_research",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => rawItems.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    publisher: text("publisher"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("item_research_item_url_idx").on(t.itemId, t.url)],
);

/** Ananya's feedback on insights: read / not relevant (with optional reason). Drives score learning. */
export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").references(() => rawItems.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    action: text("action").$type<"read" | "irrelevant">().notNull(),
    reason: text("reason"),
    // snapshot of features used for learning (source, signal type, sectors) at the time of feedback
    source: text("source"),
    signalType: text("signal_type"),
    memberId: integer("member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feedback_item_action_idx").on(t.itemId, t.action)],
);

/** Per-company "pitch kit": what the company is after + sourced proof points (Gemini + Google Search). */
export const pitchKits = pgTable("pitch_kits", {
  companyId: integer("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<PitchKit>().notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface PitchKit {
  wants: { text: string; url: string | null }[]; // what the company is looking to achieve / benefit
  recentNews: { text: string; url: string | null; date: string | null }[];
  proof: { text: string; url: string | null }[]; // sourced metrics / evidence only
}

/** Small key/value store for computed model metrics (forecast accuracy, correlations). */
export const modelMetrics = pgTable("model_metrics", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Community builder: people publicly named in a professional capacity (CSR heads quoted in
 * announcements, authors of public CSR posts, managers named in news). Name, role, company and the
 * public source only: no personal emails or phone numbers are collected.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    title: text("title"),
    companyName: text("company_name"),
    companyKey: text("company_key").notNull().default(""),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
    kind: text("kind").$type<"spokesperson" | "author" | "manager" | "hiring_manager">().notNull().default("spokesperson"),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title"),
    context: text("context"),
    status: text("status").$type<"new" | "reached_out" | "connected" | "failed" | "not_useful">().notNull().default("new"),
    notes: text("notes"),
    isDemo: boolean("is_demo").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    updatedBy: integer("updated_by"),
  },
  (t) => [uniqueIndex("contacts_person_idx").on(t.nameKey, t.companyKey)],
);

/** Items already scanned for contacts (so each article is read once). */
export const contactScans = pgTable("contact_scans", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => rawItems.id, { onDelete: "cascade" }),
  found: integer("found").notNull(),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface Quote {
  speaker: string;
  role: string;
  quote: string;
}

/**
 * Team members. The lead (Ananya) signs in with INTAKE_PASSCODE and creates teammates, each with
 * their own passcode (scrypt hash only). No emails or phone numbers are stored.
 */
export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  role: text("role").$type<"lead" | "member">().notNull().default("member"),
  passcodeHash: text("passcode_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

/** Seconds of active (visible-tab) time per member per day. */
export const memberTime = pgTable(
  "member_time",
  {
    memberId: integer("member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD, IST
    seconds: integer("seconds").notNull().default(0),
    pages: jsonb("pages").$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [uniqueIndex("member_time_idx").on(t.memberId, t.day)],
);

/** What each member did: comments, questions, feedback marks, contact moves, sector changes. */
export const activity = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").references(() => teamMembers.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    itemId: integer("item_id").references(() => rawItems.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

/**
 * Discussion on an article: team comments (with @mentions) and questions to the AI. A question
 * is answered by the intake workflow (Gemini + Google Search grounding) as a reply.
 */
export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => rawItems.id, { onDelete: "cascade" }),
    memberId: integer("member_id").references(() => teamMembers.id, { onDelete: "set null" }),
    parentId: integer("parent_id"),
    kind: text("kind").$type<"comment" | "question" | "answer">().notNull().default("comment"),
    body: text("body").notNull(),
    mentions: integer("mentions").array().notNull().default([]),
    sources: jsonb("sources").$type<{ title: string; url: string }[]>().notNull().default([]),
    status: text("status").$type<"open" | "answered" | "failed">(),
    // Questions: "article" = answer only from the Radar's own sources for this article (RAG);
    // "web" = may also search Google.
    scope: text("scope").$type<"article" | "web">().notNull().default("article"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_item_idx").on(t.itemId)],
);

/**
 * Feedback on the dashboard itself. The lead confirms or declines; confirmed items are triaged by
 * Gemini into a safe config change (applied automatically) or a request for the designer/developer.
 */
export const dashboardFeedback = pgTable("dashboard_feedback", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => teamMembers.id, { onDelete: "set null" }),
  page: text("page").notNull(),
  kind: text("kind").$type<"pro" | "con" | "idea">().notNull(),
  body: text("body").notNull(),
  status: text("status").$type<"new" | "confirmed" | "declined" | "applied" | "routed" | "failed">().notNull().default("new"),
  route: text("route").$type<"config" | "developer" | "designer">(),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/**
 * Ananya's existing funders / contracts (team-only, never shown on public pages). The daily
 * relationship watch (scripts/ingest/relationships.ts) raises alerts when something changes.
 */
export const relationships = pgTable("relationships", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  programme: text("programme"),
  sectors: text("sectors").array().notNull().default([]),
  districts: text("districts").array().notNull().default([]),
  valueLakh: real("value_lakh"),
  startDate: text("start_date"), // YYYY-MM-DD
  renewalDate: text("renewal_date"), // YYYY-MM-DD
  status: text("status").$type<"active" | "renewal_due" | "lapsed" | "prospect">().notNull().default("active"),
  contactRole: text("contact_role"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
});

/**
 * What changed for a relationship and what it means: company news, regulatory changes, spend
 * trends, renewal timing, CSR hiring. Each alert carries the impact, the reasoning behind its level,
 * and its source. `key` dedupes (e.g. "item:812", "renewal:2027-03-31", "spend:2024").
 */
export const relationshipAlerts = pgTable(
  "relationship_alerts",
  {
    id: serial("id").primaryKey(),
    relationshipId: integer("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    kind: text("kind").$type<"company_news" | "regulatory" | "spend_change" | "renewal" | "hiring">().notNull(),
    level: text("level").$type<"risk" | "watch" | "opportunity">().notNull(),
    title: text("title").notNull(),
    impact: text("impact").notNull(),
    reasoning: text("reasoning").notNull(),
    sourceUrl: text("source_url"),
    itemId: integer("item_id").references(() => rawItems.id, { onDelete: "set null" }),
    dismissed: boolean("dismissed").notNull().default(false),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("relationship_alert_key_idx").on(t.relationshipId, t.key)],
);

/** Items already assessed against each relationship (so Gemini reads each pair once). */
export const relationshipChecks = pgTable(
  "relationship_checks",
  {
    relationshipId: integer("relationship_id")
      .notNull()
      .references(() => relationships.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => rawItems.id, { onDelete: "cascade" }),
    relevant: boolean("relevant").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("relationship_check_idx").on(t.relationshipId, t.itemId)],
);
