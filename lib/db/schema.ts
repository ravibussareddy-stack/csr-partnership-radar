import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AppConfig } from "@/config/defaults";

export const SIGNAL_TYPES = [
  "new_initiative",
  "allocation_increase",
  "partner_search",
  "policy_change",
  "ongoing_programme",
  "none",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const TIERS = ["call_this_week", "watch", "background"] as const;
export type Tier = (typeof TIERS)[number];

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

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull().unique(),
  aliases: text("aliases").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
});

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
  sectors: jsonb("sectors").$type<AppConfig["sectors"]>().notNull(),
  geographies: jsonb("geographies").$type<AppConfig["geographies"]>().notNull(),
  keywords: jsonb("keywords").$type<AppConfig["keywords"]>().notNull(),
  sources: jsonb("sources").$type<AppConfig["sources"]>().notNull(),
  scoringWeights: jsonb("scoring_weights").$type<AppConfig["scoringWeights"]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
