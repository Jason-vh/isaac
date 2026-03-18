import { Elysia } from "elysia";
import { randomBytes } from "crypto";
import { db } from "../db";
import { shareTokens } from "../db/schema";

export const shareRoutes = new Elysia({ prefix: "/api" }).post(
  "/share",
  async ({ body }) => {
    const { path } = body as { path: string };
    const token = randomBytes(12).toString("base64url"); // 16 chars, URL-safe
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(shareTokens).values({
      token,
      path,
      expiresAt,
      createdAt: new Date(),
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }
);
