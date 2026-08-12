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
  uniqueIndex,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Custom type for bytea columns
const bytea = customType<{ data: Uint8Array<ArrayBuffer>; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: Buffer): Uint8Array<ArrayBuffer> {
    return new Uint8Array(value);
  },
  toDriver(value: Uint8Array) {
    return Buffer.from(value);
  },
});

// --- people ---

// One row per human across GitLab and Jira, keyed by corporate email.
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  gitlabUsername: text("gitlab_username").unique(),
  jiraAccountId: text("jira_account_id").unique(),
  isMe: boolean("is_me").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// --- tickets ---

export const tickets = pgTable("tickets", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  issueType: text("issue_type").notNull(),
  status: text("status").notNull(),
  storyPoints: decimal("story_points"),
  parentKey: text("parent_key"),
  // Self-reference needs an explicit column type to break the inference cycle.
  epicKey: text("epic_key").references((): AnyPgColumn => tickets.key),
  createdByMe: boolean("created_by_me").notNull(),
  assigneeIsMe: boolean("assignee_is_me").notNull(),
  assigneePersonId: integer("assignee_person_id").references(() => people.id),
  reporterPersonId: integer("reporter_person_id").references(() => people.id),
  // Assignee at the moment the ticket moved to done — the productivity grain.
  closingAssigneePersonId: integer("closing_assignee_person_id").references(
    () => people.id
  ),
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
  authorPersonId: integer("author_person_id").references(() => people.id),
  branchName: text("branch_name").notNull(),
  ticketKey: text("ticket_key").references(() => tickets.key),
  ticketKeyInferred: boolean("ticket_key_inferred").notNull().default(true),
  filesChanged: integer("files_changed").notNull(),
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
  commitCount: integer("commit_count").notNull(),
  // Cursor Bugbot's risk label, parsed from the MR description. Null means
  // Bugbot left no summary — it doesn't run on every author's MRs.
  bugbotRisk: text("bugbot_risk"),
  // Resolvable discussions, and how many of them ended up resolved.
  threadsOpened: integer("threads_opened").notNull().default(0),
  threadsResolved: integer("threads_resolved").notNull().default(0),
  gitlabCreatedAt: timestamp("gitlab_created_at", {
    withTimezone: true,
  }).notNull(),
  // Last draft -> ready transition, i.e. the start of the final review window.
  readyAt: timestamp("ready_at", { withTimezone: true }),
  firstApprovedAt: timestamp("first_approved_at", { withTimezone: true }),
  lastApprovedAt: timestamp("last_approved_at", { withTimezone: true }),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("merge_requests_merged_at_idx").on(t.mergedAt),
]);

// Lifecycle events for every MR, parsed from GitLab system notes. Keyed by the
// note id so re-syncing an MR never duplicates them.
export const mergeRequestStateEvents = pgTable(
  "merge_request_state_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    mergeRequestId: integer("merge_request_id")
      .notNull()
      .references(() => mergeRequests.id),
    personId: integer("person_id").references(() => people.id),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("merge_request_state_events_mr_type_idx").on(
      t.mergeRequestId,
      t.eventType
    ),
  ]
);

// One row per person who approved or commented on an MR.
export const mergeRequestReviews = pgTable(
  "merge_request_reviews",
  {
    id: serial("id").primaryKey(),
    mergeRequestId: integer("merge_request_id")
      .notNull()
      .references(() => mergeRequests.id),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    approved: boolean("approved").notNull().default(false),
    commentCount: integer("comment_count").notNull().default(0),
    firstReviewedAt: timestamp("first_reviewed_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    // When they last approved, parsed from GitLab's approval system notes.
    // Without it, approval-only reviews have no timestamp of their own.
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("merge_request_reviews_mr_person_idx").on(
      t.mergeRequestId,
      t.personId
    ),
    index("merge_request_reviews_person_idx").on(t.personId),
  ]
);

// Per-file line counts, kept raw so categorisation can change without re-syncing.
export const mergeRequestFileStats = pgTable(
  "merge_request_file_stats",
  {
    id: serial("id").primaryKey(),
    mergeRequestId: integer("merge_request_id")
      .notNull()
      .references(() => mergeRequests.id),
    path: text("path").notNull(),
    category: text("category").notNull(),
    additions: integer("additions").notNull(),
    deletions: integer("deletions").notNull(),
    excluded: boolean("excluded").notNull().default(false),
  },
  (t) => [
    uniqueIndex("merge_request_file_stats_mr_path_idx").on(
      t.mergeRequestId,
      t.path
    ),
  ]
);

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
  // Meetings link at epic grain by inference, but can be pinned to a ticket by
  // hand — the WBSO form wants a Jira Issue per row.
  ticketKey: text("ticket_key").references(() => tickets.key),
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
  path: text("path").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// --- activity_items ---

export const activityItems = pgTable("activity_items", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull().unique(),
  mergeRequestId: integer("merge_request_id").references(
    () => mergeRequests.id
  ),
  pipelineId: bigint("pipeline_id", { mode: "number" }).references(
    () => pipelines.id
  ),
  ticketKey: text("ticket_key"),
  actor: text("actor"),
  title: text("title").notNull(),
  body: text("body"),
  externalUrl: text("external_url").notNull(),
  rawEmailBody: text("raw_email_body"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("activity_items_occurred_at_idx").on(t.occurredAt),
  index("activity_items_source_type_idx").on(t.sourceType),
]);

// --- wbso_entry_marks ---

// A worksheet row that's been transcribed into the WBSO form. Rows are derived,
// so they're keyed by day + rowKey (see wbsoRowKey) rather than by an id.
// hours records what was actually filed, so a later re-estimate can't silently
// diverge from the submitted number.
export const wbsoEntryMarks = pgTable(
  "wbso_entry_marks",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    rowKey: text("row_key").notNull(),
    hours: decimal("hours").notNull(),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("wbso_entry_marks_date_row_idx").on(t.date, t.rowKey)]
);

// --- sprints ---

// Jira board sprints. Cadence is nominally two weeks but real sprints drift,
// so ranges are read from here rather than computed from a fixed anchor.
export const sprints = pgTable(
  "sprints",
  {
    // Jira's own sprint id.
    id: integer("id").primaryKey(),
    boardId: integer("board_id").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    goal: text("goal"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    completeDate: timestamp("complete_date", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sprints_start_date_idx").on(t.startDate)]
);

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
