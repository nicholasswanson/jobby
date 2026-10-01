ALTER TABLE "companies" ADD COLUMN "ai_enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "pipeline_stage" text DEFAULT 'saved' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stage_changed_at" timestamp with time zone;