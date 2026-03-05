import { Elysia } from "elysia";
import { validateCoreEnv } from "./env";
validateCoreEnv();
import { db } from "./db";
import { sql } from "drizzle-orm";
import { resolve } from "path";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { syncRoutes } from "./routes/sync";
import { objectiveRoutes } from "./routes/objectives";
import { pipelineRoutes } from "./routes/pipelines";
import { shareRoutes } from "./routes/share";
import { verifyJwt, requireOwner } from "./auth/middleware";

const STATIC_DIR = resolve(import.meta.dir, "../../web/dist");

const app = new Elysia()
  .onError(({ code, error, path }) => {
    console.error(`[${code}] ${path}:`, error);
  })
  .state("isOwner", false)
  .get("/api/health", async () => {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", timestamp: new Date().toISOString() };
  })
  .use(authRoutes)
  .guard({ beforeHandle: verifyJwt }, (app) =>
    app
      .use(dashboardRoutes)
      .use(objectiveRoutes)
      .use(pipelineRoutes)
      .guard({ beforeHandle: requireOwner }, (app) =>
        app.use(syncRoutes).use(shareRoutes)
      )
  )
  // Static file serving + SPA fallback (after all API routes)
  .onRequest(async ({ request, set }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) return;

    const filePath = `${STATIC_DIR}${url.pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) {
      set.headers["cache-control"] = "public, max-age=31536000, immutable";
      set.headers["content-type"] = file.type;
      return new Response(await file.arrayBuffer());
    }

    // SPA fallback
    set.headers["content-type"] = "text/html";
    return new Response(await Bun.file(`${STATIC_DIR}/index.html`).arrayBuffer());
  })
  .listen(Number(process.env.PORT) || 3000);

console.log(`Isaac server running at http://localhost:${app.server?.port}`);
