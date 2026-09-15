CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ats_type" text NOT NULL,
	"slug" text,
	"website" text,
	"source" text,
	"active" boolean DEFAULT true NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_ats_slug_unq" UNIQUE("ats_type","slug")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"external_id" text,
	"dedupe_hash" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"remote_type" text,
	"salary_text" text,
	"url" text NOT NULL,
	"posted_at" timestamp with time zone,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'inbox' NOT NULL,
	"closed_while_interested" boolean DEFAULT false NOT NULL,
	"triaged_at" timestamp with time zone,
	CONSTRAINT "jobs_dedupe_hash_unique" UNIQUE("dedupe_hash")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"companies_ok" integer,
	"companies_failed" integer,
	"jobs_seen" integer,
	"new_jobs" integer,
	"skipped" boolean DEFAULT false NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;