CREATE TABLE "company_news" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_stats" (
	"company_id" integer PRIMARY KEY NOT NULL,
	"last_fy" smallint,
	"years_active" smallint NOT NULL,
	"total_last_cr" real NOT NULL,
	"focus_last_cr" real NOT NULL,
	"maharashtra_focus_last_cr" real NOT NULL,
	"pune_last_cr" real NOT NULL,
	"predicted_total_cr" real NOT NULL,
	"predicted_focus_cr" real NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csr_spend" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"fy_start" smallint NOT NULL,
	"state" text NOT NULL,
	"district" text NOT NULL,
	"sector" text NOT NULL,
	"sub_sector" text NOT NULL,
	"amount_cr" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "name_key" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "base_key" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_psu" boolean;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "origin" text DEFAULT 'news' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_news" ADD CONSTRAINT "company_news_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_stats" ADD CONSTRAINT "company_stats_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csr_spend" ADD CONSTRAINT "csr_spend_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_news_company_url_idx" ON "company_news" USING btree ("company_id","url");--> statement-breakpoint
CREATE INDEX "company_stats_focus_idx" ON "company_stats" USING btree ("predicted_focus_cr");--> statement-breakpoint
CREATE INDEX "csr_spend_company_idx" ON "csr_spend" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "csr_spend_district_idx" ON "csr_spend" USING btree ("district");--> statement-breakpoint
CREATE INDEX "companies_base_key_idx" ON "companies" USING btree ("base_key");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_name_key_unique" UNIQUE("name_key");