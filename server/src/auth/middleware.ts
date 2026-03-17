import { eq, gt } from "drizzle-orm";
import { verifyToken } from "./jwt";
import { db } from "../db";
import { shareTokens } from "../db/schema";

// Elysia beforeHandle function for use with .guard()
// Tries owner token first, falls back to share token DB lookup
export async function verifyJwt({ request, store }: { request: Request; store: { isOwner: boolean } }) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const token = header.slice(7);

  if (await verifyToken(token)) {
    store.isOwner = true;
    return;
  }

  // Fall back to share token DB lookup
  const row = await db
    .select()
    .from(shareTokens)
    .where(eq(shareTokens.token, token))
    .limit(1)
    .then((rows) => rows[0]);

  if (row && row.expiresAt > new Date()) {
    store.isOwner = false;
    return;
  }

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

// Guard that requires owner token — returns 403 for share viewers
export async function requireOwner({ store }: { store: { isOwner: boolean } }) {
  if (!store.isOwner) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
}
