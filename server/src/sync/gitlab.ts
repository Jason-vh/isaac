import { db } from "../db";
import {
  mergeRequests,
  mergeRequestEvents,
  mergeRequestComments,
  mergeRequestFileStats,
  mergeRequestReviews,
  commits,
} from "../db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { env } from "../env";
import { apiFetch, paginateGitLab, runSyncWithLog, dedup } from "./util";
import { classifyPath } from "../lib/codeCategory";
import {
  GitLabIdentityResolver,
  isBotUser,
  resetPersonCache,
} from "./people";

// ---------------------------------------------------------------------------
// Types for GitLab API responses
// ---------------------------------------------------------------------------

interface GitLabUser {
  id: number;
}

interface GitLabProject {
  path_with_namespace: string;
}

interface GitLabAuthor {
  id: number;
  username: string;
  name: string;
  public_email?: string | null;
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
  author: GitLabAuthor;
}

interface GitLabCommit {
  id: string; // sha
  title: string;
  authored_date: string;
  author_name: string;
  author_email: string;
}

interface GitLabNote {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  author: GitLabAuthor;
  system: boolean;
}

// ---------------------------------------------------------------------------
// GraphQL — per-file diff stats and approvals (not available via REST)
// ---------------------------------------------------------------------------

interface GraphQLUser {
  username: string;
  name: string;
  publicEmail: string | null;
}

interface MrGraphQLDetail {
  author: GraphQLUser | null;
  approvedBy: string[];
  additions: number;
  deletions: number;
  filesChanged: number;
  commitCount: number;
  files: Array<{ path: string; additions: number; deletions: number }>;
}

const MR_DETAIL_FRAGMENT = `
  fragment MrDetail on MergeRequest {
    iid
    commitCount
    author { username name publicEmail }
    approvedBy { nodes { username name publicEmail } }
    diffStatsSummary { additions deletions fileCount }
    diffStats { path additions deletions }
  }
`;

// diffStats returns one node per changed file, so keep batches small.
const GRAPHQL_BATCH_SIZE = 10;

