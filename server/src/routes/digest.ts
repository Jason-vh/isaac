import { Elysia } from "elysia";
import { and, gte, lt, eq, or, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  tickets,
  ticketEvents,
  mergeRequests,
  confluenceDocuments,
  commits,
} from "../db/schema";
import type { DigestData, DigestMR } from "@isaac/shared";

export const digestRoutes = new Elysia({ prefix: "/api/digest" }).get(
  "/",
  async ({ query, set }) => {
    const { since, until } = query as { since?: string; until?: string };

    if (!since) {
      set.status = 400;
      return { error: "Missing required query param: since" };
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      set.status = 400;
      return { error: "Invalid since date" };
    }

    const untilDate = until ? new Date(until) : new Date();
    if (isNaN(untilDate.getTime())) {
      set.status = 400;
      return { error: "Invalid until date" };
    }

    // 1. Tickets created in range
    const createdTickets = await db
      .select({
        key: tickets.key,
        title: tickets.title,
        issueType: tickets.issueType,
        status: tickets.status,
        assigneeIsMe: tickets.assigneeIsMe,
      })
      .from(tickets)
      .where(
        and(
          gte(tickets.jiraCreatedAt, sinceDate),
          lt(tickets.jiraCreatedAt, untilDate)
        )
      );

    // Group by issueType
    const ticketsByType = new Map<string, typeof createdTickets>();
    for (const t of createdTickets) {
      const group = ticketsByType.get(t.issueType) ?? [];
      group.push(t);
      ticketsByType.set(t.issueType, group);
    }
    const ticketGroups = Array.from(ticketsByType.entries()).map(
      ([issueType, ts]) => ({
        issueType,
        count: ts.length,
        tickets: ts.map((t) => ({
          key: t.key,
          title: t.title,
          status: t.status,
          assignee: t.assigneeIsMe,
        })),
      })
    );

    // 2. Status transitions in range (join with tickets for key/title)
    const transitionRows = await db
      .select({
        toValue: ticketEvents.toValue,
        ticketKey: ticketEvents.ticketKey,
        ticketTitle: tickets.title,
      })
      .from(ticketEvents)
      .innerJoin(tickets, eq(ticketEvents.ticketKey, tickets.key))
      .where(
        and(
          eq(ticketEvents.eventType, "status_changed"),
          isNotNull(ticketEvents.toValue),
          gte(ticketEvents.occurredAt, sinceDate),
          lt(ticketEvents.occurredAt, untilDate)
        )
      );

    // Group by toValue
    const transitionsByValue = new Map<
      string,
      { key: string; title: string }[]
    >();
    for (const row of transitionRows) {
      if (!row.toValue) continue;
      const group = transitionsByValue.get(row.toValue) ?? [];
      group.push({ key: row.ticketKey, title: row.ticketTitle });
      transitionsByValue.set(row.toValue, group);
    }
    const statusTransitions = Array.from(transitionsByValue.entries()).map(
      ([toValue, ts]) => ({
        toValue,
        count: ts.length,
        tickets: ts,
      })
    );

    // 3. MRs opened in range
    const openedMrs = await db
      .select()
      .from(mergeRequests)
      .where(
        and(
          gte(mergeRequests.gitlabCreatedAt, sinceDate),
          lt(mergeRequests.gitlabCreatedAt, untilDate)
        )
      );

    // 4. MRs merged in range
    const mergedMrs = await db
      .select()
      .from(mergeRequests)
      .where(
        and(
          gte(mergeRequests.mergedAt, sinceDate),
          lt(mergeRequests.mergedAt, untilDate)
        )
      );

    // 5. Confluence docs created or updated in range
    const confDocs = await db
      .select()
      .from(confluenceDocuments)
      .where(
        or(
          and(
            gte(confluenceDocuments.confluenceCreatedAt, sinceDate),
            lt(confluenceDocuments.confluenceCreatedAt, untilDate)
          ),
          and(
            gte(confluenceDocuments.confluenceUpdatedAt, sinceDate),
            lt(confluenceDocuments.confluenceUpdatedAt, untilDate)
          )
        )
      );

    // 6. Commits in range grouped by day
    const commitsByDay = await db
      .select({
        date: sql<string>`date_trunc('day', ${commits.authoredAt})::date::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(commits)
      .where(
        and(
          gte(commits.authoredAt, sinceDate),
          lt(commits.authoredAt, untilDate)
        )
      )
      .groupBy(sql`date_trunc('day', ${commits.authoredAt})`);

    const totalCommits = commitsByDay.reduce((sum, d) => sum + d.count, 0);

    const mapMr = (mr: (typeof openedMrs)[0]): DigestMR => ({
      id: mr.id,
      gitlabIid: mr.gitlabIid,
      projectPath: mr.projectPath,
      title: mr.title,
      status: mr.status,
      authoredByMe: mr.authoredByMe,
      ticketKey: mr.ticketKey,
      changesCount: mr.changesCount,
      commitCount: mr.commitCount,
      createdAt: mr.gitlabCreatedAt.toISOString(),
      mergedAt: mr.mergedAt?.toISOString() ?? null,
    });

    const result: DigestData = {
      since: sinceDate.toISOString(),
      until: untilDate.toISOString(),

      tickets: {
        created: ticketGroups,
        totalCreated: createdTickets.length,
      },

      statusTransitions: {
        transitions: statusTransitions,
        totalTransitions: transitionRows.length,
      },

      mergeRequests: {
        opened: openedMrs.map(mapMr),
        merged: mergedMrs.map(mapMr),
        totalOpened: openedMrs.length,
        totalMerged: mergedMrs.length,
      },

      confluence: {
        documents: confDocs.map((d) => ({
          id: d.id,
          confluenceId: d.confluenceId,
          title: d.title,
          spaceKey: d.spaceKey,
          createdByMe: d.createdByMe,
          createdAt: d.confluenceCreatedAt.toISOString(),
          updatedAt: d.confluenceUpdatedAt.toISOString(),
        })),
        totalDocuments: confDocs.length,
      },

      commits: {
        totalCount: totalCommits,
        byDay: commitsByDay.map((d) => ({ date: d.date, count: d.count })),
      },
    };

    return result;
  }
);
