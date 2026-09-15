ALTER TABLE "companies" ADD COLUMN "one_liner" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "team_size" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "batch" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "enriched_at" timestamp with time zone;