import { Elysia } from "elysia";
import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { mergeRequests, mergeRequestReviews, people } from "../db/schema";
import { env } from "../env";
import { distribution, median, workHoursBetween } from "../lib/reviewMetrics";
import { parseRange } from "../lib/request";
import type {
  AuthorWait,
  Person,
  ReviewMr,
  ReviewOverview,
  ReviewSummary,
  ReviewTrendPoint,
  ReviewerLoad,
  ReviewerPair,
  ReviewerReport,
} from "@isaac/shared";

/**
 * One row per merged MR, with the review signals gathered from the tables that
 * would otherwise fan out against each other.
 *
 * `review_started_at` is when the MR first went in front of reviewers, which is
 * not the ready flag: about a third have reviewers requested while still a
 * draft, and anchoring on ready makes those look reviewed in minutes. LEAST
 * ignores nulls, so any one of the three signals is enough.
 *
 * The ready signal is the *first* draft -> ready transition, not the stored
 * `ready_at`: an MR sent back to draft after review flips ready again near the
 * merge, which would start the window after the review already happened.
 * `ready_at` still covers MRs that were never drafts, where it is creation.
 */
async function loadMergedMrs(since: Date, until: Date): Promise<ReviewMr[]> {
  const rows = (await db.execute(sql`
    SELECT
      mr.id, mr.gitlab_iid, mr.title, mr.project_path, mr.author_person_id,
      mr.threads_opened, mr.threads_resolved,
      mr.first_approved_at, mr.last_approved_at, mr.merged_at,
      LEAST(COALESCE(e.first_ready, mr.ready_at), e.first_request, r.first_comment)
        AS review_started_at,
      LEAST(r.first_comment, mr.first_approved_at) AS first_reviewed_at,
      COALESCE(f.additions, 0) AS additions,
      COALESCE(f.deletions, 0) AS deletions,
      COALESCE(r.comments, 0) AS comments,
      COALESCE(r.approvals, 0) AS approvals,
      COALESCE(r.reviewers, 0) AS reviewers,
      COALESCE(e.resets, 0) AS approval_resets,
      COALESCE(p.failed, 0) AS failed_pipelines
    FROM merge_requests mr
    LEFT JOIN LATERAL (
      SELECT sum(additions)::int AS additions, sum(deletions)::int AS deletions
      FROM merge_request_file_stats
      WHERE merge_request_id = mr.id AND NOT excluded
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT
        sum(comment_count)::int AS comments,
        count(*) FILTER (WHERE approved)::int AS approvals,
        count(*)::int AS reviewers,
        min(first_reviewed_at) AS first_comment
      FROM merge_request_reviews
      WHERE merge_request_id = mr.id
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE event_type = 'approvals_reset')::int AS resets,
        min(occurred_at) FILTER (WHERE event_type = 'ready') AS first_ready,
        min(occurred_at) FILTER (WHERE event_type = 'review_requested') AS first_request
      FROM merge_request_state_events
      WHERE merge_request_id = mr.id
    ) e ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM pipelines
      WHERE merge_request_id = mr.id
    ) p ON true
    WHERE mr.merged_at >= ${since.toISOString()}
      AND mr.merged_at < ${until.toISOString()}
    ORDER BY mr.merged_at DESC
  `)) as any[];

  return rows.map((r) => {
    const startedAt = r.review_started_at ? new Date(r.review_started_at) : null;
    const mergedAt = new Date(r.merged_at);
    const firstApprovedAt = r.first_approved_at
      ? new Date(r.first_approved_at)
      : null;
    const lastApprovedAt = r.last_approved_at
      ? new Date(r.last_approved_at)
      : null;

    // An approval predating the review window belongs to an earlier round.
    const sinceStart = (at: Date | null): number | null =>
      startedAt && at && at >= startedAt ? workHoursBetween(startedAt, at) : null;

    return {
      id: Number(r.id),
      iid: Number(r.gitlab_iid),
      title: r.title,
      webUrl: `${env.GITLAB_BASE_URL}/${r.project_path}/-/merge_requests/${r.gitlab_iid}`,
      authorId: r.author_person_id ?? null,
      additions: r.additions,
      deletions: r.deletions,
      comments: r.comments,
      approvals: r.approvals,
      reviewers: r.reviewers,
      threadsOpened: r.threads_opened,
      threadsResolved: r.threads_resolved,
      approvalResets: r.approval_resets,
      failedPipelines: r.failed_pipelines,
      hoursToFirstReview: sinceStart(
        r.first_reviewed_at ? new Date(r.first_reviewed_at) : null
      ),
      hoursToFirstApproval: sinceStart(firstApprovedAt),
      hoursToMerge: sinceStart(mergedAt),
      hoursApprovalToMerge: lastApprovedAt
        ? workHoursBetween(lastApprovedAt, mergedAt)
        : null,
      reviewStartedAt: startedAt?.toISOString() ?? null,
      mergedAt: mergedAt.toISOString(),
    } satisfies ReviewMr;
  });
}

