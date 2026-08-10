import { Elysia } from "elysia";
import { eq, sql } from "drizzle-orm";
import { db, queryRows } from "../../db";
import { mergeRequests } from "../../db/schema";
import { env } from "../../env";
import { apiFetch } from "../../sync/util";
import type {
  TrainDebugAttempt,
  TrainDebugBase,
  TrainDebugBlockingJob,
  TrainDebugInvalidation,
} from "@isaac/shared";

interface GitLabPipelineDebugDetail {
  id: number;
  ref?: string | null;
  sha: string | null;
  status: string;
  web_url: string;
}

interface GitLabCommitDebug {
  id: string;
  title: string;
  message: string;
  parent_ids: string[];
}

interface GitLabCommitRef {
  type: string;
  name: string;
}

interface GitLabMrDebug {
  iid: number;
  title: string;
  state: string;
}

interface GitLabJobDebug {
  id: number;
  name: string;
  status: string;
  allow_failure: boolean;
  failure_reason: string | null;
  started_at: string | null;
  web_url: string;
}

function gitLabProjectBase(): { baseUrl: string; authHeaders: Record<string, string>; projectId: string } {
  return {
    baseUrl: env.GITLAB_BASE_URL,
    authHeaders: { "PRIVATE-TOKEN": env.GITLAB_API_TOKEN },
    projectId: env.GITLAB_PROJECT_ID,
  };
}

function parseMergeRequestIid(message: string | null | undefined): number | null {
  if (!message) return null;
  const match = message.match(/MR:\s*!([0-9]+)/);
  return match ? Number(match[1]) : null;
}

async function fetchGitLabPipeline(pipelineId: number): Promise<GitLabPipelineDebugDetail> {
  const { baseUrl, authHeaders, projectId } = gitLabProjectBase();
  const { data } = await apiFetch<GitLabPipelineDebugDetail>(
    `${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipelineId}`,
    { headers: authHeaders }
  );
  return data;
}

async function fetchGitLabCommit(sha: string): Promise<GitLabCommitDebug> {
  const { baseUrl, authHeaders, projectId } = gitLabProjectBase();
  const { data } = await apiFetch<GitLabCommitDebug>(
    `${baseUrl}/api/v4/projects/${projectId}/repository/commits/${sha}`,
    { headers: authHeaders }
  );
  return data;
}

async function fetchGitLabCommitRefs(sha: string): Promise<GitLabCommitRef[]> {
  const { baseUrl, authHeaders, projectId } = gitLabProjectBase();
  const { data } = await apiFetch<GitLabCommitRef[]>(
    `${baseUrl}/api/v4/projects/${projectId}/repository/commits/${sha}/refs`,
    { headers: authHeaders }
  );
  return data;
}

async function fetchGitLabMr(iid: number): Promise<GitLabMrDebug> {
  const { baseUrl, authHeaders, projectId } = gitLabProjectBase();
  const { data } = await apiFetch<GitLabMrDebug>(
    `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${iid}`,
    { headers: authHeaders }
  );
  return data;
}

async function fetchPipelinesBySha(sha: string): Promise<GitLabPipelineDebugDetail[]> {
  const { baseUrl, authHeaders, projectId } = gitLabProjectBase();
  const { data } = await apiFetch<GitLabPipelineDebugDetail[]>(
    `${baseUrl}/api/v4/projects/${projectId}/pipelines?sha=${encodeURIComponent(sha)}&per_page=100`,
    { headers: authHeaders }
  );
  return data;
}

