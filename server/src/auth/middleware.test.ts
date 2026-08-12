import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { requireAuth, requireOwner, sectionOf, type Auth } from "./middleware";

const get = (path: string) =>
  ({ request: new Request(`https://isaac.test${path}`) });

const owner: Auth = { kind: "owner" };
const wbsoShare: Auth = {
  kind: "share",
  section: "wbso",
  prefixes: ["/api/wbso", "/api/sprints"],
};
const unmappedShare: Auth = { kind: "share", section: "admin", prefixes: [] };

describe("requireAuth", () => {
  test("rejects a request with no auth", async () => {
    const res = requireAuth({ ...get("/api/wbso/week/2026-01-05"), auth: null });
    expect(res?.status).toBe(401);
  });

  test("fails closed when auth was never derived", async () => {
    // Guards read `auth` as optional, so a wiring mistake must deny, not allow.
    const res = requireAuth(get("/api/wbso/week/2026-01-05"));
    expect(res?.status).toBe(401);
  });

  test("lets the owner reach anything", () => {
    expect(requireAuth({ ...get("/api/sync/log"), auth: owner })).toBeUndefined();
  });

  test("lets a share token reach its own section", () => {
    expect(
      requireAuth({ ...get("/api/wbso/week/2026-01-05"), auth: wbsoShare })
    ).toBeUndefined();
  });

  test("blocks a share token from another section", () => {
    const res = requireAuth({ ...get("/api/team/productivity"), auth: wbsoShare });
    expect(res?.status).toBe(403);
  });

  test("blocks a share token from an unmapped section entirely", () => {
    // Defaulting to allow would hand every read endpoint to such a link.
    const res = requireAuth({ ...get("/api/team/productivity"), auth: unmappedShare });
    expect(res?.status).toBe(403);
  });

  test("matches prefixes on path boundaries only", () => {
    const teamShare: Auth = { kind: "share", section: "team", prefixes: ["/api/team"] };
    expect(requireAuth({ ...get("/api/team"), auth: teamShare })).toBeUndefined();
    expect(
      requireAuth({ ...get("/api/team/productivity"), auth: teamShare })
    ).toBeUndefined();
    expect(requireAuth({ ...get("/api/teams-secret"), auth: teamShare })?.status).toBe(403);
  });

  test("ignores the query string when scoping", () => {
    expect(
      requireAuth({ ...get("/api/wbso/week/2026-01-05?since=x"), auth: wbsoShare })
    ).toBeUndefined();
  });
});

describe("requireOwner", () => {
  test("allows the owner", () => {
    expect(requireOwner({ ...get("/api/share"), auth: owner })).toBeUndefined();
  });

  test("denies share viewers", () => {
    expect(requireOwner({ ...get("/api/share"), auth: wbsoShare })?.status).toBe(403);
  });

  test("denies when auth is absent", () => {
    expect(requireOwner(get("/api/share"))?.status).toBe(403);
    expect(requireOwner({ ...get("/api/share"), auth: null })?.status).toBe(403);
  });
});

describe("sectionOf", () => {
  test("takes the first path segment", () => {
    expect(sectionOf("/wbso/2026-01-05")).toBe("wbso");
    expect(sectionOf("/team")).toBe("team");
    expect(sectionOf("/")).toBe("");
  });

  // Share links carry the page's own query, so this is the common case, not an
  // edge one: every link made from a page with a date range came through here.
  test("ignores the query string and hash", () => {
    expect(sectionOf("/reviews?since=2026-08-03&until=2026-08-12")).toBe(
      "reviews"
    );
    expect(sectionOf("/wbso/2026-01-05?view=overview")).toBe("wbso");
    expect(sectionOf("/team#totals")).toBe("team");
    expect(sectionOf("/?since=2026-08-03")).toBe("");
  });
});

describe("per-request auth isolation", () => {
  // Auth used to live in Elysia's `store`, which is one object shared by every
  // request: a write in one request is visible to the next. Nothing yielded
  // between the write and the read, so it never actually leaked — but a single
  // `await` added before an owner check would have turned it into privilege
  // escalation. These lock in the invariant that auth is per request.
  const app = new Elysia()
    .derive(({ request }) => {
      const header = request.headers.get("authorization");
      const auth: Auth | null =
        header === "Bearer owner"
          ? owner
          : header === "Bearer share"
            ? wbsoShare
            : null;
      return { auth };
    })
    .guard({ beforeHandle: requireAuth }, (app) =>
      app
        .get("/api/wbso/week", () => ({ ok: true }))
        .guard({ beforeHandle: requireOwner }, (app) =>
          app.post("/api/share", () => ({ ok: true }))
        )
    );

  const call = (path: string, token?: string, method = "GET") =>
    app.handle(
      new Request(`https://isaac.test${path}`, {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })
    );

  test("a share request never inherits owner rights from a concurrent one", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        i % 2 === 0
          ? call("/api/share", "owner", "POST").then((r) => ["owner", r.status] as const)
          : call("/api/share", "share", "POST").then((r) => ["share", r.status] as const)
      )
    );

    for (const [kind, status] of results) {
      expect(status).toBe(kind === "owner" ? 200 : 403);
    }
  });

  test("an anonymous request is unaffected by concurrent owner traffic", async () => {
    const [ownerRes, anonRes] = await Promise.all([
      call("/api/share", "owner", "POST"),
      call("/api/wbso/week"),
    ]);

    expect(ownerRes.status).toBe(200);
    expect(anonRes.status).toBe(401);
  });
});
