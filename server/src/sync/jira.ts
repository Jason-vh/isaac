import { db } from "../db";
import { tickets, ticketEvents } from "../db/schema";
import { eq, and, inArray, isNull, isNotNull } from "drizzle-orm";
import { env } from "../env";
import { apiFetch, basicAuthHeader, runSyncWithLog, dedup } from "./util";

// ---------------------------------------------------------------------------
// Types for Jira API responses
// ---------------------------------------------------------------------------

interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
}

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    issuetype: { name: string };
    status: { name: string; statusCategory: { key: string } };
    customfield_10502?: number | null;
    parent?: { key: string };
    created: string;
    updated: string;
    assignee?: { emailAddress: string } | null;
    reporter?: { emailAddress: string } | null;
  };
  changelog: {
    histories: Array<{
      created: string;
      items: Array<{
        field: string;
        fromString: string | null;
        toString: string | null;
      }>;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Jira sync
// ---------------------------------------------------------------------------

export async function syncJira(sinceOverride?: Date): Promise<void> {
  await runSyncWithLog("jira", async (since) => {
    // Lazy env access — strip trailing /jira if present (API root is the Atlassian domain)
    const baseUrl = env.JIRA_BASE_URL.replace(/\/jira\/?$/, "");

    const email = env.JIRA_EMAIL;
    const token = env.JIRA_API_TOKEN;
    const auth = basicAuthHeader(email, token);

    // JQL date format: YYYY-MM-DD
    const sinceDate = since.toISOString().slice(0, 10);

    const fields = [
      "summary",
      "issuetype",
      "status",
      "customfield_10502",
      "parent",
      "created",
      "updated",
      "assignee",
      "reporter",
    ].join(",");

    // Paginate through all matching issues (using nextPageToken cursor)
    const jql = `project = DESK AND updated >= "${sinceDate}"`;
    const allIssues: JiraIssue[] = [];
    let nextPageToken: string | undefined;

    while (true) {
      const url = new URL(`${baseUrl}/rest/api/3/search/jql`);
      url.searchParams.set("jql", jql);
      url.searchParams.set("fields", fields);
      url.searchParams.set("expand", "changelog");
      url.searchParams.set("maxResults", "50");
      if (nextPageToken) {
        url.searchParams.set("nextPageToken", nextPageToken);
      }

      const { data } = await apiFetch<JiraSearchResponse>(url.toString(), {
        headers: { Authorization: auth },
      });

      allIssues.push(...data.issues);

      if (!data.nextPageToken || data.issues.length === 0) {
        break;
      }
      nextPageToken = data.nextPageToken;
    }

    if (allIssues.length === 0) return 0;

    // --- First pass: upsert all tickets ---
    for (const issue of allIssues) {
      const sp = issue.fields.customfield_10502 ?? null;

      const createdByMe =
        issue.fields.reporter?.emailAddress === email;
      const assigneeIsMe =
        issue.fields.assignee?.emailAddress === email;
      const parentKey = issue.fields.parent?.key ?? null;

      const jiraCreatedAt = new Date(issue.fields.created);
      const jiraUpdatedAt = new Date(issue.fields.updated);

      // Determine closedAt from changelog if status is done
      let closedAt: Date | null = null;
      if (issue.fields.status.statusCategory.key === "done") {
        const currentStatusName = issue.fields.status.name;
        // Find the most recent transition INTO the current done status
        for (let i = issue.changelog.histories.length - 1; i >= 0; i--) {
          const history = issue.changelog.histories[i];
          const statusItem = history.items.find(
            (item) =>
              item.field === "status" && item.toString === currentStatusName
          );
          if (statusItem) {
            closedAt = new Date(history.created);
            break;
          }
        }
        // If no changelog history has a status change, fall back to updatedAt
        if (!closedAt) {
          closedAt = jiraUpdatedAt;
        }
      }

      await db
        .insert(tickets)
        .values({
          key: issue.key,
          title: issue.fields.summary,
          issueType: issue.fields.issuetype.name.toLowerCase(),
          status: issue.fields.status.name,
          storyPoints: sp != null ? String(sp) : null,
          parentKey,
          epicKey: null,
          createdByMe,
          assigneeIsMe,
          closedAt,
          jiraCreatedAt,
          jiraUpdatedAt,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tickets.key,
          set: {
            title: issue.fields.summary,
            issueType: issue.fields.issuetype.name.toLowerCase(),
            status: issue.fields.status.name,
            storyPoints: sp != null ? String(sp) : null,
            parentKey,
            createdByMe,
            assigneeIsMe,
            closedAt,
            jiraCreatedAt,
            jiraUpdatedAt,
            syncedAt: new Date(),
          },
        });
    }

    // --- Second pass: backfill epicKey for ALL tickets with parentKey but no epicKey ---
    const orphanRows = await db
      .select({ key: tickets.key, parentKey: tickets.parentKey })
      .from(tickets)
      .where(and(isNotNull(tickets.parentKey), isNull(tickets.epicKey)));

    if (orphanRows.length > 0) {
      const neededParentKeys = [
        ...new Set(orphanRows.map((r) => r.parentKey!)),
      ];

      // Check which parents already exist in the DB
      const existingParents = await db
        .select({ key: tickets.key })
        .from(tickets)
        .where(inArray(tickets.key, neededParentKeys));
      const existingParentKeys = new Set(existingParents.map((r) => r.key));

      // Fetch and insert any parent tickets not already in the DB
      const missingParentKeys = neededParentKeys.filter(
        (k) => !existingParentKeys.has(k)
      );
      if (missingParentKeys.length > 0) {
        const parentJql = `key in (${missingParentKeys.map((k) => `"${k}"`).join(",")})`;
        const parentUrl = new URL(`${baseUrl}/rest/api/3/search/jql`);
        parentUrl.searchParams.set("jql", parentJql);
        parentUrl.searchParams.set("fields", fields);
        parentUrl.searchParams.set("maxResults", "50");

        const { data: parentData } = await apiFetch<JiraSearchResponse>(
          parentUrl.toString(),
          { headers: { Authorization: auth } }
        );

        for (const parent of parentData.issues) {
          await db
            .insert(tickets)
            .values({
              key: parent.key,
              title: parent.fields.summary,
              issueType: parent.fields.issuetype.name.toLowerCase(),
              status: parent.fields.status.name,
              storyPoints: null,
              parentKey: parent.fields.parent?.key ?? null,
              epicKey: null,
              createdByMe: false,
              assigneeIsMe: false,
              closedAt: null,
              jiraCreatedAt: new Date(parent.fields.created),
              jiraUpdatedAt: new Date(parent.fields.updated),
              syncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: tickets.key,
              set: {
                title: parent.fields.summary,
                issueType: parent.fields.issuetype.name.toLowerCase(),
                status: parent.fields.status.name,
                jiraUpdatedAt: new Date(parent.fields.updated),
                syncedAt: new Date(),
              },
            });
          existingParentKeys.add(parent.key);
        }
      }

      // Set epicKey for all orphans whose parent now exists
      for (const row of orphanRows) {
        if (existingParentKeys.has(row.parentKey!)) {
          await db
            .update(tickets)
            .set({ epicKey: row.parentKey })
            .where(eq(tickets.key, row.key));
        }
      }
    }

    // --- Ticket events (with dedup) ---
    for (const issue of allIssues) {
      // Build incoming events
      const incoming: Array<{
        ticketKey: string;
        eventType: string;
        fromValue: string | null;
        toValue: string | null;
        occurredAt: Date;
      }> = [];

      // "created" event
      incoming.push({
        ticketKey: issue.key,
        eventType: "created",
        fromValue: null,
        toValue: null,
        occurredAt: new Date(issue.fields.created),
      });

      // Status change events from changelog
      for (const history of issue.changelog.histories) {
        for (const item of history.items) {
          if (item.field === "status") {
            incoming.push({
              ticketKey: issue.key,
              eventType: "status_changed",
              fromValue: item.fromString,
              toValue: item.toString,
              occurredAt: new Date(history.created),
            });
          }
        }
      }

      // Fetch existing events for this ticket
      const existing = await db
        .select({
          eventType: ticketEvents.eventType,
          fromValue: ticketEvents.fromValue,
          toValue: ticketEvents.toValue,
          occurredAt: ticketEvents.occurredAt,
        })
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketKey, issue.key));

      const existingKeyFn = (e: {
        eventType: string;
        fromValue: string | null;
        toValue: string | null;
        occurredAt: Date;
      }) =>
        `${e.eventType}:${e.fromValue}:${e.toValue}:${e.occurredAt.toISOString()}`;

      const incomingKeyFn = (e: {
        ticketKey: string;
        eventType: string;
        fromValue: string | null;
        toValue: string | null;
        occurredAt: Date;
      }) =>
        `${e.eventType}:${e.fromValue}:${e.toValue}:${e.occurredAt.toISOString()}`;

      const newEvents = dedup(existing, incoming, existingKeyFn, incomingKeyFn);

      if (newEvents.length > 0) {
        await db.insert(ticketEvents).values(newEvents);
      }
    }

    return allIssues.length;
  }, sinceOverride);
}
