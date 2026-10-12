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
