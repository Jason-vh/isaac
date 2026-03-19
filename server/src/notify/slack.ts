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

function buildMessage(action: ActionType, data: EnrichedData): string {
  const verb = ACTION_VERB[action];
  const prefix = PREFIX[action] ? `${PREFIX[action]} ` : "";
  const cleanTitle = stripTicketKeys(data.title);
  const mrRef = data.externalUrl
    ? `<${data.externalUrl}|${cleanTitle}>`
    : cleanTitle;

  let text: string;
  if (action === "pipeline_success" || action === "pipeline_failure") {
    text = `${prefix}${verb} ${mrRef}`;
  } else {
    text = `${prefix}${resolveActor(data.actor)} ${verb} ${mrRef}`;
  }

  // Failed jobs
  if (action === "pipeline_failure" && data.failedJobs.length > 0) {
    const MAX_JOBS = 3;
    const shown = data.failedJobs.slice(0, MAX_JOBS);
    const rest = data.failedJobs.length - MAX_JOBS;
    let jobLinks = shown
      .map((job) => `<${job.webUrl}|${job.name}>`)
      .join(", ");
    if (rest > 0) jobLinks += ` (+${rest} more)`;
    text += `\n> Failed: ${jobLinks}`;
  }

  // Comment body
  const isCursor = resolveActor(data.actor) === "Cursor";
  if (
    data.body &&
    !isCursor &&
    (action === "gitlab_comment" || action === "mentioned")
  ) {
    const quoted = data.body
      .split("\n")
      .slice(0, 3)
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
      rawEmailBody: data.rawEmailBody,
      notifiedAt: null, // set after successful Slack send
      occurredAt: data.occurredAt,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: activityItems.sourceId })
    .returning({ id: activityItems.id });

  if (!inserted) return; // already claimed by another concurrent process

  const token = env.SLACK_BOT_TOKEN;
  const channelId = env.SLACK_CHANNEL_ID;
  const text = buildMessage(action, data);

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, text, unfurl_links: false }),
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
