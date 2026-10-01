ALTER TABLE "jobs" DROP CONSTRAINT "jobs_dedupe_hash_unique";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "profile" text DEFAULT 'erin' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_dedupe_hash_profile_unq" UNIQUE("dedupe_hash","profile");--> statement-breakpoint
ALTER TABLE "application_profile" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "application_profile" ADD COLUMN "profile" text PRIMARY KEY DEFAULT 'erin' NOT NULL;--> statement-breakpoint
ALTER TABLE "resume" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "resume" ADD COLUMN "profile" text PRIMARY KEY DEFAULT 'erin' NOT NULL;
