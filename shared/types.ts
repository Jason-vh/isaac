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
  /** Identifies this row within its day across re-estimates. */
  rowKey: string;
  /** Transcribed into the WBSO form. */
  marked: boolean;
  /** Hours as filed, which may since have drifted from `hours`. */
  markedHours: number | null;
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
  /** No activity was found for this day — hours must be entered from memory. */
  needsInput: boolean;
  entries: WbsoEntry[];
}

export interface WbsoWorkType {
  /** The Work Type option, verbatim as it reads in the WBSO form's dropdown. */
  label: string;
  /** Abbreviated for table display, where the full label doesn't fit. */
  short: string;
}

const DEV_MISC: WbsoWorkType = {
  label:
    "Dev Miscellaneous (Code Reviews, Monitoring, Documentation, Maintenance, Troubleshooting)",
  short: "Dev Miscellaneous",
};

// Isaac category → WBSO work type. Code review is a Dev Miscellaneous case: the
// form has no option of its own for it.
export const WBSO_WORK_TYPE: Record<WbsoCategory, WbsoWorkType> = {
  coding: { label: "Coding / Commit", short: "Coding / Commit" },
  code_review: DEV_MISC,
  dev_meeting: { label: "Dev Meeting", short: "Dev Meeting" },
  dev_misc: DEV_MISC,
  non_dev: {
    label: "Non-dev (Meeting / Miscellaneous / Training / Event / Travel)",
    short: "Non-dev",
  },
  leave: {
    label: "Leave / Holiday / Sickness",
    short: "Leave / Holiday / Sickness",
  },
};

/** Hours in the WBSO form's own notation, e.g. 2.25 → "2h 15m". */
export function formatWbsoHours(hours: number): string {
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!minutes) return "0h";
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Human-readable work description for a WBSO form row. */
export function wbsoDescription(entry: WbsoEntry): string {
  const r = entry.reasoning;
  if (r.meetingTitle) return r.meetingTitle;
  if (entry.category === "code_review") {
    const title = r.mrTitles?.[0];
    return title ? `Code review: ${title}` : "Code review";
  }
  if (r.mrTitles?.length) return r.mrTitles.join("; ");
  if (entry.ticketTitle) return entry.ticketTitle;
  return "";
}

/**
 * Stable identity for a worksheet row within its day. Rows are derived, so they
 * key off what produced them. Deliberately not the category: a meeting's
 * category changes when it's linked to a ticket, which would orphan the mark,
 * and one MR can't be both coding and review (review excludes MRs I authored).
 */
export function wbsoRowKey(entry: {
  meetingId?: number;
  ticketKey: string | null;
  reasoning: WbsoReasoning;
}): string {
  const mrId = entry.reasoning.mergeRequests?.[0]?.id;
  if (entry.meetingId) return `meeting:${entry.meetingId}`;
  if (mrId) return `mr:${mrId}`;
  return `ticket:${entry.ticketKey ?? "none"}`;
}

