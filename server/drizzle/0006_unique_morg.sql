ALTER TABLE "pipeline_jobs" ADD COLUMN "needs" text[];--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "iid" integer;