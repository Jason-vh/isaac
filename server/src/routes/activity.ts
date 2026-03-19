import { Elysia } from "elysia";
import { desc, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import { activityItems, tickets } from "../db/schema";
import { env } from "../env";
import type { ActivityItem, ActivityDay } from "@isaac/shared";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const activityRoutes = new Elysia({ prefix: "/api/activity" }).get(
  "/",
  async ({ query }) => {
    const days = Math.min(Number(query.days) || 30, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db
      .select({
        id: activityItems.id,
        sourceType: activityItems.sourceType,
        sourceId: activityItems.sourceId,
        ticketKey: activityItems.ticketKey,
        actor: activityItems.actor,
        title: activityItems.title,
        body: activityItems.body,
        externalUrl: activityItems.externalUrl,
        notifiedAt: activityItems.notifiedAt,
        occurredAt: activityItems.occurredAt,
        createdAt: activityItems.createdAt,
      })
      .from(activityItems)
      .where(gte(activityItems.occurredAt, since))
      .orderBy(desc(activityItems.occurredAt));

    // Collect unique ticket keys to resolve epic names
    const ticketKeys = [
      ...new Set(rows.map((r) => r.ticketKey).filter(Boolean)),
    ] as string[];

    const epicMap = new Map<string, string>();
    if (ticketKeys.length > 0) {
      const ticketRows = await db
        .select({
          key: tickets.key,
          epicKey: tickets.epicKey,
        })
        .from(tickets)
        .where(inArray(tickets.key, ticketKeys));

      const epicKeys = [
        ...new Set(
          ticketRows.map((t) => t.epicKey).filter(Boolean),
        ),
      ] as string[];

      if (epicKeys.length > 0) {
        const epicRows = await db
          .select({ key: tickets.key, title: tickets.title })
          .from(tickets)
          .where(inArray(tickets.key, epicKeys));
        for (const e of epicRows) {
          epicMap.set(e.key, e.title);
        }
      }

      // Map ticket key → epic name
      for (const t of ticketRows) {
        if (t.epicKey && epicMap.has(t.epicKey)) {
          epicMap.set(t.key, epicMap.get(t.epicKey)!);
        }
      }
    }

    // Group by day
    const dayMap = new Map<string, ActivityItem[]>();
    for (const row of rows) {
      const date = formatDate(row.occurredAt);
      const item: ActivityItem = {
        id: row.id,
        sourceType: row.sourceType as ActivityItem["sourceType"],
        sourceId: row.sourceId,
        ticketKey: row.ticketKey,
        epicName: row.ticketKey ? (epicMap.get(row.ticketKey) ?? null) : null,
        actor: row.actor,
        title: row.title,
        body: row.body,
        externalUrl: row.externalUrl,
        notifiedAt: row.notifiedAt?.toISOString() ?? null,
        occurredAt: row.occurredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      };
      if (!dayMap.has(date)) dayMap.set(date, []);
      dayMap.get(date)!.push(item);
    }

    const dayList: ActivityDay[] = [...dayMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));

    const jiraBase = env.JIRA_BASE_URL || "https://fareharbor.atlassian.net/jira";
    return { days: dayList, total: rows.length, jiraBrowseUrl: `${jiraBase}/browse` };
  },
);
