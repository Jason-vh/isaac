import { Elysia } from "elysia";
import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  mergeRequests,
  mergeRequestFileStats,
  mergeRequestReviews,
  people,
  tickets,
} from "../db/schema";
import { CODE_CATEGORIES, type CodeCategory } from "../lib/codeCategory";
import { TEAM_METRICS } from "@isaac/shared";
import type {
  CodeVolume,
  LinesByCategory,
  Person,
  TeamMemberProductivity,
  TeamMetric,
  TeamProductivity,
  TeamTrend,
  TeamTrendPoint,
} from "@isaac/shared";

const DEFAULT_DAYS = 30;

function parseRange(query: Record<string, string | undefined>) {
  const until = query.until ? new Date(query.until) : new Date();
  const since = query.since
    ? new Date(query.since)
    : new Date(until.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  return { since, until };
}

function emptyByCategory(): LinesByCategory {
  return Object.fromEntries(
    CODE_CATEGORIES.map((c) => [c, { additions: 0, deletions: 0 }])
  ) as LinesByCategory;
}

function emptyVolume(): CodeVolume {
  return { mrs: 0, additions: 0, deletions: 0, byCategory: emptyByCategory() };
}

/**
 * A review is attributed to when the review happened, falling back to the
 * merge date for approvals that left no comment.
 */
const reviewedAt = sql`coalesce(${mergeRequestReviews.lastReviewedAt}, ${mergeRequests.mergedAt}, ${mergeRequests.gitlabCreatedAt})`;

/** Raw sql templates can't bind a Date, so pass an explicitly cast ISO string. */
function reviewedBetween(since: Date, until: Date) {
  return and(
    sql`${reviewedAt} >= ${since.toISOString()}::timestamptz`,
    sql`${reviewedAt} < ${until.toISOString()}::timestamptz`
  );
}

/** Excluded files (lockfiles, generated code) never count towards line totals. */
const countedFile = eq(mergeRequestFileStats.excluded, false);

export const teamRoutes = new Elysia({ prefix: "/api/team" })
  .get("/people", async () => {
    const rows = await db
      .select({
        id: people.id,
        email: people.email,
        displayName: people.displayName,
        isMe: people.isMe,
      })
      .from(people)
      .where(eq(people.active, true))
      .orderBy(people.displayName);
    return rows satisfies Person[];
  })
  .get("/productivity", async ({ query }) => {
    const { since, until } = parseRange(query as Record<string, string>);

    const mergedInRange = and(
      gte(mergeRequests.mergedAt, since),
      lt(mergeRequests.mergedAt, until),
      isNotNull(mergeRequests.authorPersonId)
    );

    // MRs merged per author
    const mergedCounts = await db
      .select({
        personId: mergeRequests.authorPersonId,
        mrs: sql<number>`count(*)::int`,
      })
      .from(mergeRequests)
      .where(mergedInRange)
      .groupBy(mergeRequests.authorPersonId);

    // Lines merged per author per category
    const mergedLines = await db
      .select({
        personId: mergeRequests.authorPersonId,
        category: mergeRequestFileStats.category,
        additions: sql<number>`coalesce(sum(${mergeRequestFileStats.additions}), 0)::int`,
        deletions: sql<number>`coalesce(sum(${mergeRequestFileStats.deletions}), 0)::int`,
      })
      .from(mergeRequests)
      .innerJoin(
        mergeRequestFileStats,
        eq(mergeRequestFileStats.mergeRequestId, mergeRequests.id)
      )
      .where(and(mergedInRange, countedFile))
      .groupBy(mergeRequests.authorPersonId, mergeRequestFileStats.category);

    const reviewedInRange = reviewedBetween(since, until);

    // MRs reviewed per reviewer. Every reviewer is credited the full diff,
    // so the team total exceeds the volume actually merged.
    const reviewedCounts = await db
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
      .where(reviewedInRange)
      .groupBy(mergeRequestReviews.personId);

    // Lines reviewed per reviewer per category
    const reviewedLines = await db
      .select({
        personId: mergeRequestReviews.personId,
        category: mergeRequestFileStats.category,
        additions: sql<number>`coalesce(sum(${mergeRequestFileStats.additions}), 0)::int`,
        deletions: sql<number>`coalesce(sum(${mergeRequestFileStats.deletions}), 0)::int`,
      })
      .from(mergeRequestReviews)
      .innerJoin(
        mergeRequests,
        eq(mergeRequests.id, mergeRequestReviews.mergeRequestId)
      )
      .innerJoin(
        mergeRequestFileStats,
        eq(mergeRequestFileStats.mergeRequestId, mergeRequests.id)
      )
      .where(and(reviewedInRange, countedFile))
      .groupBy(mergeRequestReviews.personId, mergeRequestFileStats.category);

    // Tickets closed, attributed to the assignee at close time
    const ticketTotals = await db
      .select({
        personId: tickets.closingAssigneePersonId,
        closed: sql<number>`count(*)::int`,
        storyPoints: sql<number>`coalesce(sum(${tickets.storyPoints}), 0)::float`,
      })
      .from(tickets)
      .where(
        and(
          gte(tickets.closedAt, since),
          lt(tickets.closedAt, until),
          isNotNull(tickets.closingAssigneePersonId)
        )
      )
      .groupBy(tickets.closingAssigneePersonId);

    const allPeople = await db
      .select({
        id: people.id,
        email: people.email,
        displayName: people.displayName,
        isMe: people.isMe,
      })
      .from(people);
    const peopleById = new Map(allPeople.map((p) => [p.id, p]));

    const members = new Map<number, TeamMemberProductivity>();
    const memberFor = (personId: number): TeamMemberProductivity | null => {
      const person = peopleById.get(personId);
      if (!person) return null;
      let member = members.get(personId);
      if (!member) {
        member = {
          person,
          merged: emptyVolume(),
          reviewed: { ...emptyVolume(), approvals: 0, comments: 0 },
          tickets: { closed: 0, storyPoints: 0 },
        };
        members.set(personId, member);
      }
      return member;
    };

    for (const row of mergedCounts) {
      const m = memberFor(row.personId!);
      if (m) m.merged.mrs = row.mrs;
    }
    for (const row of mergedLines) {
      const m = memberFor(row.personId!);
      if (!m) continue;
      const bucket = m.merged.byCategory[row.category as CodeCategory];
      if (!bucket) continue;
      bucket.additions += row.additions;
      bucket.deletions += row.deletions;
      m.merged.additions += row.additions;
      m.merged.deletions += row.deletions;
    }
    for (const row of reviewedCounts) {
      const m = memberFor(row.personId);
      if (!m) continue;
      m.reviewed.mrs = row.mrs;
      m.reviewed.approvals = row.approvals;
      m.reviewed.comments = row.comments;
    }
    for (const row of reviewedLines) {
      const m = memberFor(row.personId);
      if (!m) continue;
      const bucket = m.reviewed.byCategory[row.category as CodeCategory];
      if (!bucket) continue;
      bucket.additions += row.additions;
      bucket.deletions += row.deletions;
      m.reviewed.additions += row.additions;
      m.reviewed.deletions += row.deletions;
    }
    for (const row of ticketTotals) {
      const m = memberFor(row.personId!);
      if (!m) continue;
      m.tickets.closed = row.closed;
      m.tickets.storyPoints = Math.round(row.storyPoints * 10) / 10;
    }

    const result: TeamProductivity = {
      since: since.toISOString(),
      until: until.toISOString(),
      members: [...members.values()].sort(
        (a, b) => b.merged.additions - a.merged.additions
      ),
    };
    return result;
  })
  .get("/trend", async ({ query }) => {
    const { since, until } = parseRange(query as Record<string, string>);
    const week = (col: unknown) =>
      sql<string>`to_char(date_trunc('week', ${col}), 'YYYY-MM-DD')`;

    const mergedByWeek = await db
      .select({
        weekStart: week(mergeRequests.mergedAt),
        personId: mergeRequests.authorPersonId,
        mrs: sql<number>`count(distinct ${mergeRequests.id})::int`,
        additions: sql<number>`coalesce(sum(${mergeRequestFileStats.additions}) filter (where not ${mergeRequestFileStats.excluded}), 0)::int`,
      })
      .from(mergeRequests)
      .leftJoin(
        mergeRequestFileStats,
        eq(mergeRequestFileStats.mergeRequestId, mergeRequests.id)
      )
      .where(
        and(
          gte(mergeRequests.mergedAt, since),
          lt(mergeRequests.mergedAt, until),
          isNotNull(mergeRequests.authorPersonId)
        )
      )
      .groupBy(sql`1`, mergeRequests.authorPersonId);

    const reviewedByWeek = await db
      .select({
        weekStart: week(reviewedAt),
        personId: mergeRequestReviews.personId,
        mrs: sql<number>`count(distinct ${mergeRequests.id})::int`,
        additions: sql<number>`coalesce(sum(${mergeRequestFileStats.additions}) filter (where not ${mergeRequestFileStats.excluded}), 0)::int`,
      })
      .from(mergeRequestReviews)
      .innerJoin(
        mergeRequests,
        eq(mergeRequests.id, mergeRequestReviews.mergeRequestId)
      )
      .leftJoin(
        mergeRequestFileStats,
        eq(mergeRequestFileStats.mergeRequestId, mergeRequests.id)
      )
      .where(reviewedBetween(since, until))
      .groupBy(sql`1`, mergeRequestReviews.personId);

    // Separate from reviewedByWeek: that query fans out over file stats, which
    // would multiply comment counts by the number of files in each MR.
    const commentsByWeek = await db
      .select({
        weekStart: week(reviewedAt),
        personId: mergeRequestReviews.personId,
        comments: sql<number>`coalesce(sum(${mergeRequestReviews.commentCount}), 0)::int`,
      })
      .from(mergeRequestReviews)
      .innerJoin(
        mergeRequests,
        eq(mergeRequests.id, mergeRequestReviews.mergeRequestId)
      )
      .where(reviewedBetween(since, until))
      .groupBy(sql`1`, mergeRequestReviews.personId);

    const ticketsByWeek = await db
      .select({
        weekStart: week(tickets.closedAt),
        personId: tickets.closingAssigneePersonId,
        closed: sql<number>`count(*)::int`,
        storyPoints: sql<number>`coalesce(sum(${tickets.storyPoints}), 0)::float`,
      })
      .from(tickets)
      .where(
        and(
          gte(tickets.closedAt, since),
          lt(tickets.closedAt, until),
          isNotNull(tickets.closingAssigneePersonId)
        )
      )
      .groupBy(sql`1`, tickets.closingAssigneePersonId);

    const pointsByWeek = new Map<string, TeamTrendPoint>();
    const seenPeople = new Set<number>();

    const bucket = (weekStart: string, personId: number) => {
      seenPeople.add(personId);
      let point = pointsByWeek.get(weekStart);
      if (!point) {
        point = { weekStart, byPerson: {} };
        pointsByWeek.set(weekStart, point);
      }
      if (!point.byPerson[personId]) {
        point.byPerson[personId] = Object.fromEntries(
          TEAM_METRICS.map((m) => [m, 0])
        ) as Record<TeamMetric, number>;
      }
      return point.byPerson[personId];
    };

    for (const row of mergedByWeek) {
      const b = bucket(row.weekStart, row.personId!);
      b.mergedMrs = row.mrs;
      b.mergedAdditions = row.additions;
    }
    for (const row of reviewedByWeek) {
      const b = bucket(row.weekStart, row.personId);
      b.reviewedMrs = row.mrs;
      b.reviewedAdditions = row.additions;
    }
    for (const row of commentsByWeek) {
      bucket(row.weekStart, row.personId).reviewComments = row.comments;
    }
    for (const row of ticketsByWeek) {
      const b = bucket(row.weekStart, row.personId!);
      b.ticketsClosed = row.closed;
      b.storyPoints = Math.round(row.storyPoints * 10) / 10;
    }

    const peopleRows = await db
      .select({
        id: people.id,
        email: people.email,
        displayName: people.displayName,
        isMe: people.isMe,
      })
      .from(people)
      .orderBy(people.displayName);

    const result: TeamTrend = {
      people: peopleRows.filter((p) => seenPeople.has(p.id)),
      points: [...pointsByWeek.values()].sort((a, b) =>
        a.weekStart.localeCompare(b.weekStart)
      ),
    };
    return result;
  });
