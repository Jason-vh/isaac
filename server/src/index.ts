import { Elysia } from "elysia";

const app = new Elysia()
  .get("/api/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .listen(3000);

console.log(`Isaac server running at http://localhost:${app.server?.port}`);