/** A hit from the WBSO ticket search, used to link an entry by hand. */
export interface WbsoTicketSearchResult {
  key: string;
  title: string;
  issueType: string;
  epicKey: string | null;
  epicTitle: string | null;
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

// --- Team productivity ---

export type CodeCategory = "frontend" | "backend" | "other";

export interface Person {
  id: number;
  email: string;
  displayName: string;
  isMe: boolean;
}

/** Line counts split by area of the codebase. */
export type LinesByCategory = Record<
  CodeCategory,
  { additions: number; deletions: number }
>;

export interface CodeVolume {
  mrs: number;
  additions: number;
  deletions: number;
  byCategory: LinesByCategory;
}

export interface TeamMemberProductivity {
  person: Person;
  merged: CodeVolume;
  reviewed: CodeVolume & { approvals: number; comments: number };
  tickets: { closed: number; storyPoints: number };
}

export interface TeamProductivity {
  since: string;
  until: string;
  members: TeamMemberProductivity[];
}

export const TEAM_METRICS = [
  "mergedAdditions",
  "mergedMrs",
  "reviewedAdditions",
  "reviewedMrs",
  "reviewComments",
  "ticketsClosed",
  "storyPoints",
] as const;

export type TeamMetric = (typeof TEAM_METRICS)[number];

export interface TeamTrendPoint {
  weekStart: string;
  /** Person id -> metric values for that week. */
  byPerson: Record<number, Record<TeamMetric, number>>;
}

export interface TeamTrend {
  people: Person[];
  points: TeamTrendPoint[];
}

// --- Review analytics ---

/** Percentiles over a set of MRs; null when the sample is empty. */
export interface Distribution {
  n: number;
  p50: number | null;
  p90: number | null;
  p99: number | null;
}

/**
 * Durations in hours, weekends excluded. Measured from the moment an MR first
 * went in front of reviewers, not from the ready flag: a third of MRs have
 * reviewers requested while still a draft.
 */
export interface ReviewLatency {
  /** To the first review action by anyone but the author: a comment or an approval. */
  toFirstReview: Distribution;
  toFirstApproval: Distribution;
  toMerge: Distribution;
  approvalToMerge: Distribution;
}

export interface ReviewSummary {
  mrs: number;
  latency: ReviewLatency;
  size: { additions: Distribution };
  engagement: {
    commentsPerMr: Distribution;
    commentsPer100Lines: Distribution;
    /** Approvals wiped out by a later push. */
    approvalResets: Distribution;
    threadsOpened: number;
    threadsResolved: number;
  };
  /** Counts of MRs, out of `mrs`. */
  quality: {
    noApproval: number;
    singleApprover: number;
    rubberStamped: number;
    withResetApproval: number;
    withFailedPipeline: number;
  };
}

/** Cursor Bugbot's risk label for an MR. */
export type BugbotRisk = "low" | "medium" | "high" | "critical";

/** MRs sharing a risk label; `risk: null` is "Bugbot left no score". */
export interface BugbotCohort {
  risk: BugbotRisk | null;
  mrs: number;
  lines: Distribution;
  comments: Distribution;
  /** Counts of MRs, out of `mrs`. */
  approvedWithoutComments: number;
  withResetApproval: number;
}

/**
 * The same cohorts within one size band. Risk tracks MR size closely, so the
 * headline split mostly restates size unless it is held constant.
 */
export interface BugbotSizeBand {
  label: string;
  cohorts: BugbotCohort[];
}

/**
 * Bugbot doesn't run on every MR, and which ones it skips is decided by the
 * author, not the change — so coverage is reported next to the cohorts.
 */
export interface BugbotReport {
  scored: number;
  cohorts: BugbotCohort[];
  bySize: BugbotSizeBand[];
  coverage: Array<{ person: Person; mrs: number; scored: number }>;
}

export interface ReviewMr {
  id: number;
  iid: number;
  title: string;
  webUrl: string;
  authorId: number | null;
  bugbotRisk: BugbotRisk | null;
  additions: number;
  deletions: number;
  comments: number;
  approvals: number;
  reviewers: number;
  threadsOpened: number;
  threadsResolved: number;
  approvalResets: number;
  failedPipelines: number;
  hoursToFirstReview: number | null;
  hoursToFirstApproval: number | null;
  hoursToMerge: number | null;
  hoursApprovalToMerge: number | null;
  reviewStartedAt: string | null;
  mergedAt: string;
}

export interface ReviewTrendPoint {
  weekStart: string;
  mrs: number;
  toFirstReviewP50: number | null;
  toFirstApprovalP50: number | null;
  toMergeP50: number | null;
  commentsPerMrP50: number | null;
}

/** How long one engineer's own MRs waited to be looked at. */
export interface AuthorWait {
  person: Person;
  mrs: number;
  toFirstReview: Distribution;
  toFirstApproval: Distribution;
  toMerge: Distribution;
}

export interface ReviewOverview {
  since: string;
  until: string;
  summary: ReviewSummary;
  trend: ReviewTrendPoint[];
  authors: AuthorWait[];
  bugbot: BugbotReport;
  mrs: ReviewMr[];
  people: Person[];
}

export interface ReviewerLoad {
  person: Person;
  mrsReviewed: number;
  approvals: number;
  comments: number;
  /** Share of all reviews in the period. */
  share: number;
}

/** How often one person reviewed another's MRs. */
export interface ReviewerPair {
  authorId: number;
  reviewerId: number;
  mrs: number;
}

export interface ReviewerReport {
  reviewers: ReviewerLoad[];
  pairs: ReviewerPair[];
  /** Share of reviews done by the two busiest reviewers. */
  top2Share: number;
}

/** A Jira board sprint. Dates are ISO strings; `startDate` is absent on some future sprints. */
export interface Sprint {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
}

export * from "./criticalPath";
