import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { verifyToken } from "./jwt";
import { db } from "../db";
import { shareTokens } from "../db/schema";

// API prefixes a share token may read, keyed by the page section it was created
// from. A section that isn't listed grants nothing — a share link is never
// wider than the page it came from, and defaulting to allow would hand every
// read endpoint to a link made from an unmapped page.
const SECTION_API_PREFIXES: Record<string, string[]> = {
  wbso: ["/api/wbso", "/api/sprints"],
  objectives: ["/api/objectives", "/api/key-results", "/api/sprints"],
  team: ["/api/team", "/api/sprints"],
  reviews: ["/api/reviews", "/api/sprints"],
  pipelines: ["/api/pipelines", "/api/sprints"],
};

export type Auth =
  | { kind: "owner" }
  | { kind: "share"; section: string; prefixes: string[] };

export type AuthContext = { auth: Auth | null };

// Elysia doesn't thread a plugin's `derive` into the types of a guard's
// `beforeHandle`, so guards read `auth` as optional and treat its absence the
// same as an absent token — a wiring mistake fails closed rather than open.
type GuardContext = { request: Request; auth?: Auth | null };

/**
 * The page section a share path belongs to, e.g. "/wbso/2026-01-05" -> "wbso".
 * Share paths are router full paths, so the query string has to come off first:
 * a link made from a page with a date range would otherwise yield a section of
 * "reviews?since=...", which matches nothing and silently grants nothing.
 */
export function sectionOf(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  return withoutQuery.split("/").filter(Boolean)[0] ?? "";
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Matches a prefix exactly or as a path parent, so /api/team can't match /api/teams. */
function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Resolves the caller once per request. Elysia's `store` is shared by every
 * request, so auth state must live on the per-request context instead.
 */
async function deriveAuth({
  request,
}: {
  request: Request;
}): Promise<AuthContext> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return { auth: null };

  const token = header.slice(7);
  if (await verifyToken(token)) return { auth: { kind: "owner" } };

  const [row] = await db
    .select()
    .from(shareTokens)
    .where(eq(shareTokens.token, token))
    .limit(1);

  if (!row || row.expiresAt <= new Date()) return { auth: null };

  const section = sectionOf(row.path);
  return {
    auth: {
      kind: "share",
      section,
      prefixes: SECTION_API_PREFIXES[section] ?? [],
    },
  };
}

/**
 * Puts `auth` on the request context. Named so Elysia deduplicates it: route
 * modules `use` it to type their own guards, and it still resolves once.
 */
export const authContext = new Elysia({ name: "auth-context" })
  .derive(deriveAuth)
  .as("global");

/** Requires any valid token, and holds share tokens to their section's endpoints. */
export function requireAuth({
  auth,
  request,
}: GuardContext): Response | undefined {
  if (!auth) return jsonError(401, "Unauthorized");
  if (auth.kind === "owner") return;

  const path = new URL(request.url).pathname;
  if (!auth.prefixes.some((prefix) => underPrefix(path, prefix))) {
    return jsonError(403, "Forbidden");
  }
}

/** Requires the owner token — share viewers are read-only. */
export function requireOwner({ auth }: GuardContext): Response | undefined {
  if (auth?.kind !== "owner") return jsonError(403, "Forbidden");
}
