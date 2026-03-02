CREATE TABLE "confluence_document_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"external_url" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confluence_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"confluence_id" text NOT NULL,
	"title" text NOT NULL,
	"space_key" text NOT NULL,
	"created_by_me" boolean NOT NULL,
	"epic_key" text,
	"epic_key_inferred" boolean DEFAULT true NOT NULL,
	"confluence_created_at" timestamp with time zone NOT NULL,
	"confluence_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "confluence_documents_confluence_id_unique" UNIQUE("confluence_id")
);
--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"objective_id" integer NOT NULL,
	"title" text NOT NULL,
	"target_value" numeric,
	"current_value" numeric,
	"unit" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"calendar_event_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"epic_key" text,
	"epic_key_inferred" boolean DEFAULT true NOT NULL,
	"response_status" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "meetings_calendar_event_id_unique" UNIQUE("calendar_event_id")
);
--> statement-breakpoint
CREATE TABLE "merge_request_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"merge_request_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"external_url" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merge_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"gitlab_id" integer NOT NULL,
	"gitlab_iid" integer NOT NULL,
	"project_path" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"authored_by_me" boolean NOT NULL,
	"branch_name" text NOT NULL,
	"ticket_key" text,
	"ticket_key_inferred" boolean DEFAULT true NOT NULL,
	"additions" integer NOT NULL,
	"deletions" integer NOT NULL,
	"commit_count" integer NOT NULL,
	"gitlab_created_at" timestamp with time zone NOT NULL,
	"merged_at" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "merge_requests_gitlab_id_unique" UNIQUE("gitlab_id")
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"year" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" "bytea" NOT NULL,
	"counter" integer NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "passkey_credentials_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"items_synced" integer
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_key" text NOT NULL,
	"event_type" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"issue_type" text NOT NULL,
	"status" text NOT NULL,
	"story_points" numeric,
	"epic_key" text,
	"created_by_me" boolean NOT NULL,
	"assignee_is_me" boolean NOT NULL,
	"closed_at" timestamp with time zone,
	"jira_created_at" timestamp with time zone NOT NULL,
	"jira_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wins" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"slack_message_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wins_slack_message_id_unique" UNIQUE("slack_message_id")
);
--> statement-breakpoint
ALTER TABLE "confluence_document_events" ADD CONSTRAINT "confluence_document_events_document_id_confluence_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."confluence_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confluence_documents" ADD CONSTRAINT "confluence_documents_epic_key_tickets_key_fk" FOREIGN KEY ("epic_key") REFERENCES "public"."tickets"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_epic_key_tickets_key_fk" FOREIGN KEY ("epic_key") REFERENCES "public"."tickets"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_request_events" ADD CONSTRAINT "merge_request_events_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_ticket_key_tickets_key_fk" FOREIGN KEY ("ticket_key") REFERENCES "public"."tickets"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_key_tickets_key_fk" FOREIGN KEY ("ticket_key") REFERENCES "public"."tickets"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_epic_key_tickets_key_fk" FOREIGN KEY ("epic_key") REFERENCES "public"."tickets"("key") ON DELETE no action ON UPDATE no action;