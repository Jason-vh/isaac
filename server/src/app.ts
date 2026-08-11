import { Elysia } from "elysia";
import { validateCoreEnv, webauthnOrigins } from "./env";
validateCoreEnv();
import { db } from "./db";
import { sql } from "drizzle-orm";
import { resolve, sep } from "path";
import { authRoutes } from "./routes/auth";
import { syncRoutes } from "./routes/sync";
import { objectiveRoutes } from "./routes/objectives";
import { pipelineRoutes } from "./routes/pipelines";
import { shareRoutes } from "./routes/share";
import { wbsoRoutes } from "./routes/wbso";
import { teamRoutes } from "./routes/team";
import { reviewRoutes } from "./routes/reviews";
import { sprintRoutes } from "./routes/sprints";
import { digestRoutes } from "./routes/digest";
import { authContext, requireAuth, requireOwner } from "./auth/middleware";
import { BadRequest } from "./lib/request";

const STATIC_DIR = resolve(import.meta.dir, "../../web/dist");

/**
 * Resolves a URL path inside STATIC_DIR, or null if it escapes it. Concatenating
 * the path onto the directory would serve anything reachable by `..`.
 */
export function resolveStaticPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const candidate = resolve(STATIC_DIR, `.${decoded}`);
  const inside =
    candidate === STATIC_DIR || candidate.startsWith(STATIC_DIR + sep);
  return inside ? candidate : null;
}

export const app = new Elysia()
  .onError(({ code, error, path, set }) => {
    if (error instanceof BadRequest) {
      set.status = 400;
      return { error: error.message };
    }
    console.error(`[${code}] ${path}:`, error);
  })
  .get("/api/health", async () => {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", timestamp: new Date().toISOString() };
  })
  .use(authRoutes)
  // Resolves `auth` per request. Elysia's `store` is shared across requests, so
  // it can't hold anything caller-specific.
  .use(authContext)
  // Guards its own routes: the week estimate is public, the rest is not.
  .use(wbsoRoutes)
  .guard({ beforeHandle: requireAuth }, (app) =>
    app
      .use(objectiveRoutes)
      .use(pipelineRoutes)
      .use(teamRoutes)
      .use(reviewRoutes)
      .use(sprintRoutes)
      .use(digestRoutes)
      .guard({ beforeHandle: requireOwner }, (app) =>
        app.use(syncRoutes).use(shareRoutes)
      )
  )
  // Static file serving + SPA fallback (after all API routes)
  .onRequest(async ({ request, set }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) return;

    // Related Origin Requests: lets one passkey work across every origin listed
    // here, not just the one matching WEBAUTHN_RP_ID.
    if (url.pathname === "/.well-known/webauthn") {
      set.headers["content-type"] = "application/json";
      return new Response(JSON.stringify({ origins: webauthnOrigins() }));
    }

    const filePath = resolveStaticPath(url.pathname);
    if (filePath) {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        // Only Vite's content-hashed bundles are safe to cache forever.
        set.headers["cache-control"] = url.pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate";
        set.headers["content-type"] = file.type;
        return new Response(file);
      }
    }

    // SPA fallback
    set.headers["cache-control"] = "no-cache";
    set.headers["content-type"] = "text/html";
    return new Response(Bun.file(`${STATIC_DIR}/index.html`));
  });