/** Comments per 100 changed lines; null for MRs too small to be meaningful. */
function commentDensity(mr: ReviewMr): number | null {
  const lines = mr.additions + mr.deletions;
  if (lines < 10) return null;
  return Math.round((mr.comments / lines) * 1000) / 10;
}

function summarise(mrs: ReviewMr[]): ReviewSummary {
  return {
    mrs: mrs.length,
    latency: {
      toFirstReview: distribution(mrs.map((m) => m.hoursToFirstReview)),
      toFirstApproval: distribution(mrs.map((m) => m.hoursToFirstApproval)),
      toMerge: distribution(mrs.map((m) => m.hoursToMerge)),
      approvalToMerge: distribution(mrs.map((m) => m.hoursApprovalToMerge)),
    },
    size: { additions: distribution(mrs.map((m) => m.additions)) },
    engagement: {
      commentsPerMr: distribution(mrs.map((m) => m.comments)),
      commentsPer100Lines: distribution(mrs.map(commentDensity)),
      approvalResets: distribution(mrs.map((m) => m.approvalResets)),
      threadsOpened: mrs.reduce((n, m) => n + m.threadsOpened, 0),
      threadsResolved: mrs.reduce((n, m) => n + m.threadsResolved, 0),
    },
    quality: {
      noApproval: mrs.filter((m) => m.approvals === 0).length,
      singleApprover: mrs.filter((m) => m.approvals === 1).length,
      rubberStamped: mrs.filter((m) => m.approvals > 0 && m.comments === 0)
        .length,
      withResetApproval: mrs.filter((m) => m.approvalResets > 0).length,
      withFailedPipeline: mrs.filter((m) => m.failedPipelines > 0).length,
    },
  };
}

/** Monday of the week an MR merged in. */
function weekStart(iso: string): string {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function trend(mrs: ReviewMr[]): ReviewTrendPoint[] {
  const byWeek = new Map<string, ReviewMr[]>();
  for (const mr of mrs) {
    const week = weekStart(mr.mergedAt);
    byWeek.set(week, [...(byWeek.get(week) ?? []), mr]);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, weekMrs]) => ({
      weekStart: week,
      mrs: weekMrs.length,
      toFirstReviewP50: median(weekMrs.map((m) => m.hoursToFirstReview)),
      toFirstApprovalP50: median(weekMrs.map((m) => m.hoursToFirstApproval)),
      toMergeP50: median(weekMrs.map((m) => m.hoursToMerge)),
      commentsPerMrP50: median(weekMrs.map((m) => m.comments)),
    }));
}

