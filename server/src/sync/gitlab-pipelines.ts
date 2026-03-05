import { db } from "../db";
import { pipelines, pipelineJobs } from "../db/schema";
import { env } from "../env";
import { apiFetch, paginateGitLab, runSyncWithLog } from "./util";

// ---------------------------------------------------------------------------
// Types for GitLab API responses
// ---------------------------------------------------------------------------

interface GitLabPipelineListItem {
  id: number;
  ref: string;
  status: string;
  source: string;
  web_url: string;
  created_at: string;
  updated_at: string;
}

interface GitLabPipelineDetail {
  id: number;
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
  duration: number | null;
  queued_duration: number | null;
  allow_failure: boolean;
  web_url: string;
  started_at: string | null;
  finished_at: string | null;
}

const FINISHED_STATUSES = new Set(["success", "failed", "canceled"]);

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export async function syncGitLabPipelines(
  sinceOverride?: Date
): Promise<void> {
  await runSyncWithLog(
    "gitlab-pipelines",
    async (since) => {
      const baseUrl = env.GITLAB_BASE_URL;
      const token = env.GITLAB_API_TOKEN;
      const projectId = env.GITLAB_PROJECT_ID;
      const authHeaders = { "PRIVATE-TOKEN": token };

      // Step 1: Fetch pipelines updated since last sync
      const sinceISO = since.toISOString();
      const allPipelines = await paginateGitLab<GitLabPipelineListItem>(
        `${baseUrl}/api/v4/projects/${projectId}/pipelines?updated_after=${sinceISO}`,
        authHeaders
      );

      // Step 2: Filter to finished pipelines only
      const finished = allPipelines.filter((p) =>
        FINISHED_STATUSES.has(p.status)
      );

      if (finished.length === 0) return 0;

      // Step 3: For each pipeline, fetch detail + jobs, then upsert
      for (const pipeline of finished) {
        // Fetch pipeline detail (for duration, queued_duration, coverage)
        const { data: detail } = await apiFetch<GitLabPipelineDetail>(
          `${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipeline.id}`,
          { headers: authHeaders }
        );

        // Fetch jobs for this pipeline
        const jobs = await paginateGitLab<GitLabJob>(
          `${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipeline.id}/jobs?include_retried=true`,
          authHeaders
        );

        // Upsert pipeline
        await db
          .insert(pipelines)
          .values({
            id: detail.id,
            ref: detail.ref,
            status: detail.status,
            source: detail.source,
            durationSeconds: detail.duration,
            queuedDurationSeconds: detail.queued_duration
              ? Math.round(detail.queued_duration)
              : null,
            coverage: detail.coverage ?? null,
            webUrl: detail.web_url,
            gitlabCreatedAt: new Date(detail.created_at),
            startedAt: detail.started_at
              ? new Date(detail.started_at)
              : null,
            finishedAt: detail.finished_at
              ? new Date(detail.finished_at)
              : null,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: pipelines.id,
            set: {
              ref: detail.ref,
              status: detail.status,
              source: detail.source,
              durationSeconds: detail.duration,
              queuedDurationSeconds: detail.queued_duration
                ? Math.round(detail.queued_duration)
                : null,
              coverage: detail.coverage ?? null,
              webUrl: detail.web_url,
              gitlabCreatedAt: new Date(detail.created_at),
              startedAt: detail.started_at
                ? new Date(detail.started_at)
                : null,
              finishedAt: detail.finished_at
                ? new Date(detail.finished_at)
                : null,
              syncedAt: new Date(),
            },
          });

        // Infer retried: when multiple jobs share the same name in a pipeline,
        // only the one with the highest ID (latest attempt) is the "real" run.
        // GitLab's API doesn't reliably set the `retried` field on our instance.
        const latestByName = new Map<string, number>();
        for (const job of jobs) {
          const prev = latestByName.get(job.name);
          if (prev === undefined || job.id > prev) {
            latestByName.set(job.name, job.id);
          }
        }

        // Upsert jobs
        for (const job of jobs) {
          const isRetried = latestByName.get(job.name) !== job.id;
          await db
            .insert(pipelineJobs)
            .values({
              id: job.id,
              pipelineId: detail.id,
              name: job.name,
              stage: job.stage,
              status: job.status,
              durationSeconds: job.duration != null
                ? String(job.duration)
                : null,
              queuedDurationSeconds: job.queued_duration != null
                ? String(job.queued_duration)
                : null,
              allowFailure: job.allow_failure,
              retried: isRetried,
              webUrl: job.web_url,
              startedAt: job.started_at ? new Date(job.started_at) : null,
              finishedAt: job.finished_at
                ? new Date(job.finished_at)
                : null,
            })
            .onConflictDoUpdate({
              target: pipelineJobs.id,
              set: {
                pipelineId: detail.id,
                name: job.name,
                stage: job.stage,
                status: job.status,
                durationSeconds: job.duration != null
                  ? String(job.duration)
                  : null,
                queuedDurationSeconds: job.queued_duration != null
                  ? String(job.queued_duration)
                  : null,
                allowFailure: job.allow_failure,
                retried: isRetried,
                webUrl: job.web_url,
                startedAt: job.started_at
                  ? new Date(job.started_at)
                  : null,
                finishedAt: job.finished_at
                  ? new Date(job.finished_at)
                  : null,
              },
            });
        }
      }

      return finished.length;
    },
    sinceOverride
  );
}
