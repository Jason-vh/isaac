import { verifyToken } from "./jwt";

// Elysia beforeHandle function for use with .guard()
export async function verifyJwt({ request }: { request: Request }) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const token = header.slice(7);
  const valid = await verifyToken(token);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
}
