CREATE TABLE "classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"content_hash" text NOT NULL,
	"is_signal" boolean NOT NULL,
	"signal_type" text NOT NULL,
	"sectors" text[] DEFAULT '{}' NOT NULL,
	"geographies" text[] DEFAULT '{}' NOT NULL,
	"companies" text[] DEFAULT '{}' NOT NULL,
	"why_it_matters" text DEFAULT '' NOT NULL,
	"confidence" real NOT NULL,
	"model" text NOT NULL,
	"key_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classifications_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "companies_canonical_name_unique" UNIQUE("canonical_name")
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"sectors" jsonb NOT NULL,
	"geographies" jsonb NOT NULL,
	"keywords" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"scoring_weights" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prefilter_passed" boolean,
	"classify_status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "raw_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"company_id" integer,
	"signal_type" text NOT NULL,
	"score" real NOT NULL,
	"tier" text NOT NULL,
	"reason" text NOT NULL,
	"classified" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signals_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_item_id_raw_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."raw_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;