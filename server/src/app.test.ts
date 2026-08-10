import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://localhost/isaac_test";
process.env.JWT_SECRET ??= "test-secret";
process.env.WEBAUTHN_RP_ID ??= "localhost";
process.env.WEBAUTHN_ORIGIN ??= "http://localhost:5173";

const { resolveStaticPath } = await import("./app");

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
