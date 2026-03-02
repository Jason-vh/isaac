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
  status: KeyResultStatus;
  createdAt: string;
}

// Auth
export interface PasskeyCredential {
  id: number;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  label: string;
  createdAt: string;
}

// Sync
export type SyncSource =
  | "jira"
  | "gitlab"
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
