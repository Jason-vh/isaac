CREATE TABLE "pipeline_jobs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"pipeline_id" bigint NOT NULL,
	"name" text NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"duration_seconds" numeric,
	"queued_duration_seconds" numeric,
	"allow_failure" boolean NOT NULL,
	"retried" boolean NOT NULL,
	"web_url" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" bigint PRIMARY KEY NOT NULL,
	"ref" text,
	"status" text NOT NULL,
	"source" text,
	"duration_seconds" integer,
	"queued_duration_seconds" integer,
	"coverage" numeric,
	"web_url" text NOT NULL,
	"gitlab_created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;