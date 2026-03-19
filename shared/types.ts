// Ticket (Jira issue, including epics)
export interface Ticket {
  key: string;
  title: string;
  issueType: string;
  status: string;
  storyPoints: number | null;
  epicKey: string | null;
  createdByMe: boolean;
  assigneeIsMe: boolean;
  closedAt: string | null;
  jiraCreatedAt: string;
  jiraUpdatedAt: string;
  syncedAt: string;
}

export interface TicketEvent {
  id: number;
  ticketKey: string;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  occurredAt: string;
}

// Merge Request (GitLab)
export interface MergeRequest {
  id: number;
  gitlabId: number;
  gitlabIid: number;
  projectPath: string;
  title: string;
  status: string;
  authoredByMe: boolean;
  reviewedByMe: boolean;
  branchName: string;
  ticketKey: string | null;
  ticketKeyInferred: boolean;
  changesCount: number;
  commitCount: number;
  gitlabCreatedAt: string;
  mergedAt: string | null;
  syncedAt: string;
}

export interface MergeRequestEvent {
  id: number;
  mergeRequestId: number;
  eventType: string;
  externalUrl: string | null;
  occurredAt: string;
}

// Confluence Document
export interface ConfluenceDocument {
  id: number;
  confluenceId: string;
  title: string;
  spaceKey: string;
  createdByMe: boolean;
  epicKey: string | null;
  epicKeyInferred: boolean;
  confluenceCreatedAt: string;
  confluenceUpdatedAt: string;
  syncedAt: string;
}

export interface ConfluenceDocumentEvent {
  id: number;
  documentId: number;
  eventType: string;
  externalUrl: string | null;
  occurredAt: string;
}

// Meeting (Google Calendar)
export interface Meeting {
  id: number;
  calendarEventId: string;
  title: string;
  category: string | null;
  epicKey: string | null;
  epicKeyInferred: boolean;
  responseStatus: string | null;
  startsAt: string;
  endsAt: string;
  syncedAt: string;
}

// Win (Slack)
export interface Win {
  id: number;
  title: string;
  description: string | null;
  slackMessageId: string;
  createdAt: string;
  updatedAt: string;
}

// Entity Link (polymorphic)
export type EntityLinkSourceType = "win" | "key_result";
export type EntityLinkTargetType =
  | "ticket"
  | "merge_request"
  | "confluence_document"
  | "meeting"
  | "objective"
  | "key_result";

export interface EntityLink {
  id: number;
  sourceType: EntityLinkSourceType;
  sourceId: string;
  targetType: EntityLinkTargetType;
  targetId: string;
  createdAt: string;
}

// OKR
export interface Objective {
  slug: string;
  title: string;
  description: string;
}

export interface KeyResult {
  slug: string;
  objectiveSlug: string;
  title: string;
}

export interface EvidenceItem {
  linkId: number;
  type: EntityLinkTargetType;
  id: string;
  title: string;
  subtitle: string | null;
  source: "direct" | "via_epic";
  epicKey: string | null;
}

export interface EvidenceSummary {
  epics: number;
  tickets: number;
  mergeRequests: number;
  documents: number;
  total: number;
}

export interface KeyResultWithEvidence extends KeyResult {
  evidence: EvidenceItem[];
}

export interface KeyResultWithSummary extends KeyResult {
  evidenceSummary: EvidenceSummary;
}

export interface ObjectiveWithKeyResults extends Objective {
  keyResults: KeyResultWithEvidence[];
}

export interface ObjectiveWithSummary extends Objective {
  keyResults: KeyResultWithSummary[];
}

// Timeline
export type TimelineEventType =
  | "ticket_created" | "ticket_closed" | "ticket_status_changed"
  | "mr_opened" | "mr_merged" | "mr_commented"
  | "confluence_published" | "confluence_updated"
  | "win";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle: string | null;
  occurredAt: string;
  externalUrl: string | null;
  entityType: string;
  entityId: string;
  parentTicketKey: string | null;
  epicKey: string | null;
}

// Auth
export interface PasskeyCredential {
  id: number;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  label: string;
  transports: string | null;
  createdAt: string;
}

// Dashboard
export interface DayActivity {
  date: string;
  ticketsClosed: number;
  ticketEvents: number;
  mrsMerged: number;
  mrsOpened: number;
  mrComments: number;
  mrsReviewed: number;
  confluencePublished: number;
  meetingMinutes: number;
  meetingCount: number;
  winsLogged: number;
}

