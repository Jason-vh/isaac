import { db } from "../db";
import { mergeRequests, mergeRequestEvents } from "../db/schema";
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

    // Step 3: Fetch MRs I authored
    const sinceISO = since.toISOString();
    const authoredMRs = await paginateGitLab<GitLabMR>(
      `${baseUrl}/api/v4/projects/${projectId}/merge_requests?author_id=${myUserId}&updated_after=${sinceISO}&state=all`,
      authHeaders
    );

    // Step 4: Fetch MRs I reviewed
    const reviewedMRs = await paginateGitLab<GitLabMR>(
      `${baseUrl}/api/v4/projects/${projectId}/merge_requests?reviewer_id=${myUserId}&updated_after=${sinceISO}&state=all`,
      authHeaders
    );

    // Step 5: Merge and deduplicate by gitlab_id
    const mrMap = new Map<number, GitLabMR>();
    for (const mr of [...authoredMRs, ...reviewedMRs]) {
      mrMap.set(mr.id, mr);
    }
    const allMRs = [...mrMap.values()];

    if (allMRs.length === 0) return 0;

    // Step 6: Upsert MRs and create events
    for (const mr of allMRs) {
      const authoredByMe = mr.author.id === myUserId;

      const [upserted] = await db
        .insert(mergeRequests)
        .values({
          gitlabId: mr.id,
          gitlabIid: mr.iid,
          projectPath,
          title: mr.title,
          status: mr.state,
          authoredByMe,
          branchName: mr.source_branch,
          additions: 0, // TODO: fetch per-MR detail endpoint for line-level stats
          deletions: 0, // TODO: fetch per-MR detail endpoint for line-level stats
          commitCount: 0, // TODO: fetch per-MR detail endpoint for commit count
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
            branchName: mr.source_branch,
            additions: 0, // TODO
            deletions: 0, // TODO
            commitCount: 0, // TODO
            gitlabCreatedAt: new Date(mr.created_at),
            mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
            syncedAt: new Date(),
          },
        })
        .returning({ id: mergeRequests.id });

      const mrId = upserted.id;

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

      // "merged" event
      if (mr.state === "merged" && mr.merged_at) {
        incoming.push({
          mergeRequestId: mrId,
          eventType: "merged",
          externalUrl: mr.web_url,
          occurredAt: new Date(mr.merged_at),
        });
      }

      // "commented" events — only for MRs not authored by me
      if (!authoredByMe) {
        const notes = await paginateGitLab<GitLabNote>(
          `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mr.iid}/notes?sort=asc&created_after=${sinceISO}`,
          authHeaders
        );

        for (const note of notes) {
          if (note.author.id === myUserId && !note.system) {
            incoming.push({
              mergeRequestId: mrId,
              eventType: "commented",
              externalUrl: `${mr.web_url}#note_${note.id}`,
              occurredAt: new Date(note.created_at),
            });
          }
        }
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
