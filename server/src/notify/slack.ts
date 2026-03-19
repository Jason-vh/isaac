import { eq } from "drizzle-orm";
import { db } from "../db";
import { activityItems } from "../db/schema";
import { env } from "../env";
import type { ActionType } from "./classify";
import type { EnrichedData } from "./enrich";

const ACTION_VERB: Record<ActionType, string> = {
  gitlab_comment: "commented on",
  gitlab_approval: "approved",
  gitlab_merge: "merged",
  pipeline_success: "Pipeline passed for",
  pipeline_failure: "Pipeline failed for",
  review_request: "requested review on",
  commits_pushed: "pushed commits to",
  mentioned: "mentioned you on",
  marked_ready: "marked as ready",
};

const PREFIX: Partial<Record<ActionType, string>> = {
  gitlab_approval: ":bacon:",
  gitlab_merge: ":merged:",
  pipeline_failure: ":hellmo:",
  pipeline_success: ":tada:",
  marked_ready: ":white_check_mark:",
};

const TICKET_KEY_RE = /\[?[A-Z][A-Z0-9]+-\d+\]?\s*/gi;

const ACTOR_ALIASES: Record<string, string> = {
  "****": "Cursor",
};

function resolveActor(actor: string | null): string | null {
  if (!actor) return null;
  return ACTOR_ALIASES[actor] ?? actor;
}

function stripTicketKeys(title: string): string {
  return title.replace(TICKET_KEY_RE, "").replace(/\s+/g, " ").trim();
}

function jiraBrowseUrl(key: string): string {
  const base = env.JIRA_BASE_URL;
  // JIRA_BASE_URL may be "https://x.atlassian.net/jira" — browse lives at the root
  const origin = base.replace(/\/jira\/?$/, "");
  return `${origin}/browse/${key}`;
}

function buildHeadline(action: ActionType, data: EnrichedData): string {
  const verb = ACTION_VERB[action];
  const prefix = PREFIX[action] ? `${PREFIX[action]} ` : "";
  const cleanTitle = stripTicketKeys(data.title);
  const mrRef = data.externalUrl
    ? `<${data.externalUrl}|${cleanTitle}>`
    : cleanTitle;

  let actionLine: string;
  if (action === "pipeline_success" || action === "pipeline_failure") {
    actionLine = `${prefix}${verb}`;
  } else {
    actionLine = `${prefix}${resolveActor(data.actor)} ${verb}`;
  }

  return `${actionLine}\n${mrRef}`;
}

function buildTicketContextBlock(data: EnrichedData): object | null {
  if (!data.ticketKey) return null;

  const ticketLabel = data.ticketTitle ?? data.ticketKey;
  const ticketUrl = jiraBrowseUrl(data.ticketKey);
  let text = `<${ticketUrl}|${ticketLabel}>`;

  if (data.epicName && data.epicKey) {
    const epicUrl = jiraBrowseUrl(data.epicKey);
    text += ` (<${epicUrl}|${data.epicName}>)`;
  } else if (data.epicName) {
    text += ` (${data.epicName})`;
  }

  return {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  };
}

function buildPayload(
  action: ActionType,
  data: EnrichedData,
): Record<string, unknown> {
  let text = buildHeadline(action, data);

  // Comment body for comments/mentions
  if (
    data.body &&
    (action === "gitlab_comment" || action === "mentioned")
  ) {
    const quoted = data.body
      .split("\n")
      .slice(0, 5)
      .map((line) => `> ${line}`)
      .join("\n");
    text += `\n${quoted}`;
  }

  const blocks: object[] = [
    { type: "section", text: { type: "mrkdwn", text } },
  ];

  if (action === "pipeline_failure" && data.failedJobs.length > 0) {
    const MAX_JOBS = 3;
    const shown = data.failedJobs.slice(0, MAX_JOBS);
    const rest = data.failedJobs.length - MAX_JOBS;
    let jobLinks = shown
      .map((job) => `<${job.webUrl}|${job.name}>`)
      .join(", ");
    if (rest > 0) jobLinks += ` (+${rest} more)`;
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Failed: ${jobLinks}` }],
    });
  }

  const ticketBlock = buildTicketContextBlock(data);
  if (ticketBlock) blocks.push(ticketBlock);

  blocks.push({ type: "divider" });

  return { text, blocks, unfurl_links: false };
}

export async function sendSlackNotification(
  action: ActionType,
  data: EnrichedData,
  sourceId: string,
): Promise<void> {
  // Claim the source_id BEFORE sending to Slack to prevent race condition
  // where two SSE events for the same email both pass isDuplicate() check
  const [inserted] = await db
    .insert(activityItems)
    .values({
      sourceType: action,
      sourceId,
      mergeRequestId: data.mergeRequestId,
      pipelineId: data.pipelineId,
      ticketKey: data.ticketKey,
      actor: data.actor,
      title: data.title,
      body: data.body,
      externalUrl: data.externalUrl,
      notifiedAt: null, // set after successful Slack send
      occurredAt: data.occurredAt,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: activityItems.sourceId })
    .returning({ id: activityItems.id });

  if (!inserted) return; // already claimed by another concurrent process

  const token = env.SLACK_BOT_TOKEN;
  const channelId = env.SLACK_CHANNEL_ID;
  const payload = buildPayload(action, data);

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, ...payload }),
  });

  if (!res.ok) {
    throw new Error(`Slack API error: ${res.status}`);
  }

  const result = (await res.json()) as { ok: boolean; error?: string };
  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`);
  }

  await db
    .update(activityItems)
    .set({ notifiedAt: new Date() })
    .where(eq(activityItems.id, inserted.id));
}