async function fetchFailedJobs(pipelineId: number): Promise<GitLabJobDebug[]> {
  const { baseUrl, authHeaders, projectId } = gitLabProjectBase();
  const { data } = await apiFetch<GitLabJobDebug[]>(
    `${baseUrl}/api/v4/projects/${projectId}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=true`,
    { headers: authHeaders }
  );
  return data
    .filter((job) => !job.allow_failure && job.status === "failed")
    .sort((a, b) => {
      const aTs = a.started_at ? new Date(a.started_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bTs = b.started_at ? new Date(b.started_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aTs - bTs || a.id - b.id;
    });
}

async function resolveBasedOn(parentSha: string | null): Promise<TrainDebugBase> {
  if (!parentSha) {
    return {
      kind: "unknown",
      sha: null,
      onMain: null,
      mrIid: null,
      title: null,
    };
  }

  try {
    const [parentCommit, refs] = await Promise.all([
      fetchGitLabCommit(parentSha),
      fetchGitLabCommitRefs(parentSha),
    ]);
    const onMain = refs.some((ref) => ref.type === "branch" && ref.name === "main");
    const mrIid = parseMergeRequestIid(parentCommit.message);

    if (!mrIid) {
      return {
        kind: onMain ? "main" : "unknown",
        sha: parentSha,
        onMain,
        mrIid: null,
        title: parentCommit.title,
      };
    }

    let title = parentCommit.title;
    try {
      const mr = await fetchGitLabMr(mrIid);
      title = mr.title;
    } catch {
      // Fall back to commit title when the MR lookup is unavailable.
    }

    return {
      kind: onMain ? "main" : "merge_request",
      sha: parentSha,
      onMain,
      mrIid,
      title,
    };
  } catch {
    return {
      kind: "unknown",
      sha: parentSha,
      onMain: null,
      mrIid: null,
      title: null,
    };
  }
}

async function resolveInvalidation(
  basedOn: TrainDebugBase,
  hasLaterAttempt: boolean
): Promise<TrainDebugInvalidation | null> {
  if (!hasLaterAttempt) return null;

  if (basedOn.kind !== "merge_request" || !basedOn.mrIid || !basedOn.sha) {
    return {
      kind: "train_rebuilt",
      summary: "A later train attempt replaced this one after the queue changed.",
      upstreamMrIid: null,
      upstreamTitle: null,
      upstreamPipelineId: null,
      upstreamPipelineStatus: null,
      upstreamPipelineWebUrl: null,
      blockingJob: null,
    };
  }

  try {
    const upstreamPipelines = await fetchPipelinesBySha(basedOn.sha);
    const upstreamTrain = upstreamPipelines.find((pipeline) =>
      pipeline.ref?.endsWith("/train")
    );

    if (!upstreamTrain) {
      return {
        kind: "unknown",
        summary: `This run was based on !${basedOn.mrIid}, but Isaac could not resolve the upstream train pipeline.`,
        upstreamMrIid: basedOn.mrIid,
        upstreamTitle: basedOn.title,
        upstreamPipelineId: null,
        upstreamPipelineStatus: null,
        upstreamPipelineWebUrl: null,
        blockingJob: null,
      };
    }

    if (upstreamTrain.status === "failed") {
      const failedJobs = await fetchFailedJobs(upstreamTrain.id);
      const firstJob = failedJobs[0];
      const blockingJob: TrainDebugBlockingJob | null = firstJob
        ? {
            name: firstJob.name,
            failureReason: firstJob.failure_reason,
            webUrl: firstJob.web_url,
          }
        : null;

      return {
        kind: "upstream_failed",
        summary: firstJob
          ? `Blocked by !${basedOn.mrIid}, which failed ${firstJob.name}${firstJob.failure_reason ? ` (${firstJob.failure_reason})` : ""}.`
          : `Blocked by !${basedOn.mrIid}, whose train pipeline failed.`,
        upstreamMrIid: basedOn.mrIid,
        upstreamTitle: basedOn.title,
        upstreamPipelineId: upstreamTrain.id,
        upstreamPipelineStatus: upstreamTrain.status,
        upstreamPipelineWebUrl: upstreamTrain.web_url,
        blockingJob,
      };
    }

    if (upstreamTrain.status === "success") {
      return {
        kind: "upstream_merged",
        summary: `!${basedOn.mrIid} advanced ahead of this run, so GitLab rebuilt the train behind it.`,
        upstreamMrIid: basedOn.mrIid,
        upstreamTitle: basedOn.title,
        upstreamPipelineId: upstreamTrain.id,
        upstreamPipelineStatus: upstreamTrain.status,
        upstreamPipelineWebUrl: upstreamTrain.web_url,
        blockingJob: null,
      };
    }

    return {
      kind: "unknown",
      summary: `The queue changed around !${basedOn.mrIid}, and GitLab rebuilt the train.`,
      upstreamMrIid: basedOn.mrIid,
      upstreamTitle: basedOn.title,
      upstreamPipelineId: upstreamTrain.id,
      upstreamPipelineStatus: upstreamTrain.status,
      upstreamPipelineWebUrl: upstreamTrain.web_url,
      blockingJob: null,
    };
  } catch {
    return {
      kind: "unknown",
      summary: `This run was based on !${basedOn.mrIid}, but Isaac could not fully explain why it was replaced.`,
      upstreamMrIid: basedOn.mrIid,
      upstreamTitle: basedOn.title,
      upstreamPipelineId: null,
      upstreamPipelineStatus: null,
      upstreamPipelineWebUrl: null,
      blockingJob: null,
    };
  }
}

interface TrainAttemptRow {
  id: number;
  ref: string | null;
  status: string;
  duration_seconds: number | null;
  web_url: string;
  gitlab_created_at: Date;
}

function positionOf(basedOn: TrainDebugBase): TrainDebugAttempt["position"] {
  if (basedOn.kind === "merge_request" && basedOn.onMain === false) {
    return "behind_other_mr";
  }
  if (basedOn.kind === "main" || (basedOn.kind === "merge_request" && basedOn.onMain === true)) {
    return "front_of_train";
  }
  return "unknown";
}

function outcomeOf(
  hasLaterAttempt: boolean,
  mrStatus: string,
  attemptStatus: string
): TrainDebugAttempt["outcome"] {
  if (hasLaterAttempt) return "superseded";
  if (mrStatus === "merged") return "merged";
  if (attemptStatus === "running" || attemptStatus === "pending") return "active";
  return "completed";
}

export const trainDebugRoutes = new Elysia().get(
  "/merge-requests/:id/train-debug",
  async ({ params, set }) => {
    const mrId = Number(params.id);
    if (!Number.isInteger(mrId)) {
      set.status = 400;
      return { error: "Invalid merge request id" };
    }

    const [mr] = await db
      .select({ status: mergeRequests.status })
      .from(mergeRequests)
      .where(eq(mergeRequests.id, mrId))
      .limit(1);

    if (!mr) return [];

    const attempts = await queryRows<TrainAttemptRow>(sql`
      SELECT
        p.id, p.ref, p.status, p.duration_seconds, p.web_url, p.gitlab_created_at
      FROM pipelines p
      WHERE p.merge_request_id = ${mrId}
        AND p.ref LIKE '%/train'
      ORDER BY p.gitlab_created_at ASC
    `);

    return Promise.all(
      attempts.map(async (attempt, index): Promise<TrainDebugAttempt> => {
        const hasLaterAttempt = index < attempts.length - 1;

        let sha: string | null = null;
        let parentSha: string | null = null;
        let basedOn: TrainDebugBase = {
          kind: "unknown",
          sha: null,
          onMain: null,
          mrIid: null,
          title: null,
        };

        try {
          const livePipeline = await fetchGitLabPipeline(Number(attempt.id));
          sha = livePipeline.sha;
          if (sha) {
            const commit = await fetchGitLabCommit(sha);
            parentSha = commit.parent_ids[0] ?? null;
            basedOn = await resolveBasedOn(parentSha);
          }
        } catch {
          // Best effort only; the stored row is still useful on its own.
        }

        return {
          pipelineId: Number(attempt.id),
          status: attempt.status,
          webUrl: attempt.web_url,
          createdAt: new Date(attempt.gitlab_created_at).toISOString(),
          durationSeconds: attempt.duration_seconds,
          sha,
          parentSha,
          position: positionOf(basedOn),
          basedOn,
          outcome: outcomeOf(hasLaterAttempt, mr.status, attempt.status),
          supersededByPipelineId: hasLaterAttempt
            ? Number(attempts[index + 1].id)
            : null,
          invalidation: await resolveInvalidation(basedOn, hasLaterAttempt),
        };
      })
    );
  }
);
