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
  branchName: string;
  ticketKey: string | null;
  ticketKeyInferred: boolean;
  additions: number;
  deletions: number;
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
  confluencePublished: number;
  meetingMinutes: number;
  meetingCount: number;
  winsLogged: number;
}

export interface WeekStats {
  ticketsClosed: number;
  storyPointsClosed: number;
  mrsMerged: number;
  linesChanged: number;
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
export interface WeeklyPipelineStats {
  weekStart: string;
  total: number;
  successCount: number;
  failedCount: number;
  p50Duration: number | null;
  p90Duration: number | null;
  maxDuration: number | null;
  avgQueueTime: number | null;
  retryRate: number;
}

export interface SlowestJob {
  name: string;
  stage: string;
  runCount: number;
  avgDuration: number;
  p90Duration: number | null;
}

export interface FlakyJob {
  name: string;
  stage: string;
  totalRuns: number;
  retryCount: number;
  retryRate: number;
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
