import { Elysia, t } from "elysia";
import { eq, and, ilike, sql } from "drizzle-orm";
import { db } from "../db";
import { requireOwner } from "../auth/middleware";
import {
  objectives,
  keyResults,
  entityLinks,
  tickets,
  mergeRequests,
  confluenceDocuments,
} from "../db/schema";
import type {
  Objective,
  KeyResult,
  EvidenceItem,
  EvidenceSummary,
  ObjectiveWithKeyResults,
  ObjectiveWithSummary,
  KeyResultWithSummary,
  EntityLink,
} from "@isaac/shared";

function mapObjective(row: typeof objectives.$inferSelect): Objective {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    year: row.year,
    status: row.status as Objective["status"],
    createdAt: row.createdAt.toISOString(),
  };
}

function mapKeyResult(row: typeof keyResults.$inferSelect): KeyResult {
  return {
    id: row.id,
    objectiveId: row.objectiveId,
    title: row.title,
    targetValue: row.targetValue ? Number(row.targetValue) : null,
    currentValue: row.currentValue ? Number(row.currentValue) : null,
    unit: row.unit,
    dataSource: row.dataSource,
    status: row.status as KeyResult["status"],
    createdAt: row.createdAt.toISOString(),
  };
}

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

async function resolveEvidence(krId: number): Promise<EvidenceItem[]> {
  const links = await db
    .select()
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.sourceType, "key_result"),
        eq(entityLinks.sourceId, krId)
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