export interface WeekStats {
  ticketsClosed: number;
  storyPointsClosed: number;
  mrsMerged: number;
  mrsReviewed: number;
  teamMrsMerged: number;
  filesChanged: number;
  meetingHours: number;
  meetingCount: number;
  confluenceDocuments: number;
  winsLogged: number;
}

export type FeedItemType =
  | "ticket_closed"
  | "ticket_status_changed"
  | "mr_merged"
  | "mr_opened"
  | "mr_commented"
  | "confluence_published"
  | "meeting"
  | "win";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  subtitle: string | null;
  occurredAt: string;
  endsAt: string | null;
  externalUrl: string | null;
}

export interface WeekData {
  weekStart: string;
  weekEnd: string;
  days: DayActivity[];
  stats: WeekStats;
  feed: FeedItem[];
}

// Velocity
export interface VelocityWeek {
  weekStart: string;
  storyPointsClosed: number;
  ticketsClosed: number;
}

// Pipelines
export type PipelineScope = "frontend" | "backend" | "fullstack" | "neither";

export interface PipelineDurationPoint {
  id: number;
  type: "merge" | "train";
  scope: PipelineScope;
  durationSeconds: number;
  queuedDurationSeconds: number | null;
  createdAt: string;
  webUrl: string;
  jobCount: number;
  retriedJobCount: number;
  jobDurationSum: number | null;
}

export interface JobStats {
  name: string;
  stage: string;
  runCount: number;
  avgDuration: number;
  p10Duration: number | null;
  p50Duration: number | null;
  p90Duration: number | null;
  stddevDuration: number | null;
  avgQueuedDuration: number | null;
  p50QueuedDuration: number | null;
  retryCount: number;
  needs: string[] | null;
}