async function fetchMrDetails(
  baseUrl: string,
  token: string,
  projectPath: string,
  iids: number[],
  resolver: GitLabIdentityResolver
): Promise<Map<number, MrGraphQLDetail>> {
  const result = new Map<number, MrGraphQLDetail>();

  for (let i = 0; i < iids.length; i += GRAPHQL_BATCH_SIZE) {
    const batch = iids.slice(i, i + GRAPHQL_BATCH_SIZE);
    const aliases = batch
      .map((iid, idx) => `m${idx}: mergeRequest(iid: "${iid}") { ...MrDetail }`)
      .join("\n");
    const query = `${MR_DETAIL_FRAGMENT}
      query($projectPath: ID!) {
        project(fullPath: $projectPath) { ${aliases} }
      }`;

    const res = await fetch(`${baseUrl}/api/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "PRIVATE-TOKEN": token },
      body: JSON.stringify({ query, variables: { projectPath } }),
    });

    if (!res.ok) {
      console.warn(`[gitlab] GraphQL diff query failed: ${res.status}`);
      continue;
    }

    const json = (await res.json()) as {
      data?: { project?: Record<string, any> | null };
      errors?: unknown;
    };
    const project = json.data?.project;
    if (!project) {
      console.warn(`[gitlab] GraphQL diff query returned no project`);
      continue;
    }

    for (let idx = 0; idx < batch.length; idx++) {
      const node = project[`m${idx}`];
      if (!node) continue;

      const approvers: string[] = [];
      for (const u of node.approvedBy?.nodes ?? []) {
        resolver.observe(u.username, u.name, u.publicEmail);
        approvers.push(u.username);
      }
      if (node.author) {
        resolver.observe(
          node.author.username,
          node.author.name,
          node.author.publicEmail
        );
      }

      result.set(batch[idx], {
        author: node.author,
        approvedBy: approvers,
        additions: node.diffStatsSummary?.additions ?? 0,
        deletions: node.diffStatsSummary?.deletions ?? 0,
        filesChanged: node.diffStatsSummary?.fileCount ?? 0,
        commitCount: node.commitCount ?? 0,
        files: node.diffStats ?? [],
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Review attribution
// ---------------------------------------------------------------------------

type ReviewerMap = Map<
  string,
  {
    approved: boolean;
    commentCount: number;
    first?: Date;
    last?: Date;
    approvedAt?: Date;
  }
>;

// GitLab records approvals as system notes rather than exposing a timestamp on
// the MR, so this is the only way to know when a review actually happened.
const APPROVAL_NOTE = /^approved this merge request$/i;

/** Latest approval time per user, from an MR's system notes. */
function parseApprovals(notes: GitLabNote[]): Map<string, Date> {
  const approvals = new Map<string, Date>();
  for (const note of notes) {
    if (!note.system || !APPROVAL_NOTE.test(note.body.trim())) continue;
    const at = new Date(note.created_at);
    const seen = approvals.get(note.author.username);
    if (!seen || at > seen) approvals.set(note.author.username, at);
  }
  return approvals;
}

/** Upserts an MR's reviews and drops rows for people who no longer review it. */
async function writeReviews(
  mrId: number,
  reviewers: ReviewerMap,
  resolver: GitLabIdentityResolver
): Promise<void> {
  const personIds: number[] = [];

  for (const [username, r] of reviewers) {
    const personId = await resolver.resolve(username);
    if (!personId) continue;
    personIds.push(personId);
    const reviewValues = {
      approved: r.approved,
      commentCount: r.commentCount,
      firstReviewedAt: r.first ?? null,
      lastReviewedAt: r.last ?? null,
      approvedAt: r.approvedAt ?? null,
    };
    await db
      .insert(mergeRequestReviews)
      .values({ mergeRequestId: mrId, personId, ...reviewValues })
      .onConflictDoUpdate({
        target: [
          mergeRequestReviews.mergeRequestId,
          mergeRequestReviews.personId,
        ],
        set: reviewValues,
      });
  }

  // Drop reviews that no longer exist (e.g. a revoked approval, or a reviewer
  // now correctly identified as a bot).
  await db
    .delete(mergeRequestReviews)
    .where(
      and(
        eq(mergeRequestReviews.mergeRequestId, mrId),
        personIds.length > 0
          ? notInArray(mergeRequestReviews.personId, personIds)
          : undefined
      )
    );
}

// ---------------------------------------------------------------------------
// GitLab sync
// ---------------------------------------------------------------------------

export async function syncGitLab(sinceOverride?: Date): Promise<void> {
  await runSyncWithLog("gitlab", async (since) => {
    resetPersonCache();

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

    // Step 3: Seed identity resolution from known people and project members
    const resolver = new GitLabIdentityResolver();
    await resolver.loadKnownPeople();
    await resolver.loadProjectMembers();

    // Step 4: Fetch ALL project MRs (no author/reviewer filter)
    const allMRs = await paginateGitLab<GitLabMR>(
      `${baseUrl}/api/v4/projects/${projectId}/merge_requests?updated_after=${sinceISO}&state=all`,
      authHeaders
    );

    if (allMRs.length === 0) return 0;

    // Step 5: Fetch MRs I approved (efficient list-level filter)
    const approvedMRs = await paginateGitLab<GitLabMR>(
      `${baseUrl}/api/v4/projects/${projectId}/merge_requests?approved_by_ids[]=${myUserId}&updated_after=${sinceISO}&state=all`,
      authHeaders
    );
    const approvedSet = new Set(approvedMRs.map((mr) => mr.id));

    // Step 6: Process MRs in chunks, committing each one before moving on, so
    // an interruption keeps everything synced so far. People we can't identify
    // yet are deferred to the end of the run.
    const deferredReviews: Array<{ mrId: number; reviewers: ReviewerMap }> = [];
    const deferredAuthorIids: number[] = [];

    console.log(`[sync:gitlab] Processing ${allMRs.length} MRs`);
    let processed = 0;

    for (let i = 0; i < allMRs.length; i += GRAPHQL_BATCH_SIZE) {
      const chunk = allMRs.slice(i, i + GRAPHQL_BATCH_SIZE);
      const details = await fetchMrDetails(
        baseUrl,
        token,
        projectPath,
        chunk.map((mr) => mr.iid),
        resolver
      );

      for (const mr of chunk) {
        if (++processed % 100 === 0) {
          console.log(
            `[sync:gitlab] Processed ${processed}/${allMRs.length} MRs`
          );
        }

        const authoredByMe = mr.author.id === myUserId;
        const detail = details.get(mr.iid);

        resolver.observe(
          mr.author.username,
          mr.author.name,
          mr.author.public_email
        );

        const mrCommits = await paginateGitLab<GitLabCommit>(
          `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mr.iid}/commits`,
          authHeaders
        );
        resolver.observeCommits(mr.author.username, mrCommits);

        const notes = await paginateGitLab<GitLabNote>(
          `${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mr.iid}/notes?sort=asc`,
          authHeaders
        );
        for (const note of notes) {
          if (note.system) continue;
          resolver.observe(
            note.author.username,
            note.author.name,
            note.author.public_email
          );
        }

        const allNotes = notes.filter((n) => !n.system);
        const myNotes = allNotes.filter((note) => note.author.id === myUserId);
        const reviewedByMe = approvedSet.has(mr.id) || myNotes.length > 0;

        const authorPersonId = await resolver.resolve(mr.author.username);
        if (!authorPersonId && !resolver.isIgnorable(mr.author.username)) {
          deferredAuthorIids.push(mr.iid);
        }

        const values = {
          gitlabIid: mr.iid,
          projectPath,
          title: mr.title,
          status: mr.state,
          authoredByMe,
          reviewedByMe,
          authorPersonId,
          branchName: mr.source_branch,
          gitlabCreatedAt: new Date(mr.created_at),
          mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
          syncedAt: new Date(),
        };

        // Never overwrite known counts with zeros when a GraphQL batch failed.
        const diffValues = detail
          ? {
              filesChanged: detail.filesChanged,
              additions: detail.additions,
              deletions: detail.deletions,
              commitCount: detail.commitCount,
            }
          : null;
        if (!diffValues) {
          console.warn(`[sync:gitlab] No diff stats for MR !${mr.iid}`);
        }

        const [upserted] = await db
          .insert(mergeRequests)
          .values({
            gitlabId: mr.id,
            ...values,
            filesChanged: diffValues?.filesChanged ?? 0,
            additions: diffValues?.additions ?? 0,
            deletions: diffValues?.deletions ?? 0,
            commitCount: diffValues?.commitCount ?? 0,
          })
          .onConflictDoUpdate({
            target: mergeRequests.gitlabId,
            set: { ...values, ...(diffValues ?? {}) },
          })
          .returning({ id: mergeRequests.id });

        const mrId = upserted.id;

        // Per-file line counts
        if (detail) {
          if (detail.files.length > 0) {
            const fileRows = detail.files.map((f) => {
              const { category, excluded } = classifyPath(f.path);
              return {
                mergeRequestId: mrId,
                path: f.path,
                category,
                additions: f.additions,
                deletions: f.deletions,
                excluded,
              };
            });

            await db
              .insert(mergeRequestFileStats)
              .values(fileRows)
              .onConflictDoUpdate({
                target: [
                  mergeRequestFileStats.mergeRequestId,
                  mergeRequestFileStats.path,
                ],
                set: {
                  category: sql`excluded.category`,
                  additions: sql`excluded.additions`,
                  deletions: sql`excluded.deletions`,
                  excluded: sql`excluded.excluded`,
                },
              });
          }

          // Drop files that left the diff (e.g. after a force-push).
          const paths = detail.files.map((f) => f.path);
          await db
            .delete(mergeRequestFileStats)
            .where(
              and(
                eq(mergeRequestFileStats.mergeRequestId, mrId),
                paths.length > 0
                  ? notInArray(mergeRequestFileStats.path, paths)
                  : undefined
              )
            );
        }

        // Reviews — anyone who approved or commented, excluding the MR author.
        const reviewers: ReviewerMap = new Map();
        const approvals = parseApprovals(notes);
        const currentlyApproved = new Set(detail?.approvedBy ?? []);

        const reviewerEntry = (username: string) => {
          const entry = reviewers.get(username) ?? {
            approved: currentlyApproved.has(username),
            commentCount: 0,
            approvedAt: approvals.get(username),
          };
          reviewers.set(username, entry);
          return entry;
        };

        for (const username of currentlyApproved) {
          if (username === mr.author.username) continue;
          reviewerEntry(username);
        }
        // An approval that was later reset (by a push, or withdrawn) still
        // happened, so it counts as a review even with no comment.
        for (const username of approvals.keys()) {
          if (username === mr.author.username || isBotUser(username)) continue;
          reviewerEntry(username);
        }
        for (const note of allNotes) {
          const username = note.author.username;
          if (username === mr.author.username || isBotUser(username)) continue;
          const entry = reviewerEntry(username);
          entry.commentCount++;
          const at = new Date(note.created_at);
          if (!entry.first || at < entry.first) entry.first = at;
          if (!entry.last || at > entry.last) entry.last = at;
        }

        // Writing a partial reviewer set would let the stale-row cleanup delete a
        // reviewer we simply can't identify yet, so defer the whole MR instead.
        if (resolver.hasUnresolved([...reviewers.keys()])) {
          deferredReviews.push({ mrId, reviewers });
        } else {
          await writeReviews(mrId, reviewers, resolver);
        }

        // Upsert commits for all MRs
        for (const c of mrCommits) {
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

        // "commented" events from my notes
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

        // Upsert comment content (all non-system comments for digest)
        if (allNotes.length > 0) {
          const commentRows = allNotes.map((note) => ({
            id: note.id,
            mergeRequestId: mrId,
            body: note.body,
            externalUrl: `${mr.web_url}#note_${note.id}`,
            createdAt: new Date(note.created_at),
            updatedAt: new Date(note.updated_at),
          }));

          await db
            .insert(mergeRequestComments)
            .values(commentRows)
            .onConflictDoUpdate({
              target: mergeRequestComments.id,
              set: {
                body: sql`excluded.body`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }

      }
    }

    // Step 7: Retry whatever referenced a person we couldn't identify at the
    // time. Every email discovered during the run is known by now.
    if (deferredAuthorIids.length > 0 || deferredReviews.length > 0) {
      console.log(
        `[sync:gitlab] Resolving ${deferredAuthorIids.length} deferred authors, ${deferredReviews.length} deferred review sets`
      );
    }

    const mrByIid = new Map(allMRs.map((mr) => [mr.iid, mr]));
    for (const iid of deferredAuthorIids) {
      const mr = mrByIid.get(iid);
      if (!mr) continue;
      const personId = await resolver.resolve(mr.author.username);
      if (!personId) continue;
      await db
        .update(mergeRequests)
        .set({ authorPersonId: personId })
        .where(eq(mergeRequests.gitlabId, mr.id));
    }

    for (const { mrId, reviewers } of deferredReviews) {
      await writeReviews(mrId, reviewers, resolver);
    }

    return allMRs.length;
  }, sinceOverride);
}
