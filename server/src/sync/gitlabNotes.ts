// Parsing of GitLab MR discussions.
//
// GitLab records lifecycle changes (draft/ready, approvals, pushes, review
// requests) as system notes rather than as fields on the merge request, so
// walking the notes is the only way to know when they happened.

import { isBotUser } from "./people";

export interface GitLabNoteAuthor {
  id: number;
  username: string;
  name: string;
  public_email?: string | null;
}

export interface GitLabNote {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  author: GitLabNoteAuthor;
  system: boolean;
  type: string | null;
  resolvable: boolean;
  resolved?: boolean;
}

export interface GitLabDiscussion {
  id: string;
  individual_note: boolean;
  notes: GitLabNote[];
}

export const MR_STATE_EVENT_TYPES = [
  "draft",
  "ready",
  "approved",
  "unapproved",
  "approvals_reset",
  "commits_pushed",
  "review_requested",
  "review_request_removed",
] as const;

export type MrStateEventType = (typeof MR_STATE_EVENT_TYPES)[number];

export interface MrStateEvent {
  noteId: number;
  type: MrStateEventType;
  username: string;
  occurredAt: Date;
}

const EVENT_PATTERNS: Array<[MrStateEventType, RegExp]> = [
  ["ready", /^marked (this merge request )?as \*\*ready\*\*/i],
  ["ready", /^unmarked as a \*\*work in progress\*\*/i],
  ["draft", /^marked (this merge request )?as \*\*draft\*\*/i],
  ["draft", /^marked as a \*\*work in progress\*\*/i],
  ["approved", /^approved this merge request/i],
  ["unapproved", /^unapproved this merge request/i],
  ["approvals_reset", /^reset (all )?approvals? (from|by pushing)/i],
  ["commits_pushed", /^added \d+ commits?\b/i],
  ["review_requested", /^requested review from /i],
  ["review_request_removed", /^removed review request for /i],
];

/** Notes from every discussion, oldest first. */
export function flattenNotes(discussions: GitLabDiscussion[]): GitLabNote[] {
  return discussions
    .flatMap((d) => d.notes)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function parseStateEvents(notes: GitLabNote[]): MrStateEvent[] {
  const events: MrStateEvent[] = [];
  for (const note of notes) {
    if (!note.system) continue;
    const body = note.body.trim();
    const match = EVENT_PATTERNS.find(([, re]) => re.test(body));
    if (!match) continue;
    events.push({
      noteId: note.id,
      type: match[0],
      username: note.author.username,
      occurredAt: new Date(note.created_at),
    });
  }
  return events;
}

/** Latest approval time per user. */
export function approvalsByUser(events: MrStateEvent[]): Map<string, Date> {
  const approvals = new Map<string, Date>();
  for (const e of events) {
    if (e.type !== "approved") continue;
    const seen = approvals.get(e.username);
    if (!seen || e.occurredAt > seen) approvals.set(e.username, e.occurredAt);
  }
  return approvals;
}

export interface MrReviewTimings {
  readyAt: Date | null;
  firstApprovedAt: Date | null;
  lastApprovedAt: Date | null;
}

/**
 * Review-window timings for one MR. `readyAt` is the first draft -> ready
 * transition before the merge, since a later flip back to draft is rework, not
 * a fresh wait for review; MRs that were never drafts count as ready from
 * creation. Approvals by the author itself are ignored.
 */
export function deriveReviewTimings(
  events: MrStateEvent[],
  mr: { createdAt: Date; mergedAt: Date | null; draft: boolean; authorUsername: string }
): MrReviewTimings {
  const readyEvents = events
    .filter((e) => e.type === "ready")
    .filter((e) => !mr.mergedAt || e.occurredAt <= mr.mergedAt);
  const firstReady = readyEvents[0]?.occurredAt ?? null;
  const wasEverDraft = events.some((e) => e.type === "draft") || mr.draft;

  const approvals = events
    .filter((e) => e.type === "approved" && e.username !== mr.authorUsername)
    .map((e) => e.occurredAt)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    readyAt: firstReady ?? (wasEverDraft ? null : mr.createdAt),
    firstApprovedAt: approvals[0] ?? null,
    lastApprovedAt: approvals.at(-1) ?? null,
  };
}

export interface ThreadStats {
  opened: number;
  resolved: number;
}

/**
 * Resolvable discussions (review threads) and how many are resolved. Threads
 * started by a bot — Cursor's Bugbot, the security scanner — are review noise
 * rather than review, and are left out like their comments are.
 */
export function threadStats(discussions: GitLabDiscussion[]): ThreadStats {
  let opened = 0;
  let resolved = 0;
  for (const d of discussions) {
    const resolvable = d.notes.filter((n) => n.resolvable && !n.system);
    if (resolvable.length === 0) continue;
    const author = resolvable[0].author;
    if (isBotUser(author.username, author.public_email, author.name)) continue;
    opened++;
    if (resolvable.every((n) => n.resolved)) resolved++;
  }
  return { opened, resolved };
}
