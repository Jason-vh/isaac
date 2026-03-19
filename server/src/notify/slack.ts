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
};

const PREFIX: Partial<Record<ActionType, string>> = {
  gitlab_approval: ":bacon:",
  gitlab_merge: ":merged:",
  pipeline_failure: ":hellmo:",
  pipeline_success: ":tada:",
};

function buildMessage(
  action: ActionType,
  data: EnrichedData,
): string {
  const verb = ACTION_VERB[action];
  const prefix = PREFIX[action] ? `${PREFIX[action]} ` : "";

  // Build MR reference with link
  const mrRef = data.externalUrl
    ? `<${data.externalUrl}|${data.title}>`
    : data.title;

  // Build ticket context
  let ticketContext = "";
  if (data.ticketKey) {
    const jiraBase = env.JIRA_BASE_URL;
    const ticketLink = `<${jiraBase}/browse/${data.ticketKey}|${data.ticketKey}>`;
    ticketContext = ` · ${ticketLink}`;

    // Add epic name and story points
    const parts: string[] = [];
    if (data.epicName) parts.push(data.epicName);
    if (data.storyPoints) parts.push(`${data.storyPoints} SP`);
    if (parts.length > 0) ticketContext += ` (${parts.join(", ")})`;
  }

  let text: string;
  if (
    action === "pipeline_success" ||
    action === "pipeline_failure"
  ) {
    text = `${prefix}${verb} ${mrRef}${ticketContext}`;
  } else {
    text = `${prefix}${data.actor} ${verb} ${mrRef}${ticketContext}`;
  }

  // Add failed job summary for pipeline failures
  if (action === "pipeline_failure" && data.failedJobSummary) {
    text += `\n> Failed: ${data.failedJobSummary}`;
  }

  // Add comment body
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

  return text;
}

export async function sendSlackNotification(
  action: ActionType,
  data: EnrichedData,
  sourceId: string,
): Promise<void> {
  const token = env.SLACK_BOT_TOKEN;
  const channelId = env.SLACK_CHANNEL_ID;

  const text = buildMessage(action, data);

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text,
      unfurl_links: false,
    }),
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
