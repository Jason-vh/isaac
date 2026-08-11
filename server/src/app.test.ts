import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://localhost/isaac_test";
process.env.JWT_SECRET ??= "test-secret";
process.env.WEBAUTHN_RP_ID ??= "localhost";
process.env.WEBAUTHN_ORIGIN ??= "http://localhost:5173";

const { app, resolveStaticPath } = await import("./app");

describe("resolveStaticPath", () => {
  test("resolves a normal asset", () => {
    expect(resolveStaticPath("/assets/index.js")).toMatch(/web\/dist\/assets\/index\.js$/);
  });

  test("resolves the root", () => {
    expect(resolveStaticPath("/")).toMatch(/web\/dist$/);
  });

  test("refuses to escape the static directory", () => {
    for (const path of [
      "/../../etc/passwd",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/assets/../../../../etc/passwd",
      "/..%2f..%2fetc%2fpasswd",
    ]) {
      const resolved = resolveStaticPath(path);
      // Either refused outright, or confined to the static directory.
      expect(resolved === null || /web\/dist(\/|$)/.test(resolved)).toBe(true);
    }
  });

  test("rejects a malformed percent-encoding", () => {
    expect(resolveStaticPath("/%")).toBeNull();
  });

  test("rejects a null byte", () => {
    expect(resolveStaticPath("/index.html%00.js")).toBeNull();
  });
});

describe("wbso week is public", () => {
  // An invalid date is rejected before any query runs, so this reaches the
  // handler without a database — a 401 here would mean the route got guarded.
  test("an anonymous request reaches the handler", async () => {
    const res = await app.handle(
      new Request("https://isaac.test/api/wbso/week/not-a-date")
    );
    expect(res.status).toBe(400);
  });

  test("an anonymous ticket search is still rejected", async () => {
    const res = await app.handle(
      new Request("https://isaac.test/api/wbso/tickets/search?q=ab")
    );
    expect(res.status).toBe(401);
  });
});
