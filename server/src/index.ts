import { Elysia } from "elysia";
import "./env"; // validate core env vars on startup
import { db } from "./db";
import { sql } from "drizzle-orm";
import { resolve } from "path";

const STATIC_DIR = resolve(import.meta.dir, "../../web/dist");

const app = new Elysia()
  .get("/api/health", async () => {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", timestamp: new Date().toISOString() };
  })
  // Static file serving + SPA fallback (after all API routes)
  .onRequest(async ({ request, set }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) return;

    const filePath = `${STATIC_DIR}${url.pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) {
      set.headers["cache-control"] = "public, max-age=31536000, immutable";
      return new Response(file);
    }

    // SPA fallback
    return new Response(Bun.file(`${STATIC_DIR}/index.html`), {
      headers: { "content-type": "text/html" },
    });
  })
  .listen(Number(process.env.PORT) || 3000);

console.log(`Isaac server running at http://localhost:${app.server?.port}`);