async function computeEvidenceSummary(krId: number): Promise<EvidenceSummary> {
  const items = await resolveEvidence(krId);
  const summary: EvidenceSummary = {
    epics: 0,
    tickets: 0,
    mergeRequests: 0,
    documents: 0,
    total: 0,
  };

  for (const item of items) {
    if (item.type === "ticket" && item.source === "direct") {
      // Check if it's an epic by looking if any via_epic items reference it
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

const SEED_DATA = [
  {
    title: "Define and track feature adoption",
    description:
      "Establish practices and tooling to measure how well shipped features are adopted by users.",
    keyResults: [
      { title: "Feature launch checklist with adoption metrics", target: null, unit: null },
      { title: "Automated adoption report for 1 shipped feature", target: null, unit: null },
      {
        title:
          "Integrate Mixpanel into backend, track 1+ previously untrackable event",
        target: null,
        unit: null,
      },
    ],
  },
  {
    title: "Scale the desk frontend codebase",
    description:
      "Establish conventions, structure, and testing patterns that help the frontend codebase scale.",
    keyResults: [
      { title: "Document conventions for APIs, components, testing", target: null, unit: null },
      { title: "Define feature-based folder structure convention", target: null, unit: null },
      { title: "Establish standardised fixture writing approach", target: null, unit: null },
    ],
  },
  {
    title: "Shorten the path from code to production",
    description:
      "Reduce friction in the development and deployment pipeline.",
    keyResults: [
      { title: "Max pipeline duration below 15 minutes", target: 15, unit: "minutes", current: 43, dataSource: "pipeline:max_duration" },
      { title: "Reduce E2E retry cost to single-test re-run", target: null, unit: null },
      { title: "Deployment automation proposal with team buy-in", target: null, unit: null },
    ],
  },
  {
    title: "Invest in my teammates",
    description:
      "Grow as a mentor and contributor to the team through reviews, feedback, and documentation.",
    keyResults: [
      { title: "Reasoning in >80% of review comments", target: 80, unit: "percent" },
      { title: "Peer feedback from 2+ teammates", target: 2, unit: "teammates" },
      { title: "Author 2+ internal docs on frequent MR comment topics", target: 2, unit: "documents" },
    ],
  },
];

export const objectiveRoutes = new Elysia({ prefix: "/api" })
  // List objectives with evidence summaries
  .get("/objectives", async () => {
    const rows = await db
      .select()
      .from(objectives)
      .orderBy(objectives.id);

    const result: ObjectiveWithSummary[] = [];

    for (const obj of rows) {
      const krRows = await db
        .select()
        .from(keyResults)
        .where(eq(keyResults.objectiveId, obj.id))
        .orderBy(keyResults.id);

      const krsWithSummary: KeyResultWithSummary[] = [];
      for (const kr of krRows) {
        krsWithSummary.push({
          ...mapKeyResult(kr),
          evidenceSummary: await computeEvidenceSummary(kr.id),
        });
      }

      result.push({
        ...mapObjective(obj),
        keyResults: krsWithSummary,
      });
    }

    return result;
  })

  // Create objective
  .post(
    "/objectives",
    async ({ body }) => {
      const [row] = await db
        .insert(objectives)
        .values({
          title: body.title,
          description: body.description ?? null,
          year: body.year,
          status: "active",
          createdAt: new Date(),
        })
        .returning();
      return mapObjective(row);
    },
    {
      beforeHandle: [requireOwner],
      body: t.Object({
        title: t.String(),
        description: t.Optional(t.String()),
        year: t.Number(),
      }),
    }
  )

  // Get objective detail with full evidence
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

  // Seed objectives
  .post("/objectives/seed", async () => {
    // Idempotent: check if 2026 objectives exist
    const existing = await db
      .select()
      .from(objectives)
      .where(eq(objectives.year, 2026));

    if (existing.length === 0) {
      for (const obj of SEED_DATA) {
        const [row] = await db
          .insert(objectives)
          .values({
            title: obj.title,
            description: obj.description,
            year: 2026,
            status: "active",
            createdAt: new Date(),
          })
          .returning();

        for (const kr of obj.keyResults) {
          await db.insert(keyResults).values({
            objectiveId: row.id,
            title: kr.title,
            targetValue: kr.target ? String(kr.target) : null,
            currentValue: "current" in kr && kr.current ? String(kr.current) : null,
            unit: kr.unit,
            dataSource: "dataSource" in kr ? (kr as any).dataSource : null,
            status: "on_track",
            createdAt: new Date(),
          });
        }
      }
    }

    // Return the full list
    const rows = await db
      .select()
      .from(objectives)
      .where(eq(objectives.year, 2026))
      .orderBy(objectives.id);

    const result: ObjectiveWithSummary[] = [];
    for (const obj of rows) {
      const krRows = await db
        .select()
        .from(keyResults)
        .where(eq(keyResults.objectiveId, obj.id))
        .orderBy(keyResults.id);

      const krsWithSummary: KeyResultWithSummary[] = [];
      for (const kr of krRows) {
        krsWithSummary.push({
          ...mapKeyResult(kr),
          evidenceSummary: await computeEvidenceSummary(kr.id),
        });
      }

      result.push({ ...mapObjective(obj), keyResults: krsWithSummary });
    }

    return result;
  }, { beforeHandle: [requireOwner] })

  // Get objective detail
  .get("/objectives/:id", async ({ params, set }) => {
    const id = Number(params.id);
    const [obj] = await db
      .select()
      .from(objectives)
      .where(eq(objectives.id, id));

    if (!obj) {
      set.status = 404;
      return { error: "Not found" };
    }

    const krRows = await db
      .select()
      .from(keyResults)
      .where(eq(keyResults.objectiveId, id))
      .orderBy(keyResults.id);

    const krsWithEvidence = [];
    for (const kr of krRows) {
      krsWithEvidence.push({
        ...mapKeyResult(kr),
        evidence: await resolveEvidence(kr.id),
      });
    }

    const result: ObjectiveWithKeyResults = {
      ...mapObjective(obj),
      keyResults: krsWithEvidence,
    };
    return result;
  })

  // Update objective
  .patch(
    "/objectives/:id",
    async ({ params, body, set }) => {
      const id = Number(params.id);
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.status !== undefined) updates.status = body.status;

      const [row] = await db
        .update(objectives)
        .set(updates)
        .where(eq(objectives.id, id))
        .returning();

      if (!row) {
        set.status = 404;
        return { error: "Not found" };
      }
      return mapObjective(row);
    },
    {
      beforeHandle: [requireOwner],
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
    }
  )

  // Create key result
  .post(
    "/objectives/:id/key-results",
    async ({ params, body }) => {
      const objectiveId = Number(params.id);
      const [row] = await db
        .insert(keyResults)
        .values({
          objectiveId,
          title: body.title,
          targetValue: body.targetValue ? String(body.targetValue) : null,
          currentValue: body.currentValue ? String(body.currentValue) : null,
          unit: body.unit ?? null,
          status: "on_track",
          createdAt: new Date(),
        })
        .returning();
      return mapKeyResult(row);
    },
    {
      beforeHandle: [requireOwner],
      body: t.Object({
        title: t.String(),
        targetValue: t.Optional(t.Number()),
        currentValue: t.Optional(t.Number()),
        unit: t.Optional(t.String()),
      }),
    }
  )

  // Update key result
  .patch(
    "/key-results/:id",
    async ({ params, body, set }) => {
      const id = Number(params.id);
      const updates: Record<string, unknown> = {};
      if (body.status !== undefined) updates.status = body.status;
      if (body.currentValue !== undefined)
        updates.currentValue = String(body.currentValue);
      if (body.title !== undefined) updates.title = body.title;
      if (body.dataSource !== undefined) updates.dataSource = body.dataSource;

      const [row] = await db
        .update(keyResults)
        .set(updates)
        .where(eq(keyResults.id, id))
        .returning();

      if (!row) {
        set.status = 404;
        return { error: "Not found" };
      }
      return mapKeyResult(row);
    },
    {
      beforeHandle: [requireOwner],
      body: t.Object({
        status: t.Optional(t.String()),
        currentValue: t.Optional(t.Number()),
        title: t.Optional(t.String()),
        dataSource: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  // Add evidence link
  .post(
    "/key-results/:id/evidence",
    async ({ params, body }) => {
      const krId = Number(params.id);
      const [row] = await db
        .insert(entityLinks)
        .values({
          sourceType: "key_result",
          sourceId: krId,
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
  .delete("/key-results/:id/evidence/:linkId", async ({ params }) => {
    await db
      .delete(entityLinks)
      .where(eq(entityLinks.id, Number(params.linkId)));
    return { ok: true };
  }, { beforeHandle: [requireOwner] });
