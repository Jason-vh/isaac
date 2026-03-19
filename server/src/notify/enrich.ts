import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  activityItems,
  mergeRequests,
  mergeRequestComments,
  pipelines,
  pipelineJobs,
  tickets,
} from "../db/schema";
import { env } from "../env";
import { apiFetch } from "../sync/util";
import type { ClassifiedEmail, ActionType } from "./classify";

const TICKET_KEY_RE = /([A-Z][A-Z0-9]+-\d+)/i;

interface GitLabMR {
  id: number;
  iid: number;
  title: string;
  state: string;
  source_branch: string;
  web_url: string;
  created_at: string;
  merged_at: string | null;
}

interface GitLabNote {
  id: number;
  body: string;
  author: { name: string };
  created_at: string;
  updated_at: string;
}

interface GitLabPipeline {
  id: number;
  iid: number;
  ref: string;
  status: string;
  source: string;
  duration: number | null;
  queued_duration: number | null;
  coverage: string | null;
  web_url: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface GitLabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  failure_reason: string | null;
  duration: number | null;
  queued_duration: number | null;
  allow_failure: boolean;
  web_url: string;
  started_at: string | null;
  finished_at: string | null;
}

interface GitLabProject {
  path_with_namespace: string;
}

export interface FailedJob {
  name: string;
  duration: string | null;
  webUrl: string;
}

export interface EnrichedData {
  title: string;
  body: string | null;
  externalUrl: string;
  actor: string | null;
  ticketKey: string | null;
  epicName: string | null;
  storyPoints: string | null;
  occurredAt: Date;
  mergeRequestId: number | null;
  pipelineId: number | null;
  failedJobs: FailedJob[];
}

async function gitlabFetch<T>(path: string): Promise<T | null> {
  const baseUrl = env.GITLAB_BASE_URL;
  const token = env.GITLAB_API_TOKEN;
  try {
    const { data } = await apiFetch<T>(
      `${baseUrl}/api/v4${path}`,
      { headers: { "PRIVATE-TOKEN": token } },
    );
    return data;
  } catch (err) {
    console.error(`[notify] GitLab API error for ${path}:`, err);
    return null;
  }
}

async function upsertMr(
  mr: GitLabMR,
): Promise<number | null> {
  const projectId = env.GITLAB_PROJECT_ID;
  const project = await gitlabFetch<GitLabProject>(
    `/projects/${projectId}`,
  );
  const projectPath = project?.path_with_namespace ?? "unknown";

  try {
    const [upserted] = await db
      .insert(mergeRequests)
      .values({
        gitlabId: mr.id,
        gitlabIid: mr.iid,
        projectPath,
        title: mr.title,
        status: mr.state,
        authoredByMe: false,
        reviewedByMe: false,
        branchName: mr.source_branch,
        changesCount: 0,
        commitCount: 0,
        gitlabCreatedAt: new Date(mr.created_at),
        mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: mergeRequests.gitlabId,
        set: {
          gitlabIid: mr.iid,
          projectPath,
          title: mr.title,
          status: mr.state,
          branchName: mr.source_branch,
          gitlabCreatedAt: new Date(mr.created_at),
          mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
          syncedAt: new Date(),
        },
      })
      .returning({ id: mergeRequests.id });
    return upserted.id;
  } catch (err) {
    console.error("[notify] MR upsert failed:", err);
    return null;
  }
}

async function resolveTicketKey(
  branchName: string,
): Promise<{
  ticketKey: string | null;
  epicName: string | null;
  storyPoints: string | null;
}> {
  const match = branchName.match(TICKET_KEY_RE);
  if (!match) return { ticketKey: null, epicName: null, storyPoints: null };

  const key = match[1].toUpperCase();
  const [ticket] = await db
    .select({
      key: tickets.key,
      storyPoints: tickets.storyPoints,
      epicKey: tickets.epicKey,
    })
    .from(tickets)
    .where(eq(tickets.key, key))
    .limit(1);

  if (!ticket)
    return { ticketKey: key, epicName: null, storyPoints: null };

  let epicName: string | null = null;
  if (ticket.epicKey) {
    const [epic] = await db
      .select({ title: tickets.title })
      .from(tickets)
      .where(eq(tickets.key, ticket.epicKey))
      .limit(1);
    if (epic) epicName = epic.title;
  }

  return {
    ticketKey: key,
    epicName,
    storyPoints: ticket.storyPoints,
  };
}

