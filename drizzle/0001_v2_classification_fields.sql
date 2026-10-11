ALTER TABLE "classifications" ADD COLUMN "other_sectors" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "actively_partnering" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "partners" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "programme_start_year" integer;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "amount_inr_crore" real;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "financial_year" text;