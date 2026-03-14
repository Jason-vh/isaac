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
  sourceId: number;
  targetType: EntityLinkTargetType;
  targetId: string;
  createdAt: string;
}

// OKR
export type ObjectiveStatus = "active" | "completed" | "abandoned";
export type KeyResultStatus = "on_track" | "at_risk" | "behind" | "completed";

export interface Objective {
  id: number;
  title: string;
  description: string | null;
  year: number;
  status: ObjectiveStatus;
  createdAt: string;
}

export interface KeyResult {
  id: number;
  objectiveId: number;
  title: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  dataSource: string | null;
  status: KeyResultStatus;
  createdAt: string;
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
export interface PipelineDurationPoint {
  id: number;
  type: "merge" | "train";
  durationSeconds: number;
  createdAt: string;
  webUrl: string;
  jobCount: number;
  retriedJobCount: number;
}

export interface JobStats {
  name: string;
  stage: string;
  runCount: number;
  avgDuration: number;
  p50Duration: number | null;
  retryCount: number;
  needs: string[];
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
