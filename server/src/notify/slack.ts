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

function buildHeadline(action: ActionType, data: EnrichedData): string {
  const verb = ACTION_VERB[action];
  const prefix = PREFIX[action] ? `${PREFIX[action]} ` : "";
  const mrRef = data.externalUrl
    ? `<${data.externalUrl}|${data.title}>`
    : data.title;

  if (action === "pipeline_success" || action === "pipeline_failure") {
    return `${prefix}${verb} ${mrRef}`;
  }
  return `${prefix}${data.actor} ${verb} ${mrRef}`;
}

function buildTicketContextBlock(data: EnrichedData): object | null {
  if (!data.ticketKey) return null;
  const jiraBase = env.JIRA_BASE_URL;

  const elements: object[] = [];

  elements.push({
    type: "mrkdwn",
    text: `<${jiraBase}/browse/${data.ticketKey}|:jira: ${data.ticketKey}>`,
  });

  if (data.epicName) {
    elements.push({ type: "mrkdwn", text: data.epicName });
  }

  return { type: "context", elements };
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
    blocks.push({
      type: "context",
      elements: data.failedJobs.map((job) => ({
        type: "mrkdwn",
        text: `:x:  <${job.webUrl}|${job.name}>${job.duration ? `  _(${job.duration})_` : ""}`,
      })),
    });
  }

  const ticketBlock = buildTicketContextBlock(data);
  if (ticketBlock) blocks.push(ticketBlock);

  return { text, blocks, unfurl_links: false };
}

export async function sendSlackNotification(
  action: ActionType,
  data: EnrichedData,
  sourceId: string,
): Promise<void> {
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

  // Insert activity item after successful notification
  await db
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
      notifiedAt: new Date(),
      occurredAt: data.occurredAt,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: activityItems.sourceId });
}
