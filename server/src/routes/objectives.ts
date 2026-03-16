import { Elysia, t } from "elysia";
import { eq, and, ilike, inArray, gte, lte, or } from "drizzle-orm";
import { db } from "../db";
import { requireOwner } from "../auth/middleware";
import {
  entityLinks,
  tickets,
  ticketEvents,
  mergeRequests,
  mergeRequestEvents,
  confluenceDocuments,
  confluenceDocumentEvents,
} from "../db/schema";
import { env } from "../env";
import { OBJECTIVES, getObjective, getKeyResult, getKeyResultsForObjective } from "@isaac/shared/objectives";
import type {
  EvidenceItem,
  EvidenceSummary,
  ObjectiveWithKeyResults,
  ObjectiveWithSummary,
  KeyResultWithSummary,
  KeyResultWithEvidence,
  EntityLink,
  TimelineEvent,
} from "@isaac/shared";

function mapEntityLink(row: typeof entityLinks.$inferSelect): EntityLink {
  return {
    id: row.id,
    sourceType: row.sourceType as EntityLink["sourceType"],
    sourceId: row.sourceId,
    targetType: row.targetType as EntityLink["targetType"],
    targetId: row.targetId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveEvidence(krSlug: string): Promise<EvidenceItem[]> {
  const links = await db
    .select()
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.sourceType, "key_result"),
        eq(entityLinks.sourceId, krSlug)
      )
    );

  const items: EvidenceItem[] = [];

  for (const link of links) {
    if (link.targetType === "ticket") {
      // Check if it's an epic
      const [ticket] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.key, link.targetId));

      if (!ticket) continue;

      if (ticket.issueType.toLowerCase() === "epic") {
        // Add the epic itself
        items.push({
          linkId: link.id,
          type: "ticket",
          id: ticket.key,
          title: ticket.key,
          subtitle: ticket.title,
          source: "direct",
          epicKey: null,
        });

        // Auto-resolve child tickets
        const childTickets = await db
          .select()
          .from(tickets)
          .where(eq(tickets.epicKey, ticket.key));

        for (const child of childTickets) {
          items.push({
            linkId: link.id,
            type: "ticket",
            id: child.key,
            title: child.key,
            subtitle: child.title,
            source: "via_epic",
            epicKey: ticket.key,
          });

          // Auto-resolve MRs linked to child tickets
          const mrs = await db
            .select()
            .from(mergeRequests)
            .where(eq(mergeRequests.ticketKey, child.key));

          for (const mr of mrs) {
            items.push({
              linkId: link.id,
              type: "merge_request",
              id: String(mr.id),
              title: `!${mr.gitlabIid} ${mr.title}`,
              subtitle: mr.projectPath,
              source: "via_epic",
              epicKey: ticket.key,
            });
          }
        }

        // Auto-resolve docs linked to epic
        const docs = await db
          .select()
          .from(confluenceDocuments)
          .where(eq(confluenceDocuments.epicKey, ticket.key));

        for (const doc of docs) {
          items.push({
            linkId: link.id,
            type: "confluence_document",
            id: doc.confluenceId,
            title: doc.title,
            subtitle: doc.spaceKey,
            source: "via_epic",
            epicKey: ticket.key,
          });
        }
      } else {
        // Direct ticket link
        items.push({
          linkId: link.id,
          type: "ticket",
          id: ticket.key,
          title: ticket.key,
          subtitle: ticket.title,
          source: "direct",
          epicKey: null,
        });
      }
    } else if (link.targetType === "merge_request") {
      const [mr] = await db
        .select()
        .from(mergeRequests)
        .where(eq(mergeRequests.id, Number(link.targetId)));

      if (mr) {
        items.push({
          linkId: link.id,
          type: "merge_request",
          id: String(mr.id),
          title: `!${mr.gitlabIid} ${mr.title}`,
          subtitle: mr.projectPath,
          source: "direct",
          epicKey: null,
        });
      }
    } else if (link.targetType === "confluence_document") {
      const [doc] = await db
        .select()
        .from(confluenceDocuments)
        .where(eq(confluenceDocuments.confluenceId, link.targetId));

      if (doc) {
        items.push({
          linkId: link.id,
          type: "confluence_document",
          id: doc.confluenceId,
          title: doc.title,
          subtitle: doc.spaceKey,
          source: "direct",
          epicKey: null,
        });
      }
    }
  }

  return items;
}

