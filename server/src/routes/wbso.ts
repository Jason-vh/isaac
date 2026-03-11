import { Elysia } from "elysia";
import { eq, or, ilike, inArray } from "drizzle-orm";
import { db } from "../db";
import { meetings, mergeRequests, tickets } from "../db/schema";
import { estimateWeek } from "../wbso/estimator";

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export const wbsoRoutes = new Elysia({ prefix: "/api/wbso" })
  .get("/tickets/search", async ({ query }) => {
    const q = (query as { q?: string }).q?.trim();
    if (!q || q.length < 2) return [];

    const rows = await db
      .select({
        key: tickets.key,
        title: tickets.title,
        issueType: tickets.issueType,
        epicKey: tickets.epicKey,
      })
      .from(tickets)
      .where(
        or(
          ilike(tickets.key, `%${q}%`),
          ilike(tickets.title, `%${q}%`)
        )
      )
      .limit(10);

    // Resolve epic titles
    const epicKeys = [...new Set(rows.map((r) => r.epicKey).filter((k): k is string => k !== null))];
    const epicTitleMap = new Map<string, string>();
    if (epicKeys.length > 0) {
      const epicRows = await db
        .select({ key: tickets.key, title: tickets.title })
        .from(tickets)
        .where(inArray(tickets.key, epicKeys));
      for (const e of epicRows) epicTitleMap.set(e.key, e.title);
    }

    return rows.map((r) => ({
      ...r,
      epicTitle: r.epicKey ? epicTitleMap.get(r.epicKey) ?? null : null,
    }));
  })
  .get("/week/:date", async ({ params }) => {
    const monday = getMonday(params.date);
    return estimateWeek(monday);
  })
  .patch("/meetings/:id", async ({ params, body, store }) => {
    if (!(store as any).isOwner) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    const { category, epicKey, ticketKey } = (body ?? {}) as {
      category?: "dev" | "non_dev";
      epicKey?: string;
      ticketKey?: string;
    };

    if (category && !["dev", "non_dev"].includes(category)) {
      return new Response(
        JSON.stringify({ error: "Invalid category. Must be 'dev' or 'non_dev'" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (!category && epicKey === undefined && ticketKey === undefined) {
      return new Response(
        JSON.stringify({ error: "No fields to update" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const meetingId = Number(params.id);
    const update: Record<string, unknown> = {
      epicKeyInferred: false,
    };

    if (category) {
      update.category = category;
    }

    if (epicKey !== undefined) {
      update.epicKey = epicKey || null;
    }

    // Resolve ticketKey to epicKey
    if (ticketKey) {
      const [ticket] = await db
        .select({ key: tickets.key, epicKey: tickets.epicKey, issueType: tickets.issueType })
        .from(tickets)
        .where(eq(tickets.key, ticketKey));

      if (!ticket) {
        return new Response(JSON.stringify({ error: "Ticket not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      if (ticket.epicKey) {
        update.epicKey = ticket.epicKey;
        update.category = "dev";
      } else if (ticket.issueType === "epic") {
        update.epicKey = ticket.key;
        update.category = "dev";
      } else {
        update.epicKey = null;
      }
    }

    const [updated] = await db
      .update(meetings)
      .set(update)
      .where(eq(meetings.id, meetingId))
      .returning();

    if (!updated) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    return updated;
  })
  .patch("/merge-requests/:id", async ({ params, body, store }) => {
    if (!(store as any).isOwner) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    const { ticketKey } = (body ?? {}) as { ticketKey?: string };

    if (!ticketKey) {
      return new Response(
        JSON.stringify({ error: "ticketKey is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Validate ticket exists
    const [ticket] = await db
      .select({ key: tickets.key })
      .from(tickets)
      .where(eq(tickets.key, ticketKey));

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const mrId = Number(params.id);
    const [updated] = await db
      .update(mergeRequests)
      .set({ ticketKey, ticketKeyInferred: false })
      .where(eq(mergeRequests.id, mrId))
      .returning();

    if (!updated) {
      return new Response(JSON.stringify({ error: "Merge request not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    return updated;
  });