// Pipeline Waterfall
export interface PipelineListItem {
  id: number;
  ref: string | null;
  status: string;
  source: string | null;
  durationSeconds: number | null;
  jobCount: number;
  retriedJobCount: number;
  webUrl: string;
  gitlabCreatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PipelineJobDetail {
  id: number;
  name: string;
  stage: string;
  status: string;
  durationSeconds: number | null;
  queuedDurationSeconds: number | null;
  allowFailure: boolean;
  retried: boolean;
  needs: string[] | null;
  webUrl: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PipelineDetail extends PipelineListItem {
  jobs: PipelineJobDetail[];
}

export interface MergeRequestListItem {
  id: number;
  gitlabIid: number;
  projectPath: string;
  title: string;
  status: string;
  branchName: string;
  pipelineCount: number;
  gitlabCreatedAt: string;
  mergedAt: string | null;
}

export interface MrPipelineSummary {
  id: number;
  gitlabIid: number;
  projectPath: string;
  title: string;
  status: string;
  branchName: string;
  pipelineCount: number;
  failedCount: number;
  successCount: number;
  totalDurationSeconds: number | null;
  firstPipelineAt: string | null;
  lastPipelineAt: string | null;
  gitlabCreatedAt: string;
  mergedAt: string | null;
}

export type TrainAttemptPosition =
  | "front_of_train"
  | "behind_other_mr"
  | "unknown";

export type TrainAttemptOutcome =
  | "merged"
  | "superseded"
  | "active"
  | "completed";

export type TrainInvalidationKind =
  | "none"
  | "upstream_failed"
  | "upstream_merged"
  | "train_rebuilt"
  | "unknown";

export interface TrainDebugBase {
  kind: "main" | "merge_request" | "unknown";
  sha: string | null;
  onMain: boolean | null;
  mrIid: number | null;
  title: string | null;
}

export interface TrainDebugBlockingJob {
  name: string | null;
  failureReason: string | null;
  webUrl: string | null;
}

export interface TrainDebugInvalidation {
  kind: TrainInvalidationKind;
  summary: string;
  upstreamMrIid: number | null;
  upstreamTitle: string | null;
  upstreamPipelineId: number | null;
  upstreamPipelineStatus: string | null;
  upstreamPipelineWebUrl: string | null;
  blockingJob: TrainDebugBlockingJob | null;
}

export interface TrainDebugAttempt {
  pipelineId: number;
  status: string;
  webUrl: string;
  createdAt: string;
  durationSeconds: number | null;
  sha: string | null;
  parentSha: string | null;
  position: TrainAttemptPosition;
  basedOn: TrainDebugBase;
  outcome: TrainAttemptOutcome;
  supersededByPipelineId: number | null;
  invalidation: TrainDebugInvalidation | null;
}

// WBSO
export type WbsoCategory = "coding" | "code_review" | "dev_meeting" | "dev_misc" | "non_dev" | "leave";

export interface WbsoEntry {
  category: WbsoCategory;
  ticketKey: string | null;
  ticketTitle: string | null;
  epicKey: string | null;
  epicTitle: string | null;
  hours: number;
  meetingId?: number;
  reasoning: WbsoReasoning;
}

export interface WbsoMrDetail {
  id: number;
  gitlabIid: number;
  projectPath: string;
  title: string;
  status: string;
  changesCount: number;
  branchName: string;
}

export interface WbsoCommitDetail {
  sha: string;
  title: string;
  authoredAt: string;
}

export interface WbsoMeetingDetail {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export interface WbsoReasoning {
  meetingTitle?: string;
  meetingDuration?: number; // minutes
  commitCount?: number;
  totalChanges?: number;
  mrTitles?: string[];
  mergeRequests?: WbsoMrDetail[];
  commits?: WbsoCommitDetail[];
  meeting?: WbsoMeetingDetail;
}

export interface WbsoDayData {
  date: string;
  dayLabel: string;
  totalHours: number;
  entries: WbsoEntry[];
}

export interface WbsoCategoryTotals {
  coding: number;
  codeReview: number;
  devMeeting: number;
  devMisc: number;
  nonDev: number;
  leave: number;
  total: number;
}

export interface WbsoEpicSummary {
  epicKey: string;
  epicTitle: string;
  jiraCreatedAt: string;
  totalHours: number;
  categories: { coding: number; codeReview: number; devMeeting: number; devMisc: number };
}

export interface WbsoUnlinkedMR {
  id: number;
  gitlabIid: number;
  title: string;
  branchName: string;
  commitCount: number;
  changesCount: number;
  role: "authored" | "reviewed";
}

export interface WbsoWeekData {
  weekStart: string;
  weekEnd: string;
  jiraBrowseUrl: string;
  gitlabBaseUrl: string;
  epicDates: Record<string, string>; // epicKey → jiraCreatedAt ISO string
  days: WbsoDayData[];
  totals: WbsoCategoryTotals;
  byEpic: WbsoEpicSummary[];
  unlinkedMRs: WbsoUnlinkedMR[];
}

// Critical Path Frequency
export interface CriticalPathFrequencyItem {
  jobName: string;
  stage: string;
  frequency: number;              // 0-1
  pipelinesAnalyzed: number;
  pipelinesCritical: number;
  avgContributionSeconds: number;  // avg execution duration when critical
  exampleCritical: number[];      // pipeline IDs where job was critical (up to 3)
  exampleNonCritical: number[];   // pipeline IDs where job was not critical (up to 3)
}

// Job Retry Trends
export interface JobRetryTrendPoint {
  weekStart: string;   // ISO date string, Monday of the week
  runCount: number;
  retryCount: number;
  retryRate: number;   // 0-100, percentage
}

export interface JobRetryTrend {
  name: string;
  weeks: JobRetryTrendPoint[];  // always 4 entries, oldest first
  slope: number;        // last week rate minus first week rate (pp)
  severity: "healthy" | "improving" | "worsening" | "chronic";
}

// Activity Items
export type ActivitySourceType =
  | "gitlab_comment"
  | "gitlab_approval"
  | "gitlab_merge"
  | "pipeline_success"
  | "pipeline_failure"
  | "review_request"
  | "commits_pushed"
  | "mentioned";

export interface ActivityItem {
  id: number;
  sourceType: ActivitySourceType;
  sourceId: string;
  ticketKey: string | null;
  epicName: string | null;
  actor: string | null;
  title: string;
  body: string | null;
  externalUrl: string;
  notifiedAt: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ActivityDay {
  date: string;
  items: ActivityItem[];
}

export interface ActivityData {
  days: ActivityDay[];
  total: number;
  jiraBrowseUrl: string;
}

// Sync
export type SyncSource =
  | "jira"
  | "gitlab"
  | "gitlab-pipelines"
  | "confluence"
  | "calendar"
  | "slack";
export type SyncStatus = "running" | "success" | "error";

export interface SyncLog {
  id: number;
  source: SyncSource;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  itemsSynced: number | null;
}
