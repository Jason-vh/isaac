import { db } from "../db";
import {
  confluenceDocuments,
  confluenceDocumentEvents,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { env } from "../env";
import { apiFetch, basicAuthHeader, runSyncWithLog, dedup } from "./util";

// ---------------------------------------------------------------------------
// Types for Confluence API responses
// ---------------------------------------------------------------------------

interface ConfluenceUser {
  accountId: string;
}

interface ConfluenceSearchResponse {
  results: ConfluencePage[];
  _links: { next?: string };
}

interface ConfluencePage {
  id: string;
  title: string;
  space: { key: string };
  version: { when: string };
  history: {
    createdBy: { accountId: string };
    createdDate: string;
  };
  _links: { webui: string };
}

interface ConfluenceCommentsResponse {
  results: ConfluenceComment[];
  _links: { next?: string };
}

interface ConfluenceComment {
  id: string;
  history: {
    createdBy: { accountId: string };
    createdDate: string;
  };
}

// ---------------------------------------------------------------------------
// Confluence sync
// ---------------------------------------------------------------------------

export async function syncConfluence(sinceOverride?: Date): Promise<void> {
  await runSyncWithLog("confluence", async (since) => {
    // Lazy env access
    const baseUrl = env.CONFLUENCE_BASE_URL;
    const email = env.CONFLUENCE_EMAIL;
    const token = env.CONFLUENCE_API_TOKEN;
    const auth = basicAuthHeader(email, token);
    const authHeaders = { Authorization: auth };

    // Step 1: Get my account ID
    const { data: me } = await apiFetch<ConfluenceUser>(
      `${baseUrl}/rest/api/user/current`,
      { headers: authHeaders }
    );
    const myAccountId = me.accountId;

    // Step 2: Search pages with pagination
    const sinceDate = since.toISOString().slice(0, 10);
    const cql = `type = page AND space = DESK AND lastModified >= "${sinceDate}"`;
    const allPages: ConfluencePage[] = [];
    let start = 0;

    while (true) {
      const url = new URL(`${baseUrl}/rest/api/content/search`);
      url.searchParams.set("cql", cql);
      url.searchParams.set("expand", "version,history,space");
      url.searchParams.set("limit", "25");
      url.searchParams.set("start", String(start));

      const { data } = await apiFetch<ConfluenceSearchResponse>(
        url.toString(),
        { headers: authHeaders }
      );

      allPages.push(...data.results);

      if (!data._links.next || data.results.length === 0) break;
      start += data.results.length;
    }

    if (allPages.length === 0) return 0;

    // Step 3: Upsert documents and create events
    for (const page of allPages) {
      const createdByMe = page.history.createdBy.accountId === myAccountId;

      const [upserted] = await db
        .insert(confluenceDocuments)
        .values({
          confluenceId: page.id,
          title: page.title,
          spaceKey: page.space.key,
          createdByMe,
          confluenceCreatedAt: new Date(page.history.createdDate),
          confluenceUpdatedAt: new Date(page.version.when),
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: confluenceDocuments.confluenceId,
          set: {
            title: page.title,
            spaceKey: page.space.key,
            createdByMe,
            confluenceCreatedAt: new Date(page.history.createdDate),
            confluenceUpdatedAt: new Date(page.version.when),
            syncedAt: new Date(),
          },
        })
        .returning({ id: confluenceDocuments.id });

      const docId = upserted.id;
      const pageUrl = `${baseUrl}${page._links.webui}`;

      // Build incoming events
      const incoming: Array<{
        documentId: number;
        eventType: string;
        externalUrl: string | null;
        occurredAt: Date;
      }> = [];

      // "published" event (personal — only for pages I created)
      if (createdByMe) {
        incoming.push({
          documentId: docId,
          eventType: "published",
          externalUrl: pageUrl,
          occurredAt: new Date(page.history.createdDate),
        });
      }

      // "commented" events — paginate comments endpoint
      let commentStart = 0;
      while (true) {
        const commentsUrl = new URL(
          `${baseUrl}/rest/api/content/${page.id}/child/comment`
        );
        commentsUrl.searchParams.set("expand", "history");
        commentsUrl.searchParams.set("limit", "25");
        commentsUrl.searchParams.set("start", String(commentStart));

        const { data: commentsData } =
          await apiFetch<ConfluenceCommentsResponse>(commentsUrl.toString(), {
            headers: authHeaders,
          });

        for (const comment of commentsData.results) {
          // Events are personal — only track my comments for the dashboard
          if (comment.history.createdBy.accountId !== myAccountId) continue;
          const commentDate = new Date(comment.history.createdDate);
          if (commentDate < since) continue;

          incoming.push({
            documentId: docId,
            eventType: "commented",
            externalUrl: `${pageUrl}?focusedCommentId=${comment.id}`,
            occurredAt: commentDate,
          });
        }

        if (!commentsData._links.next || commentsData.results.length === 0) {
          break;
        }
        commentStart += commentsData.results.length;
      }

      // Dedup events
      const existing = await db
        .select({
          eventType: confluenceDocumentEvents.eventType,
          occurredAt: confluenceDocumentEvents.occurredAt,
        })
        .from(confluenceDocumentEvents)
        .where(eq(confluenceDocumentEvents.documentId, docId));

      const existingKeyFn = (e: { eventType: string; occurredAt: Date }) =>
        `${e.eventType}:${e.occurredAt.toISOString()}`;

      const incomingKeyFn = (e: {
        documentId: number;
        eventType: string;
        externalUrl: string | null;
        occurredAt: Date;
      }) => `${e.eventType}:${e.occurredAt.toISOString()}`;

      const newEvents = dedup(existing, incoming, existingKeyFn, incomingKeyFn);

      if (newEvents.length > 0) {
        await db.insert(confluenceDocumentEvents).values(newEvents);
      }
    }

    return allPages.length;
  }, sinceOverride);
}