/** How long each author's own MRs waited, busiest author first. */
function authorWaits(mrs: ReviewMr[], people: Person[]): AuthorWait[] {
  const byAuthor = new Map<number, ReviewMr[]>();
  for (const mr of mrs) {
    if (mr.authorId === null) continue;
    byAuthor.set(mr.authorId, [...(byAuthor.get(mr.authorId) ?? []), mr]);
  }

  return people
    .flatMap((person) => {
      const authored = byAuthor.get(person.id);
      if (!authored) return [];
      return [
        {
          person,
          mrs: authored.length,
          toFirstReview: distribution(authored.map((m) => m.hoursToFirstReview)),
          toFirstApproval: distribution(
            authored.map((m) => m.hoursToFirstApproval)
          ),
          toMerge: distribution(authored.map((m) => m.hoursToMerge)),
        },
      ];
    })
    .sort((a, b) => b.mrs - a.mrs);
}

async function loadPeople(): Promise<Person[]> {
  return db
    .select({
      id: people.id,
      email: people.email,
      displayName: people.displayName,
      isMe: people.isMe,
    })
    .from(people)
    .orderBy(people.displayName);
}

export const reviewRoutes = new Elysia({ prefix: "/api/reviews" })
  .get("/overview", async ({ query }) => {
    const { since, until } = parseRange(query as Record<string, string>);
    const mrs = await loadMergedMrs(since, until);
    const peopleList = await loadPeople();

    return {
      since: since.toISOString(),
      until: until.toISOString(),
      summary: summarise(mrs),
      trend: trend(mrs),
      authors: authorWaits(mrs, peopleList),
      mrs,
      people: peopleList,
    } satisfies ReviewOverview;
  })
  .get("/reviewers", async ({ query }) => {
    const { since, until } = parseRange(query as Record<string, string>);
    const mergedInRange = and(
      gte(mergeRequests.mergedAt, since),
      lt(mergeRequests.mergedAt, until)
    );

    const loadRows = await db
      .select({
        personId: mergeRequestReviews.personId,
        mrs: sql<number>`count(*)::int`,
        approvals: sql<number>`count(*) filter (where ${mergeRequestReviews.approved})::int`,
        comments: sql<number>`coalesce(sum(${mergeRequestReviews.commentCount}), 0)::int`,
      })
      .from(mergeRequestReviews)
      .innerJoin(
        mergeRequests,
        eq(mergeRequests.id, mergeRequestReviews.mergeRequestId)
      )
      .where(mergedInRange)
      .groupBy(mergeRequestReviews.personId);

    const pairRows = await db
      .select({
        authorId: mergeRequests.authorPersonId,
        reviewerId: mergeRequestReviews.personId,
        mrs: sql<number>`count(*)::int`,
      })
      .from(mergeRequestReviews)
      .innerJoin(
        mergeRequests,
        eq(mergeRequests.id, mergeRequestReviews.mergeRequestId)
      )
      .where(and(mergedInRange, isNotNull(mergeRequests.authorPersonId)))
      .groupBy(mergeRequests.authorPersonId, mergeRequestReviews.personId);

    const peopleById = new Map((await loadPeople()).map((p) => [p.id, p]));
    const total = loadRows.reduce((n, r) => n + r.mrs, 0);

    const reviewers: ReviewerLoad[] = loadRows
      .flatMap((r) => {
        const person = peopleById.get(r.personId);
        if (!person) return [];
        return [
          {
            person,
            mrsReviewed: r.mrs,
            approvals: r.approvals,
            comments: r.comments,
            share: total > 0 ? Math.round((r.mrs / total) * 1000) / 10 : 0,
          },
        ];
      })
      .sort((a, b) => b.mrsReviewed - a.mrsReviewed);

    const pairs: ReviewerPair[] = pairRows.map((r) => ({
      authorId: r.authorId!,
      reviewerId: r.reviewerId,
      mrs: r.mrs,
    }));

    const top2 = reviewers.slice(0, 2).reduce((n, r) => n + r.mrsReviewed, 0);

    return {
      reviewers,
      pairs,
      top2Share: total > 0 ? Math.round((top2 / total) * 1000) / 10 : 0,
    } satisfies ReviewerReport;
  });
