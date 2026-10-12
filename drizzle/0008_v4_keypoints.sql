ALTER TABLE "classifications" ADD COLUMN "key_points" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "next_step" text;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "company_domain" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "domain" text;