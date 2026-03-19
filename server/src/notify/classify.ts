import type { Email } from "./jmap";

export type ActionType =
  | "gitlab_comment"
  | "gitlab_approval"
  | "gitlab_merge"
  | "pipeline_success"
  | "pipeline_failure"
  | "review_request"
  | "commits_pushed"
  | "mentioned"
  | "marked_ready";

export interface ClassifiedEmail {
  action: ActionType | null;
  mrIid: number | null;
  noteId: number | null;
  pipelineId: number | null;
  mrTitle: string | null;
  mrUrl: string | null;
  actor: string;
  commentText: string | null;
  sourceId: string;
  email: Email;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSubject(subject: string): {
  mrTitle: string | null;
  mrIid: number | null;
} {
  const match = subject.match(
    /^(?:Re:\s*)?(?:.+?\s*\|\s*)?(.+?)\s*\(!(\d+)\)\s*$/,
  );
  if (!match) return { mrTitle: null, mrIid: null };
  return { mrTitle: match[1], mrIid: Number(match[2]) };
}

export function extractMrUrl(body: string): string | null {
  const match = body.match(
    /https:\/\/gitlab\.[^\s]+\/merge_requests\/\d+(?:#note_\d+)?/,
  );
  return match ? match[0] : null;
}

export function extractMrIid(subject: string): number | null {
  const match = subject.match(/\(!(\d+)\)/);
  return match ? Number(match[1]) : null;
}

export function extractNoteId(body: string): number | null {
  const match = body.match(/#note_(\d+)/);
  return match ? Number(match[1]) : null;
}

export function extractPipelineId(body: string): number | null {
  const match = body.match(/\/pipelines\/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function extractCommentText(body: string): string | null {
  let text = body.split(
    /\n-- \n|\n---\n|Reply to this email|View it on GitLab/,
  )[0];

  text = text
    .replace(/^.*wrote:.*$/m, "")
    .replace(/^.*created a new comment.*$/m, "")
    .replace(/^.*commented on a discussion.*$/m, "")
    .replace(/^.*commented on a commit.*$/m, "")
    .replace(/^.*mentioned you.*$/m, "")
    .replace(/^https?:\/\/\S+$/m, "")
    .trim();

  if (!text) return null;
  if (text.length > 200) text = text.slice(0, 197) + "...";
  return text;
}

function isDiscussionResolved(text: string): boolean {
  return (
    (text.includes("resolved") && (text.includes("discussion") || text.includes("thread"))) ||
    (text.includes("resolve all") || text.includes("resolved all"))
  );
}

function detectAction(
  subject: string,
  body: string,
): ActionType | null {
  const lower = body.toLowerCase();

  if (lower.includes("pipeline")) {
    if (lower.includes("passed") || lower.includes("success"))
      return "pipeline_success";
    if (lower.includes("failed") || lower.includes("failure"))
      return "pipeline_failure";
  }
  if (lower.includes("approved this merge request") || lower.includes("was approved by"))
    return "gitlab_approval";
  if (lower.includes("merged")) return "gitlab_merge";
  if (lower.includes("pushed") && lower.includes("commit"))
    return "commits_pushed";
  if (isDiscussionResolved(lower)) return null;
  if (lower.includes("marked") && lower.includes("as draft")) return null;
  if (lower.includes("marked") && lower.includes("as ready")) return "marked_ready";
  if (lower.includes("requested") && lower.includes("review"))
    return "review_request";
  if (lower.includes("added as reviewer"))
    return "review_request";
  if (lower.includes("mentioned you")) return "mentioned";

  // Re: subjects are usually comments, but check body isn't just a resolution notice
  if (subject.startsWith("Re:")) {
    const comment = extractCommentText(body);
    if (comment && isDiscussionResolved(comment.toLowerCase())) return null;
    return "gitlab_comment";
  }

  const comment = extractCommentText(body);
  if (comment) {
    if (isDiscussionResolved(comment.toLowerCase())) return null;
    return "gitlab_comment";
  }

  return null;
}

export function buildSourceId(
  action: ActionType,
  mrIid: number | null,
  noteId: number | null,
  pipelineId: number | null,
  emailId: string,
): string {
  switch (action) {
    case "gitlab_comment":
      return noteId ? `note:${noteId}` : `comment:${mrIid}:${emailId}`;
    case "gitlab_approval":
      return `approval:${mrIid}:${emailId}`;
    case "gitlab_merge":
      return `merge:${mrIid}`;
    case "pipeline_success":
      return `pipeline:${pipelineId}:success`;
    case "pipeline_failure":
      return `pipeline:${pipelineId}:failure`;
    case "review_request":
      return `review_req:${mrIid}:${emailId}`;
    case "commits_pushed":
      return `push:${mrIid}:${emailId}`;
    case "mentioned":
      return noteId ? `mention:${noteId}` : `mention:${emailId}`;
    case "marked_ready":
      return `ready:${mrIid}:${emailId}`;
  }
}

export function classifyEmail(email: Email): ClassifiedEmail | null {
  const rawBody = email.body;

  // Extract identifiers from raw body BEFORE stripping HTML,
  // since URLs with #note_ID and /pipelines/ID live inside <a href="..."> tags
  const mrUrl = extractMrUrl(rawBody);
  const noteId = extractNoteId(rawBody);
  const pipelineId = extractPipelineId(rawBody);

  let body = rawBody;
  if (/<[^>]+>/.test(body)) {
    body = stripHtml(body);
  }

  const action = detectAction(email.subject, body);
  if (!action) return null;

  const { mrTitle } = parseSubject(email.subject);
  const mrIid = extractMrIid(email.subject);
  const actor = email.from
    .replace(/\s+via\s+GitLab$/i, "")
    .split(" ")[0] || email.from;

  const hasCommentBody =
    action === "gitlab_comment" || action === "mentioned";
  const commentText = hasCommentBody ? extractCommentText(body) : null;

  const sourceId = buildSourceId(action, mrIid, noteId, pipelineId, email.id);

  return {
    action,
    mrIid,
    noteId,
    pipelineId,
    mrTitle,
    mrUrl,
    actor,
    commentText,
    sourceId,
    email,
  };
}
