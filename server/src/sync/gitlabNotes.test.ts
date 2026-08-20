import { describe, expect, test } from "bun:test";
import { threadStats, type GitLabDiscussion } from "./gitlabNotes";

function discussion(
  username: string,
  notes: Array<Partial<{ resolvable: boolean; resolved: boolean; system: boolean }>>
): GitLabDiscussion {
  return {
    id: username,
    individual_note: false,
    notes: notes.map((n, i) => ({
      id: i,
      body: "",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      author: { id: 1, username, name: username },
      system: n.system ?? false,
      type: null,
      resolvable: n.resolvable ?? true,
      resolved: n.resolved ?? false,
    })),
  };
}

describe("threadStats", () => {
  test("counts resolvable threads and the resolved ones", () => {
    expect(
      threadStats([
        discussion("json.fh", [{ resolved: true }, { resolved: true }]),
        discussion("json.fh", [{ resolved: false }]),
      ])
    ).toEqual({ opened: 2, resolved: 1 });
  });

  test("ignores discussions with nothing resolvable", () => {
    expect(
      threadStats([
        discussion("json.fh", [{ resolvable: false }, { system: true }]),
      ])
    ).toEqual({ opened: 0, resolved: 0 });
  });

  test("ignores threads opened by a bot", () => {
    expect(
      threadStats([
        discussion("project_59279169_bot_4f1bfe5f", [{ resolved: true }]),
        discussion("GitLab-Security-Bot", [{ resolved: false }]),
        discussion("json.fh", [{ resolved: true }]),
      ])
    ).toEqual({ opened: 1, resolved: 1 });
  });
});
