import { db } from "../db";
import { mergeRequests, mergeRequestEvents, commits } from "../db/schema";
import { eq } from "drizzle-orm";
import { env } from "../env";
import { apiFetch, paginateGitLab, runSyncWithLog, dedup } from "./util";

// ---------------------------------------------------------------------------
// Types for GitLab API responses
// ---------------------------------------------------------------------------

interface GitLabUser {
  id: number;
}

interface GitLabProject {
  path_with_namespace: string;
}

interface GitLabMR {
  id: number;
  iid: number;
  title: string;
  state: string;
  source_branch: string;
  web_url: string;
  created_at: string;
  merged_at: string | null;
  author: { id: number };
}

interface GitLabMRDetail {
  additions: number | null;
  deletions: number | null;
  commit_count: number | null;
}

interface GitLabCommit {
  id: string; // sha
  title: string;
  authored_date: string;
}

interface GitLabNote {
  id: number;
  created_at: string;
  author: { id: number };
  system: boolean;
}

// ---------------------------------------------------------------------------
// GitLab sync
// ---------------------------------------------------------------------------

export async function syncGitLab(sinceOverride?: Date): Promise<void> {
  await runSyncWithLog("gitlab", async (since) => {
    // Lazy env access
    const baseUrl = env.GITLAB_BASE_URL;
    const token = env.GITLAB_API_TOKEN;
    const projectId = env.GITLAB_PROJECT_ID;
    const authHeaders = { "PRIVATE-TOKEN": token };

    // Step 1: Get my user ID
    const { data: me } = await apiFetch<GitLabUser>(
      `${baseUrl}/api/v4/user`,
      { headers: authHeaders }
    );
    const myUserId = me.id;

    // Step 2: Get project path
    const { data: project } = await apiFetch<GitLabProject>(
      `${baseUrl}/api/v4/projects/${projectId}`,
      { headers: authHeaders }
    );
    const projectPath = project.path_with_namespace;

    const sinceISO = since.toISOString();

    // Step 3: Fetch ALL project MRs (no author/reviewer filter)
    const allMRs = await paginateGitLab<GitLabMR>(
      `${baseUrl}/api/v4/projects/${projectId}/merge_requests?updated_after=${sinceISO}&state=all`,
      authHeaders
    );

    if (allMRs.length === 0) return 0;

    // Step 4: Fetch MRs I approved (efficient list-level filter)
    const approvedMRs = await paginateGitLab<GitLabMR>(
      `${baseUrl}/api/v4/projects/${projectId}/merge_requests?approved_by_ids[]=${myUserId}&updated_after=${sinceISO}&state=all`,
      authHeaders
    );
    const approvedSet = new Set(approvedMRs.map((mr) => mr.id));

    // Step 5: Process each MR
    for (const mr of allMRs) {
      const authoredByMe = mr.author.id === myUserId;

      // Fetch MR detail for line stats and commit count
      const { data: detail } = await apiFetch<GitLabMRDetail>(
        `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mr.iid}`,
        { headers: authHeaders }
      );

      // For non-authored MRs, check if I commented
      let hasMyComments = false;
      let myNotes: GitLabNote[] = [];

      if (!authoredByMe) {
        const notes = await paginateGitLab<GitLabNote>(
          `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mr.iid}/notes?sort=asc&created_after=${sinceISO}`,
          authHeaders
        );
        myNotes = notes.filter(
          (note) => note.author.id === myUserId && !note.system
        );
        hasMyComments = myNotes.length > 0;
      }

      const reviewedByMe = approvedSet.has(mr.id) || hasMyComments;

      // Upsert MR with both flags
      const [upserted] = await db
        .insert(mergeRequests)
        .values({
          gitlabId: mr.id,
          gitlabIid: mr.iid,
          projectPath,
          title: mr.title,
          status: mr.state,
          authoredByMe,
          reviewedByMe,
          branchName: mr.source_branch,
          additions: detail.additions ?? 0,
          deletions: detail.deletions ?? 0,
          commitCount: detail.commit_count ?? 0,
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
            authoredByMe,
            reviewedByMe,
            branchName: mr.source_branch,
            additions: detail.additions ?? 0,
            deletions: detail.deletions ?? 0,
            commitCount: detail.commit_count ?? 0,
            gitlabCreatedAt: new Date(mr.created_at),
            mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
            syncedAt: new Date(),
          },
        })
        .returning({ id: mergeRequests.id });

      const mrId = upserted.id;

      // Fetch and upsert commits for MRs I authored
      if (authoredByMe) {
        const gitlabCommits = await paginateGitLab<GitLabCommit>(
          `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mr.iid}/commits`,
          authHeaders
        );

        for (const c of gitlabCommits) {
          await db
            .insert(commits)
            .values({
              mergeRequestId: mrId,
              sha: c.id,
              title: c.title,
              authoredAt: new Date(c.authored_date),
            })
            .onConflictDoNothing({ target: commits.sha });
        }
      }

      // Events stay personal — only for MRs I participated in
      if (!authoredByMe && !reviewedByMe) continue;

      // Build incoming events
      const incoming: Array<{
        mergeRequestId: number;
        eventType: string;
        externalUrl: string | null;
        occurredAt: Date;
      }> = [];

      // "authored" event
      if (authoredByMe) {
        incoming.push({
          mergeRequestId: mrId,
          eventType: "authored",
          externalUrl: mr.web_url,
          occurredAt: new Date(mr.created_at),
        });
      }

      // "merged" event (for authored OR reviewed MRs)
      if (mr.state === "merged" && mr.merged_at) {
        incoming.push({
          mergeRequestId: mrId,
          eventType: "merged",
          externalUrl: mr.web_url,
          occurredAt: new Date(mr.merged_at),
        });
      }

      // "commented" events from notes (already fetched for non-authored MRs)
      for (const note of myNotes) {
        incoming.push({
          mergeRequestId: mrId,
          eventType: "commented",
          externalUrl: `${mr.web_url}#note_${note.id}`,
          occurredAt: new Date(note.created_at),
        });
      }

      // Dedup events
      const existing = await db
        .select({
          eventType: mergeRequestEvents.eventType,
          occurredAt: mergeRequestEvents.occurredAt,
        })
        .from(mergeRequestEvents)
        .where(eq(mergeRequestEvents.mergeRequestId, mrId));

      const existingKeyFn = (e: { eventType: string; occurredAt: Date }) =>
        `${e.eventType}:${e.occurredAt.toISOString()}`;

      const incomingKeyFn = (e: {
        mergeRequestId: number;
        eventType: string;
        externalUrl: string | null;
        occurredAt: Date;
      }) => `${e.eventType}:${e.occurredAt.toISOString()}`;

      const newEvents = dedup(existing, incoming, existingKeyFn, incomingKeyFn);

      if (newEvents.length > 0) {
        await db.insert(mergeRequestEvents).values(newEvents);
      }
    }

    return allMRs.length;
  }, sinceOverride);
}
