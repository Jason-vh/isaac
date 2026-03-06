import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { meetings } from "../db/schema";
import { estimateWeek } from "../wbso/estimator";

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export const wbsoRoutes = new Elysia({ prefix: "/api/wbso" })
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

    const { category, epicKey } = (body ?? {}) as {
      category?: "dev" | "non_dev";
      epicKey?: string;
    };

    if (!category || !["dev", "non_dev"].includes(category)) {
      return new Response(
        JSON.stringify({ error: "Invalid category. Must be 'dev' or 'non_dev'" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const meetingId = Number(params.id);
    const update: Record<string, unknown> = {
      category,
      epicKeyInferred: false,
    };
    if (epicKey !== undefined) {
      update.epicKey = epicKey || null;
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
  });
