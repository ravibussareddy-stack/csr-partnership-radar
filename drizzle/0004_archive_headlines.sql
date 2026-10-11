CREATE TABLE "archive_headlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"company" text,
	"company_id" integer,
	"kind" text,
	"sector" text,
	"model" text,
	CONSTRAINT "archive_headlines_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "archive_headlines" ADD CONSTRAINT "archive_headlines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;