async function computeEvidenceSummary(krSlug: string): Promise<EvidenceSummary> {
  const items = await resolveEvidence(krSlug);
  const summary: EvidenceSummary = {
    epics: 0,
    tickets: 0,
    mergeRequests: 0,
    documents: 0,
    total: 0,
  };

  for (const item of items) {
    if (item.type === "ticket" && item.source === "direct") {
      const isEpic = items.some(
        (i) => i.epicKey === item.id && i.source === "via_epic"
      );
      if (isEpic) summary.epics++;
      else summary.tickets++;
    } else if (item.type === "ticket" && item.source === "via_epic") {
      summary.tickets++;
    } else if (item.type === "merge_request") {
      summary.mergeRequests++;
    } else if (item.type === "confluence_document") {
      summary.documents++;
    }
  }

  summary.total =
    summary.epics + summary.tickets + summary.mergeRequests + summary.documents;
  return summary;
}

export const objectiveRoutes = new Elysia({ prefix: "/api" })
  // List objectives with evidence summaries
  .get("/objectives", async () => {
    const result: ObjectiveWithSummary[] = [];

    for (const obj of OBJECTIVES) {
      const krsWithSummary: KeyResultWithSummary[] = [];
      for (const kr of obj.keyResults) {
        krsWithSummary.push({
          slug: kr.slug,
          objectiveSlug: obj.slug,
          title: kr.title,
          evidenceSummary: await computeEvidenceSummary(kr.slug),
        });
      }

      result.push({
        slug: obj.slug,
        title: obj.title,
        description: obj.description,
        keyResults: krsWithSummary,
      });
    }

    return result;
  })

  // Epic search — must be before /:slug to avoid route conflict
  .get("/objectives/epics", async ({ query }) => {
    const q = query?.q ?? "";
    const rows = await db
      .select({ key: tickets.key, title: tickets.title })
      .from(tickets)
      .where(
        and(
          ilike(tickets.issueType, "epic"),
          q ? ilike(tickets.title, `%${q}%`) : undefined
        )
      )
      .limit(20);
    return rows;
  })

  // Search entities for evidence linking — must be before /:slug
  .get("/objectives/search", async ({ query: q, set }) => {
    const type = q?.type as string;
    const search = (q?.q as string) ?? "";

    if (!type) {
      set.status = 400;
      return { error: "type parameter required" };
    }

    if (type === "ticket") {
      const rows = await db
        .select({ key: tickets.key, title: tickets.title })
        .from(tickets)
        .where(
          or(
            ilike(tickets.key, `%${search}%`),
            ilike(tickets.title, `%${search}%`)
          )
        )
        .limit(20);
      return rows.map((r) => ({ id: r.key, title: `${r.key} ${r.title}` }));
    }

    if (type === "document") {
      const rows = await db
        .select({ confluenceId: confluenceDocuments.confluenceId, title: confluenceDocuments.title })
        .from(confluenceDocuments)
        .where(search ? ilike(confluenceDocuments.title, `%${search}%`) : undefined)
        .limit(20);
      return rows.map((r) => ({ id: r.confluenceId, title: r.title }));
    }

    set.status = 400;
    return { error: `Unknown search type: ${type}` };
  })

  // Get objective detail with full evidence
  .get("/objectives/:slug", async ({ params, set }) => {
    const obj = getObjective(params.slug);

    if (!obj) {
      set.status = 404;
      return { error: "Not found" };
    }

    const krsWithEvidence: KeyResultWithEvidence[] = [];
    for (const kr of obj.keyResults) {
      krsWithEvidence.push({
        slug: kr.slug,
        objectiveSlug: obj.slug,
        title: kr.title,
        evidence: await resolveEvidence(kr.slug),
      });
    }

    const result: ObjectiveWithKeyResults = {
      slug: obj.slug,
      title: obj.title,
      description: obj.description,
      keyResults: krsWithEvidence,
    };
    return result;
  })

  // Add evidence link
  .post(
    "/key-results/:slug/evidence",
    async ({ params, body }) => {
      const [row] = await db
        .insert(entityLinks)
        .values({
          sourceType: "key_result",
          sourceId: params.slug,
          targetType: body.targetType,
          targetId: body.targetId,
          createdAt: new Date(),
        })
        .returning();
      return mapEntityLink(row);
    },
    {
      beforeHandle: [requireOwner],
      body: t.Object({
        targetType: t.String(),
        targetId: t.String(),
      }),
    }
  )

  // Remove evidence link
  .delete("/key-results/:slug/evidence/:linkId", async ({ params }) => {
    await db
      .delete(entityLinks)
      .where(eq(entityLinks.id, Number(params.linkId)));
    return { ok: true };
  }, { beforeHandle: [requireOwner] })

  // KR Timeline
  .get("/key-results/:slug/timeline", async ({ params, query, set }) => {
    const kr = getKeyResult(params.slug);
    if (!kr) {
      set.status = 404;
      return { error: "Key result not found" };
    }

    const evidence = await resolveEvidence(params.slug);
    const events: TimelineEvent[] = [];

    // Collect entity IDs by type
    const ticketKeys = [...new Set(evidence.filter((e) => e.type === "ticket").map((e) => e.id))];
    const mrIds = [...new Set(evidence.filter((e) => e.type === "merge_request").map((e) => Number(e.id)))];
    const docIds = [...new Set(evidence.filter((e) => e.type === "confluence_document").map((e) => e.id))];

    // Build date filters
    const sinceDate = query?.since ? new Date(query.since as string) : undefined;
    const untilDate = query?.until ? new Date(query.until as string) : undefined;

    const jiraBaseUrl = env.JIRA_BASE_URL ? env.JIRA_BASE_URL.replace(/\/jira\/?$/, "") : "";
    const gitlabBaseUrl = env.GITLAB_BASE_URL || "";

    // --- Ticket events ---
    if (ticketKeys.length > 0) {
      // Derive ticket_created and ticket_closed from tickets table
      const ticketRows = await db
        .select()
        .from(tickets)
        .where(inArray(tickets.key, ticketKeys));

      // Build ticket title lookup
      const ticketTitleMap = new Map<string, string>();
      for (const t of ticketRows) ticketTitleMap.set(t.key, t.title);

      for (const t of ticketRows) {
        const epicKey = evidence.find((e) => e.id === t.key)?.epicKey ?? null;

        events.push({
          id: `ticket_created:${t.key}`,
          type: "ticket_created",
          title: "Created",
          subtitle: t.title,
          occurredAt: t.jiraCreatedAt.toISOString(),
          externalUrl: jiraBaseUrl ? `${jiraBaseUrl}/browse/${t.key}` : null,
          entityType: "ticket",
          entityId: t.key,
          parentTicketKey: null,
          epicKey,
        });
      }

      // Status change events — only show closure transitions
      const teFilters = [inArray(ticketEvents.ticketKey, ticketKeys)];
      if (sinceDate) teFilters.push(gte(ticketEvents.occurredAt, sinceDate));
      if (untilDate) teFilters.push(lte(ticketEvents.occurredAt, untilDate));

      const tEvents = await db
        .select()
        .from(ticketEvents)
        .where(and(...teFilters));

      const closedStatuses = new Set(["done", "closed", "resolved"]);

      for (const te of tEvents) {
        const isClosure = te.toValue ? closedStatuses.has(te.toValue.toLowerCase()) : false;
        if (!isClosure) continue;

        const epicKey = evidence.find((e) => e.id === te.ticketKey)?.epicKey ?? null;
        events.push({
          id: `ticket_event:${te.id}`,
          type: "ticket_closed",
          title: "Implemented",
          subtitle: ticketTitleMap.get(te.ticketKey) ?? te.ticketKey,
          occurredAt: te.occurredAt.toISOString(),
          externalUrl: jiraBaseUrl ? `${jiraBaseUrl}/browse/${te.ticketKey}` : null,
          entityType: "ticket",
          entityId: te.ticketKey,
          parentTicketKey: null,
          epicKey,
        });
      }
    }

    // --- MR events ---
    if (mrIds.length > 0) {
      const mrRows = await db
        .select()
        .from(mergeRequests)
        .where(inArray(mergeRequests.id, mrIds));

      for (const mr of mrRows) {
        const epicKey = evidence.find((e) => e.id === String(mr.id))?.epicKey ?? null;
        const mrUrl = `${gitlabBaseUrl}/${mr.projectPath}/-/merge_requests/${mr.gitlabIid}`;

        // mr_opened derived from gitlabCreatedAt
        events.push({
          id: `mr_opened:${mr.id}`,
          type: "mr_opened",
          title: "Opened",
          subtitle: mr.title,
          occurredAt: mr.gitlabCreatedAt.toISOString(),
          externalUrl: mrUrl,
          entityType: "merge_request",
          entityId: String(mr.id),
          parentTicketKey: mr.ticketKey,
          epicKey,
        });

        if (mr.mergedAt) {
          events.push({
            id: `mr_merged:${mr.id}`,
            type: "mr_merged",
            title: "Merged",
            subtitle: mr.title,
            occurredAt: mr.mergedAt.toISOString(),
            externalUrl: mrUrl,
            entityType: "merge_request",
            entityId: String(mr.id),
            parentTicketKey: mr.ticketKey,
            epicKey,
          });
        }
      }

      // MR events (commented, etc.)
      const mreFilters = [inArray(mergeRequestEvents.mergeRequestId, mrIds)];
      if (sinceDate) mreFilters.push(gte(mergeRequestEvents.occurredAt, sinceDate));
      if (untilDate) mreFilters.push(lte(mergeRequestEvents.occurredAt, untilDate));

      const mrEvts = await db
        .select()
        .from(mergeRequestEvents)
        .where(and(...mreFilters));

      // Build MR lookup for ticket key
      const mrLookup = new Map<number, typeof mrRows[0]>();
      for (const mr of mrRows) mrLookup.set(mr.id, mr);

      for (const mre of mrEvts) {
        const mr = mrLookup.get(mre.mergeRequestId);
        if (!mr) continue;
        const epicKey = evidence.find((e) => e.id === String(mr.id))?.epicKey ?? null;

        events.push({
          id: `mr_event:${mre.id}`,
          type: "mr_commented",
          title: "Commented",
          subtitle: mr.title,
          occurredAt: mre.occurredAt.toISOString(),
          externalUrl: mre.externalUrl,
          entityType: "merge_request",
          entityId: String(mr.id),
          parentTicketKey: mr.ticketKey,
          epicKey,
        });
      }
    }

    // --- Confluence events ---
    if (docIds.length > 0) {
      // Fetch docs by confluenceId
      const docRows = await db
        .select()
        .from(confluenceDocuments)
        .where(inArray(confluenceDocuments.confluenceId, docIds));

      const docIdToRow = new Map<string, typeof docRows[0]>();
      const dbDocIds: number[] = [];
      for (const doc of docRows) {
        docIdToRow.set(doc.confluenceId, doc);
        dbDocIds.push(doc.id);
      }

      if (dbDocIds.length > 0) {
        const cdeFilters = [inArray(confluenceDocumentEvents.documentId, dbDocIds)];
        if (sinceDate) cdeFilters.push(gte(confluenceDocumentEvents.occurredAt, sinceDate));
        if (untilDate) cdeFilters.push(lte(confluenceDocumentEvents.occurredAt, untilDate));

        const cEvents = await db
          .select()
          .from(confluenceDocumentEvents)
          .where(and(...cdeFilters));

        // Build reverse lookup: db id -> confluenceId
        const dbIdToConfId = new Map<number, string>();
        for (const doc of docRows) dbIdToConfId.set(doc.id, doc.confluenceId);

        for (const ce of cEvents) {
          const confId = dbIdToConfId.get(ce.documentId);
          const doc = confId ? docIdToRow.get(confId) : undefined;
          if (!doc) continue;
          const epicKey = evidence.find((e) => e.id === doc.confluenceId)?.epicKey ?? null;

          events.push({
            id: `doc_event:${ce.id}`,
            type: ce.eventType === "published" ? "confluence_published" : "confluence_updated",
            title: ce.eventType === "published" ? "Published" : "Updated",
            subtitle: doc.title,
            occurredAt: ce.occurredAt.toISOString(),
            externalUrl: ce.externalUrl,
            entityType: "confluence_document",
            entityId: doc.confluenceId,
            parentTicketKey: null,
            epicKey,
          });
        }
      }
    }

    // Apply date filters to derived events (created/closed)
    const filtered = events.filter((e) => {
      const d = new Date(e.occurredAt);
      if (sinceDate && d < sinceDate) return false;
      if (untilDate && d > untilDate) return false;
      return true;
    });

    // Sort descending by occurredAt
    filtered.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return filtered;
  });
