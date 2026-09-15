CREATE TABLE "application_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"full_name" text,
	"email" text,
	"phone" text,
	"location" text,
	"linkedin_url" text,
	"website_url" text,
	"work_authorization" text,
	"requires_sponsorship" boolean DEFAULT false NOT NULL,
	"willing_to_relocate" boolean DEFAULT false NOT NULL,
	"decline_demographics" boolean DEFAULT true NOT NULL,
	"extra_answers" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"ats_type" text,
	"apply_url" text,
	"session_url" text,
	"screenshot_base64" text,
	"log" jsonb,
	"error" text,
	"auto_submit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "job_tailoring" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tailored_markdown" text,
	"rationale" text,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_tailoring_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "resume" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"data_base64" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tailoring" ADD CONSTRAINT "job_tailoring_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;