async function resolveMrFromPipelineRef(
  ref: string,
): Promise<number | null> {
  const mrIidMatch = ref.match(/^refs\/merge-requests\/(\d+)\//);
  if (!mrIidMatch) return null;

  const mrIid = Number(mrIidMatch[1]);
  const [mr] = await db
    .select({ id: mergeRequests.id })
    .from(mergeRequests)
    .where(eq(mergeRequests.gitlabIid, mrIid))
    .limit(1);
  return mr?.id ?? null;
}

async function upsertPipelineData(
  pipeline: GitLabPipeline,
  jobs: GitLabJob[],
): Promise<void> {
  const mergeRequestId = await resolveMrFromPipelineRef(
    pipeline.ref,
  );

  await db
    .insert(pipelines)
    .values({
      id: pipeline.id,
      iid: pipeline.iid,
      mergeRequestId,
      ref: pipeline.ref,
      status: pipeline.status,
      source: pipeline.source,
      durationSeconds: pipeline.duration,
      queuedDurationSeconds: pipeline.queued_duration
        ? Math.round(pipeline.queued_duration)
        : null,
      coverage: pipeline.coverage ?? null,
      webUrl: pipeline.web_url,
      gitlabCreatedAt: new Date(pipeline.created_at),
      startedAt: pipeline.started_at
        ? new Date(pipeline.started_at)
        : null,
      finishedAt: pipeline.finished_at
        ? new Date(pipeline.finished_at)
        : null,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pipelines.id,
      set: {
        iid: pipeline.iid,
        mergeRequestId,
        ref: pipeline.ref,
        status: pipeline.status,
        source: pipeline.source,
        durationSeconds: pipeline.duration,
        queuedDurationSeconds: pipeline.queued_duration
          ? Math.round(pipeline.queued_duration)
          : null,
        coverage: pipeline.coverage ?? null,
        webUrl: pipeline.web_url,
        startedAt: pipeline.started_at
          ? new Date(pipeline.started_at)
          : null,
        finishedAt: pipeline.finished_at
          ? new Date(pipeline.finished_at)
          : null,
        syncedAt: new Date(),
      },
    });

  if (jobs.length > 0) {
    // Infer retried: latest ID per job name is the real run
    const latestByName = new Map<string, number>();
    for (const job of jobs) {
      const prev = latestByName.get(job.name);
      if (prev === undefined || job.id > prev) {
        latestByName.set(job.name, job.id);
      }
    }

    const jobRows = jobs.map((job) => ({
      id: job.id,
      pipelineId: pipeline.id,
      name: job.name,
      stage: job.stage,
      status: job.status,
      failureReason: job.failure_reason ?? null,
      durationSeconds:
        job.duration != null ? String(job.duration) : null,
      queuedDurationSeconds:
        job.queued_duration != null
          ? String(job.queued_duration)
          : null,
      allowFailure: job.allow_failure,
      retried: latestByName.get(job.name) !== job.id,
      needs: null as string[] | null,
      webUrl: job.web_url,
      startedAt: job.started_at ? new Date(job.started_at) : null,
      finishedAt: job.finished_at
        ? new Date(job.finished_at)
        : null,
    }));

    await db
      .insert(pipelineJobs)
      .values(jobRows)
      .onConflictDoUpdate({
        target: pipelineJobs.id,
        set: {
          pipelineId: sql`excluded.pipeline_id`,
          name: sql`excluded.name`,
          stage: sql`excluded.stage`,
          status: sql`excluded.status`,
          failureReason: sql`excluded.failure_reason`,
          durationSeconds: sql`excluded.duration_seconds`,
          queuedDurationSeconds: sql`excluded.queued_duration_seconds`,
          allowFailure: sql`excluded.allow_failure`,
          retried: sql`excluded.retried`,
          webUrl: sql`excluded.web_url`,
          startedAt: sql`excluded.started_at`,
          finishedAt: sql`excluded.finished_at`,
        },
      });
  }
}

function getFailedJobs(jobs: GitLabJob[]): FailedJob[] {
  return jobs
    .filter((j) => j.status === "failed" && !j.allow_failure)
    .map((j) => ({
      name: j.name,
      duration: j.duration
        ? `${Math.floor(j.duration / 60)}m ${Math.round(j.duration % 60)}s`
        : null,
      webUrl: j.web_url,
    }));
}

export async function enrich(
  classified: ClassifiedEmail,
): Promise<EnrichedData> {
  const projectId = env.GITLAB_PROJECT_ID;
  const { action, mrIid, noteId, pipelineId, email } = classified;

  // Defaults from email-parsed data
  let title = classified.mrTitle ?? email.subject;
  let body = classified.commentText;
  let externalUrl = classified.mrUrl ?? "";
  let actor: string | null =
    action === "pipeline_success" || action === "pipeline_failure"
      ? null
      : classified.actor;
  let ticketKey: string | null = null;
  let epicName: string | null = null;
  let storyPoints: string | null = null;
  let occurredAt = new Date(email.receivedAt);
  let mergeRequestId: number | null = null;
  let enrichedPipelineId: number | null = null;
  let failedJobs: FailedJob[] = [];

  try {
    if (
      action === "pipeline_success" ||
      action === "pipeline_failure"
    ) {
      // Pipeline events
      if (pipelineId) {
        const pipeline = await gitlabFetch<GitLabPipeline>(
          `/projects/${projectId}/pipelines/${pipelineId}`,
        );
        if (pipeline) {
          enrichedPipelineId = pipeline.id;
          externalUrl = pipeline.web_url;
          if (pipeline.finished_at) {
            occurredAt = new Date(pipeline.finished_at);
          }

          const jobs =
            (await gitlabFetch<GitLabJob[]>(
              `/projects/${projectId}/pipelines/${pipelineId}/jobs?include_retried=true&per_page=100`,
            )) ?? [];

          await upsertPipelineData(pipeline, jobs);

          if (action === "pipeline_failure") {
            failedJobs = getFailedJobs(jobs);
          }

          // Resolve MR from pipeline ref
          const mrIidFromRef = pipeline.ref?.match(
            /^refs\/merge-requests\/(\d+)\//,
          );
          if (mrIidFromRef) {
            const refIid = Number(mrIidFromRef[1]);
            const mr = await gitlabFetch<GitLabMR>(
              `/projects/${projectId}/merge_requests/${refIid}`,
            );
            if (mr) {
              title = mr.title;
              mergeRequestId = await upsertMr(mr);
              const resolved = await resolveTicketKey(
                mr.source_branch,
              );
              ticketKey = resolved.ticketKey;
              epicName = resolved.epicName;
              storyPoints = resolved.storyPoints;
            }
          }
        }
      }
    } else if (mrIid) {
      // MR-based events
      const mr = await gitlabFetch<GitLabMR>(
        `/projects/${projectId}/merge_requests/${mrIid}`,
      );
      if (mr) {
        title = mr.title;
        externalUrl = mr.web_url;
        mergeRequestId = await upsertMr(mr);

        const resolved = await resolveTicketKey(mr.source_branch);
        ticketKey = resolved.ticketKey;
        epicName = resolved.epicName;
        storyPoints = resolved.storyPoints;

        if (action === "gitlab_merge" && mr.merged_at) {
          occurredAt = new Date(mr.merged_at);
        }

        // Fetch note for comment/mention actions
        if (
          (action === "gitlab_comment" || action === "mentioned") &&
          noteId
        ) {
          const note = await gitlabFetch<GitLabNote>(
            `/projects/${projectId}/merge_requests/${mrIid}/notes/${noteId}`,
          );
          if (note) {
            body = note.body.length > 200
              ? note.body.slice(0, 197) + "..."
              : note.body;
            actor = note.author.name.split(" ")[0];
            occurredAt = new Date(note.created_at);
            externalUrl = `${mr.web_url}#note_${noteId}`;

            // Upsert the comment
            if (mergeRequestId) {
              try {
                await db
                  .insert(mergeRequestComments)
                  .values({
                    id: note.id,
                    mergeRequestId,
                    body: note.body,
                    externalUrl: `${mr.web_url}#note_${noteId}`,
                    createdAt: new Date(note.created_at),
                    updatedAt: new Date(note.updated_at),
                  })
                  .onConflictDoNothing({ target: mergeRequestComments.id });
              } catch (err) {
                console.error("[notify] Comment upsert failed:", err);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[notify] Enrichment failed, using email data:", err);
  }

  return {
    title,
    body,
    externalUrl: externalUrl || `https://gitlab.com`,
    actor,
    ticketKey,
    epicName,
    storyPoints,
    occurredAt,
    mergeRequestId,
    pipelineId: enrichedPipelineId,
    failedJobs,
  };
}

export async function isDuplicate(sourceId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: activityItems.id })
    .from(activityItems)
    .where(eq(activityItems.sourceId, sourceId))
    .limit(1);
  return !!existing;
}
