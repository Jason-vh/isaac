import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { pipelines, pipelineJobs, mergeRequests } from "../db/schema";
import { env } from "../env";
import { apiFetch, paginateGitLab, runSyncWithLog } from "./util";

// ---------------------------------------------------------------------------
// Types for GitLab API responses
// ---------------------------------------------------------------------------

interface GitLabPipelineListItem {
  id: number;
  iid: number;
  ref: string;
  status: string;
  source: string;
  web_url: string;
  created_at: string;
  updated_at: string;
}

interface GitLabPipelineDetail {
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

interface GitLabProject {
  path_with_namespace: string;
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
// GraphQL query for job `needs` (DAG dependencies)
// ---------------------------------------------------------------------------

const JOB_NEEDS_QUERY = `
  query($projectPath: ID!, $pipelineIid: ID!) {
    project(fullPath: $projectPath) {
      pipeline(iid: $pipelineIid) {
        jobs {
          nodes {
            name
            needs {
              nodes { name }
            }
          }
        }
      }
    }
  }
`;

interface GraphQLJobNeedsResponse {
  data: {
    project: {
      pipeline: {
        jobs: {
          nodes: Array<{
            name: string;
            needs: { nodes: Array<{ name: string }> } | null;
          }>;
        };
      } | null;
    } | null;
  };
}

async function fetchJobNeeds(
  baseUrl: string,
  token: string,
  projectPath: string,
  pipelineIid: number
): Promise<Map<string, string[] | null>> {
  const res = await fetch(`${baseUrl}/api/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": token,
    },
    body: JSON.stringify({
      query: JOB_NEEDS_QUERY,
      variables: { projectPath, pipelineIid: String(pipelineIid) },
    }),
  });

  if (!res.ok) {
    console.warn(`[gitlab-pipelines] GraphQL needs query failed: ${res.status}`);
    return new Map();
  }

  const json = (await res.json()) as GraphQLJobNeedsResponse;
  const jobs = json.data?.project?.pipeline?.jobs?.nodes;
  if (!jobs) return new Map();

  const map = new Map<string, string[] | null>();
  for (const job of jobs) {
    if (job.needs === null) {
      map.set(job.name, null);
    } else {
      map.set(job.name, job.needs.nodes.map((n) => n.name));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

const CONCURRENCY = 6;

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

      // Step 0: Fetch project path (needed for GraphQL queries)
      const { data: project } = await apiFetch<GitLabProject>(
        `${baseUrl}/api/v4/projects/${projectId}`,
        { headers: authHeaders }
      );
      const projectPath = project.path_with_namespace;

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

      // Step 3: Skip pipelines we've already synced (finished pipelines don't change)
      const existingIds = new Set(
        (
          await db
            .select({ id: pipelines.id })
            .from(pipelines)
            .where(inArray(pipelines.id, finished.map((p) => p.id)))
        ).map((r) => r.id)
      );
      const toSync = finished.filter((p) => !existingIds.has(p.id));

      if (toSync.length === 0) return 0;

      // Helper: process a single pipeline
      async function processPipeline(pipeline: GitLabPipelineListItem) {
        // Fetch detail, jobs, and job needs in parallel
        const [{ data: detail }, jobs, needsMap] = await Promise.all([
          apiFetch<GitLabPipelineDetail>(
            `${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipeline.id}`,
            { headers: authHeaders }
          ),
          paginateGitLab<GitLabJob>(
            `${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipeline.id}/jobs?include_retried=true`,
            authHeaders
          ),
          fetchJobNeeds(baseUrl, token, projectPath, pipeline.iid),
        ]);

        // Resolve merge request link from ref
        let mergeRequestId: number | null = null;
        const mrIidMatch = detail.ref?.match(
          /^refs\/merge-requests\/(\d+)\//
        );
        if (mrIidMatch) {
          const mrIid = Number(mrIidMatch[1]);
          const [mr] = await db
            .select({ id: mergeRequests.id })
            .from(mergeRequests)
            .where(eq(mergeRequests.gitlabIid, mrIid))
            .limit(1);
          if (mr) mergeRequestId = mr.id;
        }

        // Upsert pipeline
        await db
          .insert(pipelines)
          .values({
            id: detail.id,
            iid: detail.iid,
            mergeRequestId,
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
              iid: detail.iid,
              mergeRequestId,
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
        const latestByName = new Map<string, number>();
        for (const job of jobs) {
          const prev = latestByName.get(job.name);
          if (prev === undefined || job.id > prev) {
            latestByName.set(job.name, job.id);
          }
        }

        // Batch upsert all jobs
        if (jobs.length > 0) {
          const jobRows = jobs.map((job) => {
            const isRetried = latestByName.get(job.name) !== job.id;
            const jobNeeds = needsMap.has(job.name)
              ? needsMap.get(job.name)!
              : null;

            return {
              id: job.id,
              pipelineId: detail.id,
              name: job.name,
              stage: job.stage,
              status: job.status,
              durationSeconds:
                job.duration != null ? String(job.duration) : null,
              queuedDurationSeconds:
                job.queued_duration != null
                  ? String(job.queued_duration)
                  : null,
              allowFailure: job.allow_failure,
              retried: isRetried,
              needs: jobNeeds,
              webUrl: job.web_url,
              startedAt: job.started_at ? new Date(job.started_at) : null,
              finishedAt: job.finished_at
                ? new Date(job.finished_at)
                : null,
            };
          });

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
                durationSeconds: sql`excluded.duration_seconds`,
                queuedDurationSeconds: sql`excluded.queued_duration_seconds`,
                allowFailure: sql`excluded.allow_failure`,
                retried: sql`excluded.retried`,
                needs: sql`excluded.needs`,
                webUrl: sql`excluded.web_url`,
                startedAt: sql`excluded.started_at`,
                finishedAt: sql`excluded.finished_at`,
              },
            });
        }
      }

      // Step 4: Process pipelines in parallel batches
      for (let i = 0; i < toSync.length; i += CONCURRENCY) {
        const batch = toSync.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map((p) => processPipeline(p)));
      }

      return toSync.length;
    },
    sinceOverride
  );
}
