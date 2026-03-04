import { Elysia } from "elysia";
import { and, between, eq, gte, lt, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  tickets,
  ticketEvents,
  mergeRequests,
  mergeRequestEvents,
  confluenceDocuments,
  confluenceDocumentEvents,
  meetings,
  wins,
} from "../db/schema";
import type {
  DayActivity,
  WeekStats,
  FeedItem,
  FeedItemType,
  WeekData,
  VelocityWeek,
} from "@isaac/shared";

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function dayKey(ts: Date | string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return formatDate(d);
}

export const dashboardRoutes = new Elysia({ prefix: "/api/dashboard" }).get(
  "/week/:date",
  async ({ params }) => {
    const monday = getMonday(params.date);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);

    const weekStart = formatDate(monday);
    const weekEnd = formatDate(sunday);

    // Initialize day buckets
    const dayMap = new Map<string, DayActivity>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const key = formatDate(d);
      dayMap.set(key, {
        date: key,
        ticketsClosed: 0,
        ticketEvents: 0,
        mrsMerged: 0,
        mrsOpened: 0,
        mrComments: 0,
        confluencePublished: 0,
        meetingMinutes: 0,
        meetingCount: 0,
        winsLogged: 0,
      });
    }

    const feed: FeedItem[] = [];
    const stats: WeekStats = {
      ticketsClosed: 0,
      storyPointsClosed: 0,
      mrsMerged: 0,
      linesChanged: 0,
      meetingHours: 0,
      meetingCount: 0,
      confluenceDocuments: 0,
      winsLogged: 0,
    };

    // 1. Ticket events
    const ticketEventRows = await db
      .select({
        eventType: ticketEvents.eventType,
        occurredAt: ticketEvents.occurredAt,
        ticketKey: ticketEvents.ticketKey,
        ticketTitle: tickets.title,
        fromValue: ticketEvents.fromValue,
        toValue: ticketEvents.toValue,
      })
      .from(ticketEvents)
      .innerJoin(tickets, eq(ticketEvents.ticketKey, tickets.key))
      .where(
        and(
          gte(ticketEvents.occurredAt, monday),
          lt(ticketEvents.occurredAt, nextMonday)
        )
      );

    for (const row of ticketEventRows) {
      const dk = dayKey(row.occurredAt);
      const day = dayMap.get(dk);
      if (day) day.ticketEvents++;

      let feedType: FeedItemType = "ticket_status_changed";
      let subtitle = row.fromValue && row.toValue
        ? `${row.fromValue} → ${row.toValue}`
        : row.eventType;

      feed.push({
        id: `ticket_event:${row.ticketKey}:${row.occurredAt.toISOString()}`,
        type: feedType,
        title: `${row.ticketKey} ${row.ticketTitle}`,
        subtitle,
        occurredAt: row.occurredAt.toISOString(),
        endsAt: null,
        externalUrl: null,
      });
    }

    // 2. Tickets closed
    const closedTickets = await db
      .select()
      .from(tickets)
      .where(
        and(gte(tickets.closedAt, monday), lt(tickets.closedAt, nextMonday))
      );

    for (const t of closedTickets) {
      const dk = dayKey(t.closedAt!);
      const day = dayMap.get(dk);
      if (day) day.ticketsClosed++;
      stats.ticketsClosed++;
      stats.storyPointsClosed += Number(t.storyPoints) || 0;

      feed.push({
        id: `ticket_closed:${t.key}`,
        type: "ticket_closed",
        title: `${t.key} ${t.title}`,
        subtitle: t.storyPoints ? `${t.storyPoints} SP` : null,
        occurredAt: t.closedAt!.toISOString(),
        endsAt: null,
        externalUrl: null,
      });
    }

    // 3. MR events
    const mrEventRows = await db
      .select({
        eventType: mergeRequestEvents.eventType,
        occurredAt: mergeRequestEvents.occurredAt,
        externalUrl: mergeRequestEvents.externalUrl,
        mrTitle: mergeRequests.title,
        mrId: mergeRequests.gitlabIid,
        projectPath: mergeRequests.projectPath,
      })
      .from(mergeRequestEvents)
      .innerJoin(
        mergeRequests,
        eq(mergeRequestEvents.mergeRequestId, mergeRequests.id)
      )
      .where(
        and(
          gte(mergeRequestEvents.occurredAt, monday),
          lt(mergeRequestEvents.occurredAt, nextMonday)
        )
      );

    for (const row of mrEventRows) {
      const dk = dayKey(row.occurredAt);
      const day = dayMap.get(dk);
      if (day) {
        if (row.eventType === "commented") day.mrComments++;
        if (row.eventType === "opened") day.mrsOpened++;
      }

      let feedType: FeedItemType = "mr_commented";
      if (row.eventType === "opened") feedType = "mr_opened";

      feed.push({
        id: `mr_event:${row.mrId}:${row.occurredAt.toISOString()}`,
        type: feedType,
        title: `!${row.mrId} ${row.mrTitle}`,
        subtitle: row.projectPath,
        occurredAt: row.occurredAt.toISOString(),
        endsAt: null,
        externalUrl: row.externalUrl,
      });
    }

    // 4. MRs merged
    const mergedMrs = await db
      .select()
      .from(mergeRequests)
      .where(
        and(
          gte(mergeRequests.mergedAt, monday),
          lt(mergeRequests.mergedAt, nextMonday)
        )
      );

    for (const mr of mergedMrs) {
      const dk = dayKey(mr.mergedAt!);
      const day = dayMap.get(dk);
      if (day) day.mrsMerged++;
      stats.mrsMerged++;
      stats.linesChanged += mr.additions + mr.deletions;

      feed.push({
        id: `mr_merged:${mr.gitlabIid}`,
        type: "mr_merged",
        title: `!${mr.gitlabIid} ${mr.title}`,
        subtitle: `+${mr.additions} -${mr.deletions}`,
        occurredAt: mr.mergedAt!.toISOString(),
        endsAt: null,
        externalUrl: null,
      });
    }

    // 5. Confluence events
    const confEventRows = await db
      .select({
        eventType: confluenceDocumentEvents.eventType,
        occurredAt: confluenceDocumentEvents.occurredAt,
        externalUrl: confluenceDocumentEvents.externalUrl,
        docTitle: confluenceDocuments.title,
        docId: confluenceDocuments.confluenceId,
      })
      .from(confluenceDocumentEvents)
      .innerJoin(
        confluenceDocuments,
        eq(confluenceDocumentEvents.documentId, confluenceDocuments.id)
      )
      .where(
        and(
          gte(confluenceDocumentEvents.occurredAt, monday),
          lt(confluenceDocumentEvents.occurredAt, nextMonday)
        )
      );

    for (const row of confEventRows) {
      const dk = dayKey(row.occurredAt);
      const day = dayMap.get(dk);
      if (day && row.eventType === "published") {
        day.confluencePublished++;
        stats.confluenceDocuments++;
      }

      feed.push({
        id: `confluence:${row.docId}:${row.occurredAt.toISOString()}`,
        type: "confluence_published",
        title: row.docTitle,
        subtitle: null,
        occurredAt: row.occurredAt.toISOString(),
        endsAt: null,
        externalUrl: row.externalUrl,
      });
    }

    // 6. Meetings (accepted/tentative only)
    const meetingRows = await db
      .select()
      .from(meetings)
      .where(
        and(
          gte(meetings.startsAt, monday),
          lt(meetings.startsAt, nextMonday),
          inArray(meetings.responseStatus, ["accepted", "tentative"])
        )
      );

    for (const m of meetingRows) {
      const dk = dayKey(m.startsAt);
      const day = dayMap.get(dk);
      const durationMin =
        (m.endsAt.getTime() - m.startsAt.getTime()) / 1000 / 60;
      if (day) {
        day.meetingMinutes += durationMin;
        day.meetingCount++;
      }
      stats.meetingCount++;
      stats.meetingHours += durationMin / 60;

      const hours = Math.floor(durationMin / 60);
      const mins = Math.round(durationMin % 60);
      const durationStr =
        hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;

      feed.push({
        id: `meeting:${m.calendarEventId}`,
        type: "meeting",
        title: m.title,
        subtitle: durationStr,
        occurredAt: m.startsAt.toISOString(),
        endsAt: m.endsAt.toISOString(),
        externalUrl: null,
      });
    }

    // 7. Wins
    const winRows = await db
      .select()
      .from(wins)
      .where(
        and(gte(wins.createdAt, monday), lt(wins.createdAt, nextMonday))
      );

    for (const w of winRows) {
      const dk = dayKey(w.createdAt);
      const day = dayMap.get(dk);
      if (day) day.winsLogged++;
      stats.winsLogged++;

      feed.push({
        id: `win:${w.id}`,
        type: "win",
        title: w.title,
        subtitle: w.description,
        occurredAt: w.createdAt.toISOString(),
        endsAt: null,
        externalUrl: null,
      });
    }

    // Round stats
    stats.meetingHours = Math.round(stats.meetingHours * 10) / 10;

    // Sort feed by time descending
    feed.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );

    // Build days array (Mon-Sun order)
    const days: DayActivity[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      days.push(dayMap.get(formatDate(d))!);
    }

    const result: WeekData = { weekStart, weekEnd, days, stats, feed };
    return result;
  }
).get("/velocity", async ({ query }) => {
  const weeks = Math.min(Number(query?.weeks) || 12, 26);
  const now = new Date();
  const currentMonday = getMonday(formatDate(now));

  const result: VelocityWeek[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(currentMonday);
    monday.setUTCDate(currentMonday.getUTCDate() - i * 7);
    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);

    const closedTickets = await db
      .select({
        count: sql<number>`count(*)::int`,
        points: sql<number>`coalesce(sum(${tickets.storyPoints}), 0)::float`,
      })
      .from(tickets)
      .where(
        and(gte(tickets.closedAt, monday), lt(tickets.closedAt, nextMonday))
      );

    const row = closedTickets[0];
    result.push({
      weekStart: formatDate(monday),
      storyPointsClosed: Math.round((row?.points ?? 0) * 10) / 10,
      ticketsClosed: row?.count ?? 0,
    });
  }

  return result;
});
