import { Elysia } from "elysia";
import { desc, isNotNull } from "drizzle-orm";
import type { Sprint } from "@isaac/shared";
import { db } from "../db";
import { sprints } from "../db/schema";

const DEFAULT_LIMIT = 24;

export const sprintRoutes = new Elysia({ prefix: "/api/sprints" }).get(
  "/",
  async ({ query }): Promise<Sprint[]> => {
    const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, 100);

    const rows = await db
      .select()
      .from(sprints)
      .where(isNotNull(sprints.startDate))
      .orderBy(desc(sprints.startDate))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      state: row.state as Sprint["state"],
      goal: row.goal,
      startDate: row.startDate?.toISOString() ?? null,
      endDate: row.endDate?.toISOString() ?? null,
      completeDate: row.completeDate?.toISOString() ?? null,
    }));
  }
);
