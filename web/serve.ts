// Simple static file server for production (Railway)
const port = Number(process.env.PORT) || 5173;

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Try serving static file from dist/
    const file = Bun.file(`dist${path}`);
    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback: serve index.html for all non-file routes
    return new Response(Bun.file("dist/index.html"));
  },
});

console.log(`Isaac web serving on port ${port}`);
