import {
  pgTable,
  text,
  serial,
  boolean,
  integer,
  bigint,
  decimal,
  timestamp,
  index,
  customType,
} from "drizzle-orm/pg-core";

// Custom type for bytea columns
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: Buffer) {
    return new Uint8Array(value);
  },
  toDriver(value: Uint8Array) {
    return Buffer.from(value);
  },
});

// --- tickets ---

export const tickets = pgTable("tickets", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  issueType: text("issue_type").notNull(),
  status: text("status").notNull(),
  storyPoints: decimal("story_points"),
  parentKey: text("parent_key"),
  epicKey: text("epic_key").references(() => tickets.key),
  createdByMe: boolean("created_by_me").notNull(),
  assigneeIsMe: boolean("assignee_is_me").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  jiraCreatedAt: timestamp("jira_created_at", { withTimezone: true }).notNull(),
  jiraUpdatedAt: timestamp("jira_updated_at", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
});

export const ticketEvents = pgTable("ticket_events", {
  id: serial("id").primaryKey(),
  ticketKey: text("ticket_key")
    .notNull()
    .references(() => tickets.key),
  eventType: text("event_type").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
});

// --- merge_requests ---

export const mergeRequests = pgTable("merge_requests", {
  id: serial("id").primaryKey(),
  gitlabId: integer("gitlab_id").notNull().unique(),
  gitlabIid: integer("gitlab_iid").notNull(),
  projectPath: text("project_path").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  authoredByMe: boolean("authored_by_me").notNull(),
  reviewedByMe: boolean("reviewed_by_me").notNull().default(false),
  branchName: text("branch_name").notNull(),
  ticketKey: text("ticket_key").references(() => tickets.key),
  ticketKeyInferred: boolean("ticket_key_inferred").notNull().default(true),
  changesCount: integer("additions").notNull(), // files changed (column kept as "additions" to avoid migration)
  commitCount: integer("commit_count").notNull(),
  gitlabCreatedAt: timestamp("gitlab_created_at", {
    withTimezone: true,
  }).notNull(),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
});

export const mergeRequestEvents = pgTable("merge_request_events", {
  id: serial("id").primaryKey(),
  mergeRequestId: integer("merge_request_id")
    .notNull()
    .references(() => mergeRequests.id),
  eventType: text("event_type").notNull(),
  externalUrl: text("external_url"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
});

// --- commits ---

export const commits = pgTable("commits", {
  id: serial("id").primaryKey(),
  mergeRequestId: integer("merge_request_id")
    .notNull()
    .references(() => mergeRequests.id),
  sha: text("sha").notNull().unique(),
  title: text("title").notNull(),
  authoredAt: timestamp("authored_at", { withTimezone: true }).notNull(),
});

// --- confluence_documents ---

export const confluenceDocuments = pgTable("confluence_documents", {
  id: serial("id").primaryKey(),
  confluenceId: text("confluence_id").notNull().unique(),
  title: text("title").notNull(),
  spaceKey: text("space_key").notNull(),
  createdByMe: boolean("created_by_me").notNull(),
  epicKey: text("epic_key").references(() => tickets.key),
  epicKeyInferred: boolean("epic_key_inferred").notNull().default(true),
  confluenceCreatedAt: timestamp("confluence_created_at", {
    withTimezone: true,
  }).notNull(),
  confluenceUpdatedAt: timestamp("confluence_updated_at", {
    withTimezone: true,
  }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
});

export const confluenceDocumentEvents = pgTable(
  "confluence_document_events",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => confluenceDocuments.id),
    eventType: text("event_type").notNull(),
    externalUrl: text("external_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  }
);

// --- meetings ---

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  calendarEventId: text("calendar_event_id").notNull().unique(),
  title: text("title").notNull(),
  category: text("category"),
  epicKey: text("epic_key").references(() => tickets.key),
  epicKeyInferred: boolean("epic_key_inferred").notNull().default(true),
  responseStatus: text("response_status"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
});

// --- wins ---

export const wins = pgTable("wins", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  slackMessageId: text("slack_message_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// --- merge_request_comments ---

export const mergeRequestComments = pgTable("merge_request_comments", {
  id: bigint("id", { mode: "number" }).primaryKey(), // GitLab note ID
  mergeRequestId: integer("merge_request_id")
    .notNull()
    .references(() => mergeRequests.id),
  body: text("body").notNull(),
  externalUrl: text("external_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// --- entity_links ---

export const entityLinks = pgTable("entity_links", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// --- pipelines ---

export const pipelines = pgTable("pipelines", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  iid: integer("iid"),
  mergeRequestId: integer("merge_request_id").references(
    () => mergeRequests.id
  ),
  ref: text("ref"),
  status: text("status").notNull(),
  source: text("source"),
  durationSeconds: integer("duration_seconds"),
  queuedDurationSeconds: integer("queued_duration_seconds"),
  coverage: decimal("coverage"),
  webUrl: text("web_url").notNull(),
  gitlabCreatedAt: timestamp("gitlab_created_at", {
    withTimezone: true,
  }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("pipelines_status_created_idx").on(t.status, t.gitlabCreatedAt),
]);

export const pipelineJobs = pgTable("pipeline_jobs", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  pipelineId: bigint("pipeline_id", { mode: "number" })
    .notNull()
    .references(() => pipelines.id),
  name: text("name").notNull(),
  stage: text("stage").notNull(),
  status: text("status").notNull(),
  durationSeconds: decimal("duration_seconds"),
  queuedDurationSeconds: decimal("queued_duration_seconds"),
  allowFailure: boolean("allow_failure").notNull(),
  retried: boolean("retried").notNull(),
  needs: text("needs").array(),
  failureReason: text("failure_reason"),
  webUrl: text("web_url").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("pipeline_jobs_pipeline_retried_idx").on(t.pipelineId, t.retried),
]);

// --- passkey_credentials ---

export const passkeyCredentials = pgTable("passkey_credentials", {
  id: serial("id").primaryKey(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: bytea("public_key").notNull(),
  counter: integer("counter").notNull(),
  label: text("label").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// --- share_tokens ---

export const shareTokens = pgTable("share_tokens", {
  token: text("token").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// --- sync_log ---

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  itemsSynced: integer("items_synced"),
});
