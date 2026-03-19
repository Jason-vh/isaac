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

function buildMrRef(data: EnrichedData): string {
  return data.externalUrl
    ? `<${data.externalUrl}|${data.title}>`
    : data.title;
}

function buildTicketContext(data: EnrichedData): string {
  if (!data.ticketKey) return "";
  const jiraBase = env.JIRA_BASE_URL;
  const ticketLink = `<${jiraBase}/browse/${data.ticketKey}|${data.ticketKey}>`;
  let ctx = ` · ${ticketLink}`;

  const parts: string[] = [];
  if (data.epicName) parts.push(data.epicName);
  if (data.storyPoints) parts.push(`${data.storyPoints} SP`);
  if (parts.length > 0) ctx += ` (${parts.join(", ")})`;
  return ctx;
}

function buildHeadline(action: ActionType, data: EnrichedData): string {
  const verb = ACTION_VERB[action];
  const prefix = PREFIX[action] ? `${PREFIX[action]} ` : "";
  const mrRef = buildMrRef(data);
  const ticketContext = buildTicketContext(data);

  if (action === "pipeline_success" || action === "pipeline_failure") {
    return `${prefix}${verb} ${mrRef}${ticketContext}`;
  }
  return `${prefix}${data.actor} ${verb} ${mrRef}${ticketContext}`;
}

function buildPayload(
  action: ActionType,
  data: EnrichedData,
): Record<string, unknown> {
  const headline = buildHeadline(action, data);

  // Pipeline failures: use Block Kit for structured job list
  if (action === "pipeline_failure" && data.failedJobs.length > 0) {
    const blocks: unknown[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: headline },
      },
      {
        type: "context",
        elements: data.failedJobs.map((job) => ({
          type: "mrkdwn",
          text: `:x:  <${job.webUrl}|${job.name}>${job.duration ? `  _(${job.duration})_` : ""}`,
        })),
      },
    ];

    return { text: headline, blocks, unfurl_links: false };
  }

  // Comments / mentions: include quoted body
  if (
    data.body &&
    (action === "gitlab_comment" || action === "mentioned")
  ) {
    const quoted = data.body
      .split("\n")
      .slice(0, 5)
      .map((line) => `> ${line}`)
      .join("\n");
    return { text: `${headline}\n${quoted}`, unfurl_links: false };
  }

  return { text: headline, unfurl_links: false };
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
